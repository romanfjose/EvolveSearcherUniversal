// Citation + gate rules for reply files. Grammar and codes match the canonical Assayer
// (repo `docs/demo/demo-app.js` → `assay`); test/citations.test.mjs proves parity when that file is present.

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

export const normQuote = s => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
/** Source text normalised for quote lookup: `L<n> ` coordinates removed, lines joined. */
export const normSource = s => normQuote(s.replace(/^L\d+ /gm, ''));

// One normalisation per sources object, not per file: a 300-file reply against 40 pages stays linear.
const indexCache = new WeakMap();
const sourceIndex = src => {
  if (!indexCache.has(src)) indexCache.set(src, new Map(Object.entries(src).map(([u, t]) => [canonicalUrl(u), normSource(t)])));
  return indexCache.get(src);
};

const CITE_LINE = /\[verified:\s*https?:\/\/\S+\s+["“][^"”]+["”]\]/;
const GATE_LINE = /^- \*\*Gates:\*\*[^\S\r\n]*(.*)$/im;
const gateRe = n => new RegExp(`(?:^|;)\\s*G${n}\\s*:?\\s*(pass|fail|unknown)\\b`, 'i');
const GATE_WORD = [1, 2, 3, 4].map(n => new RegExp(`\\bG${n}\\b`));

function classify(token, exactTag) {
  if (!exactTag) return ['CITATION_CASE', 'Tag must be exactly `[verified:` (lowercase, no inner spaces)'];
  if (!token.endsWith(']')) return ['CITATION_UNCLOSED', 'Citation has no closing `]` on its line'];
  const body = token.slice(token.indexOf(':') + 1, -1);
  if (!/https?:\/\//.test(body)) {
    if (/https?:\/\//i.test(body)) return ['CITATION_MALFORMED', 'URL scheme must be lowercase `http://` or `https://`'];
    if (/^\s*[a-z][\w+.-]*:/i.test(body)) return ['CITATION_UNSAFE_SCHEME', 'Only http(s) sources count as read evidence'];
    return ['CITATION_NO_URL', 'Citation names no http(s) source URL'];
  }
  if (!/["“”]/.test(body)) return ['CITATION_MISSING_QUOTE', 'Citation has a URL but no "quoted" source text'];
  if (/["“]\s*["”]\s*$/.test(body) && !/["“][^"”]+["”]/.test(body)) return ['CITATION_EMPTY_QUOTE', 'Quoted source text is empty'];
  if (/["“]/.test(body.match(/https?:\/\/(\S*)/)[1])) return ['CITATION_MALFORMED', 'Separate the URL from the "quote" with a space: `<url> "<quote>"`'];
  return ['CITATION_MALFORMED', 'Expected `[verified: <url> "<quote>"]`'];
}

/**
 * Scan one file body. Returns { citations, diagnostics }.
 * opts.sources: { [url]: text } — when a cited URL is one of the packet's sources, its quote must occur in that text.
 * Every diagnostic carries 1-based `line`/`col` and `start`/`end` offsets into `text`.
 */
export function lintCitations(text, opts = {}) {
  const sources = sourceIndex(opts.sources || {});
  const citations = [], diagnostics = [];
  const lines = text.split('\n');
  let offset = 0;
  const add = (code, severity, li, at, end, message) =>
    diagnostics.push({ code, severity, line: li + 1, col: at + 1, start: offset + at, end: offset + end, excerpt: lines[li].slice(at, end), message });
  for (const [li, raw] of lines.entries()) {
    const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    for (const m of content.matchAll(/\[\s*verified\s*:/gi)) {
      const at = m.index;
      const sticky = /\[verified:\s*(https?:\/\/\S+)\s+["“]([^"”]+)["”]\]/y;
      sticky.lastIndex = at;
      const ok = m[0] === '[verified:' && sticky.exec(content);
      if (!ok) {
        const close = content.indexOf(']', at);
        const end = close < 0 ? content.length : close + 1;
        const [code, message] = classify(content.slice(at, end), m[0] === '[verified:');
        add(code, 'error', li, at, end, message);
        continue;
      }
      const [token, url, quote] = ok, end = at + token.length, canonical = canonicalUrl(url);
      const c = { url, quote, canonical, line: li + 1, start: offset + at, end: offset + end, source: 'unchecked' };
      if (!canonical) add('URL_INVALID', 'error', li, at, end, `\`${url}\` is not a parseable http(s) URL`);
      else if (sources.has(canonical)) {
        c.source = sources.get(canonical).includes(normQuote(quote)) ? 'found' : 'missing';
        if (c.source === 'missing') add('QUOTE_NOT_IN_SOURCE', 'error', li, at, end, `Quote does not occur in the packet's source for ${canonical}`);
      } else if (opts.requireSourced && sources.size) add('SOURCE_NOT_IN_PACKET', 'error', li, at, end, `${canonical} was not supplied in this packet, so the quote is unverifiable`);
      if (!quote.trim()) add('QUOTE_BLANK', 'warn', li, at, end, 'Quote is whitespace only');
      citations.push(c);
    }
    offset += raw.length + 1;
  }
  return { citations, diagnostics };
}

/** Gate rule (RecallCharter §7 / lead-lint): every `Gn pass` on the `- **Gates:**` line needs a well-formed citation on a line naming Gn. */
export function lintGates(text) {
  const m = GATE_LINE.exec(text);
  if (!m) return [];
  const lines = text.split('\n'), out = [];
  const lineNo = text.slice(0, m.index).split('\n').length;
  for (const n of [1, 2, 3, 4]) {
    const g = m[1].match(gateRe(n));
    if (g?.[1]?.toLowerCase() !== 'pass') continue;
    if (lines.some(l => GATE_WORD[n - 1].test(l) && CITE_LINE.test(l))) continue;
    const lead = g[0].indexOf('G' + n), col = m[0].length - m[1].length + g.index + lead + 1;
    out.push({ code: 'GATE_UNSOURCED', severity: 'error', line: lineNo, col, start: m.index + col - 1, end: m.index + col - 1 + g[0].length - lead,
      excerpt: g[0].slice(lead), message: `G${n} pass has no \`[verified: <url> "<quote>"]\` on a line naming G${n}` });
  }
  return out;
}
