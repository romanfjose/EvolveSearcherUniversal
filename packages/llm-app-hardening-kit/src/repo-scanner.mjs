// Static security & reliability scanner for LLM applications. Zero dependencies.
// Rules are deterministic, structure-aware pattern checks over a comment-stripped
// and string-masked view of each source file, so offsets map 1:1 onto the original text.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, basename, extname, sep } from 'node:path';

export const SEVERITY_WEIGHT = Object.freeze({ critical: 50, high: 30, medium: 15, low: 5 });
export const SEVERITY_ORDER = Object.freeze(['critical', 'high', 'medium', 'low']);

export const CATEGORIES = Object.freeze({
  cost: 'Cost Ceiling Protection',
  leak: 'Prompt/Key Leak Surface',
  injection: 'Tool-Call Injection',
  schema: 'Schema Reliability',
  idempotency: 'Idempotency & Webhook Integrity',
});

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', 'dist', 'build', 'out', 'coverage', 'vendor']);
const MAX_BYTES = 1 << 20;

export const isEnvFile = (p) => /^\.env(\..+)?$/.test(basename(p));
export const isScannable = (p) => isEnvFile(p) || CODE_EXT.has(extname(p));

// ───────────────────────────── lexing ─────────────────────────────

const blank = (s) => s.replace(/[^\n]/g, ' ');
const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]|^$|\b(?:return|typeof|case|do|else|in|of|void|yield|await)$/;

/**
 * Returns two same-length views of `src`:
 *  - code:   comments blanked (string contents kept, for URL/SQL/key matching)
 *  - masked: comments AND string/template/regex literal contents blanked (for structure)
 */
export function lex(src) {
  let code = '', masked = '';
  const stack = []; // 'tpl' | 'expr' | 'brace'
  const n = src.length;
  let i = 0;
  const emit = (raw, m = raw) => { code += raw; masked += m; };
  while (i < n) {
    const c = src[i];
    if (stack[stack.length - 1] === 'tpl') {
      if (c === '\\') { emit(src.slice(i, i + 2), blank(src.slice(i, i + 2))); i += 2; continue; }
      if (c === '`') { stack.pop(); emit(c); i++; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push('expr'); emit('${'); i += 2; continue; }
      emit(c, c === '\n' ? '\n' : ' '); i++; continue;
    }
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = n;
      const b = blank(src.slice(i, j)); emit(b, b); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      const b = blank(src.slice(i, j)); emit(b, b); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, n);
      const raw = src.slice(i, j);
      emit(raw, c + blank(raw.slice(1, -1)) + (raw.length > 1 ? raw[raw.length - 1] : ''));
      i = j; continue;
    }
    if (c === '`') { stack.push('tpl'); emit(c); i++; continue; }
    if (c === '/') {
      let e = code.length; while (e > 0 && /\s/.test(code[e - 1])) e--;
      let s = e; while (s > 0 && /\w/.test(code[s - 1])) s--;
      const prev = s < e ? code.slice(s, e) : code.slice(Math.max(0, e - 1), e);
      if (REGEX_PREV.test(prev)) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) break;
          j++;
        }
        if (src[j] === '/') {
          j++; while (j < n && /[a-z]/i.test(src[j])) j++;
          const raw = src.slice(i, j); emit(raw, '/' + blank(raw.slice(1))); i = j; continue;
        }
      }
    }
    if (c === '{' && stack.length) stack.push('brace');
    else if (c === '}' && stack.length) stack.pop();
    emit(c); i++;
  }
  return { code, masked };
}

const PAIRS = { '(': ')', '[': ']', '{': '}' };
/** Index of the bracket closing the one at `open` (in masked text), or text length if unbalanced. */
export function matchBracket(masked, open) {
  const want = PAIRS[masked[open]]; const stack = [want];
  for (let i = open + 1; i < masked.length; i++) {
    const ch = masked[i];
    if (PAIRS[ch]) stack.push(PAIRS[ch]);
    else if (ch === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i; }
  }
  return masked.length;
}

function insideTry(masked, idx) {
  const stack = [];
  for (let i = 0; i < idx; i++) {
    if (masked[i] === '{') stack.push(/\btry\s*$/.test(masked.slice(Math.max(0, i - 16), i)));
    else if (masked[i] === '}') stack.pop();
  }
  return stack.includes(true);
}

