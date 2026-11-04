// Deterministic LLM output sanitizer. Zero dependencies.
//
// - extractJson / repairJson: pull JSON out of fenced or chatty output, repair truncation
//   (unclosed strings/containers, dangling keys, partial literals), trailing commas,
//   raw newlines inside strings, and trailing prose.
// - validateSchema: strict JSON Schema subset (draft 2020-12 keywords listed in README).
// - redact / createStreamGuard: strip provider keys, caller-supplied secrets and verbatim
//   system-prompt fragments (k-word shingles) from batch or streamed output.
// - verifyCitations: check [n] markers resolve to supplied sources and quoted spans exist in them.

// ───────────────────────────── JSON ─────────────────────────────

const WS = /\s/;
const LITERAL = /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Repair possibly-truncated or dirty JSON text starting at its first `{` or `[`.
 * @returns {{ text: string, complete: boolean } | null}  complete=false means content was cut/closed
 */
export function repairJson(src) {
  const startAt = src.search(/[{[]/);
  if (startAt < 0) return null;
  let out = '', i = startAt, cp = null, done = false;
  const stack = []; // { t: '{'|'[', e: 'key'|'colon'|'value'|'comma' }
  const closers = () => stack.map((f) => (f.t === '{' ? '}' : ']')).reverse().join('');
  const mark = () => { cp = { len: out.length, closers: closers() }; };
  const valueDone = () => { const top = stack.at(-1); if (!top) done = true; else top.e = 'comma'; mark(); };
  const n = src.length;

  scan: while (i < n && !done) {
    const c = src[i], top = stack.at(-1);
    const expectValue = !top || top.e === 'value';
    if (WS.test(c)) { out += c; i++; continue; }
    if ((c === '{' || c === '[') && expectValue) {
      out += c; stack.push({ t: c, e: c === '{' ? 'key' : 'value' }); mark(); i++; continue;
    }
    if (c === '"' && (expectValue || top?.e === 'key')) {
      const isKey = top?.e === 'key';
      let j = i + 1, s = '"';
      for (; j < n; j++) {
        const ch = src[j];
        if (ch === '\\') {
          const esc = src.slice(j, j + 2);
          if (esc.length < 2 || (esc === '\\u' && !/^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6)))) { j = n; break; }
          s += src.slice(j, esc === '\\u' ? j + 6 : j + 2); j += esc === '\\u' ? 5 : 1; continue;
        }
        if (ch === '"') break;
        s += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch < ' ' ? '' : ch;
      }
      if (j >= n) { // truncated inside the string
        if (isKey) break scan;
        out += s + '"'; valueDone(); break scan;
      }
      out += s + '"'; i = j + 1;
      if (isKey) top.e = 'colon'; else valueDone();
      continue;
    }
    if (c === ':' && top?.e === 'colon') { out += c; top.e = 'value'; i++; continue; }
    if (c === ',' && top?.e === 'comma') { out += c; top.e = top.t === '{' ? 'key' : 'value'; i++; continue; }
    if ((c === '}' && top?.t === '{' && (top.e === 'comma' || top.e === 'key')) || (c === ']' && top?.t === '[' && (top.e === 'comma' || top.e === 'value'))) {
      let k = out.length; while (k > 0 && WS.test(out[k - 1])) k--;
      if (out[k - 1] === ',') out = out.slice(0, k - 1) + out.slice(k); // trailing comma
      out += c; stack.pop(); valueDone(); i++; continue;
    }
    if (expectValue) {
      LITERAL.lastIndex = i;
      const lit = LITERAL.exec(src)?.[0];
      if (lit && /[\s,}\]]/.test(src[i + lit.length] ?? '')) { out += lit; i += lit.length; valueDone(); continue; }
    }
    break; // truncation, partial literal, or trailing prose
  }
  if (done) return { text: out.trim(), complete: true };
  if (!cp) return null;
  return { text: (out.slice(0, cp.len) + cp.closers).trim(), complete: false };
}

