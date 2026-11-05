// Deterministic URL canonicalization, URL deduplication, and dossier linting.
// Canonical form: lowercase scheme and host, default port removed, fragment removed,
// utm_* / fbclid / gclid / mc_cid / mc_eid / ref / ref_src query params removed, remaining
// query params sorted by name, percent-encoding hex uppercased in the path, trailing slash removed from non-root paths.
// Hosts are not rewritten (no www stripping): two hosts are only merged if they are identical.

const TRACKING_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const REQUIRED_SECTIONS = ['Summary', 'Findings', 'Sources'];
const PLACEHOLDER_RE = /\b(TODO|TBD|FIXME)\b|lorem ipsum/i;

export function canonicalizeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return { ok: false, reason: 'unparseable URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `unsupported scheme ${url.protocol}` };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials in URL' };
  url.hash = '';
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);
  // Percent-encoding hex digits are case-insensitive (RFC 3986 section 6.2.2.1): %c3%a9 and %C3%A9 are the same path.
  url.pathname = url.pathname.replace(/%[0-9a-f]{2}/gi, m => m.toUpperCase());
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return { ok: true, url: url.toString() };
}

// Keeps the first occurrence of each canonical URL, in input order.
export function dedupUrls(urls) {
  const firstIndex = new Map();
  const unique = [];
  const duplicates = [];
  const invalid = [];
  urls.forEach((raw, index) => {
    const c = canonicalizeUrl(raw);
    if (!c.ok) {
      invalid.push({ index, url: raw, reason: c.reason });
      return;
    }
    if (firstIndex.has(c.url)) {
      duplicates.push({ index, url: raw, canonical: c.url, duplicateOf: firstIndex.get(c.url) });
      return;
    }
    firstIndex.set(c.url, index);
    unique.push(c.url);
  });
  return { unique, duplicates, invalid };
}

// Dossier schema: an H1 title, then the sections Summary, Findings, Sources in that order.
// Sources must contain at least one link. Every markdown link target must be canonical and unique
// within Sources. No bare URLs outside link syntax. No TODO/TBD/FIXME/lorem placeholders.
export function lintDossier(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const violations = [];
  const add = (rule, line, message) => violations.push({ rule, line, message });

  const firstContent = lines.findIndex(l => l.trim() !== '');
  if (firstContent < 0 || !/^# \S/.test(lines[firstContent])) {
    add('title', firstContent + 1, 'document must open with a single H1 title');
  }

  const headings = [];
  lines.forEach((text, i) => {
    if (/^## /.test(text)) headings.push({ name: text.slice(3).trim(), line: i + 1 });
  });
  let cursor = -1;
  for (const name of REQUIRED_SECTIONS) {
    const idx = headings.findIndex(h => h.name === name);
    if (idx < 0) add('sections', 0, `missing section "## ${name}"`);
    else if (idx < cursor) add('sections', headings[idx].line, `section "## ${name}" is out of order`);
    else cursor = idx;
  }

  const sources = headings.find(h => h.name === 'Sources');
  const sourcesEnd = sources
    ? (headings.find(h => h.line > sources.line)?.line ?? lines.length + 1)
    : -1;
  const seen = new Map();
  let links = 0;
  let sourceLinks = 0;
  lines.forEach((text, i) => {
    const lineNo = i + 1;
    if (PLACEHOLDER_RE.test(text)) add('placeholder', lineNo, 'placeholder text present');
    const inSources = Boolean(sources) && lineNo > sources.line && lineNo < sourcesEnd;
    for (const match of text.matchAll(LINK_RE)) {
      links++;
      const raw = match[2];
      const c = canonicalizeUrl(raw);
      if (!c.ok) {
        add('url', lineNo, `invalid link target "${raw}": ${c.reason}`);
        continue;
      }
      if (c.url !== raw) add('url', lineNo, `non-canonical link target "${raw}" (canonical: ${c.url})`);
      if (inSources) {
        sourceLinks++;
        if (seen.has(c.url)) add('duplicate-source', lineNo, `duplicate of line ${seen.get(c.url)}`);
        else seen.set(c.url, lineNo);
      }
    }
    if (/https?:\/\//.test(text.replace(LINK_RE, ''))) add('bare-url', lineNo, 'bare URL outside markdown link syntax');
  });
  if (sources && sourceLinks === 0) add('sources', sources.line, '"## Sources" contains no links');

  return {
    ok: violations.length === 0,
    violations,
    stats: { links, sourceLinks, uniqueSources: seen.size },
  };
}