/** Argument text of the call whose `(` is the last char of a match ending at `end`. */
function callArgs(ctx, end) {
  const open = end - 1, close = matchBracket(ctx.masked, open);
  return { open, close, args: ctx.code.slice(open + 1, close) };
}

function* matches(re, text) {
  re.lastIndex = 0; let m;
  while ((m = re.exec(text))) { yield m; if (m[0] === '') re.lastIndex++; }
}

// ───────────────────────────── shared patterns ─────────────────────────────

const LLM_CALL = /\.(?:chat\.completions|completions|responses|messages)\.create\s*\(|(?<![\w$.])(?:generateText|streamText|generateObject|streamObject)\s*\(|\.(?:generateContent|generateContentStream|sendMessage|invoke)\s*\(|\bfetch\s*\(\s*['"`]https:\/\/(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|openrouter\.ai)/;
const LOOP_BOUND = /\b(?:max_?(?:turns?|iter(?:ation)?s?|steps|rounds|calls|depth))|budget|breaker|ceiling|deadline/i;
const PROVIDER = '(?:OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|GOOGLE_GENAI|GROQ|MISTRAL|COHERE|TOGETHER|REPLICATE|PERPLEXITY|DEEPSEEK|XAI|FIREWORKS|OPENROUTER|HUGGINGFACE|HF|LLM|AI)';
const PUBLIC_KEY = new RegExp(`\\b(?:NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|GATSBY|PUBLIC)_(?:[A-Z0-9]+_)*?${PROVIDER}(?:_[A-Z0-9]+)*?_(?:API_)?(?:KEY|TOKEN|SECRET)\\b`, 'g');
const SECRET_LITERAL = /(['"`])(sk-(?:proj-|ant-(?:api|admin)\d{2}-|svcacct-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{35}|gsk_[A-Za-z0-9]{40,}|xai-[A-Za-z0-9]{40,}|hf_[A-Za-z0-9]{30,}|r8_[A-Za-z0-9]{30,})\1/g;
const PLACEHOLDER = /x{4,}|your|example|placeholder|dummy|redacted|\.\.\.|<|changeme/i;
const PROVIDER_SDK = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(?\s*)['"](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|groq-sdk|@mistralai\/mistralai|cohere-ai|@ai-sdk\/(?!react|ui-utils|svelte|vue)[\w-]+)['"]/g;
const PROVIDER_URL = /\bfetch\s*\(\s*(['"`])https?:\/\/(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|openrouter\.ai|api\.together\.xyz|api\.deepseek\.com|api\.x\.ai|api\.cohere\.(?:ai|com)|api\.perplexity\.ai)/g;
const SQL_TEXT = /\bSELECT\b[\s\S]*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b[\s\S]*\bSET\b|\bDELETE\s+FROM\b/i;
const STR = String.raw`(?:'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")`;
const MODEL_OUTPUT = /\bchoices\b|\.content\b|\boutput_text\b|\bcompletion\b|\.arguments\b|\btool_?[cC]all|\b(?:result|response|output|reply|answer|generation|msg|message)\.text\b/;

// ───────────────────────────── rules ─────────────────────────────

/** @typedef {{path:string, src:string, code:string, masked:string, env:boolean}} Ctx */
/** @typedef {{index:number, message?:string}} Hit */

export const RULES = [
  {
    id: 'HK001', category: 'leak', severity: 'critical', env: true,
    title: 'LLM provider key exposed to the browser bundle',
    fix: 'Drop the public prefix and call the provider from a server route; the bundler inlines every NEXT_PUBLIC_/VITE_/REACT_APP_ variable into client JavaScript.',
    detect: (ctx) => [...matches(PUBLIC_KEY, ctx.code)].map((m) => ({ index: m.index, message: `${m[0]} is inlined into client code` })),
  },
  {
    id: 'HK002', category: 'leak', severity: 'critical',
    title: 'Hard-coded LLM provider secret',
    fix: 'Load the key from a server-only environment variable or secret manager and rotate the leaked key.',
    detect: (ctx) => [...matches(SECRET_LITERAL, ctx.code)].filter((m) => !PLACEHOLDER.test(m[2])).map((m) => ({ index: m.index, message: `Literal key ${m[2].slice(0, 7)}… committed to source` })),
  },
  {
    id: 'HK003', category: 'leak', severity: 'high',
    title: 'Provider SDK shipped to the browser',
    fix: 'Keep provider SDKs server-side and expose a narrow, authenticated /api route; never set dangerouslyAllowBrowser.',
    detect(ctx) {
      const hits = [...matches(/\bdangerouslyAllowBrowser\s*:\s*true\b/g, ctx.masked)].map((m) => ({ index: m.index, message: 'dangerouslyAllowBrowser: true ships the API key to every visitor' }));
      if (/^\s*(['"])use client\1/.test(ctx.code)) {
        for (const m of matches(PROVIDER_SDK, ctx.code)) hits.push({ index: m.index, message: `'use client' module imports ${m[1]}` });
      }
      return hits;
    },
  },
  {
    id: 'HK004', category: 'cost', severity: 'critical',
    title: 'Unbounded agent loop (no max turns or cost ceiling)',
    fix: 'Bound the loop with a MAX_TURNS counter and gate each model call through a budget breaker.',
    detect(ctx) {
      const hits = [];
      const heads = /\bwhile\s*\(\s*(?:true|1|!\s*[\w$.]+)\s*\)\s*\{|\bfor\s*\(\s*;\s*;\s*\)\s*\{|\bdo\s*\{/g;
      for (const m of matches(heads, ctx.masked)) {
        const open = m.index + m[0].length - 1, close = matchBracket(ctx.masked, open);
        if (m[0].startsWith('do') && !/^\s*while\s*\(\s*(?:true|1)\s*\)/.test(ctx.masked.slice(close + 1))) continue;
        const body = ctx.code.slice(open, close);
        if (LLM_CALL.test(body) && !LOOP_BOUND.test(body)) hits.push({ index: m.index, message: 'Model is called inside a loop with no turn or spend bound' });
      }
      return hits;
    },
  },
  {
    id: 'HK005', category: 'cost', severity: 'medium',
    title: 'Model call without an output token cap',
    fix: 'Set max_tokens / maxOutputTokens on every call so one runaway completion cannot exhaust the budget.',
    detect(ctx) {
      const hits = [];
      const re = /\.(?:chat\.completions|completions|responses|messages)\.create\s*\(|(?<![\w$.])(?:generateText|streamText|generateObject|streamObject)\s*\(|\.generateContent(?:Stream)?\s*\(/g;
      const cap = /\b(?:max_tokens|maxTokens|max_completion_tokens|maxCompletionTokens|max_output_tokens|maxOutputTokens)\b/;
      for (const m of matches(re, ctx.masked)) {
        const { args } = callArgs(ctx, m.index + m[0].length);
        if (!args.trim().startsWith('{') || /\.\.\./.test(args) || cap.test(args)) continue;
        if (m[0].includes('generateContent') && cap.test(ctx.code)) continue; // set on getGenerativeModel()
        hits.push({ index: m.index + 1, message: 'No output token cap on this call' });
      }
      return hits;
    },
  },
  {
    id: 'HK006', category: 'cost', severity: 'medium',
    title: 'Raw provider fetch without timeout',
    fix: 'Pass signal: AbortSignal.timeout(ms) and retry 429/5xx with capped exponential backoff, or use the official SDK (built-in timeout and retries).',
    detect(ctx) {
      const hits = [];
      for (const m of matches(PROVIDER_URL, ctx.code)) {
        const open = ctx.masked.indexOf('(', m.index), close = matchBracket(ctx.masked, open);
        if (!/\b(?:signal|timeout)\b/.test(ctx.code.slice(open, close))) hits.push({ index: m.index, message: 'Hung provider connections block the request forever' });
      }
      return hits;
    },
  },
  {
    id: 'HK007', category: 'idempotency', severity: 'critical',
    title: 'Webhook handler without signature verification',
    fix: 'Verify the provider signature over the raw body (e.g. stripe.webhooks.constructEvent, HMAC + timingSafeEqual) before acting on the event, and dedupe by event id.',
    detect(ctx) {
      const handler = /\bexport\s+(?:async\s+)?function\s+POST\b|\bexport\s+const\s+POST\b|\b(?:app|router|server|fastify|api)\.post\s*\(/.exec(ctx.masked);
      if (!handler) return [];
      const isWebhook = /webhook/i.test(ctx.path) || /(['"`])[^'"`\n]*webhook[^'"`\n]*\1/i.test(ctx.code);
      const verified = /constructEvent|verifySignature|verifyWebhook|validateWebhook|timingSafeEqual|createHmac|svix|\bWebhook\s*\(|\.verify\s*\(/.test(ctx.code);
      return isWebhook && !verified ? [{ index: handler.index, message: 'Anyone can POST forged events to this endpoint' }] : [];
    },
  },
  {
    id: 'HK008', category: 'injection', severity: 'critical',
    title: 'Shell command built from tool-call input',
    fix: 'Use execFile/spawn with an argument array (no shell) and validate tool arguments against an allow-list.',
    detect(ctx) {
      if (!/child_process/.test(ctx.code)) return [];
      const hits = [];
      const exec = new RegExp(String.raw`(?<![\w$.])(?:(?:cp|childProcess|child_process)\.)?(?:exec|execSync|execAsync|execPromise)\s*\(\s*(?:\`[^\`]*\$\{|${STR}\s*\+|[\w$.\[\]]+\s*\+)`, 'g');
      for (const m of matches(exec, ctx.code)) hits.push({ index: m.index, message: 'Interpolated command string reaches a shell' });
      for (const m of matches(/(?<![\w$.])(?:(?:cp|childProcess|child_process)\.)?(?:spawn|spawnSync|execFile|execFileSync)\s*\(/g, ctx.masked)) {
        if (/\bshell\s*:\s*true\b/.test(callArgs(ctx, m.index + m[0].length).args)) hits.push({ index: m.index, message: 'shell: true re-enables shell metacharacters' });
      }
      return hits;
    },
  },
  {
    id: 'HK009', category: 'injection', severity: 'critical',
    title: 'SQL built from tool-call input',
    fix: 'Use parameterized queries ($1 / ? placeholders) or a tagged sql`` template; never interpolate model-chosen values.',
    detect(ctx) {
      const re = new RegExp(String.raw`\.(?:query|execute|raw|exec|all|get|run|prepare|unsafe|\$queryRawUnsafe|\$executeRawUnsafe)\s*\(\s*(\`[^\`]*\$\{[^\`]*\`|${STR}\s*\+)`, 'g');
      return [...matches(re, ctx.code)].filter((m) => SQL_TEXT.test(m[1])).map((m) => ({ index: m.index + 1, message: 'Interpolated SQL string' }));
    },
  },
  {
    id: 'HK010', category: 'injection', severity: 'critical',
    title: 'Model output executed as code',
    fix: 'Never eval model output. Parse it as data, or run generated code only in an isolated sandbox (separate process/container, no secrets, no network).',
    detect(ctx) {
      const hits = [];
      for (const m of matches(/(?<![\w$.])eval\s*\(/g, ctx.masked)) {
        const { args } = callArgs(ctx, m.index + m[0].length);
        if (!new RegExp(`^\\s*${STR}\\s*$`).test(args)) hits.push({ index: m.index, message: 'eval() of dynamic input' });
      }
      for (const m of matches(/\bnew\s+Function\s*\(|\bvm\.(?:runInNewContext|runInThisContext|runInContext|compileFunction)\s*\(|\bnew\s+vm\.Script\s*\(/g, ctx.masked)) {
        hits.push({ index: m.index, message: `${m[0].replace(/\s*\($/, '')} compiles dynamic code` });
      }
      return hits;
    },
  },
  {
    id: 'HK011', category: 'schema', severity: 'high',
    title: 'Unguarded JSON.parse of model output',
    fix: 'Extract and repair JSON (output-guard extractJson), validate it against a schema, and handle failure explicitly instead of crashing the request.',
    detect(ctx) {
      const hits = [];
      for (const m of matches(/\bJSON\.parse\s*\(/g, ctx.masked)) {
        const { args } = callArgs(ctx, m.index + m[0].length);
        if (MODEL_OUTPUT.test(args) && !insideTry(ctx.masked, m.index)) hits.push({ index: m.index, message: 'Truncated or fenced model JSON throws here' });
      }
      return hits;
    },
  },
  {
    id: 'HK012', category: 'idempotency', severity: 'high',
    title: 'Side-effecting payment call without idempotency key',
    fix: 'Pass a deterministic idempotencyKey (e.g. derived from the tool-call id) so agent retries cannot double-charge or double-refund.',
    detect(ctx) {
      const hits = [];
      const re = /\b[\w$]*stripe[\w$]*\.(?:paymentIntents|charges|refunds|transfers|payouts|subscriptions|invoices|setupIntents|customers|checkout\.sessions)\.create\s*\(/gi;
      for (const m of matches(re, ctx.masked)) {
        if (!/idempotency_?key/i.test(callArgs(ctx, m.index + m[0].length).args)) hits.push({ index: m.index, message: 'Retried agent turns repeat this side effect' });
      }
      for (const m of matches(/\bfetch\s*\(\s*['"`]https:\/\/api\.stripe\.com/g, ctx.code)) {
        const open = ctx.masked.indexOf('(', m.index), args = ctx.code.slice(open, matchBracket(ctx.masked, open));
        if (/\bPOST\b/i.test(args) && !/idempotency-key/i.test(args)) hits.push({ index: m.index, message: 'POST to Stripe without Idempotency-Key header' });
      }
      return hits;
    },
  },
].map((r) => Object.freeze(r));

export const RULES_BY_ID = Object.freeze(Object.fromEntries(RULES.map((r) => [r.id, r])));

// ───────────────────────────── scanning ─────────────────────────────

function suppressed(lines, line, id) {
  for (const l of [lines[line - 1], lines[line - 2]]) {
    const m = l && /llm-harden-ignore\b([^\n]*)/.exec(l);
    if (m && (!/HK\d{3}/.test(m[1]) || m[1].includes(id))) return true;
  }
  return false;
}

/**
 * Scan one file's source text.
 * @param {string} src
 * @param {string} path  path used for reporting and path-based heuristics
 * @returns {Array<{rule:string,title:string,severity:string,category:string,path:string,line:number,col:number,snippet:string,message:string,fix:string}>}
 */
export function scanSource(src, path = 'input.ts') {
  src = src.replace(/^﻿/, '');
  const env = isEnvFile(path);
  const ctx = env
    ? { path, src, env, code: src.replace(/^[ \t]*#.*$/gm, blank), masked: '' }
    : { path, src, env, ...lex(src) };
  const lines = src.split('\n');
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const locate = (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: idx - starts[lo] + 1 };
  };
  const out = [], seen = new Set();
  for (const rule of RULES) {
    if (env && !rule.env) continue;
    for (const hit of rule.detect(ctx)) {
      const { line, col } = locate(hit.index);
      const key = `${rule.id}:${line}`;
      if (seen.has(key) || suppressed(lines, line, rule.id)) continue;
      seen.add(key);
      out.push({
        rule: rule.id, title: rule.title, severity: rule.severity, category: rule.category,
        path, line, col, snippet: lines[line - 1].trim().slice(0, 200), message: hit.message ?? rule.title, fix: rule.fix,
      });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule));
}

async function* walk(dir) {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(p); }
    else if (e.isFile() && isScannable(p)) yield p;
  }
}

/** Per-category 0–100 score: 100 minus severity weights of findings, floored at 0. */
export function scoreFindings(findings) {
  const scores = {};
  for (const cat of Object.keys(CATEGORIES)) {
    const penalty = findings.filter((f) => f.category === cat).reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
    scores[cat] = Math.max(0, 100 - penalty);
  }
  const values = Object.values(scores);
  return { categories: scores, overall: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
}

export function summarize(findings) {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  const byRule = {};
  for (const f of findings) { bySeverity[f.severity]++; byRule[f.rule] = (byRule[f.rule] ?? 0) + 1; }
  return { total: findings.length, bySeverity, byRule };
}

/**
 * Recursively scan a directory (or a single file).
 * @param {string} target
 */
export async function scanDir(target) {
  const info = await stat(target);
  const files = info.isFile() ? [target] : [];
  if (info.isDirectory()) for await (const p of walk(target)) files.push(p);
  const root = info.isFile() ? join(target, '..') : target;
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    if ((await stat(file)).size > MAX_BYTES) continue;
    scanned++;
    findings.push(...scanSource(await readFile(file, 'utf8'), relative(root, file).split(sep).join('/')));
  }
  return { root: target, filesScanned: scanned, findings, summary: summarize(findings), score: scoreFindings(findings) };
}

/** True if any finding is at or above `threshold` severity ('none' never fails). */
export function exceeds(findings, threshold = 'high') {
  if (threshold === 'none') return false;
  const cut = SEVERITY_ORDER.indexOf(threshold);
  if (cut < 0) throw new Error(`Unknown severity: ${threshold}`);
  return findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) <= cut);
}
