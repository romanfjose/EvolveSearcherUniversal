import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripNoise, decodeEntities, parseHtml } from '../src/strip-noise.mjs';
import { CORPUS, makePage, rng } from './fixtures/pages.mjs';

const lines = (html, o) => stripNoise(html, o).lines;

describe('reduction ratios on chrome-heavy pages', () => {
  for (const kind of ['article', 'docs', 'listing', 'program']) {
    test(`${kind}: ≥85% smaller and every content sentence kept`, () => {
      for (const p of CORPUS.filter(c => c.kind === kind)) {
        const r = stripNoise(p.html);
        assert.ok(r.stats.reduction >= 0.85, `${kind}#${p.seed} reduction ${r.stats.reduction}`);
        assert.deepEqual(p.content.filter(c => !r.lines.includes(c)), []);
      }
    });
  }
  test('precision: no boilerplate line survives on any fixture', () => {
    for (const p of CORPUS) assert.equal(stripNoise(p.html).lines.length, p.content.length, `${p.kind}#${p.seed}`);
  });
  test('content-dense page: output is within numbering overhead of the content itself', () => {
    const p = makePage('plain', 9), r = stripNoise(p.html);
    const contentBytes = Buffer.byteLength(p.content.join('\n'));
    assert.ok(r.stats.outBytes <= contentBytes + p.content.length * 5, `${r.stats.outBytes} vs ${contentBytes}`);
  });
  test('example program page in examples/ shrinks by more than 95%', () => {
    const html = fs.readFileSync(new URL('../examples/grant-check/program-page.html', import.meta.url), 'utf8');
    const r = stripNoise(html);
    assert.ok(r.stats.reduction > 0.95);
    assert.ok(r.lines.includes('Awards range from $25,000 to $150,000 for projects lasting up to 18 months.'));
  });
});

describe('determinism and numbering', () => {
  test('byte-identical output across runs', () => {
    for (const p of CORPUS.slice(0, 5)) assert.equal(stripNoise(p.html).numbered, stripNoise(p.html).numbered);
  });
  test('coordinates are L1..Ln, contiguous', () => {
    const r = stripNoise(makePage('docs', 4).html);
    r.numbered.split('\n').forEach((l, i) => assert.ok(l.startsWith(`L${i + 1} `), l));
  });
  test('CRLF and BOM input give the same result as LF', () => {
    const h = '<p>a</p>\n<p>b</p>';
    assert.equal(stripNoise('﻿' + h.replace(/\n/g, '\r\n')).numbered, stripNoise(h).numbered);
  });
});

describe('structure', () => {
  test('headings, ordered and unordered lists', () => {
    assert.deepEqual(lines('<h2>T</h2><ol><li>a<li>b</ol><ul><li>c</li></ul>'), ['## T', '1. a', '2. b', '- c']);
  });
  test('table rows become pipe-separated cells', () => {
    assert.deepEqual(lines('<table><tr><th>A<th>B<tr><td>1<td>2</table>'), ['A | B', '1 | 2']);
  });
  test('pre keeps internal whitespace and line breaks', () => {
    assert.deepEqual(lines('<p>x</p><pre>  a  b\n    c</pre>'), ['x', '  a  b', '    c']);
  });
  test('br splits lines; inline tags do not', () => assert.deepEqual(lines('<p>a <b>b</b><br>c<i>d</i></p>'), ['a b', 'cd']));
  test('implicit </p> closes on block start', () => assert.deepEqual(lines('<p>one<p>two<div>three</div>'), ['one', 'two', 'three']));
  test('links are dropped by default and appended with links:true', () => {
    const h = '<p>See <a href="https://x.org/a">the rules</a>.</p><p>z</p>';
    assert.deepEqual(lines(h), ['See the rules.', 'z']);
    assert.deepEqual(lines(h, { links: true }), ['See the rules <https://x.org/a>.', 'z']);
  });
  test('img alt only with alt:true', () => {
    assert.deepEqual(lines('<p>a<img src=x alt="Chart of awards"></p><p>b</p>'), ['a', 'b']);
    assert.deepEqual(lines('<p>a<img src=x alt="Chart of awards"></p><p>b</p>', { alt: true }), ['a [image: Chart of awards]', 'b']);
  });
});

