// Deterministic HTML / DOM-dump → clean, coordinate-numbered text (`L1 ...`). Pure: no DOM, no I/O, no randomness.
// Same input always yields byte-identical output, so quotes cited against `L<n>` stay checkable offline.

const VOID = new Set('area base br col embed hr img input keygen link meta param source track wbr'.split(' '));
const RAW = new Set('script style textarea title xmp plaintext noscript template iframe'.split(' '));
const DROP = new Set('head script style noscript template svg math iframe object embed canvas video audio picture map nav footer aside form button select option datalist dialog menu'.split(' '));
const BLOCK = new Set('address article aside blockquote body caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table tbody thead tfoot tr ul'.split(' '));
const CELL = new Set(['td', 'th']);
const PROTECTED = new Set(['html', 'body', 'main', 'article']);
const NOISE_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'complementary', 'search', 'dialog', 'alertdialog', 'menu', 'menubar', 'toolbar']);
const NOISE_PARTS = new Set(('nav navbar navigation menu megamenu footer sidebar breadcrumb breadcrumbs cookie cookies consent gdpr ccpa advert adverts advertisement ads adslot ' +
  'promo newsletter subscribe social share sharing sharebar modal popup overlay skip skiplink sronly toolbar related recommended outbrain taboola').split(' '));
// Implicit end tags: opening `key` closes an open element of these names (HTML tree-construction, simplified).
const AUTO_CLOSE = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'], p: ['p'] };
const CLOSES_P = new Set('address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul'.split(' '));
const BOILERPLATE = /^(skip to (main )?(content|navigation)|accept( all)?( cookies)?|reject( all)?|allow (all|cookies)|cookie (settings|preferences|policy)|we use cookies\b.*|this (site|website) uses cookies\b.*|manage (cookies|preferences|consent)|subscribe( now| to our newsletter)?|sign up for (our|the) newsletter|share( this)?( on \w+)?|follow us( on \w+)?|back to top|toggle (navigation|menu)|open menu|close( menu)?|menu|search|loading\W*|advertisement|sponsored|©.*|copyright \d{4}.*|all rights reserved\.?|privacy policy|terms (of (use|service)|and conditions)|print|email|tweet|pin it)$/i;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£',
  yen: '¥', cent: '¢', sect: '§', para: '¶', middot: '·', bull: '•', times: '×', divide: '÷', deg: '°', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  shy: '', zwj: '', zwnj: '', lrm: '', rlm: '', prime: '′', Prime: '″', larr: '←', rarr: '→', uarr: '↑', darr: '↓', check: '✓', iexcl: '¡', iquest: '¿' };
export function decodeEntities(s) {
  return s.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
    }
    return e in NAMED ? NAMED[e] : m;
  });
}

const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(ATTR)) {
    const k = m[1].toLowerCase();
    if (!(k in attrs)) attrs[k] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Lenient HTML tree builder. Nodes: { tag, attrs, children, parent } or text strings. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root, i = 0;
  const n = html.length, lower = html.toLowerCase();
  const open = tag => { for (let c = cur; c; c = c.parent) if (c.tag === tag) return c; return null; };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { cur.children.push(html.slice(i)); break; }
    if (lt > i) cur.children.push(html.slice(i, lt));
    i = lt;
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (html[i + 1] === '!' || html[i + 1] === '?') { const e = html.indexOf('>', i); i = e < 0 ? n : e + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(html.slice(i, i + 65536));
    if (!m) { cur.children.push('<'); i++; continue; }
    i += m[0].length;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const target = open(tag);
      if (target) cur = target.parent;
      continue;
    }
    if (tag === 'p' || CLOSES_P.has(tag)) { const p = open('p'); if (p && !/^(table|li|td|th)$/.test(cur.tag)) cur = p.parent; }
    for (const t of AUTO_CLOSE[tag] || []) {
      if (t === 'p') continue;
      // Only close a sibling, never an ancestor across a list/table boundary.
      let c = cur;
      while (c && c !== root && !/^(ul|ol|dl|table|tbody|thead|tfoot|select|datalist)$/.test(c.tag) && c.tag !== t) c = c.parent;
      if (c && c.tag === t) cur = c.parent;
    }
    const node = { tag, attrs: parseAttrs(m[3]), children: [], parent: cur };
    cur.children.push(node);
    if (VOID.has(tag) || m[3].trimEnd().endsWith('/')) continue;
    if (RAW.has(tag)) {
      const close = lower.indexOf('</' + tag, i);
      const end = close < 0 ? n : close;
      if (tag === 'textarea' || tag === 'title') node.children.push(html.slice(i, end));
      const gt = close < 0 ? n : html.indexOf('>', close);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    cur = node;
  }
  return root;
}

