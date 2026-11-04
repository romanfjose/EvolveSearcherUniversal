// EvolveSearcher Universal · static demo.
// Part 1 is a pure, deterministic core (no DOM, no I/O) shared by the browser and `ui/pipeline-benchmark.test.mjs`.
// Canonical sources: `tools/lead-lint.mjs` (gates, citations, flags) and `ui/data.mjs` (canonicalURL, dashboard field reader).
// lintRow/lintCorpus are a byte-for-byte behavioural port; the benchmark suite proves parity against the real lintLeads.
// assay() adds the Assayer advisories that lead-lint cannot see, each pinned to exact source coordinates.

export const GATES = [
  { n: 1, id: 'G1', name: 'Live & Direct Source' },
  { n: 2, id: 'G2', name: 'Relevant Value' },
  { n: 3, id: 'G3', name: 'Eligibility & Constraints' },
  { n: 4, id: 'G4', name: 'Feasible Access' },
];
export const ACTIVE_STATUSES = ['Verify', 'Try-worthy', 'Ready', 'Waiting on Commander'];
const REGATE_FLAGS = ['NO_GATES_LINE', 'STALE_GRADE', 'CLOSABLE', 'DEADLINE_PAST_REVIEW'];

// ---------- Canonical lead-lint port ----------
const CITE_LINE = /\[verified:\s*https?:\/\/\S+\s+["“][^"”]+["”]\]/;
const fieldRe = (name, flags = 'im') => new RegExp(`^- \\*\\*${name}:\\*\\*[^\\S\\r\\n]*(.*)$`, flags);
/** lead-lint field reader: anchored `- **Name:**` line, first match wins. */
export const field = (text, name) => text.match(fieldRe(name))?.[1]?.trim() || '';
const gateRe = n => new RegExp(`(?:^|;)\\s*G${n}\\s*:?\\s*(pass|fail|unknown)\\b`, 'i');
export const gateValues = gl => [1, 2, 3, 4].map(n => gl.match(gateRe(n))?.[1]?.toLowerCase() || 'unknown');
const GATE_WORD = [1, 2, 3, 4].map(n => new RegExp(`\\bG${n}\\b`));
const lineSources = (lines, n) => lines.some(l => GATE_WORD[n - 1].test(l) && CITE_LINE.test(l));

/** One lead-lint row for one dossier. `mtimeMs`/`charterMtimeMs` replace fs.statSync; `now` replaces Date.now(). */
export function lintRow(text, { file = 'dossier.md', mtimeMs = 0, charterMtimeMs = 0, now = Date.now() } = {}) {
  const status = field(text, 'Status') || 'Unknown', gl = field(text, 'Gates');
  const values = gateValues(gl);
  const flags = [], open = values.filter(v => v !== 'pass').length;
  if (!gl) flags.push('NO_GATES_LINE');
  const lines = text.split('\n');
  const unsourced = values.some((v, i) => v === 'pass' && !lineSources(lines, i + 1));
  if (unsourced || mtimeMs < charterMtimeMs) flags.push('STALE_GRADE');
  if (status === 'Verify' && open >= 1 && open <= 2 && !values.includes('fail'))
    flags.push(/fast.paste|commander paste|waiting on commander/i.test(field(text, 'Verification gaps')) ? 'PARKED' : 'CLOSABLE');
  const deadline = field(text, 'Deadline');
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && Date.parse(deadline + 'T23:59:59Z') < now) flags.push('DEADLINE_PAST_REVIEW');
  return { file, status, gates: open, gates_line: gl || null, flags, value: field(text, 'Value') || null };
}

/** lintLeads over in-memory files ({ file, text, mtimeMs? }): same filter, counts, sort and shape. */
export function lintCorpus(files, { charterMtimeMs = 0, now = Date.now() } = {}) {
  const statuses = { Verify: 0, 'Try-worthy': 0, Ready: 0, 'Waiting on Commander': 0, Unknown: 0 }, rows = [];
  for (const f of files.filter(f => f.file.endsWith('.md') && f.file !== 'screened.md')) {
    const row = lintRow(f.text, { file: f.file, mtimeMs: f.mtimeMs ?? 0, charterMtimeMs, now });
    statuses[row.status] = (statuses[row.status] || 0) + 1;
    rows.push(row);
  }
  rows.sort((a, b) => a.gates - b.gates || a.file.localeCompare(b.file));
  const regate = rows.filter(r => r.flags.some(f => REGATE_FLAGS.includes(f))).map(r => r.file);
  return { today_utc: new Date(now).toISOString().slice(0, 10), leads: rows.length, statuses,
    tiers: { try_worthy: statuses['Try-worthy'] || 0, ready: statuses.Ready || 0 }, regate_needed: regate.length ? regate : 'none', rows };
}

// ---------- ui/data.mjs ports ----------
/** ui/data.mjs canonicalURL: http(s) only, no fragment, no www., no tracking params, sorted query, no trailing slash. */
export function canonicalUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.host + u.pathname.replace(/\/+$/, '') + u.search;
  } catch {
    return '';
  }
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dashboardRes = name => [new RegExp(`\\*\\*${escRe(name)}:\\*\\*[^\\S\\r\\n]*([^\\r\\n]+)`, 'i'), new RegExp(`\\*\\*${escRe(name)}\\*\\*:[^\\S\\r\\n]*([^\\r\\n]+)`, 'i')];
/** ui/data.mjs field reader: unanchored `**Name:**` anywhere, so it can disagree with lead-lint. */
export const dashboardField = (text, name) => dashboardRes(name).map(re => text.match(re)?.[1]?.trim()).find(Boolean) || '';
const DASHBOARD_ACTIVE = /^(Verify|Try-worthy|Ready|Waiting on Commander)\b/i;
const URL_FIELDS = ['Canonical URL', 'Official event', 'Official URL', 'Official Website', 'URL', 'Source URL', 'Link', 'Application endpoint'];
const FIT_FIELDS = ['Fit %', 'Fit', 'Fit Score'];
const UNGRADED_FIT = /^(unknown|unassessed|ungraded|tbd|pending|n\/a|none|-|—)\b/i;