describe('noise removal', () => {
  test('script/style/svg/template/noscript bodies never leak, even with markup inside strings', () => {
    const h = '<p>keep</p><script>var s="</div><p>leak</p>";</script><style>p{}</style><svg><text>leak</text></svg><template><p>leak</p></template><noscript>leak</noscript><p>end</p>';
    assert.deepEqual(lines(h), ['keep', 'end']);
  });
  test('nav, footer, aside, form, dialog dropped; page header dropped, article header kept', () => {
    const h = '<header><h2>Site</h2></header><nav>n</nav><main><article><header><h1>Title</h1></header><p>Body</p></article><aside>a</aside></main><form><p>f</p></form><dialog>d</dialog><footer>f</footer>';
    assert.deepEqual(lines(h), ['# Title', 'Body']);
  });
  test('ARIA roles, hidden, aria-hidden and display:none are dropped', () => {
    const h = '<div role="navigation">n</div><div hidden>h</div><div aria-hidden="true">a</div><div style="color:red; display: none">s</div><div role="banner">b</div><p>ok</p>';
    assert.deepEqual(lines(h), ['ok']);
  });
  test('class/id tokens (cookie-banner, site_footer, share-bar) are dropped', () => {
    assert.deepEqual(lines('<div class="cookie-banner">c</div><div id="site_footer">f</div><div class="x share-bar">s</div><p>ok</p>'), ['ok']);
  });
  test('a noisy-looking wrapper that holds <main> is kept (layout-with-sidebar)', () => {
    assert.deepEqual(lines('<div class="layout-with-sidebar"><main><p>content</p></main></div>'), ['content']);
  });
  test('boilerplate lines removed; similar real sentences kept', () => {
    const h = '<p>Accept all cookies</p><p>Skip to content</p><p>© 2026 Org</p><p>Share on LinkedIn</p><p>We accept all applications from teams.</p>';
    assert.deepEqual(lines(h), ['We accept all applications from teams.']);
  });
  test('short lines repeated ≥3 times are kept once', () => {
    assert.deepEqual(lines('<p>Read more</p><p>A</p><p>Read more</p><p>B</p><p>Read more</p>'), ['Read more', 'A', 'B']);
  });
  test('keepBoilerplate:true disables line filters', () => assert.deepEqual(lines('<p>Accept all</p><p>x</p>', { keepBoilerplate: true }), ['Accept all', 'x']));
});

describe('entities and text', () => {
  test('named, decimal and hex entities; nbsp collapses', () => {
    assert.equal(decodeEntities('&amp;&lt;&#8220;x&#x201D;&nbsp;&mdash;&unknown;'), '&<“x” —&unknown;');
    assert.deepEqual(lines('<p>a&nbsp;&nbsp;b &amp; c</p>'), ['a b & c']);
  });
  test('invalid code points become U+FFFD instead of throwing', () => assert.equal(decodeEntities('&#xD800;&#99999999;&#0;'), '\uFFFD\uFFFD\uFFFD'));
  test('zero-width and soft hyphens removed from text', () => assert.deepEqual(lines('<p>ab​c­d</p><p>x</p>'), ['abcd', 'x']));
  test('plain text input is cleaned and numbered without HTML parsing', () => {
    const r = stripNoise('  first   line \n\n\nsecond');
    assert.equal(r.stats.html, false);
    assert.equal(r.numbered, 'L1 first line\nL2 second');
  });
});

describe('robustness', () => {
  test('attribute values containing > and quotes do not break tags', () => {
    assert.deepEqual(lines(`<p data-x="a>b" title='c"d'>ok</p><p>z</p>`), ['ok', 'z']);
  });
  test('unclosed tags, stray end tags and bare < are tolerated', () => {
    assert.deepEqual(lines('<div><p>a</span></div></div><p>1 < 2<p>b'), ['a', '1 < 2', 'b']);
  });
  test('comments, doctype, CDATA and processing instructions are skipped', () => {
    assert.deepEqual(lines('<!doctype html><?xml version="1.0"?><!-- <p>no</p> --><![CDATA[x]]><p>yes</p><p>z</p>'), ['yes', 'z']);
  });
  test('unterminated script swallows the rest instead of leaking code', () => assert.deepEqual(lines('<p>a</p><p>b</p><script>var x = 1;'), ['a', 'b']));
  test('fuzz: 400 random tag soups never throw and never emit markup from raw-text elements', () => {
    const r = rng(99), bits = ['<div>', '</div>', '<p>', '<script>', '</script>', 'SECRET', 'text', '<a href="x">', '</a>', '<!--', '-->', '<', '>', '&amp;', '<li>', '<table>', '<td>', '"', "'", '<pre>', '\n', '<br/>'];
    for (let i = 0; i < 400; i++) {
      const s = Array.from({ length: Math.floor(r() * 40) }, () => bits[Math.floor(r() * bits.length)]).join('');
      const out = stripNoise(s);
      assert.equal(typeof out.numbered, 'string');
      if (!s.includes('<script>')) continue;
      const tree = parseHtml(s);
      const walk = n => n.children.forEach(c => { if (typeof c !== 'string') { if (c.tag === 'script') assert.equal(c.children.length, 0); walk(c); } });
      walk(tree);
    }
  });
  test('1 MB page strips in under a second', () => {
    const big = makePage('listing', 5).html.repeat(13);
    const t0 = performance.now();
    stripNoise(big);
    assert.ok(performance.now() - t0 < 1000);
  });
});
