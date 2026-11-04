// Deterministic synthetic web pages (seeded PRNG) shaped like real-world DOM dumps: utility-class soup, inline
// analytics, SVG icon sprites, hydration JSON, mega-menus, cookie banners. Each page lists the content sentences
// that stripping must keep, so reduction is never bought by dropping content.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const WORDS = 'grant program applicants teams research data open eligibility deadline award funding project review budget partners nonprofit university license report outcome community science tools access portal criteria'.split(' ');
const UTIL = 'flex grid items-center justify-between px-4 py-2 md:px-6 lg:px-8 text-sm text-base font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 rounded-md shadow-sm ring-1 ring-black/5 transition-colors duration-150 gap-4 w-full max-w-7xl mx-auto'.split(' ');

export function makePage(kind, seed = 1) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const cls = (n = 8) => Array.from({ length: n }, () => pick(UTIL)).join(' ');
  const sentence = k => { const w = Array.from({ length: 10 + Math.floor(r() * 14) }, () => pick(WORDS)); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return `${w.join(' ')} (ref ${seed}-${k}).`; };
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="${cls(3)}"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>`;
  const menu = n => `<ul class="${cls()}">${Array.from({ length: n }, (_, i) => `<li class="${cls(5)}"><a class="${cls(6)}" href="/s/${i}" data-track='{"nav":${i}}'>${pick(WORDS)} ${pick(WORDS)}</a>${icon}</li>`).join('')}</ul>`;
  const script = n => `<script>${'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("event","view",{page:location.pathname});'.repeat(n)}</script>`;
  const style = n => `<style>${'.c-btn{display:inline-flex;align-items:center;border-radius:.375rem;padding:.5rem 1rem}'.repeat(n)}</style>`;
  const hydrate = n => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { items: Array.from({ length: n }, (_, i) => ({ id: i, slug: pick(WORDS) + '-' + i, title: pick(WORDS) })) } })}</script>`;
  const content = [];
  const para = k => { const s = sentence(k); content.push(s); return `<div class="${cls()}"><p class="${cls()}">${s}</p></div>`; };
  const shape = {
    article: { paras: 14, menu: 40, scripts: 25, styles: 40, hydrate: 150, aside: 20 },
    docs: { paras: 30, menu: 25, scripts: 6, styles: 15, hydrate: 0, aside: 30 },
    listing: { paras: 8, menu: 60, scripts: 30, styles: 50, hydrate: 400, aside: 10 },
    program: { paras: 10, menu: 50, scripts: 20, styles: 30, hydrate: 200, aside: 15 },
    plain: { paras: 40, menu: 6, scripts: 1, styles: 2, hydrate: 0, aside: 0 },
  }[kind];
  const body = Array.from({ length: shape.paras }, (_, k) => para(k)).join('');
  const h1 = `${kind} page ${seed}`;
  content.unshift('# ' + h1);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${h1}</title>${style(shape.styles)}${script(shape.scripts)}</head>
<body class="${cls()}"><a class="skip-link" href="#main">Skip to content</a><div id="cookie-banner" class="${cls()}"><p>We use cookies to improve your experience.</p><button>Accept all</button></div>
<header class="${cls()}"><nav class="${cls()}">${menu(shape.menu)}</nav></header>
<main id="main" class="${cls()}"><article class="${cls()}"><h1 class="${cls()}">${h1}</h1>${body}
<div class="share-buttons ${cls(3)}"><a href="#">Share on X</a>${icon}${icon}</div></article>
${shape.aside ? `<aside class="${cls()}"><h3>Related</h3>${menu(shape.aside)}</aside>` : ''}</main>
<footer class="${cls()}">${menu(Math.ceil(shape.menu / 2))}<p>© 2026 Example Org. All rights reserved.</p></footer>${shape.hydrate ? hydrate(shape.hydrate) : ''}${script(Math.ceil(shape.scripts / 4))}</body></html>`;
  return { kind, seed, html, content };
}

export const CORPUS = ['article', 'docs', 'listing', 'program', 'plain'].flatMap(kind => [1, 2, 3].map(seed => makePage(kind, seed)));