const hasDescendant = (node, test) => node.children.some(c => typeof c !== 'string' && (test(c) || hasDescendant(c, test)));
const isContentRoot = c => c.tag === 'main' || c.tag === 'article' || c.tag === 'h1' || c.attrs.role === 'main';
function isNoise(node) {
  const { tag, attrs } = node;
  if (PROTECTED.has(tag)) return false;
  let noise = DROP.has(tag) || NOISE_ROLES.has((attrs.role || '').toLowerCase()) || 'hidden' in attrs || attrs['aria-hidden'] === 'true' ||
    /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style || '');
  if (!noise && tag === 'header') { let p = node.parent; while (p && !/^(main|article)$/.test(p.tag)) p = p.parent; noise = !p; }
  if (!noise) {
    const parts = `${attrs.class || ''} ${attrs.id || ''}`.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    noise = parts.some(p => NOISE_PARTS.has(p));
  }
  // Never discard the subtree that holds the page's actual content.
  return noise && tag !== 'head' && !/^(script|style|svg|template|noscript)$/.test(tag) ? !hasDescendant(node, isContentRoot) : noise;
}

function render(root, opts) {
  const lines = [];
  let line = '', pre = 0;
  const flush = () => { if (line.trim()) lines.push(pre ? '\u0001' + line : line); line = ''; };
  const walk = (node, ctx) => {
    for (const c of node.children) {
      if (typeof c === 'string') {
        if (ctx.pre) {
          const parts = decodeEntities(c).split('\n');
          parts.forEach((p, k) => { if (k) flush(); line += p.replace(/\t/g, '  '); });
        } else line += decodeEntities(c).replace(/[\s ]+/g, ' ');
        continue;
      }
      if (isNoise(c)) continue;
      const { tag } = c;
      if (tag === 'br') { flush(); continue; }
      if (tag === 'img') { if (opts.alt && c.attrs.alt?.trim()) line += ` [image: ${c.attrs.alt.trim()}] `; continue; }
      const block = BLOCK.has(tag);
      if (block) flush();
      if (CELL.has(tag) && line.trim()) line += ' | ';
      if (/^h[1-6]$/.test(tag)) line += '#'.repeat(+tag[1]) + ' ';
      let next = ctx;
      if (tag === 'ol' || tag === 'ul') next = { ...ctx, list: tag, n: 0 };
      if (tag === 'li') line += ctx.list === 'ol' ? `${++ctx.n}. ` : '- ';
      if (tag === 'pre') { next = { ...next, pre: true }; pre++; }
      walk(c, next);
      if (tag === 'pre') { flush(); pre--; }
      if (tag === 'a' && opts.links) {
        const href = c.attrs.href || '';
        if (/^https?:\/\//i.test(href) && !line.includes(href)) line += ` <${href}>`;
      }
      if (block) flush();
    }
  };
  walk(root, { list: null, n: 0, pre: false });
  flush();
  return lines;
}

const clean = l => l.replace(/[​-‍⁠﻿­]/g, '').replace(/[ \t]+/g, ' ').trim();
const isHtml = s => /<\/?[a-zA-Z][^>]*>/.test(s) && (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).length >= 2;
const utf8 = s => new TextEncoder().encode(s).length;

/**
 * Strip markup and boilerplate. Returns { lines, text, numbered, stats }.
 * opts: { links=false (append absolute hrefs), alt=false (keep img alt), keepBoilerplate=false, html=auto }
 */
export function stripNoise(input, opts = {}) {
  const src = String(input ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const html = opts.html ?? isHtml(src);
  let lines = (html ? render(parseHtml(src), opts) : src.split('\n'))
    .map(l => (l[0] === '\u0001' ? l.slice(1).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trimEnd() : clean(l).replace(/^(#{1,6}) +/, '$1 ')))
    .filter(l => l.trim() && !/^#{1,6}$/.test(l));
  if (!opts.keepBoilerplate) {
    const counts = new Map();
    for (const l of lines) counts.set(l, (counts.get(l) || 0) + 1);
    const seen = new Set();
    lines = lines.filter((l, k) => {
      const bare = l.replace(/^(- |\d+\. |#{1,6} )/, '').replace(/[|•·›»\s]+$/g, '').trim();
      if (!bare || BOILERPLATE.test(bare)) return false;
      if (k && l === lines[k - 1]) return false;
      if (counts.get(l) >= 3 && l.length <= 40) { if (seen.has(l)) return false; seen.add(l); }
      return true;
    });
  }
  const text = lines.join('\n');
  const numbered = numberLines(lines);
  const inBytes = utf8(src), outBytes = utf8(numbered);
  return { lines, text, numbered, stats: { html, inBytes, outBytes, inLines: src ? src.split('\n').length : 0, outLines: lines.length,
    reduction: inBytes ? Math.round((1 - outBytes / inBytes) * 10000) / 10000 : 0 } };
}

/** `L<n> ` coordinates; `start` keeps numbering global when a source is chunked across packets. */
export function numberLines(lines, start = 1) {
  return lines.map((l, k) => `L${start + k} ${l}`).join('\n');
}