const FENCE = /```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;

/**
 * Extract the JSON payload from model output (```json fences first, then any fence, then raw).
 * @returns {{ ok: true, value: any, repaired: boolean, truncated: boolean, source: 'fence'|'raw' } | { ok: false, error: string }}
 */
export function extractJson(text) {
  const fences = [...String(text).matchAll(FENCE)];
  const candidates = [
    ...fences.filter((m) => /^json/i.test(m[1])).map((m) => ['fence', m[2]]),
    ...fences.filter((m) => !/^json/i.test(m[1])).map((m) => ['fence', m[2]]),
    ['raw', String(text)],
  ];
  for (const [source, body] of candidates) {
    const trimmed = body.trim();
    try { return { ok: true, value: JSON.parse(trimmed), repaired: false, truncated: false, source }; } catch {}
    const fixed = repairJson(body);
    if (!fixed) continue;
    try { return { ok: true, value: JSON.parse(fixed.text), repaired: true, truncated: !fixed.complete, source }; } catch {}
  }
  return { ok: false, error: 'no parseable JSON found' };
}

// ───────────────────────────── schema ─────────────────────────────

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeMatches = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number' && Number.isFinite(v));
const ptr = (path) => (path.length ? '/' + path.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '');

/**
 * Validate against a JSON Schema subset: type, enum, const, properties, required,
 * additionalProperties, items, prefixItems, minItems, maxItems, uniqueItems, minLength, maxLength,
 * pattern, minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, anyOf, oneOf, allOf, not.
 * With strict (default), objects reject unknown properties unless additionalProperties is set.
 * @returns {{ valid: boolean, errors: Array<{path:string, message:string}> }}
 */
