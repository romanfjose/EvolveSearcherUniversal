#!/usr/bin/env node
/**
 * Zero-token deterministic utilities for `universal-discovery`. No arguments prints usage.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lintLeads } from './lead-lint.mjs';
import { Resolver } from 'node:dns/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dns = new Resolver({ timeout: 5000, tries: 1 });
const request = (url, options = {}) => fetch(url, { signal: AbortSignal.timeout(15000), ...options });

const [, , cmd, ...args] = process.argv;

const UA = 'SelfEvolvingResearchBot/1.0 (research; contact via Commander)'; // honest tool UA on every request: never a browser string

async function checkDns(host) {
  const clean = host.replace(/^https?:\/\//, '').split('/')[0];
  const settle = async (fn) => {
    try { return await fn(); } catch (e) { return { error: e.code || e.message }; }
  };
  const [a, aaaa, ns, soa] = await Promise.all([
    settle(() => dns.resolve4(clean)),
    settle(() => dns.resolve6(clean)),
    settle(() => dns.resolveNs(clean)),
    settle(() => dns.resolveSoa(clean)),
  ]);
  const hasIp = Array.isArray(a) && a.length > 0 || Array.isArray(aaaa) && aaaa.length > 0;
  const hasDelegation = Array.isArray(ns) && ns.length > 0 || (soa && !soa.error);
  const transient = (r) => ['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED'].includes(r?.error);
  const verdict = hasIp ? 'LIVE_DNS'
    : transient(a) || transient(aaaa) ? 'DNS_INCONCLUSIVE_RETRY'
    : hasDelegation ? 'DEAD_HOST_NO_A_AAAA_SKIP' : 'NXDOMAIN_SKIP';
  console.log(JSON.stringify({ host: clean, verdict, a, aaaa, ns, soa }, null, 2));
}

const htmlToText = (raw) => raw
  .replace(/<(script|style|svg|noscript|iframe|header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

const READ_CACHE = path.join(ROOT, 'scratch', '.read-cache'), READ_TTL = 6 * 3600000; // one GET per URL per mission: replies (walls included) are cached 6 h and never retried
const WALL_BODY = /Just a moment\.\.\.|cf-chl|Attention Required! \| Cloudflare|Checking your browser|ddos-guard|Enable JavaScript and cookies to continue|Verify you are human|Request unsuccessful\. Incapsula/i;
/** 401/403/429 or a challenge page: stop, park for a Commander paste; never retry via proxy, r.jina.ai, Wayback or another User-Agent. */
const isWall = (r) => [401, 403, 429].includes(r.status) || (r.status > 0 && /html/i.test(r.ct) && r.body.length < 30000 && WALL_BODY.test(r.body));
const walledNote = 'Stop: park the lead (Waiting on Commander, paste ask). No retry via proxy, r.jina.ai, Wayback or another User-Agent.';
const cacheKey = (s) => path.join(READ_CACHE, crypto.createHash('sha1').update(s).digest('hex') + '.json');
const cacheGet = (file) => { try { if (Date.now() - fs.statSync(file).mtimeMs < READ_TTL) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), cached: true }; } catch {} return null; };
const cachePut = (file, r) => { if (r.status > 0 && r.status < 500 && r.body.length < 4e6) { fs.mkdirSync(READ_CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify(r)); } };

/** Honest-UA GET (no cookies, no credentials, no bypass); cached per URL; never throws. */
async function get(url, ms = 15000, accept = 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8') {
  const file = cacheKey(url), hit = cacheGet(file);
  if (hit) return hit;
  let r;
  try {
    const res = await request(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(ms) });
    r = { status: res.status, ct: res.headers.get('content-type') || '', url: res.url, body: await res.text() };
  } catch (e) { return { status: 0, ct: '', url, body: '', error: e.cause?.code || e.message }; }
  r.walled = isWall(r);
  cachePut(file, r);
  return r;
}

const PROBE_LEGAL = /terms|legal|rules|faq|restriction/i;
const PROBE_DOCS = /docs\.|gitbook|notion\.(?:site|so)|whitepaper|\/docs\b|\/api\b|\bapi\.|terms|legal|rules/i;
const PROBE_NOISE = /w3\.org|schema\.org|reactjs\.org|react\.dev|github\.com\/(?:facebook|mrdoob)|mozilla|googleapis|gstatic|google\.com|cloudflare|unpkg|jsdelivr|npmjs|walletconnect|reown|infura|alchemy|sentry|segment|vercel|nextjs\.org|mixpanel|cdn\./i;
const PROBE_GATE = /eligib|requirement|restriction|availability|deadline|criteria|benefit|cost|evidence|terms|rule/i;