// ---------- Assayer advisories with coordinates ----------
const TIER_RANK = { Verify: 1, 'Waiting on Commander': 1, 'Try-worthy': 2, Ready: 3 };
const snapshotCache = new WeakMap();
const snapshotIndex = sources => {
  if (!snapshotCache.has(sources)) snapshotCache.set(sources, new Map(Object.entries(sources).map(([u, t]) => [canonicalUrl(u), normQuote(t)])));
  return snapshotCache.get(sources);
};
const normQuote = s => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

function lineTable(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
function position(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - starts[lo] + 1 };
}
function fieldSpans(text, name) {
  const out = [];
  for (const m of text.matchAll(fieldRe(name, 'gim'))) {
    const start = m.index + m[0].length - m[1].length;
    out.push({ raw: m[1], value: m[1].trim(), start, end: start + m[1].trimEnd().length, lineStart: m.index });
  }
  return out;
}
function dashboardSpan(text, name) {
  for (const re of dashboardRes(name)) {
    const m = text.match(re);
    if (m?.[1]?.trim()) {
      const start = m.index + m[0].length - m[1].length;
      return { value: m[1].trim(), start, end: start + m[1].trimEnd().length };
    }
  }
  return null;
}

function classifyCitation(token, exactTag) {
  if (!exactTag) return ['CITATION_CASE', 'lead-lint matches the tag `[verified:` exactly (lowercase, no inner spaces); this tag is invisible to it'];
  if (!token.endsWith(']')) return ['CITATION_UNCLOSED', 'Citation has no closing `]` on its line'];
  const body = token.slice(token.indexOf(':') + 1, -1);
  if (!/https?:\/\//.test(body)) {
    if (/https?:\/\//i.test(body)) return ['CITATION_MALFORMED', 'URL scheme must be lowercase `http://` or `https://`'];
    if (/^\s*[a-z][\w+.-]*:/i.test(body)) return ['CITATION_UNSAFE_SCHEME', 'Only http(s) sources count as read evidence'];
    return ['CITATION_NO_URL', 'Citation names no http(s) source URL'];
  }
  if (!/["“”]/.test(body)) return ['CITATION_MISSING_QUOTE', 'Citation has a URL but no "quoted" source text'];
  if (/["“]\s*["”]\s*$/.test(body) && !/["“][^"”]+["”]/.test(body)) return ['CITATION_EMPTY_QUOTE', 'Quoted source text is empty'];
  if (/["“]/.test(body.match(/https?:\/\/(\S*)/)[1])) return ['CITATION_MALFORMED', 'Separate the URL from the "quote" with a space; lead-lint needs `<url> "<quote>"`'];
  return ['CITATION_MALFORMED', 'Expected `[verified: <url> "<quote>"]`'];
}

/**
 * Full Assayer view of one dossier: the lead-lint row plus located diagnostics, gate evidence and an evidence-capped tier.
 * Every diagnostic satisfies text.slice(start, end) === excerpt; line/col are 1-based UTF-16 positions (String#slice and textarea selection units).
 * opts: { file, now, mtimeMs, charterMtimeMs, rejected, sources: { url: snapshotText } }
 */
export function assay(text, opts = {}) {
  const now = opts.now ?? Date.now();
  const row = lintRow(text, { file: opts.file, mtimeMs: opts.mtimeMs, charterMtimeMs: opts.charterMtimeMs, now });
  const starts = lineTable(text), diagnostics = [];
  const add = (code, severity, start, end, message, extra = {}) =>
    diagnostics.push({ code, severity, message, ...position(starts, start), start, end, excerpt: text.slice(start, end), ...extra });
  const snapshots = snapshotIndex(opts.sources || {});

  // Lines, fences and citations.
  const lines = [];
  let offset = 0, fence = false;
  for (const raw of text.split('\n')) {
    const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const isFence = /^\s*```/.test(content);
    lines.push({ start: offset, content, inFence: fence && !isFence, names: [1, 2, 3, 4].filter(n => GATE_WORD[n - 1].test(content)) });
    if (isFence) fence = !fence;
    offset += raw.length + 1;
  }
  const citations = [];
  for (const [li, ln] of lines.entries()) {
    for (const m of ln.content.matchAll(/\[\s*verified\s*:/gi)) {
      const at = m.index, abs = ln.start + at;
      const sticky = /\[verified:\s*(https?:\/\/\S+)\s+["“]([^"”]+)["”]\]/y;
      sticky.lastIndex = at;
      const ok = m[0] === '[verified:' && sticky.exec(ln.content);
      if (ok) {
        const url = ok[1], quote = ok[2], canonical = canonicalUrl(url);
        const c = { url, quote, canonical, start: abs, end: abs + ok[0].length, line: li + 1, valid: true, snapshot: 'none', gates: [] };
        if (!canonical) { c.valid = false; add('URL_INVALID', 'error', abs, c.end, `\`${url}\` is not a parseable http(s) URL`); }
        else {
          if (canonical !== url.replace(/^https?:\/\//, '')) add('URL_NONCANONICAL', 'info', abs, c.end, `Cite the canonical form \`${canonical}\` (tracking params, fragment, www. or trailing slash detected)`, { canonical });
          if (url.startsWith('http://')) add('URL_INSECURE', 'info', abs, c.end, 'Source cited over plain http://');
          if (snapshots.has(canonical)) {
            c.snapshot = snapshots.get(canonical).includes(normQuote(quote)) ? 'found' : 'missing';
            if (c.snapshot === 'missing') add('QUOTE_NOT_IN_SOURCE', 'error', abs, c.end, `Quote not found in the cached snapshot of ${canonical}: the citation does not match what the source says`);
          }
        }
        if (!quote.trim()) add('QUOTE_BLANK', 'warn', abs, c.end, 'Quote is whitespace only; lead-lint still accepts it');
        if (ln.inFence) add('CITATION_IN_CODE_FENCE', 'warn', abs, c.end, 'Citation sits inside a code fence; lead-lint still counts it as gate evidence');
        citations.push(c);
      } else {
        const close = ln.content.indexOf(']', at);
        const end = ln.start + (close < 0 ? ln.content.length : close + 1);
        const [code, message] = classifyCitation(text.slice(abs, end), m[0] === '[verified:');
        add(code, 'error', abs, end, message);
      }
    }
  }

  // Gate evidence: lead-lint semantics (any citation on a line naming the gate), plus effective evidence.
  const gl = fieldSpans(text, 'Gates');
  const values = gateValues(row.gates_line || '');
  const glSpan = gl[0];
  const gates = GATES.map((g, i) => {
    const cites = citations.filter(c => lines[c.line - 1].names.includes(g.n));
    cites.forEach(c => c.gates.push(g.n));
    const sourced = lines.some(l => l.names.includes(g.n) && CITE_LINE.test(l.content));
    const good = cites.filter(c => c.valid && c.snapshot !== 'missing');
    return { ...g, value: values[i], sourced, effective: values[i] === 'pass' && good.length > 0, citations: cites.map(c => citations.indexOf(c)) };
  });

  if (!glSpan?.value) add('NO_GATES_LINE', 'error', glSpan?.lineStart ?? 0, glSpan?.start ?? 0, 'No graded `- **Gates:**` line: lead-lint treats all four gates as unknown');
  else {
    if (gl.length > 1) add('GATES_DUPLICATE', 'warn', gl[1].start, gl[1].end, 'Second Gates line is ignored by lead-lint; keep one');
    const raw = glSpan.raw, base = glSpan.start;
    for (const g of gates) {
      const mentions = [...raw.matchAll(new RegExp(`\\bG${g.n}(?!\\d)`, 'gi'))];
      const canon = raw.match(gateRe(g.n));
      g.span = canon ? [base + canon.index, base + canon.index + canon[0].length] : mentions[0] ? [base + mentions[0].index, base + mentions[0].index + 2] : [glSpan.start, glSpan.end];
      if (!mentions.length) { add('GATE_MISSING', 'warn', glSpan.start, glSpan.end, `${g.id} is absent from the Gates line; lead-lint reads it as unknown`, { gate: g.n }); continue; }
      if (mentions.length > 1) add('GATE_DUPLICATE', 'warn', base + mentions[1].index, base + mentions[1].index + 2, `${g.id} appears more than once; lead-lint keeps the first \`;\`-separated value`, { gate: g.n });
      if (!canon) {
        const mi = mentions[0].index, stop = raw.indexOf(';', mi);
        const end = base + (stop < 0 ? raw.trimEnd().length : stop);
        const separated = /(?:^|;)\s*$/.test(raw.slice(0, mi));
        add('GATE_UNPARSED', 'warn', base + mi, end, separated
          ? `${g.id} value is not pass|fail|unknown; lead-lint reads it as unknown`
          : `${g.id} is not separated by \`;\`; lead-lint only reads \`G1 pass; G2 pass\`, so it counts as unknown`, { gate: g.n });
        g.span = [base + mi, end];
        continue;
      }
      const after = canon.index + canon[0].length, stop = raw.indexOf(';', after);
      const qualifier = raw.slice(after, stop < 0 ? raw.length : stop).trim();
      if (qualifier) add('GATE_QUALIFIED', 'info', base + canon.index, base + after + raw.slice(after).indexOf(qualifier) + qualifier.length,
        `\`${qualifier}\` is ignored: lead-lint grades ${g.id} as plain ${g.value}`, { gate: g.n });
      if (g.value === 'pass' && !g.sourced) add('GATE_UNSOURCED', 'error', g.span[0], g.span[1], `${g.id} pass has no \`[verified: <url> "<quote>"]\` on a line naming ${g.id} (lead-lint: STALE_GRADE)`, { gate: g.n });
    }
    for (const c of citations.filter(c => c.valid)) {
      const named = c.gates.length, onLine = citations.filter(o => o.valid && o.line === c.line).length;
      if (named > 1 && onLine < named && citations.indexOf(c) === citations.findIndex(o => o.valid && o.line === c.line))
        add('CITATION_SHARED', 'warn', c.start, c.end, `One citation sources ${c.gates.map(n => 'G' + n).join(', ')}: each gate should quote its own evidence`);
    }
  }
  if (row.flags.includes('STALE_GRADE') && !gates.some(g => g.value === 'pass' && !g.sourced))
    add('STALE_GRADE', 'error', 0, 0, 'Dossier is older than RecallCharter.md: regrade under the current charter');

  // Status, tier ceiling and smuggling.
  const status = row.status;
  let declared = '';
  if (opts.rejected) {
    if (!field(text, 'Rejection Reason') && !dashboardField(text, 'Reason')) add('REJECTION_REASON_MISSING', 'warn', 0, 0, 'Rejected dossier has no `- **Rejection Reason:**`');
  } else {
    const spans = fieldSpans(text, 'Status'), loose = dashboardSpan(text, 'Status');
    if (!spans.length) {
      if (loose) add('STATUS_UNREAD', 'error', loose.start, loose.end, `Dashboard reads \`${loose.value}\` but lead-lint finds no \`- **Status:**\` line and counts it Unknown`);
      else add('STATUS_MISSING', 'error', 0, 0, 'No `- **Status:**` line');
    } else {
      const s0 = spans[0];
      if (spans.length > 1 && spans.slice(1).some(s => s.value !== s0.value)) add('STATUS_CONFLICT', 'error', spans[1].start, spans[1].end, `Second Status \`${spans[1].value}\` contradicts \`${s0.value}\`; lead-lint keeps the first`);
      else if (spans.length > 1) add('STATUS_DUPLICATE', 'warn', spans[1].start, spans[1].end, 'Duplicate Status line; keep one');
      if (loose && loose.value !== s0.value) add('STATUS_DIVERGENT', 'error', loose.start, loose.end, `Status smuggling: the dashboard reads \`${loose.value}\` here, lead-lint counts \`${s0.value}\``);
      if (!ACTIVE_STATUSES.includes(status)) {
        const ci = ACTIVE_STATUSES.find(s => s.toLowerCase() === status.toLowerCase());
        if (ci) add('STATUS_CASE', 'error', s0.start, s0.end, `\`${status}\` is not counted as ${ci}: lead-lint tiers match exact spelling`);
        else if (DASHBOARD_ACTIVE.test(status)) add('STATUS_DECORATED', 'error', s0.start, s0.end, `\`${status}\` is filtered as ${status.match(DASHBOARD_ACTIVE)[1]} by the dashboard but lead-lint tiers ignore it; move qualifiers to Notes`);
        else add('STATUS_UNRECOGNIZED', 'error', s0.start, s0.end, `\`${status}\` is not Verify | Try-worthy | Ready | Waiting on Commander`);
      }
    }
    const shown = loose?.value || status;
    const m = shown.match(DASHBOARD_ACTIVE);
    declared = m ? ACTIVE_STATUSES.find(s => s.toLowerCase() === m[1].toLowerCase()) : '';
  }
  const readyLine = fieldSpans(text, 'Ready evidence')[0];
  const readyEvidence = !!readyLine && /\b\d{4}-\d{2}-\d{2}\b/.test(readyLine.value) && CITE_LINE.test(readyLine.value);
  const allEffective = gates.every(g => g.effective);
  const ceiling = allEffective ? (readyEvidence ? 3 : 2) : 1;
  const assayerTier = opts.rejected ? 'Rejected' : allEffective ? (readyEvidence ? 'Ready' : 'Try-worthy') : declared === 'Waiting on Commander' ? 'Waiting on Commander' : 'Verify';
  if (declared && !opts.rejected) {
    const st = fieldSpans(text, 'Status')[0] || dashboardSpan(text, 'Status') || { start: 0, end: 0 };
    const blockers = gates.filter(g => !g.effective).map(g => `${g.id} ${g.value !== 'pass' ? g.value : !g.sourced ? 'unsourced' : 'refuted by source'}`);
    if (TIER_RANK[declared] > ceiling) {
      if (declared === 'Ready' && allEffective) add('READY_UNVALIDATED', 'error', st.start, st.end, 'Ready needs a dated, attributable `- **Ready evidence:**` line with a citation (RecallCharter §7); evidence supports Try-worthy');
      else add('STATUS_SMUGGLING', 'error', st.start, st.end, `Status \`${declared}\` outruns the evidence (${blockers.join(', ')}): Assayer grade is ${assayerTier}`);
    } else if (TIER_RANK[declared] < ceiling && TIER_RANK[declared] === 1)
      add('PROMOTABLE', 'info', st.start, st.end, `All four gates are sourced: Assayer would grade ${assayerTier}`);
  }

  // Lead-lint flags with locations, and dashboard-format checks.
  const gaps = fieldSpans(text, 'Verification gaps')[0], stSpan = fieldSpans(text, 'Status')[0];
  if (row.flags.includes('CLOSABLE')) add('CLOSABLE', 'info', gaps?.start ?? stSpan.start, gaps?.end ?? stSpan.end, 'One or two open gates and no fail: one more source read can close this');
  if (row.flags.includes('PARKED')) add('PARKED', 'info', gaps.start, gaps.end, 'Open gates wait on a Commander paste: parked, not closable by scouts');
  const dl = fieldSpans(text, 'Deadline')[0];
  if (dl?.value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dl.value)) add('DEADLINE_UNPARSED', 'warn', dl.start, dl.end, `\`${dl.value}\` is not YYYY-MM-DD: lead-lint skips the past-deadline review`);
    else {
      const t = Date.parse(dl.value + 'T00:00:00Z');
      if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== dl.value) add('DEADLINE_INVALID', 'error', dl.start, dl.end, `\`${dl.value}\` is not a calendar date${Number.isNaN(t) ? '' : ` (JavaScript rolls it to ${new Date(t).toISOString().slice(0, 10)})`}`);
      if (row.flags.includes('DEADLINE_PAST_REVIEW')) add('DEADLINE_PAST_REVIEW', 'error', dl.start, dl.end, 'Deadline has passed: queue for review (files are never moved by the linter)');
    }
  }
  if (text.charCodeAt(0) === 0xfeff) add('BOM_PRESENT', 'warn', 0, 1, 'UTF-8 BOM: lead-lint cannot read a `- **Field:**` on line 1 behind it');
  if (!opts.rejected) {
    if (!/^#\s+\S/m.test(text) && !['Title', 'Game', 'Role', 'Opportunity', 'Position'].some(f => dashboardField(text, f))) add('TITLE_MISSING', 'warn', 0, 0, 'No `# Title` heading: the dashboard falls back to the file name');
    const urlField = URL_FIELDS.map(f => [f, dashboardSpan(text, f)]).find(([, s]) => s && /https?:\/\/[^\s)\];>]+/.test(s.value));
    if (!urlField) add('URL_MISSING', 'warn', 0, 0, 'No opportunity URL field (`- **Canonical URL:**`): the dashboard cannot link or deduplicate it');
    else {
      const [name, s] = urlField, u = s.value.match(/https?:\/\/[^\s)\];>]+/)[0], at = s.start + s.value.indexOf(u), canon = canonicalUrl(u);
      if (canon && canon !== u.replace(/^https?:\/\//, '')) add('URL_NONCANONICAL', 'info', at, at + u.length, `${name} should be \`https://${canon}\` so engines deduplicate onto one row`, { canonical: canon });
    }
    const fitRaw = FIT_FIELDS.map(f => dashboardField(text, f)).find(Boolean) || '';
    const fit = parseInt(fitRaw, 10), ungradedOk = /^(Verify|Waiting on Commander)\b/i.test(dashboardField(text, 'Status') || status);
    if (!fitRaw && !ungradedOk) add('FIT_MISSING', 'warn', stSpan?.start ?? 0, stSpan?.end ?? 0, 'Graded dossier has no `- **Fit %:**`');
    else if (fitRaw && !(fit >= 0 && fit <= 100) && !(ungradedOk && UNGRADED_FIT.test(fitRaw))) {
      const s = FIT_FIELDS.map(f => dashboardSpan(text, f)).find(Boolean);
      add('FIT_UNPARSEABLE', 'warn', s.start, s.end, `\`${fitRaw}\` is not 0–100%`);
    }
  }

  const rank = { error: 0, warn: 1, info: 2 };
  diagnostics.sort((a, b) => a.start - b.start || rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
  const counts = { error: 0, warn: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  const fitMatch = (FIT_FIELDS.map(f => dashboardField(text, f)).find(Boolean) || '').match(/^\s*(\d{1,3})/);
  return { row, status, declared, assayerTier, readyEvidence, gates, citations, diagnostics, counts,
    fit: fitMatch && +fitMatch[1] <= 100 ? +fitMatch[1] : null, title: (text.match(/^#\s+(.+)/m)?.[1] || opts.file || '').replace(/^Lead:\s*/i, '').trim() };
}

// ---------- Part 2: browser UI (skipped under Node) ----------
if (typeof document !== 'undefined') boot();

function boot() {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { data: null, lane: '', group: '', engine: '', tab: 'leads', all: [] };
  let names = {};

  const host = u => { try { return new URL(u).host; } catch { return u; } };
  const link = (url, label) => /^https?:\/\//.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>` : esc(label);
  function inline(text) {
    const pattern = /\[verified:\s*(https?:\/\/\S+)\s+["“]([^"”]+)["”]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'`)\];,]+)/g;
    const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    let out = '', last = 0;
    for (const m of text.matchAll(pattern)) {
      out += fmt(text.slice(last, m.index));
      out += m[1] ? `<span class="cite" title="${esc(m[1])}">✓ ${link(m[1], host(m[1]))} <q>${esc(m[2])}</q></span>` : link(m[4] || m[5], m[3] || m[5]);
      last = m.index + m[0].length;
    }
    return out + fmt(text.slice(last));
  }
  function markdown(text) {
    let html = '', list = false, code = false, buf = [];
    for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
      if (line.startsWith('```')) {
        if (list) { html += '</ul>'; list = false; }
        if (code) { html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; buf = []; }
        code = !code; continue;
      }
      if (code) { buf.push(line); continue; }
      const h = line.match(/^(#{1,6})\s+(.*)/), item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
      if (list && !item) { html += '</ul>'; list = false; }
      if (h) html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      else if (item) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(item[1])}</li>`; }
      else if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
    if (buf.length) html += `<pre>${esc(buf.join('\n'))}</pre>`;
    return html + (list ? '</ul>' : '');
  }

  const now = () => Date.parse(state.data.asOf + 'T12:00:00Z');
  const laneName = id => state.data.lanes.find(l => l.id === id)?.name || id;
  const text = d => d.markdown.join('\n');
  const tierClass = t => ({ Ready: 'ready', 'Try-worthy': 'try', Verify: 'verify', 'Waiting on Commander': 'waiting', Rejected: 'rejected' }[t] || 'unknown');
  const sevIcon = { error: '✗', warn: '!', info: 'i' };

  async function load() {
    try {
      const res = await fetch('demo-data.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`demo-data.json: HTTP ${res.status}`);
      state.data = await res.json();
    } catch (e) {
      $('#error').hidden = false;
      $('#error').textContent = `Could not load demo-data.json (${e.message}). Browsers block fetch() on file:// pages: serve this folder, e.g. \`python3 -m http.server -d docs/demo\`, or open the GitHub Pages copy.`;
      $('#sync').textContent = 'Offline';
      return;
    }
    names = Object.fromEntries(state.data.engines.map(e => [e.id, e.name]));
    state.all = state.data.dossiers.map((d, i) => {
      const a = assay(text(d), { file: d.file.split('/').pop(), now: now(), rejected: d.rejected, sources: state.data.sources });
      return { ...d, i, a, id: d.markdown.join('\n').match(/^- \*\*Opportunity ID:\*\*\s*(\S+)/m)?.[1] || d.file };
    });
    $('#sync').textContent = `Demo clock ${state.data.asOf} · ${state.all.length} dossiers`;
    $('#clock').textContent = state.data.asOf;
    renderPresets();
    const fromHash = location.hash.slice(1);
    if (['leads', 'sandbox', 'diagnostics', 'report'].includes(fromHash)) state.tab = fromHash;
    renderAll();
    tab(state.tab);
    if (state.tab === 'sandbox' && !$('#editor').value) loadPreset(state.data.presets[0] ? 'p:0' : 'd:0');
  }

  const inLane = d => !state.lane || d.lane === state.lane;
  function groups() {
    const map = new Map();
    for (const d of state.all.filter(inLane)) {
      const key = d.lane + '|' + d.id;
      if (!map.has(key)) map.set(key, { key, lane: d.lane, id: d.id, title: d.a.title, entries: [] });
      map.get(key).entries.push(d);
    }
    return [...map.values()];
  }
  const engineOrder = e => state.data.engines.findIndex(x => x.id === e.engine);

  function renderAll() {
    renderLanes(); renderEngines(); renderList(); renderDiagnostics(); renderReport();
    if (state.group) showGroup(state.group);
  }

  function renderLanes() {
    const count = l => state.all.filter(d => (!l || d.lane === l) && !d.rejected).length;
    const errs = l => state.all.filter(d => !l || d.lane === l).reduce((n, d) => n + d.a.counts.error, 0);
    const pill = (id, name, sub) => `<button class="lane-pill ${state.lane === id ? 'selected' : ''}" role="tab" aria-selected="${state.lane === id}" data-lane="${esc(id)}" title="${esc(sub)}">
      <span class="lane-pill-name">${esc(name)}</span><span class="lane-pill-meta">${count(id)} active</span>
      ${errs(id) ? `<span class="warn-badge" title="Assayer errors">⚠ ${errs(id)}</span>` : ''}</button>`;
    $('#lanes').innerHTML = pill('', 'All Lanes', 'Every synthetic lane') + state.data.lanes.map(l => pill(l.id, l.name, l.subtitle)).join('');
  }

  function renderEngines() {
    const scope = state.all.filter(inLane);
    $('#projects').innerHTML = state.data.engines.map(e => {
      const mine = scope.filter(d => d.engine === e.id), active = mine.filter(d => !d.rejected);
      const n = t => active.filter(d => d.a.row.status === t).length;
      const errors = mine.reduce((s, d) => s + d.a.counts.error, 0);
      return `<article class="project ${e.id}">
        <div class="project-head"><div><span class="project-lane-tag">${esc(state.lane ? laneName(state.lane) : 'All lanes')}</span><span class="project-name">${esc(e.name)}</span></div>
        <span class="state ${errors ? 'warn-state' : 'ready-state'}">${errors ? `${errors} Assayer error${errors === 1 ? '' : 's'}` : 'Clean'}</span></div>
        <div class="tier-strip">
          <span class="tier ready">Ready <b>${n('Ready')}</b></span><span class="tier try">Try-worthy <b>${n('Try-worthy')}</b></span>
          <span class="tier verify">Verify <b>${n('Verify')}</b></span><span class="tier waiting">Waiting <b>${n('Waiting on Commander')}</b></span>
          <span class="tier rejected">Rejected <b>${mine.length - active.length}</b></span>
        </div></article>`;
    }).join('');
  }

  function visible() {
    const q = $('#search').value.toLowerCase().trim(), eng = $('#project-filter').value, st = $('#status-filter').value;
    const rej = $('#rejected').checked, shared = $('#shared').checked, issues = $('#malformed').checked;
    const list = groups().filter(g => {
      const es = g.entries.filter(e => (rej || !e.rejected) && (!eng || e.engine === eng) && (!st || tierClass(e.rejected ? 'Rejected' : e.a.declared) === st) && (!issues || e.a.counts.error));
      return es.length && (!shared || new Set(g.entries.map(e => e.engine)).size > 1) &&
        (!q || g.entries.some(e => `${e.a.title} ${e.id} ${e.a.status} ${names[e.engine]} ${laneName(e.lane)} ${e.a.diagnostics.map(d => d.code).join(' ')}`.toLowerCase().includes(q)));
    });
    const fit = g => Math.max(-1, ...g.entries.filter(e => rej || !e.rejected).map(e => e.a.fit ?? -1));
    const errs = g => g.entries.reduce((n, e) => n + e.a.counts.error, 0);
    const order = $('#sort').value;
    return list.sort((a, b) => order === 'title' ? a.title.localeCompare(b.title)
      : order === 'issues' ? errs(b) - errs(a) || fit(b) - fit(a)
      : order === 'shared' ? b.entries.length - a.entries.length || fit(b) - fit(a)
      : fit(b) - fit(a) || a.title.localeCompare(b.title));
  }

  function renderList() {
    const gs = visible();
    $('#lead-count').textContent = groups().filter(g => g.entries.some(e => !e.rejected)).length;
    $('#list-count').textContent = `${gs.length} opportunities · ${gs.filter(g => new Set(g.entries.map(e => e.engine)).size > 1).length} shared across engines`;
    $('#rows').innerHTML = gs.map(g => {
      const errors = g.entries.reduce((n, e) => n + e.a.counts.error, 0);
      return `<button class="lead-row ${state.group === g.key ? 'selected' : ''}" aria-pressed="${state.group === g.key}" data-group="${esc(g.key)}">
        <div class="row-top-meta">${state.lane ? '' : `<span class="lane-tag">${esc(laneName(g.lane))}</span>`}
          ${g.entries.length > 1 ? `<span class="shared-label">${g.entries.length} engines</span>` : ''}
          ${errors ? `<span class="warn-badge">⚠ ${errors}</span>` : ''}</div>
        <span class="row-title">${esc(g.title)}</span>
        <span class="badges">${[...g.entries].sort((a, b) => engineOrder(a) - engineOrder(b)).map(e =>
          `<span class="badge ${e.engine} ${e.rejected ? 'rejected' : ''}" title="${esc(e.a.status)}">${esc(names[e.engine])} ${e.a.fit == null ? '—' : e.a.fit + '%'} · ${esc(e.rejected ? 'Rejected' : e.a.declared || e.a.status)}</span>`).join('')}</span>
      </button>`;
    }).join('') || '<div class="empty">No opportunities match these filters.</div>';
  }

  function gateTable(a) {
    return `<table class="gate-table"><thead><tr><th>Gate</th><th>Graded</th><th>Evidence</th><th>Assayer</th></tr></thead><tbody>${a.gates.map(g => {
      const cites = g.citations.map(i => a.citations[i]);
      const verdict = g.effective ? ['ok', '✓ holds'] : g.value !== 'pass' ? ['open', '– open'] : !g.sourced ? ['bad', '✗ unsourced'] : ['bad', '✗ refuted'];
      return `<tr><td><b>${g.id}</b><div class="muted">${esc(g.name)}</div></td>
        <td><span class="gv ${g.value}">${g.value}</span></td>
        <td>${cites.length ? cites.map(c => `<div class="ev ${c.snapshot}"><span class="ev-host">${esc(host(c.url))}</span> <q>${esc(c.quote)}</q>
          <span class="ev-check" title="Checked against the cached source snapshot">${c.snapshot === 'found' ? 'quote in source' : c.snapshot === 'missing' ? 'quote NOT in source' : 'no snapshot'}</span></div>`).join('') : '<span class="muted">No citation</span>'}</td>
        <td><span class="verdict ${verdict[0]}">${verdict[1]}</span></td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function diagList(a, interactive) {
    if (!a.diagnostics.length) return '<div class="diag-ok"><h3>✓ No Assayer findings</h3><p class="muted">Gates, citations, status and fields are consistent.</p></div>';
    return `<ul class="findings">${a.diagnostics.map((d, i) => `<li class="finding ${d.severity}">
      <${interactive ? `button type="button" data-jump="${i}"` : 'div'} class="finding-inner">
        <span class="sev">${sevIcon[d.severity]}</span><code class="code">${esc(d.code)}</code><span class="loc">L${d.line}:${d.col}</span>
        <span class="msg">${inline(d.message)}</span>
      </${interactive ? 'button' : 'div'}></li>`).join('')}</ul>`;
  }
  function inspector(a, interactive = false) {
    return `<div class="verdict-bar">
        <div><span class="muted">Declared</span><span class="tierpill ${tierClass(a.declared || 'Unknown')}">${esc(a.status)}</span></div>
        <div><span class="muted">Assayer grade</span><span class="tierpill ${tierClass(a.assayerTier)}">${esc(a.assayerTier)}</span></div>
        <div><span class="muted">Fit</span><b>${a.fit == null ? 'ungraded' : a.fit + '%'}</b></div>
        <div class="counts"><span class="c error">${a.counts.error} errors</span><span class="c warn">${a.counts.warn} warnings</span><span class="c info">${a.counts.info} notes</span></div>
      </div>
      <h3 class="section-h">Gate inspector</h3>${gateTable(a)}
      <h3 class="section-h">Assayer diagnostics</h3>${diagList(a, interactive)}
      <details class="raw"><summary>lead-lint row (identical to <code>tools/lead-lint.mjs</code>)</summary><pre>${esc(JSON.stringify(a.row, null, 2))}</pre></details>`;
  }

  function showGroup(key) {
    state.group = key;
    renderList();
    const g = groups().find(x => x.key === key);
    if (!g) { state.group = ''; $('#detail').innerHTML = '<div class="empty"><h2>Select an opportunity</h2></div>'; return; }
    const entries = [...g.entries].sort((a, b) => engineOrder(a) - engineOrder(b));
    const cur = entries.find(e => e.engine === state.engine) || entries[0];
    state.engine = cur.engine;
    $('#detail').innerHTML = `<div class="detail-header">
        <span class="eyebrow">${esc(laneName(g.lane).toUpperCase())} · ${entries.length > 1 ? 'SHARED SUBJECT' : 'OPPORTUNITY'} · <code>${esc(g.id)}</code></span>
        <h2>${esc(g.title)}</h2>
        <p>${entries.length} independent assessment${entries.length === 1 ? '' : 's'}. Each engine keeps its own evidence; the Assayer re-derives every grade from the cited sources.</p>
        <div class="engine-tabs" role="tablist">${entries.map(e => `<button role="tab" class="engine-tab ${e.engine}" aria-selected="${e === cur}" data-engine="${e.engine}">
          ${esc(names[e.engine])} <span class="tierpill ${tierClass(e.rejected ? 'Rejected' : e.a.declared)}">${esc(e.rejected ? 'Rejected' : e.a.status)}</span>${e.a.counts.error ? ` <span class="warn-badge">⚠ ${e.a.counts.error}</span>` : ''}</button>`).join('')}</div>
      </div>
      <div class="split">
        <article class="assessment ${cur.engine}"><div class="assessment-head"><h3>${esc(names[cur.engine])} dossier</h3>
          <div class="filename">${esc(cur.lane)} / ${esc(cur.file)}</div>
          <button type="button" class="ghost-btn" data-sandbox="${cur.i}">Open in Linter Sandbox →</button></div>
          <div class="md">${markdown(text(cur))}</div></article>
        <aside class="inspector assessment ${cur.engine}"><div class="assessment-head"><h3>Assayer · ${esc(names[cur.engine])}</h3></div>
          <div class="inspector-body">${inspector(cur.a)}</div></aside>
      </div>`;
  }

  function renderDiagnostics() {
    const sev = $('#sev-filter').value;
    const items = state.all.filter(inLane).flatMap(d => d.a.diagnostics.filter(x => (sev ? x.severity === sev : x.severity !== 'info')).map(x => ({ d, x })));
    const total = state.all.filter(inLane).reduce((n, d) => n + d.a.counts.error + d.a.counts.warn, 0);
    $('#diag-count').textContent = total;
    $('#diag-count').className = `count-pill ${total ? 'has-warn' : ''}`;
    const byCode = {};
    for (const { x } of items) byCode[x.code] = (byCode[x.code] || 0) + 1;
    $('#diag-summary').innerHTML = Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button type="button" class="chip" data-code="${esc(c)}">${esc(c)} <b>${n}</b></button>`).join('');
    $('#diag-list').innerHTML = items.length ? items.map(({ d, x }) => `<article class="diag-card ${x.severity}">
      <div class="diag-card-head"><div><span class="lane-tag">${esc(laneName(d.lane))}</span> <strong>${esc(names[d.engine])}</strong> <code>${esc(d.file)}</code> <span class="loc">L${x.line}:${x.col}</span></div>
      <button type="button" class="ghost-btn" data-open="${d.i}">Inspect</button></div>
      <div class="diag-issue"><code class="code ${x.severity}">${esc(x.code)}</code> ${inline(x.message)}</div>
      ${x.excerpt ? `<pre class="diag-snippet"><code>${esc(x.excerpt)}</code></pre>` : ''}</article>`).join('')
      : '<div class="diag-ok"><h3>✓ Nothing at this severity</h3></div>';
  }

  function renderReport() {
    const lanes = state.lane ? [state.lane] : state.data.lanes.map(l => l.id);
    $('#report-body').innerHTML = lanes.flatMap(l => state.data.engines.map(e => {
      const files = state.all.filter(d => d.lane === l && d.engine === e.id && !d.rejected).map(d => ({ file: d.file.split('/').pop(), text: text(d) }));
      if (!files.length) return '';
      const r = lintCorpus(files, { now: now() });
      return `<article class="assessment ${e.id}"><div class="assessment-head"><h3>${esc(names[e.id])} · ${esc(laneName(l))}</h3>
        <p class="muted">${r.leads} leads · Ready ${r.tiers.ready} · Try-worthy ${r.tiers.try_worthy} · regate: ${esc(Array.isArray(r.regate_needed) ? r.regate_needed.join(', ') : 'none')}</p></div>
        <pre class="json">${esc(JSON.stringify(r, null, 2))}</pre></article>`;
    })).join('');
  }

  // Sandbox
  function renderPresets() {
    $('#preset').innerHTML = `<optgroup label="Edge cases">${state.data.presets.map((p, i) => `<option value="p:${i}">${esc(p.label)}</option>`).join('')}</optgroup>` +
      state.data.lanes.map(l => `<optgroup label="${esc(l.name)}">${state.all.filter(d => d.lane === l.id).map(d => `<option value="d:${d.i}">${esc(names[d.engine])} · ${esc(d.a.title)}${d.rejected ? ' (rejected)' : ''}</option>`).join('')}</optgroup>`).join('');
  }
  function loadPreset(v) {
    const [kind, i] = v.split(':');
    const src = kind === 'p' ? state.data.presets[+i] : state.all[+i];
    $('#preset').value = v;
    $('#editor').value = src.markdown.join('\n');
    $('#sb-rejected').checked = !!src.rejected;
    lintSandbox();
  }
  let sandboxResult = null;
  function lintSandbox() {
    const t0 = performance.now();
    const value = $('#editor').value;
    sandboxResult = assay(value, { file: 'sandbox.md', now: now(), rejected: $('#sb-rejected').checked, sources: $('#sb-snapshots').checked ? state.data.sources : {} });
    const ms = performance.now() - t0;
    $('#sb-timing').textContent = `Linted ${value.length.toLocaleString()} chars in ${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms · deterministic, in-browser`;
    $('#sb-gutter').textContent = Array.from({ length: value.split('\n').length }, (_, i) => i + 1).join('\n');
    $('#sb-result').innerHTML = inspector(sandboxResult, true);
  }
  function jump(i) {
    const d = sandboxResult?.diagnostics[i], ed = $('#editor');
    if (!d) return;
    ed.focus();
    ed.setSelectionRange(d.start, Math.max(d.end, d.start));
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 19;
    ed.scrollTop = Math.max(0, (d.line - 4) * lh);
    ed.scrollLeft = Math.max(0, (d.col - 12) * 7.6);
  }

  function tab(id) {
    state.tab = id;
    for (const n of ['leads', 'sandbox', 'diagnostics', 'report']) $('#' + n).hidden = n !== id;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    history.replaceState(null, '', id === 'leads' ? location.pathname : '#' + id);
    if (id === 'sandbox' && !$('#editor').value) loadPreset(state.data.presets.length ? 'p:0' : 'd:0');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-jump]');
    if (!t) return;
    if (t.dataset.tab) tab(t.dataset.tab);
    else if (t.dataset.lane !== undefined) { state.lane = t.dataset.lane; renderAll(); }
    else if (t.dataset.group) { state.engine = ''; showGroup(t.dataset.group); }
    else if (t.dataset.engine) { state.engine = t.dataset.engine; showGroup(state.group); }
    else if (t.dataset.sandbox) { tab('sandbox'); loadPreset('d:' + t.dataset.sandbox); }
    else if (t.dataset.jump) jump(+t.dataset.jump);
    else if (t.dataset.code) { $('#search').value = t.dataset.code; tab('leads'); renderList(); }
    else if (t.dataset.open) {
      const d = state.all[+t.dataset.open];
      state.engine = d.engine; tab('leads');
      if (state.lane && state.lane !== d.lane) { state.lane = ''; renderAll(); }
      showGroup(d.lane + '|' + d.id);
    }
  });
  for (const id of ['search', 'project-filter', 'status-filter', 'sort', 'rejected', 'shared', 'malformed']) $('#' + id).addEventListener('input', renderList);
  $('#sev-filter').addEventListener('input', renderDiagnostics);
  $('#editor').addEventListener('input', lintSandbox);
  $('#editor').addEventListener('scroll', () => { $('#sb-gutter').scrollTop = $('#editor').scrollTop; });
  for (const id of ['sb-rejected', 'sb-snapshots']) $('#' + id).addEventListener('input', lintSandbox);
  $('#preset').addEventListener('input', e => loadPreset(e.target.value));
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); tab('leads'); $('#search').focus(); }
  });
  load();
}
