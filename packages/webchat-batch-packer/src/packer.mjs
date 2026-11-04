// Deterministic packer: task spec → budgeted, checksummed single-paste packets plus the manifest the unpacker routes by.
// No clocks, no randomness: identical specs give byte-identical packets and ids.
import { sha256 } from './hash.mjs';
import { stripNoise } from './strip-noise.mjs';

export const PROTOCOL = 1;
const enc = new TextEncoder();

/**
 * Offline token estimate tuned to BPE tokenizers (cl100k/o200k): ~1 token per short word, long words split every 6 chars,
 * digit runs every 3, ASCII punctuation runs every 3 (`":"`, `</` merge), non-ASCII ~1 per code point. Biased slightly high.
 */
export function estimateTokens(text) {
  let n = 0;
  for (const m of String(text).matchAll(/[A-Za-z]+|\d+|[!-\/:-@[-`{-~]+|[^\x00-\x7f]+/gu)) {
    const t = m[0], c = t.charCodeAt(0);
    if (c >= 48 && c <= 57) n += Math.ceil(t.length / 3);
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n += Math.ceil(t.length / 6);
    else if (c < 128) n += Math.ceil(t.length / 3);
    else n += [...t].length;
  }
  return n + Math.ceil((String(text).match(/\n/g) || []).length / 4);
}

/** `{{name}}` substitution; an unknown placeholder is an error, never a silent blank. */
export function renderTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), vars);
    if (v == null) throw new Error(`Template variable {{${k}}} is not defined`);
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

const canonJson = v => (Array.isArray(v) ? `[${v.map(canonJson).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonJson(v[k])).join(',')}}` : JSON.stringify(v));
const attr = v => (/^[^\s=]+$/.test(v) ? v : JSON.stringify(v));

function prepareSource(s, i) {
  if (!s || typeof s.path !== 'string' || !s.path) throw new Error(`sources[${i}] needs a path`);
  if (typeof s.text !== 'string') throw new Error(`sources[${i}] (${s.path}) needs text`);
  const html = s.html ?? /\.x?html?$/i.test(s.path);
  const lines = html || s.strip ? stripNoise(s.text, { html, links: s.links }).lines : s.text ? s.text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
  return { path: s.path, url: s.url || null, number: s.number !== false, lines, sha: sha256(s.text).slice(0, 12), rawBytes: enc.encode(s.text).length };
}

function header(spec) {
  const parts = ['=== TASK ===', renderTemplate(spec.task, spec.vars).trim()];
  if (spec.schema != null) parts.push('=== SCHEMA ===', (typeof spec.schema === 'string' ? spec.schema : JSON.stringify(spec.schema, null, 2)).trim());
  if (spec.exclude?.length) parts.push(`=== EXCLUDE (${spec.exclude.length}) ===`, 'Do not return or re-verify these; they are already known:', ...spec.exclude.map(x => `- ${x}`));
  return parts.join('\n');
}

function contract(id, outputs, cite) {
  return ['=== REPLY FORMAT ===',
    'Reply in plain text only: no commentary, no code fences, no markdown around the markers.',
    'Write each output file in full between its markers, each marker on its own line:',
    '=== FILE: <relative/path> ===',
    '<complete file content>',
    '=== END FILE ===',
    'To add lines to the end of an existing file instead, use `=== APPEND: <relative/path> ===` … `=== END APPEND ===`.',
    `Allowed paths: ${outputs.length ? outputs.join(', ') : 'any relative path'}.`,
    ...(cite ? [`Back every factual claim with [verified: <url> "<exact quote copied from a SOURCE above>"]; quote the source text, not its L-number.`] : []),
    `The very first line of your reply must be exactly: === BEGIN_BUNDLE packet=${id} ===`,
    `The very last line of your reply must be exactly: === END_BUNDLE packet=${id} ===`].join('\n');
}

function sourceBlock(src, from, to) {
  const body = src.number ? src.lines.slice(from, to).map((l, k) => `L${from + k + 1} ${l}`) : src.lines.slice(from, to);
  const head = `=== SOURCE: ${attr(src.path)}${src.url ? ` url=${attr(src.url)}` : ''} lines=L${from + 1}-L${to} of=${src.lines.length} sha=${src.sha} ===`;
  return [head, ...body, '=== END SOURCE ==='].join('\n');
}

/**
 * Compile a task spec into packets.
 * spec: { task, vars?, schema?, exclude?: string[], sources?: [{ path, text, url?, html?, strip?, number? }], outputs?: string[],
 *         budget?: tokens per packet (default 24000), cite?: boolean (default true) }
 * Returns { batch, packets: [{ id, part, of, text, tokens, sources }], manifest }.
 */
export function pack(spec) {
  if (!spec || typeof spec.task !== 'string' || !spec.task.trim()) throw new Error('spec.task (string) is required');
  const budget = spec.budget ?? 24000;
  if (!(Number.isInteger(budget) && budget > 0)) throw new Error('spec.budget must be a positive integer');
  const outputs = (spec.outputs || []).map(String);
  const exclude = (spec.exclude || []).map(String);
  const sources = (spec.sources || []).map(prepareSource);
  const cite = spec.cite !== false;
  const head = header({ ...spec, exclude });
  // Fixed overhead per packet: header, contract (id length is constant), markers.
  const overhead = estimateTokens(head) + estimateTokens(contract('pk-000000000000', outputs, cite)) + 60;
  if (overhead >= budget) throw new Error(`Budget ${budget} is below the fixed packet overhead (~${overhead} tokens)`);

  // Greedy, order-preserving fill. A source larger than the remaining room is split on line boundaries.
  const groups = [[]];
  let room = budget - overhead;
  for (const src of sources) {
    let from = 0;
    while (from < src.lines.length || (from === 0 && !src.lines.length)) {
      const blockCost = to => estimateTokens(sourceBlock(src, from, to));
      let to = src.lines.length;
      if (blockCost(to) > room) {
        let lo = from, hi = src.lines.length; // largest `to` that fits
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (blockCost(mid) <= room) lo = mid; else hi = mid - 1; }
        to = lo;
        if (to === from) {
          if (groups.at(-1).length) { groups.push([]); room = budget - overhead; continue; }
          to = from + 1; // a single line larger than a whole packet still has to go somewhere
        }
      }
      groups.at(-1).push({ src, from, to });
      room -= blockCost(to);
      from = to;
      if (!src.lines.length) break;
    }
  }
  if (groups.length > 1 && !groups.at(-1).length) groups.pop();

  const of = groups.length;
  const batch = 'bt-' + sha256(canonJson({ p: PROTOCOL, head, outputs, cite, budget, s: sources.map(s => [s.path, s.url, s.sha, s.number]) })).slice(0, 12);
  const packets = groups.map((g, k) => {
    const blocks = g.map(({ src, from, to }) => sourceBlock(src, from, to));
    const id = 'pk-' + sha256(canonJson({ batch, part: k + 1, of, blocks })).slice(0, 12);
    const body = [head, ...blocks, contract(id, outputs, cite)].join('\n');
    const tokens = estimateTokens(body) + 40;
    const begin = `=== BEGIN_BUNDLE packet=${id} kind=request batch=${batch} part=${k + 1}/${of} est_tokens=${tokens} ===`;
    const text = `${begin}\n${body}\n=== END_BUNDLE packet=${id} kind=request sha256=${sha256(begin + '\n' + body)} ===\n`;
    return { id, part: k + 1, of, text, tokens, overBudget: tokens > budget,
      sources: g.map(({ src, from, to }) => ({ path: src.path, url: src.url, lines: [from + 1, to] })) };
  });
  const manifest = {
    protocol: PROTOCOL, batch, outputs, exclude, cite,
    // Stripped source text is kept so quotes stay checkable even after the raw page is gone.
    sources: sources.map(s => ({ path: s.path, url: s.url, sha: s.sha, text: s.lines.join('\n') })),
    packets: Object.fromEntries(packets.map(p => [p.id, { part: p.part, of: p.of, tokens: p.tokens, sources: p.sources }])),
  };
  return { batch, packets, manifest };
}

/** Recheck a pasted request packet: returns { ok, id, reason? }. Catches truncation and hand edits before the paste. */
export function verifyPacket(text) {
  const t = String(text).replace(/\r\n?/g, '\n');
  const b = t.match(/^=== BEGIN_BUNDLE packet=(pk-[0-9a-f]{12}) kind=request [^\n]*===$/m);
  if (!b) return { ok: false, id: null, reason: 'NO_BEGIN' };
  const id = b[1], from = b.index;
  const e = new RegExp(`^=== END_BUNDLE packet=${id} kind=request sha256=([0-9a-f]{64}) ===$`, 'm').exec(t.slice(from));
  if (!e) return { ok: false, id, reason: 'TRUNCATED' };
  const inner = t.slice(from, from + e.index - 1);
  return sha256(inner) === e[1] ? { ok: true, id } : { ok: false, id, reason: 'CHECKSUM_MISMATCH' };
}