/** Public-page reader: text -> sitemap legal paths -> embedded JSON -> bundle-referenced docs/API urls. Output <= maxChars (default 6000).
 *  A 401/403/429 or challenge page stops here (`walled`): no proxy, reader or archive fallback. The deep read has a 75 s deadline: on timeout the plain page text already fetched is returned. */
async function probe(url, maxChars) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Usage: probe <https://...> [maxChars=6000]');
  const cap = Number(maxChars) || 6000;
  const clip = (t, n) => (t.length > n ? (n > 1 ? t.slice(0, n - 1) + '…' : '') : t); // n <= 1 must empty the string (the old slice(0, -1) never shrank it: infinite loop under a small maxChars)
  const page = await get(url);
  if (page.walled) return walledExit(url, page.status);
  const origin = new URL(page.url || url).origin;
  const isHtml = /html/i.test(page.ct), isPdf = /pdf/i.test(page.ct);
  const title = (page.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
  const text = isPdf ? '' : isHtml ? htmlToText(page.body) : page.body.trim();
  const out = { status: page.status, url: page.url || url, title, text_chars: text.length };
  if (page.error) out.error = page.error;
  if (isPdf) out.note = 'PDF: curl -sL <url> -o f.pdf, then pdftotext -layout f.pdf -';
  out.text = text;

  const deep = async () => {
    const sitemaps = new Set([origin + '/sitemap.xml']);
    const robots = await get(origin + '/robots.txt', 8000);
    for (const m of robots.body.matchAll(/^sitemap:\s*(\S+)/gim)) sitemaps.add(m[1]);
    const locs = new Set();
    const locsOf = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    for (const sm of [...sitemaps].slice(0, 3)) {
      for (const l of locsOf((await get(sm, 10000)).body)) {
        if (/\.xml(\.gz)?$/i.test(l)) locsOf((await get(l, 10000)).body).forEach((c) => locs.add(c));
        else locs.add(l);
      }
    }
    const legal = [...locs].filter((l) => PROBE_LEGAL.test(new URL(l).pathname) && !/privacy|cookie/i.test(l)).slice(0, 8);
    if (legal.length) out.sitemap_legal = legal;

    const next = page.body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    const ld = [...page.body.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    const strings = [];
    const walk = (v) => { if (typeof v === 'string') { if (v.length >= 80) strings.push(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    try { if (next) walk(JSON.parse(next)); } catch {}
    if (strings.length || ld.length) out.embedded = { next_data_text: clip(strings.join(' | '), 800), ld_json: ld.slice(0, 2).map((t) => clip(t, 300)) };

    // bundle-referenced docs/API urls (JS shells only: thin text and no sitemap legal path)
    let docs = [];
    if (!legal.length && isHtml && text.length < 1500) {
      const srcs = [...page.body.matchAll(/<script[^>]+src=["']([^"']+\.m?js[^"']*)["']/gi)].map((m) => new URL(m[1], page.url || url)).filter((u) => u.origin === origin).slice(0, 6);
      const found = new Set();
      for (const u of srcs) {
        for (const m of (await get(u.href, 20000)).body.matchAll(/https?:\/\/[^\s"'`\)<>,;]+/g)) {
          const l = m[0].replace(/[.,]+$/, '');
          if (PROBE_DOCS.test(l) && !PROBE_NOISE.test(l) && !/\.(png|jpe?g|svg|webp|gif|css|woff2?|ico)(\?|$)/i.test(l)) found.add(l);
        }
      }
      docs = [...found].slice(0, 10);
      if (docs.length) out.bundle_urls = docs;
    }

    const follow = [...legal, ...docs.filter((d) => /docs\.|gitbook|notion|whitepaper|terms|rules|legal/i.test(d))].slice(0, 4);
    out.followed = [];
    for (const l of follow) {
      const r = await get(l, 15000);
      if (r.walled) { out.followed.push({ url: l, status: r.status, walled: true }); continue; }
      const t = /html/i.test(r.ct) ? htmlToText(r.body) : r.body.trim();
      const hits = [...new Set(t.split(/\n|(?<=[.!?])\s+/).filter((ln) => PROBE_GATE.test(ln)).map((ln) => clip(ln.trim(), 200)))].slice(0, 5);
      out.followed.push({ url: l, status: r.status, chars: t.length, hits, head: clip(t, 300) });
    }
  };
  let timer;
  const late = await Promise.race([deep().then(() => false), new Promise((r) => { timer = setTimeout(() => r(true), 75000); })]);
  clearTimeout(timer);
  if (late) out.timeout = 'deep read passed 75 s: plain page text only'; // out is printed below before any straggling fetch can mutate it
  if (!isPdf && text.length < 400) out.thin = 'JS shell or thin page: use sitemap_legal, bundle_urls, feed-read or notion-read; no reader proxy';

  const size = () => JSON.stringify(out).length;
  while (size() > cap && out.text.length > 0) out.text = clip(out.text, Math.max(0, out.text.length - Math.max(200, size() - cap)));
  for (const f of out.followed || []) { if (size() <= cap) break; f.head = ''; }
  for (const f of out.followed || []) { if (size() <= cap) break; f.hits = (f.hits || []).slice(0, 2); }
  console.log(JSON.stringify(out));
}

/** Board, prompt and map bytes versus caps (LF-normalised, as architecture-guard context_bytes). */
function budget() {
  const bytes = (f) => { try { return Buffer.byteLength(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')); } catch { return 0; } };
  const prompts = fs.readdirSync(path.join(ROOT, 'prompts')).filter((n) => n.endsWith('.md')).map((n) => 'prompts/' + n);
  const maps = ['CommanderKnowledge.md', 'ARCHITECT_BLUEPRINT.md', 'SearchLocationsList.md', 'ExperimentalSearchLocations.md', 'ExperimentalApproaches.md', 'next_map_recon.md', 'next_approach_recon.md'];
  const sum = (l) => l.reduce((n, f) => n + bytes(f), 0);
  const rows = { 'PostMortem.md': [bytes('PostMortem.md'), 9000], 'AhaBoard.md': [bytes('AhaBoard.md'), 3000], 'DecisionBoard.md': [bytes('DecisionBoard.md'), 4000],
    prompts: [sum(prompts), null], maps: [sum(maps), null], 'prompts+maps': [sum(prompts) + sum(maps), 85000] };
  const report = {};
  for (const [k, [n, c]] of Object.entries(rows)) report[k] = c ? { bytes: n, cap: c, over: Math.max(0, n - c) } : { bytes: n };
  report.over_cap = Object.keys(report).filter((k) => report[k].over > 0);
  console.log(JSON.stringify(report));
}

/** `<origin>/sitemap.xml` (robots.txt `Sitemap:` as fallback; sitemap indexes followed one level, 3 children) -> up to 10 URLs whose path suggests terms, rules, rewards or geo. Rejects non-200 or non-XML. */
async function sitemapRules(origin) {
  if (!origin || !/^https?:\/\//i.test(origin)) throw new Error('Usage: sitemap-rules <https://origin>');
  const base = new URL(origin).origin;
  const xml = async (u) => { const r = await get(u, 12000); return r.status === 200 && (/xml/i.test(r.ct) || /^\s*<\?xml|^\s*<(urlset|sitemapindex)\b/i.test(r.body)) && /<(urlset|sitemapindex)\b/i.test(r.body) ? r.body : null; };
  const locs = (body) => [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  let body = await xml(base + '/sitemap.xml'), from = base + '/sitemap.xml';
  if (!body) {
    for (const m of (await get(base + '/robots.txt', 8000)).body.matchAll(/^sitemap:\s*(\S+)/gim)) if ((body = await xml(from = m[1]))) break;
  }
  if (!body) throw new Error(`SITEMAP_NONE: ${base}/sitemap.xml is not a 200 XML sitemap (robots.txt lists none either)`);
  let urls = locs(body);
  if (/<sitemapindex\b/i.test(body)) {
    const kids = urls.filter((u) => !/image|video|news/i.test(u)).slice(0, 3);
    urls = [];
    for (const k of kids) urls.push(...locs((await xml(k)) || ''));
  }
  const PRIORITY = ['terms', 'legal', 'rule', 'eligibility', 'requirements', 'availability', 'deadline', 'criteria']; // most gate-relevant first
  const rank = (u) => { const p = new URL(u).pathname.toLowerCase(); const i = PRIORITY.findIndex((k) => p.includes(k)); return i < 0 ? 99 : i; };
  const hits = [...new Set(urls)].filter((u) => { try { return rank(u) < 99; } catch { return false; } }).sort((a, b) => rank(a) - rank(b));
  console.log(JSON.stringify({ origin: base, sitemap: from, urls_total: urls.length, matched: hits.length, urls: hits.slice(0, 10) }, null, 1));
}

/** Walled reply (401/403/429/challenge) from a reader: report and stop; the caller parks the lead (Waiting on Commander). */
function walledExit(url, status) {
  console.log(JSON.stringify({ url, status, walled: true, verdict: 'WALLED_PARK', note: walledNote }));
  process.exitCode = 3;
}

const FEED_ITEM = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const xmlText = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const xmlTag = (b, ...tags) => { for (const tg of tags) { const m = b.match(new RegExp(`<${tg}\\b[^>]*>([\\s\\S]*?)</${tg}>`, 'i')); if (m) return xmlText(m[1]); } return ''; };

/** Publisher's own public RSS/Atom feed, read once with the honest UA (clean hands: no cookies, login or proxy). A Medium or Substack page URL maps to its feed;
 *  a post URL also selects that post. `--match <regex>` filters items by title or link and returns their text with relevant evidence sentences. 401/403/429/challenge = WALLED_PARK. */
async function feedRead(args) {
  const usage = 'Usage: feed-read <feed-or-page-url> [--match <regex>] [--chars N]  (Medium /@user[/post] and *.substack.com map to their feed; no match = item list)';
  const url = args.find((a) => /^https?:\/\//i.test(a));
  if (!url) throw new Error(usage);
  const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const chars = Number(opt('--chars')) || 3000;
  let match = opt('--match');
  const u = new URL(url);
  let feed = url;
  if (/(^|\.)medium\.com$/i.test(u.hostname) && !/^\/feed\//.test(u.pathname)) {
    const seg = u.pathname.split('/').filter(Boolean);
    feed = u.hostname.toLowerCase() === 'medium.com' ? (seg[0] ? `https://medium.com/feed/${seg[0]}` : url) : `${u.origin}/feed`;
    if (!match && seg.length > 1) match = seg[seg.length - 1].match(/[0-9a-f]{10,12}$/i)?.[0] || seg[seg.length - 1];
  } else if (/\.substack\.com$/i.test(u.hostname) && !/^\/feed/.test(u.pathname)) {
    feed = u.origin + '/feed';
    const post = u.pathname.match(/^\/p\/([^/]+)/)?.[1];
    if (!match && post) match = post;
  }
  const accept = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8';
  let r = await get(feed, 20000, accept);
  if (r.walled) return walledExit(feed, r.status);
  if (r.status === 200 && !/<(rss|feed)\b/i.test(r.body)) { // a page: follow its advertised feed once
    const href = r.body.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) throw new Error(`FEED_NONE: ${feed} is not a feed and advertises none`);
    feed = new URL(href, r.url || feed).href;
    r = await get(feed, 20000, accept);
    if (r.walled) return walledExit(feed, r.status);
  }
  if (r.status !== 200 || !/<(rss|feed)\b/i.test(r.body)) throw new Error(`FEED_FAIL: ${feed} HTTP ${r.status}${r.error ? ' ' + r.error : ''}`);
  const re = match ? new RegExp(match, 'i') : null;
  const items = [...r.body.matchAll(FEED_ITEM)].map((m) => {
    const b = m[2], html = xmlTag(b, 'content:encoded', 'content', 'summary', 'description');
    const link = xmlTag(b, 'link') || b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || xmlTag(b, 'guid');
    return { title: htmlToText(xmlTag(b, 'title')), link: link.replace(/\?source=rss.*$/, ''), pubDate: xmlTag(b, 'pubDate', 'published', 'updated', 'dc:date'), text: htmlToText(html) };
  });
  const picked = re ? items.filter((i) => re.test(`${i.title} ${i.link}`)) : items;
  const rows = picked.slice(0, re ? 3 : 15).map((i) => re ? { title: i.title, link: i.link, pubDate: i.pubDate, chars: i.text.length, hits: [...new Set(i.text.split(/\n|(?<=[.!?])\s+/).filter((l) => PROBE_GATE.test(l)).map((l) => l.trim().slice(0, 220)))].slice(0, 8), text: i.text.slice(0, chars) }
    : { title: i.title, link: i.link, pubDate: i.pubDate, chars: i.text.length });
  console.log(JSON.stringify({ feed, status: r.status, retrieved_at_utc: new Date().toISOString(), items_in_feed: items.length, match: match || null, shown: rows.length, ...(r.cached ? { cached: true } : {}), items: rows }, null, 1));
}

const notionBlockText = (v) => (v?.properties?.title || []).map((s) => s[0]).join('');
/** Public Notion page (*.notion.site / notion.so) via the page's own anonymous `loadPageChunk` endpoint, the call its browser JS makes: read-only, honest UA, no cookies or login,
 *  max 4 chunks of one document, cached 6 h. 401/403/429/challenge = WALLED_PARK. Tables and databases are not rendered. */
async function notionRead(url, maxChars) {
  const m = (url || '').match(/^https:\/\/[^/]*notion\.(?:site|so)\/[^?#]*?([0-9a-f]{32})(?:[?#].*)?$/i);
  if (!m) throw new Error('Usage: notion-read <https://....notion.site/...-<32-hex-page-id>> [maxChars=6000]');
  const id = m[1].toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'), origin = new URL(url).origin;
  const file = cacheKey('notion:' + id), cached = cacheGet(file);
  let blocks = {}, cursor = { stack: [] }, status = 0, chunks = 0;
  if (cached) { if (cached.walled) return walledExit(url, cached.status); ({ blocks, status, chunks } = cached.notion); }
  else {
    for (; chunks < 4; chunks++) {
      let res, body;
      try {
        res = await request(`${origin}/api/v3/loadPageChunk`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ page: { id }, limit: 100, cursor, chunkNumber: chunks, verticalColumns: false }), signal: AbortSignal.timeout(20000) });
        body = await res.text();
      } catch (e) { throw new Error(`NOTION_FAIL: ${e.cause?.code || e.message}`); }
      status = res.status;
      const reply = { status, ct: res.headers.get('content-type') || '', body };
      if (isWall(reply)) { cachePut(file, { status, ct: reply.ct, url, body: '', walled: true }); return walledExit(url, status); }
      let j; try { j = JSON.parse(body); } catch { throw new Error(`NOTION_FAIL: HTTP ${status} not JSON`); }
      if (status !== 200) throw new Error(`NOTION_FAIL: HTTP ${status}`);
      for (const [k, b] of Object.entries(j.recordMap?.block || {})) blocks[k] = b.value?.value ?? b.value;
      cursor = j.cursor || { stack: [] };
      if (!cursor.stack?.length) { chunks++; break; }
      await sleep(600);
    }
    cachePut(file, { status, ct: 'application/json', url, body: '', notion: { blocks, status, chunks, truncated: !!cursor.stack?.length } });
  }
  const truncated = cached ? !!cached.notion.truncated : !!cursor.stack?.length;
  const lines = [], seen = new Set();
  const walk = (bid, depth) => {
    const v = blocks[bid];
    if (!v || seen.has(bid)) return;
    seen.add(bid);
    const tx = notionBlockText(v), list = /list/.test(v.type || '');
    if (tx) lines.push((/header/.test(v.type) ? '#'.repeat(v.type === 'header' ? 1 : v.type === 'sub_header' ? 2 : 3) + ' ' : list ? '  '.repeat(depth) + '- ' : '') + tx);
    for (const c of v.content || []) walk(c, depth + (list ? 1 : 0));
  };
  walk(id, 0);
  const text = lines.join('\n'), cap = Number(maxChars) || 6000;
  console.log(JSON.stringify({ url, status, title: notionBlockText(blocks[id]), blocks: Object.keys(blocks).length, chunks, truncated, text_chars: text.length,
    hits: [...new Set(lines.filter((l) => PROBE_GATE.test(l)).map((l) => l.slice(0, 220)))].slice(0, 8), ...(cached ? { cached: true } : {}), text: text.slice(0, cap) }));
}


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const USAGE = 'Usage: node tools/preflight-and-verify.mjs <dns host | probe url [chars] | sitemap-rules origin | feed-read url [--match regex] | notion-read url | lead-lint [--dry] | budget>'; 
try {
  if (cmd === 'dns') await checkDns(args[0] || '');
  else if (cmd === 'probe') await probe(args[0], args[1]);
  else if (cmd === 'sitemap-rules') await sitemapRules(args[0]);
  else if (cmd === 'feed-read') await feedRead(args);
  else if (cmd === 'notion-read') await notionRead(args[0], args[1]);
  else if (cmd === 'budget') budget();
  else if (cmd === 'lead-lint') console.log(JSON.stringify(lintLeads(path.join(ROOT, 'leads')), null, 2));
  else if (!cmd) console.log(USAGE);
  else throw new Error(USAGE);
} catch (error) { console.error(error.message); process.exitCode = 1; }
