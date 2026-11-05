import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, dedupUrls, lintDossier } from '../src/dossier.mjs';

test('canonicalizeUrl normalizes scheme, host, port, fragment, tracking params, order and slashes', () => {
  assert.equal(canonicalizeUrl('HTTPS://Example.COM:443/Docs/?z=1&utm_medium=x&a=2#top').url, 'https://example.com/Docs?a=2&z=1');
  assert.equal(canonicalizeUrl('http://example.com:80/').url, 'http://example.com/');
  assert.equal(canonicalizeUrl('https://example.com/a/b/').url, 'https://example.com/a/b');
});

test('canonicalizeUrl refuses unparseable, non-http and credential-bearing URLs', () => {
  assert.equal(canonicalizeUrl('not a url').ok, false);
  assert.equal(canonicalizeUrl('javascript:alert(1)').ok, false);
  assert.equal(canonicalizeUrl('https://user@localhost/').ok, false);
});

test('dedupUrls keeps first occurrence and reports duplicates and invalid entries', () => {
  const r = dedupUrls(['https://a.test/x?fbclid=1', 'https://a.test/x', 'bogus', 'https://b.test/']);
  assert.deepEqual(r.unique, ['https://a.test/x', 'https://b.test/']);
  assert.deepEqual(r.duplicates.map(d => d.index), [1]);
  assert.deepEqual(r.invalid.map(d => d.index), [2]);
});

const DOC = '# T\n\n## Summary\n\nS.\n\n## Findings\n\nF.\n\n## Sources\n\n- [A](https://a.test/x)\n';

test('lintDossier accepts a well-formed dossier', () => {
  const r = lintDossier(DOC);
  assert.equal(r.ok, true);
  assert.deepEqual(r.stats, { links: 1, sourceLinks: 1, uniqueSources: 1 });
});

test('lintDossier flags a duplicate source with the line of the first occurrence', () => {
  const r = lintDossier(DOC + '- [A2](https://a.test/x)\n');
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].rule, 'duplicate-source');
  assert.match(r.violations[0].message, /line 13/);
});

test('lintDossier does not treat a link in Findings as a source', () => {
  const r = lintDossier(DOC.replace('F.', 'F. [x](https://a.test/x)'));
  assert.equal(r.ok, true);
  assert.equal(r.stats.sourceLinks, 1);
});

test('canonicalizeUrl uppercases percent-encoding and punycodes IDN hosts', () => {
  assert.equal(canonicalizeUrl('https://example.org/caf%c3%a9').url, 'https://example.org/caf%C3%A9');
  assert.equal(canonicalizeUrl('https://example.org/café').url, 'https://example.org/caf%C3%A9');
  assert.equal(canonicalizeUrl('https://bücher.example/').url, 'https://xn--bcher-kva.example/');
  assert.equal(canonicalizeUrl('https://ｅｘａｍｐｌｅ.org').url, 'https://example.org/');
});
