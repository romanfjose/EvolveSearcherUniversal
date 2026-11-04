// Strict unpacker: pasted chat replies → validated, routed file operations. Pure (no I/O); commit.mjs does the writes.
// Repairs are applied only where the intent is unambiguous, and every repair is reported; anything ambiguous is held.
import { lintCitations, lintGates, canonicalUrl } from './citations.mjs';
import { unifiedDiff } from './diff.mjs';

const ZW = /[​-‍⁠﻿]/g;
const MARKER = /^={2,}[ \t]*(BEGIN[_ ]?BUNDLE|END[_ ]?BUNDLE|END[_ ]?FILE|END[_ ]?APPEND|FILE|APPEND)\b[ \t]*:?[ \t]*(.*?)[ \t]*(={2,})?$/i;
const KIND = { BEGINBUNDLE: 'begin', ENDBUNDLE: 'end', FILE: 'file', APPEND: 'append', ENDFILE: 'endfile', ENDAPPEND: 'endappend' };
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([\w.+#-]*)[ \t]*$/;
const RESERVED_SEGMENT = /^(\.git|\.wbp|\.hg|\.svn|node_modules)$/i;
const WIN_DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Parse one line as an envelope marker. Returns null or { kind, arg, attrs, repairs[] }. */
export function readMarker(raw) {
  const repairs = [];
  let t = raw.replace(ZW, '').trim();
  if (!t.includes('=')) return null;
  const before = t;
  t = t.replace(/\\([=_*`#\-[\]])/g, '$1');
  for (let changed = true; changed;) {
    changed = false;
    for (const re of [/^>[ \t]*/, /^#{1,6}[ \t]+/, /^[-*+][ \t]+(?==)/]) if (re.test(t)) { t = t.replace(re, ''); changed = true; }
    const wrap = /^(\*\*|__|`+|\*|_)([\s\S]+)\1$/.exec(t);
    if (wrap && wrap[2].trim().startsWith('==')) { t = wrap[2].trim(); changed = true; }
  }
  const m = MARKER.exec(t);
  if (!m) return null;
  const kind = KIND[m[1].toUpperCase().replace(/[_ ]/g, '')];
  let arg = m[2];
  if (t !== before) repairs.push('MARKER_DECORATED');
  const head = t.match(/^={2,}/)[0];
  const canonicalKw = { begin: 'BEGIN_BUNDLE', end: 'END_BUNDLE', file: 'FILE:', append: 'APPEND:', endfile: 'END FILE', endappend: 'END APPEND' }[kind];
  if (head !== '===' || (m[3] && m[3] !== '===')) repairs.push('MARKER_EQUALS');
  if (!m[3]) repairs.push('MARKER_UNTERMINATED');
  if (!t.slice(head.length).trimStart().startsWith(canonicalKw)) repairs.push('MARKER_KEYWORD');
  if (kind === 'file' || kind === 'append') {
    if (!m[3] && !/^={2,}[ \t]*\w+[ \t]*:/.test(t)) return null; // `=== FILE header…` prose: needs a colon or a closing ===

    const q = /^(`+|"|'|<)(.*)(`+|"|'|>)$/.exec(arg);
    if (q && ({ '<': '>' }[q[1]] || q[1]) === q[3]) { arg = q[2].trim(); repairs.push('PATH_QUOTED'); }
    return { kind, arg, attrs: {}, repairs };
  }
  if (kind === 'endfile' || kind === 'endappend') return arg ? null : { kind, arg: '', attrs: {}, repairs };
  const attrs = {};
  for (const a of arg.matchAll(/([\w-]+)=("[^"]*"|\S+)/g)) attrs[a[1].toLowerCase()] = a[2].replace(/^"|"$/g, '');
  return { kind, arg, attrs, repairs };
}

const glob = p => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, t => (t === '?' ? '[^/]' : t === '*' ? '[^/]*' : '(?:.*/)?' + (t.endsWith('/') ? '' : '.*'))) + '$');
/** Is a normalised relative path inside the allow list? `dir/` = prefix, globs `*` `**` `?`, otherwise exact. Empty list allows all. */
export function pathAllowed(p, allow = []) {
  if (!allow.length) return true;
  return allow.some(a => (a.endsWith('/') ? p.startsWith(a) : /[*?]/.test(a) ? glob(a).test(p) : p === a));
}

/** Validate and normalise a reply path. Returns { ok, path, code?, message?, repairs[] }. Rejects every escape route out of the root. */
export function checkPath(rawPath, allow = []) {
  const repairs = [], fail = (code, message) => ({ ok: false, path: rawPath, code, message, repairs });
  let p = String(rawPath ?? '');
  if (!p.trim()) return fail('PATH_EMPTY', 'FILE marker names no path');
  if (/[\u0000-\u001f\u007f]/.test(p)) return fail('PATH_ILLEGAL_CHAR', 'Path contains control characters');
  if (p !== p.trim()) { p = p.trim(); repairs.push('PATH_TRIMMED'); }
  if (p.length > 240) return fail('PATH_TOO_LONG', 'Path is longer than 240 characters');
  let decoded = p;
  try { decoded = decodeURIComponent(p); } catch { /* literal % is fine */ }
  const variants = [p, decoded, p.normalize('NFKC'), decoded.normalize('NFKC')].map(v => v.replace(/\\/g, '/'));
  for (const v of variants) {
    if (/^\/|^~|^[a-zA-Z]:|^\/\/|^[a-z][\w+.-]*:\/\//i.test(v)) return fail('PATH_ABSOLUTE', 'Absolute, home-relative, drive or URL paths are refused');
    if (v.split('/').some(s => s.trim() === '..' || /^\.{2,}$/.test(s.trim()))) return fail('PATH_TRAVERSAL', '`..` segments are refused');
  }
  if (decoded !== p && /[./\\]/.test(decoded.replace(p, ''))) return fail('PATH_ENCODED', 'Percent-encoded separators or dots are refused');
  if (variants[2] !== variants[0]) return fail('PATH_ENCODED', 'Path uses Unicode look-alike characters (NFKC-unstable)');
  if (/[<>:"|?*]/.test(p)) return fail('PATH_ILLEGAL_CHAR', 'Path contains characters that are invalid on Windows (<>:"|?*)');
  if (p.includes('\\')) { p = p.replace(/\\/g, '/'); repairs.push('PATH_BACKSLASH'); }
  if (p.endsWith('/')) return fail('PATH_IS_DIR', 'Path names a directory');
  const segs = p.split('/');
  const kept = segs.filter(s => s !== '' && s !== '.');
  if (kept.length !== segs.length) repairs.push('PATH_NORMALIZED');
  for (const s of kept) {
    if (RESERVED_SEGMENT.test(s)) return fail('PATH_RESERVED', `\`${s}\` is a protected directory`);
    if (WIN_DEVICE.test(s)) return fail('PATH_RESERVED', `\`${s}\` is a reserved device name`);
    if (/[. ]$/.test(s)) return fail('PATH_TRAILING', `Segment \`${s}\` ends with a dot or space`);
  }
  const norm = kept.join('/');
  if (!pathAllowed(norm, allow)) return { ok: false, path: norm, code: 'PATH_NOT_ALLOWED', message: `Not in this packet's allowed paths (${allow.join(', ')})`, repairs };
  return { ok: true, path: norm, repairs };
}

/** Strip a fence that wraps a whole body. Returns { body, repair? , ambiguous? }. */
export function unwrapFence(body) {
  const lines = body.split('\n');
  let s = 0, e = lines.length - 1;
  while (s <= e && !lines[s].trim()) s++;
  while (e >= s && !lines[e].trim()) e--;
  if (s > e) return { body };
  const open = FENCE.exec(lines[s]), close = FENCE.exec(lines[e]);
  const closes = (o, l) => { const f = FENCE.exec(l); return f && !f[2] && f[1][0] === o[1][0] && f[1].length >= o[1].length; };
  if (open && s < e && close && closes(open, lines[e])) {
    // Wrapper only if the opening fence's first closer is the last line.
    let k = s + 1;
    while (k < e && !closes(open, lines[k])) k++;
    if (k === e) return { body: lines.slice(s + 1, e).join('\n'), repair: 'FENCE_UNWRAPPED' };
    return { body, ambiguous: true };
  }
  // Dangling halves (fence opened after the FILE marker but closed after END FILE, or vice versa) can never be valid content.
  const fenceLines = lines.filter(l => FENCE.test(l));
  if (open && fenceLines.length === 1) return { body: lines.slice(s + 1).join('\n'), repair: 'FENCE_DANGLING' };
  if (close && !close[2] && fenceLines.length === 1 && s !== e) return { body: lines.slice(0, e).join('\n'), repair: 'FENCE_DANGLING' };
  return { body };
}

const REPAIR_TEXT = {
  MARKER_DECORATED: 'Marker was wrapped in markdown (bold, heading, quote, backticks or escapes)', MARKER_EQUALS: 'Marker used a non-standard number of `=`',
  MARKER_UNTERMINATED: 'Marker had no closing `===`', MARKER_KEYWORD: 'Marker keyword was misspelled or mis-cased', MARKER_INLINE: 'End marker was glued to the last content line',
  MARKER_MISMATCH: 'Block was closed with the other END marker', PATH_QUOTED: 'Path was wrapped in quotes or backticks', PATH_TRIMMED: 'Path had surrounding whitespace',
  PATH_BACKSLASH: 'Backslashes converted to `/`', PATH_NORMALIZED: '`./` or `//` removed from path', FENCE_UNWRAPPED: 'Code fence wrapping the whole body removed',
  FENCE_DANGLING: 'Unpaired code fence at the edge of the body removed', BUNDLE_HEADER_MISSING: 'Reply had no BEGIN_BUNDLE line; routed to the only packet in the manifest',
  CRLF: 'Windows line endings normalised', BOM: 'Byte-order mark removed',
};
const diag = (code, severity, message, line, extra = {}) => ({ code, severity, message, line, ...extra });

/** Split pasted text (any number of chat replies, transcripts included) into reply bundles. */
export function splitBundles(input) {
  const global = [];
  let text = String(input ?? '');
  if (text.startsWith('﻿')) { text = text.slice(1); global.push('BOM'); }
  if (/\r/.test(text)) { text = text.replace(/\r\n?/g, '\n'); global.push('CRLF'); }
  const lines = text.split('\n');
  const bundles = [];
  let cur = null, skipping = null, requests = 0;
  const close = (endLine, terminated) => { cur.endLine = endLine; cur.terminated = terminated; bundles.push(cur); cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], mk = readMarker(raw);
    if (skipping) {
      if (mk?.kind === 'end' && mk.attrs.packet === skipping && mk.attrs.kind === 'request') skipping = null;
      else if (mk?.kind === 'begin' && mk.attrs.kind !== 'request') { skipping = null; i--; } // a pasted request that lost its tail
      continue;
    }
    if (mk?.kind === 'begin') {
      if (mk.attrs.kind === 'request') { requests++; if (cur) close(i, false); skipping = mk.attrs.packet || '?'; continue; }
      if (cur) close(i, false);
      cur = { packet: mk.attrs.packet ?? null, startLine: i + 1, endLine: null, terminated: false, implicit: false, repairs: mk.repairs.map(c => ({ code: c, line: i + 1 })), lines: [] };
      continue;
    }
    if (mk?.kind === 'end' && cur) {
      if (mk.attrs.kind === 'request') continue;
      cur.endPacket = mk.attrs.packet ?? null;
      cur.repairs.push(...mk.repairs.map(c => ({ code: c, line: i + 1 })));
      close(i + 1, true);
      continue;
    }
    if (!cur && (mk?.kind === 'file' || mk?.kind === 'append')) {
      cur = { packet: null, startLine: i + 1, endLine: null, terminated: false, implicit: true, repairs: [], lines: [] };
    }
    if (cur) cur.lines.push({ text: raw, no: i + 1 });
  }
  if (cur) close(lines.length, false);
  return { bundles, requestsSkipped: requests, repairs: global };
}

function parseItems(bundle) {
  const items = [], notes = [];
  let item = null, stray = 0;
  const finish = (terminated, line) => {
    item.terminated = terminated;
    item.endLine = line;
    items.push(item);
    item = null;
  };
  for (const { text, no } of bundle.lines) {
    let mk = readMarker(text);
    let inline = null;
    if (!mk && item) {
      const g = /^(.*?\S)[ \t]*(={3}[ \t]*END[ _]?(FILE|APPEND)[ \t]*={3})[ \t]*$/i.exec(text.replace(ZW, ''));
      if (g && !/^=+$/.test(g[1].trim())) { inline = g[1]; mk = { ...readMarker(g[2]), repairs: ['MARKER_INLINE'] }; }
    }
    if (item && !mk) { item.body.push(text); continue; }
    if (!mk) {
      if (!text.trim() || FENCE.test(text)) continue;
      stray++;
      if (stray === 1) notes.push(diag('STRAY_TEXT', 'info', 'Text outside FILE/APPEND blocks was ignored', no, { excerpt: text.slice(0, 120) }));
      continue;
    }
    if (mk.kind === 'endfile' || mk.kind === 'endappend') {
      if (!item) { notes.push(diag('END_WITHOUT_START', 'warn', 'END marker with no open block was ignored', no)); continue; }
      if (inline !== null) item.body.push(inline);
      item.repairs.push(...mk.repairs.map(c => ({ code: c, line: no })));
      if (mk.kind !== 'end' + item.op) item.repairs.push({ code: 'MARKER_MISMATCH', line: no });
      finish(true, no);
      continue;
    }
    if (item) finish(false, no - 1); // a new block opened before END: the open one is truncated
    if (mk.kind === 'file' || mk.kind === 'append') {
      item = { op: mk.kind, rawPath: mk.arg, line: no, body: [], repairs: mk.repairs.map(c => ({ code: c, line: no })) };
    }
  }
  if (item) finish(false, bundle.lines.at(-1)?.no ?? bundle.startLine);
  return { items, notes, stray };
}

const severityRank = { error: 0, warn: 1, info: 2 };

/**
 * Unpack pasted replies.
 * opts: { manifest?, strict?, assay?(text, { file, sources }) → { diagnostics }, maxBytes?, requireSourced? }
 * Returns { bundles, items, missing, diagnostics, summary }. Items: { id, packet, op, path, body, status: 'ready'|'held', repairs, diagnostics }.
 */
export function unpack(input, opts = {}) {
  const manifest = opts.manifest || null, strict = !!opts.strict, maxBytes = opts.maxBytes ?? MAX_FILE_BYTES;
  const split = splitBundles(input);
  const diagnostics = split.repairs.map(c => diag(c, 'info', REPAIR_TEXT[c], 1));
  const sources = Object.fromEntries((manifest?.sources || []).filter(s => s.url).map(s => [s.url, s.text]));
  const allow = manifest?.outputs || opts.allow || [];
  const exclude = (manifest?.exclude || []).map(e => ({ raw: e, key: (canonicalUrl(e) || e).toLowerCase() })).filter(e => e.key.length >= 4);
  const seenPackets = new Map(), bundles = [], items = [];
  const packetIds = manifest ? Object.keys(manifest.packets || {}) : [];

  for (const [bi, b] of split.bundles.entries()) {
    const bd = [];
    let packet = b.packet;
    const bundleRepairs = [...b.repairs];
    if (b.implicit) {
      if (packetIds.length === 1) { packet = packetIds[0]; bundleRepairs.push({ code: 'BUNDLE_HEADER_MISSING', line: b.startLine }); }
      else if (manifest) bd.push(diag('BUNDLE_HEADER_MISSING', 'error', `Reply has no \`=== BEGIN_BUNDLE packet=… ===\` line and the manifest has ${packetIds.length} packets: cannot route`, b.startLine));
    } else if (!packet) bd.push(diag('PACKET_ID_MISSING', manifest ? 'error' : 'warn', 'BEGIN_BUNDLE line has no `packet=pk-…`', b.startLine));
    else if (!/^pk-[0-9a-f]{12}$/.test(packet)) bd.push(diag('PACKET_ID_MALFORMED', 'error', `\`${packet}\` is not a packet id (pk- + 12 hex)`, b.startLine));
    else if (manifest && !manifest.packets?.[packet]) bd.push(diag('PACKET_UNKNOWN', 'error', `${packet} is not in this manifest (other batch, or the id was mistyped)`, b.startLine));
    if (!b.terminated && !b.implicit) bd.push(diag('BUNDLE_UNTERMINATED', 'warn', 'No END_BUNDLE line: the reply may have been cut off. Complete blocks are kept, open ones are held', b.endLine));
    if (b.terminated && b.endPacket !== packet) bd.push(diag('BUNDLE_ID_MISMATCH', 'error', `END_BUNDLE names ${b.endPacket ?? 'no packet'} but BEGIN_BUNDLE named ${packet}`, b.endLine));
    if (packet && seenPackets.has(packet)) bd.push(diag('PACKET_DUPLICATE', 'error', `Second reply for ${packet} (first at line ${seenPackets.get(packet)}); only the first is used`, b.startLine));
    else if (packet) seenPackets.set(packet, b.startLine);

    const { items: raw, notes } = parseItems(b);
    bd.push(...notes);
    if (!raw.length) bd.push(diag('BUNDLE_EMPTY', 'warn', 'Bundle contains no FILE or APPEND blocks', b.startLine));
    const bundle = { index: bi, packet, startLine: b.startLine, endLine: b.endLine, terminated: b.terminated, implicit: b.implicit,
      repairs: bundleRepairs.map(r => ({ ...r, message: REPAIR_TEXT[r.code] })), diagnostics: bd, items: [] };
    const fatal = bd.filter(d => d.severity === 'error');

    for (const [k, it] of raw.entries()) {
      const d = fatal.map(f => ({ ...f, inherited: true }));
      const repairs = [...it.repairs];
      const pc = checkPath(it.rawPath, allow);
      repairs.push(...pc.repairs.map(c => ({ code: c, line: it.line })));
      if (!pc.ok) d.push(diag(pc.code, 'error', pc.message, it.line));
      if (!it.terminated) d.push(diag(it.op === 'file' ? 'FILE_UNTERMINATED' : 'APPEND_UNTERMINATED', 'error', `No END ${it.op.toUpperCase()} before line ${it.endLine + 1}: content may be truncated`, it.line));
      let body = it.body.join('\n');
      const uf = unwrapFence(body);
      if (uf.ambiguous) d.push(diag('FENCE_AMBIGUOUS', 'error', 'Body starts and ends with code fences that do not pair with each other: cannot tell a wrapper from real content', it.line + 1));
      else if (uf.repair) { body = uf.body; repairs.push({ code: uf.repair, line: it.line + 1 }); }
      body = body.replace(/\n+$/, '');
      if (body && it.op === 'file') body += '\n';
      const bytes = new TextEncoder().encode(body).length;
      if (bytes > maxBytes) d.push(diag('FILE_TOO_LARGE', 'error', `${bytes} bytes exceeds the ${maxBytes}-byte limit`, it.line));
      if (!body.trim()) d.push(diag(it.op === 'file' ? 'FILE_EMPTY' : 'APPEND_EMPTY', 'warn', 'Block has no content', it.line));
      const bodyStart = it.line + 1 + (uf.repair === 'FENCE_UNWRAPPED' || (uf.repair === 'FENCE_DANGLING' && FENCE.test(it.body.find(l => l.trim()) || '')) ? it.body.findIndex(l => l.trim()) + 1 : 0);
      const at = d0 => ({ ...d0, line: bodyStart + d0.line - 1, fileLine: d0.line });
      const lint = lintCitations(body, { sources, requireSourced: opts.requireSourced });
      d.push(...lint.diagnostics.map(at), ...lintGates(body).map(at));
      if (opts.assay && /\.md$/i.test(pc.path) && /^- \*\*Gates:\*\*/m.test(body)) {
        const seen = new Set(d.map(x => x.code + ':' + x.fileLine));
        for (const x of opts.assay(body, { file: pc.path.split('/').pop(), sources }).diagnostics || [])
          if (x.severity === 'error' && !seen.has(x.code + ':' + x.line)) d.push(at({ code: x.code, severity: 'error', message: x.message, line: x.line, col: x.col, excerpt: x.excerpt, via: 'assay' }));
      }
      const lowered = body.toLowerCase();
      for (const e of exclude) if (lowered.includes(e.key)) d.push(diag('EXCLUDED_HIT', 'warn', `Mentions excluded item \`${e.raw}\``, it.line));
      if (strict && repairs.length) d.push(diag('STRICT_REPAIR', 'error', `Strict mode: ${repairs.length} repair(s) needed (${[...new Set(repairs.map(r => r.code))].join(', ')})`, it.line));
      d.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.line - b.line);
      const item = { id: `${bi + 1}.${k + 1}`, bundle: bi, packet, op: it.op, path: pc.path, rawPath: it.rawPath, line: it.line, endLine: it.endLine,
        body, bytes, citations: lint.citations.length, repairs: repairs.map(r => ({ ...r, message: REPAIR_TEXT[r.code] })), diagnostics: d,
        status: d.some(x => x.severity === 'error') ? 'held' : 'ready' };
      bundle.items.push(item.id);
      items.push(item);
    }
    bundles.push(bundle);
  }

  // Two different FILE bodies for one path (case-insensitive: macOS/Windows) cannot both win. Identical duplicates are kept once.
  const byPath = new Map();
  for (const it of items) if (it.op === 'file' && it.status === 'ready') {
    const key = it.path.toLowerCase();
    (byPath.get(key) || byPath.set(key, []).get(key)).push(it);
  }
  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    const same = group.every(g => g.body === group[0].body && g.path === group[0].path);
    for (const [k, it] of group.entries()) {
      if (same && k === 0) continue;
      it.diagnostics.unshift(same ? diag('FILE_DUPLICATE', 'info', `Identical to item ${group[0].id}; skipped`, it.line)
        : diag('PATH_CONFLICT', 'error', `${group.length} replies write different content to ${group.map(g => g.path).join(' / ')} (items ${group.map(g => g.id).join(', ')})`, it.line));
      it.status = same ? 'skipped' : 'held';
    }
  }

  const missing = packetIds.filter(id => !seenPackets.has(id));
  const count = s => items.filter(i => i.status === s).length;
  return { bundles, items, missing, requestsSkipped: split.requestsSkipped, diagnostics,
    summary: { bundles: bundles.length, items: items.length, ready: count('ready'), held: count('held'), skipped: count('skipped'),
      repairs: items.reduce((n, i) => n + i.repairs.length, 0) + bundles.reduce((n, b) => n + b.repairs.length, 0), missing: missing.length } };
}

/**
 * Resolve ready items against current file contents. `read(path)` returns the file text or null when absent.
 * Appends chain in input order and are skipped when the file already ends with them. Returns items annotated with { action, before, after, diff }.
 */
export function plan(result, read) {
  const state = new Map();
  const current = p => (state.has(p) ? state.get(p) : read(p));
  return result.items.map(it => {
    if (it.status !== 'ready') return { ...it, action: it.status === 'skipped' ? 'skip' : 'hold', diff: '' };
    const before = current(it.path);
    let after;
    if (it.op === 'file') after = it.body;
    // Appends are idempotent: re-committing the same paste must not duplicate lines.
    else if (before != null && it.body && (before.endsWith('\n') ? before : before + '\n').endsWith((it.body.endsWith('\n') ? it.body : it.body + '\n'))) after = before;
    else after = (before == null || before === '' ? '' : before.endsWith('\n') ? before : before + '\n') + it.body + (it.body.endsWith('\n') ? '' : '\n');
    state.set(it.path, after);
    const action = before == null ? 'create' : before === after ? 'unchanged' : it.op === 'append' ? 'append' : 'update';
    return { ...it, action, before, after, diff: action === 'unchanged' ? '' : unifiedDiff(before, after, { path: it.path }) };
  });
}