export function validateSchema(value, schema, { strict = true } = {}) {
  const errors = [];
  const err = (path, message) => errors.push({ path: ptr(path), message });
  const visit = (v, s, path) => {
    if (s === true || s == null) return;
    if (s === false) return err(path, 'no value allowed');
    if (s.type) {
      const types = [].concat(s.type);
      if (!types.some((t) => typeMatches(v, t))) return err(path, `expected ${types.join('|')}, got ${typeOf(v)}`);
    }
    if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) err(path, `must be one of ${JSON.stringify(s.enum)}`);
    if ('const' in s && JSON.stringify(s.const) !== JSON.stringify(v)) err(path, `must equal ${JSON.stringify(s.const)}`);
    if (typeof v === 'string') {
      const len = [...v].length;
      if (s.minLength != null && len < s.minLength) err(path, `shorter than ${s.minLength}`);
      if (s.maxLength != null && len > s.maxLength) err(path, `longer than ${s.maxLength}`);
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err(path, `does not match ${s.pattern}`);
    }
    if (typeof v === 'number') {
      if (s.minimum != null && v < s.minimum) err(path, `< minimum ${s.minimum}`);
      if (s.maximum != null && v > s.maximum) err(path, `> maximum ${s.maximum}`);
      if (s.exclusiveMinimum != null && v <= s.exclusiveMinimum) err(path, `<= exclusiveMinimum ${s.exclusiveMinimum}`);
      if (s.exclusiveMaximum != null && v >= s.exclusiveMaximum) err(path, `>= exclusiveMaximum ${s.exclusiveMaximum}`);
      if (s.multipleOf != null && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) err(path, `not a multiple of ${s.multipleOf}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems != null && v.length < s.minItems) err(path, `fewer than ${s.minItems} items`);
      if (s.maxItems != null && v.length > s.maxItems) err(path, `more than ${s.maxItems} items`);
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) err(path, 'items not unique');
      const prefix = s.prefixItems ?? [];
      v.forEach((x, i) => visit(x, i < prefix.length ? prefix[i] : s.items, [...path, i]));
    }
    if (typeOf(v) === 'object') {
      for (const k of s.required ?? []) if (!Object.hasOwn(v, k)) err([...path, k], 'is required');
      const props = s.properties ?? {};
      const extra = s.additionalProperties ?? (strict && s.properties ? false : true);
      for (const [k, x] of Object.entries(v)) {
        if (Object.hasOwn(props, k)) visit(x, props[k], [...path, k]);
        else if (extra === false) err([...path, k], 'unexpected property');
        else visit(x, extra, [...path, k]);
      }
    }
    const sub = (s2) => validateSchema(v, s2, { strict }).valid;
    if (s.allOf) s.allOf.forEach((s2) => visit(v, s2, path));
    if (s.anyOf && !s.anyOf.some(sub)) err(path, 'matches no anyOf branch');
    if (s.oneOf && s.oneOf.filter(sub).length !== 1) err(path, 'must match exactly one oneOf branch');
    if (s.not && sub(s.not)) err(path, 'matches forbidden schema');
  };
  visit(value, schema, []);
  return { valid: errors.length === 0, errors };
}

// ───────────────────────────── redaction ─────────────────────────────

export const SECRET_PATTERNS = Object.freeze([
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g],
  ['anthropic-key', /\bsk-ant-[a-z]+\d*-[A-Za-z0-9_-]{20,}/g],
  ['openai-key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['groq-key', /\bgsk_[A-Za-z0-9]{40,}/g],
  ['xai-key', /\bxai-[A-Za-z0-9]{40,}/g],
  ['huggingface-token', /\bhf_[A-Za-z0-9]{30,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g],
]);

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const words = (s) => [...s.matchAll(WORD)].map((m) => ({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length }));

/** Build a reusable span finder for the given redaction options. */
function spanFinder({ systemPrompt, secrets = [], minWords = 8, patterns = SECRET_PATTERNS } = {}) {
  const shingles = new Set();
  if (systemPrompt) {
    const pw = words(systemPrompt).map((x) => x.w);
    for (let i = 0; i + minWords <= pw.length; i++) shingles.add(pw.slice(i, i + minWords).join(' '));
  }
  const literals = secrets.filter((s) => typeof s === 'string' && s.length >= 4);
  return (text) => {
    const spans = [];
    for (const [type, re] of patterns) for (const m of text.matchAll(new RegExp(re.source, re.flags))) spans.push({ type, start: m.index, end: m.index + m[0].length });
    for (const lit of literals) for (let i = text.indexOf(lit); i >= 0; i = text.indexOf(lit, i + 1)) spans.push({ type: 'secret', start: i, end: i + lit.length });
    if (shingles.size) {
      const tw = words(text);
      for (let i = 0; i + minWords <= tw.length; i++) {
        if (shingles.has(tw.slice(i, i + minWords).map((x) => x.w).join(' '))) spans.push({ type: 'system-prompt', start: tw[i].start, end: tw[i + minWords - 1].end });
      }
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const s of spans) {
      const last = merged.at(-1);
      if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
      else merged.push({ ...s });
    }
    return merged;
  };
}

const apply = (text, spans) => {
  let out = '', pos = 0;
  for (const s of spans) { out += text.slice(pos, s.start) + `[REDACTED:${s.type}]`; pos = s.end; }
  return out + text.slice(pos);
};

/**
 * Remove provider keys, caller secrets and verbatim system-prompt fragments (>= minWords words).
 * @returns {{ text: string, redactions: Array<{type:string, start:number, end:number}> }}
 */
export function redact(text, opts = {}) {
  const spans = spanFinder(opts)(String(text));
  return { text: apply(String(text), spans), redactions: spans };
}

/**
 * Streaming redactor. Holds back `holdback` chars so secrets split across chunks are caught,
 * and keeps an already-emitted tail as context so a prompt fragment straddling chunks is cut
 * from the point it becomes detectable (at most minWords-1 words can precede detection).
 */
export function createStreamGuard({ holdback = 512, ...opts } = {}) {
  const find = spanFinder(opts);
  let buf = '', tail = '';
  const redactions = [];
  const emit = (final) => {
    const ctx = tail + buf, spans = find(ctx).filter((s) => s.end > tail.length)
      .map((s) => ({ ...s, start: Math.max(0, s.start - tail.length), end: s.end - tail.length }));
    let cut = final ? buf.length : Math.max(0, buf.length - holdback);
    for (const s of spans) if (s.start < cut && s.end > cut) cut = s.start;
    const done = spans.filter((s) => s.end <= cut);
    const out = apply(buf.slice(0, cut), done);
    redactions.push(...done.map((s) => ({ type: s.type })));
    tail = (tail + buf.slice(0, cut)).slice(-holdback);
    buf = buf.slice(cut);
    return out;
  };
  return {
    /** Feed a chunk; returns the text that is now safe to forward. */
    push(chunk) { buf += chunk; return emit(false); },
    /** Flush everything remaining. */
    end() { return emit(true); },
    get redactions() { return [...redactions]; },
  };
}

// ───────────────────────────── citations ─────────────────────────────

const norm = (s) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Verify `[1]`, `[^2]`, `[1, 3]`, `[S4]` markers against sources, and that a quotation
 * immediately before a marker ("…" [2]) appears verbatim (whitespace/case-insensitive) in that source.
 * @param {string} text
 * @param {Array<{id:string|number, text?:string, url?:string}>} sources
 */
export function verifyCitations(text, sources, { requireCitation = true } = {}) {
  const byId = new Map(sources.map((s) => [String(s.id), s]));
  const cited = new Set(), missing = new Set(), unverifiedQuotes = [], verifiedQuotes = [];
  for (const m of String(text).matchAll(/\[\^?([A-Za-z]?\d+(?:\s*[,;]\s*[A-Za-z]?\d+)*)\]/g)) {
    const ids = m[1].split(/\s*[,;]\s*/);
    const before = text.slice(Math.max(0, m.index - 400), m.index);
    const q = /["“]([^"“”\n]{6,})["”]\s*$/.exec(before)?.[1];
    for (const id of ids) {
      if (!byId.has(id)) { missing.add(id); continue; }
      cited.add(id);
    }
    if (q) {
      const ok = ids.some((id) => byId.get(id)?.text && norm(byId.get(id).text).includes(norm(q)));
      (ok ? verifiedQuotes : unverifiedQuotes).push({ quote: q, ids });
    }
  }
  const uncited = [...byId.keys()].filter((id) => !cited.has(id));
  const valid = missing.size === 0 && unverifiedQuotes.length === 0 && (!requireCitation || !sources.length || cited.size > 0);
  return { valid, cited: [...cited], missing: [...missing], verifiedQuotes, unverifiedQuotes, uncited };
}

// ───────────────────────────── pipeline ─────────────────────────────

/**
 * One-call batch guard: redact → (extract JSON → validate schema) → (verify citations).
 * @param {string} text
 * @param {{ systemPrompt?:string, secrets?:string[], minWords?:number, json?:boolean, schema?:object, strict?:boolean, sources?:Array }} [opts]
 */
export function guardOutput(text, opts = {}) {
  const { text: clean, redactions } = redact(text, opts);
  const result = { ok: true, text: clean, redactions };
  if (opts.json || opts.schema) {
    const parsed = extractJson(clean);
    result.json = parsed;
    if (!parsed.ok) result.ok = false;
    else if (opts.schema) {
      result.schema = validateSchema(parsed.value, opts.schema, { strict: opts.strict ?? true });
      if (!result.schema.valid) result.ok = false;
    }
  }
  if (opts.sources) {
    result.citations = verifyCitations(clean, opts.sources);
    if (!result.citations.valid) result.ok = false;
  }
  return result;
}
