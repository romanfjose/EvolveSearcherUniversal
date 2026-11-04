import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lintCitations, lintGates, canonicalUrl, normQuote } from '../src/citations.mjs';
import { CANONICAL_ASSAY } from '../src/cli.mjs';

const U = 'https://grants.example.org/programs/case';
const SRC = { [U]: 'L1 Program page.\nL2 It’s open to independent\nL3 teams in   any country.' };
const codes = (t, o) => lintCitations(t, o).diagnostics.map(d => d.code);

const TABLE = [
  ['valid', `x [verified: ${U} "quoted"]`, []],
  ['curly quotes', `x [verified: ${U} “quoted”]`, []],
  ['quote containing ]', `x [verified: ${U} "clause [3] applies"]`, []],
  ['missing quote', `x [verified: ${U}]`, ['CITATION_MISSING_QUOTE']],
  ['single quotes', `x [verified: ${U} 'quoted']`, ['CITATION_MISSING_QUOTE']],
  ['empty quote', `x [verified: ${U} ""]`, ['CITATION_EMPTY_QUOTE']],
  ['capitalised tag', `x [Verified: ${U} "q"]`, ['CITATION_CASE']],
  ['spaced tag', `x [ verified: ${U} "q"]`, ['CITATION_CASE']],
  ['no URL', 'x [verified: "q"]', ['CITATION_NO_URL']],
  ['ftp scheme', 'x [verified: ftp://f.example.org/r "q"]', ['CITATION_UNSAFE_SCHEME']],
  ['javascript scheme', 'x [verified: javascript:alert(1) "q"]', ['CITATION_UNSAFE_SCHEME']],
  ['uppercase scheme', 'x [verified: HTTPS://grants.example.org/x "q"]', ['CITATION_MALFORMED']],
  ['quote glued to URL', `x [verified: ${U}"q"]`, ['CITATION_MALFORMED']],
  ['unclosed', `x [verified: ${U} "q"`, ['CITATION_UNCLOSED']],
  ['unparseable URL', 'x [verified: https://[bad "q"]', ['URL_INVALID']],
  ['two on a line, one broken', `[verified: ${U}] and [verified: ${U} "q"]`, ['CITATION_MISSING_QUOTE']],
];

describe('citation grammar', () => {
  for (const [name, text, want] of TABLE) test(name, () => assert.deepEqual(codes(text).filter(c => c !== 'QUOTE_BLANK'), want));
  test('whitespace-only quote is a warning', () => {
    const d = lintCitations(`[verified: ${U} " "]`).diagnostics;
    assert.deepEqual(d.map(x => [x.code, x.severity]), [['QUOTE_BLANK', 'warn']]);
  });
  test('diagnostics carry exact coordinates: text.slice(start, end) === excerpt', () => {
    const text = `line one\n- G1 [verified: ${U}] tail\n- G2 [Verified: x]`;
    for (const d of lintCitations(text).diagnostics) {
      assert.equal(text.slice(d.start, d.end), d.excerpt);
      assert.equal(text.split('\n')[d.line - 1].slice(d.col - 1, d.col - 1 + d.excerpt.length), d.excerpt);
    }
  });
});

describe('quote verification against packet sources', () => {
  const v = q => lintCitations(`[verified: ${U} "${q}"]`, { sources: SRC }).citations[0].source;
  test('exact quote found', () => assert.equal(v('Program page.'), 'found'));
  test('case, curly/straight apostrophes and whitespace are normalised', () => assert.equal(v("IT'S open   to"), 'found'));
  test('quote spanning a line break in the source matches; L-numbers are not part of the text', () => {
    assert.equal(v('open to independent teams in any country'), 'found');
    assert.equal(v('L2 It’s open'), 'missing');
  });
  test('paraphrase is QUOTE_NOT_IN_SOURCE', () => {
    assert.equal(v('open to all teams'), 'missing');
    assert.ok(codes(`[verified: ${U} "open to all teams"]`, { sources: SRC }).includes('QUOTE_NOT_IN_SOURCE'));
  });
  test('source matched by canonical URL (www, fragment, utm, trailing slash)', () => {
    const variant = 'https://www.grants.example.org/programs/case/?utm_source=x#top';
    assert.equal(lintCitations(`[verified: ${variant} "program page"]`, { sources: SRC }).citations[0].source, 'found');
  });
  test('URL outside the packet stays unchecked unless requireSourced', () => {
    assert.equal(lintCitations('[verified: https://other.org "q"]', { sources: SRC }).citations[0].source, 'unchecked');
    assert.ok(codes('[verified: https://other.org "q"]', { sources: SRC, requireSourced: true }).includes('SOURCE_NOT_IN_PACKET'));
  });
  test('canonicalUrl and normQuote basics', () => {
    assert.equal(canonicalUrl('https://www.x.org/a/?b=2&a=1&utm_x=3#f'), 'x.org/a?a=1&b=2');
    assert.equal(canonicalUrl('ftp://x.org'), '');
    assert.equal(normQuote(' “A”\n  b '), '"a" b');
  });
});

describe('gate rule', () => {
  const doc = (gates, ev) => `# Lead\n- **Gates:** ${gates}\n${ev}`;
  test('every pass needs a citation on a line naming the gate', () => {
    const d = lintGates(doc('G1 pass; G2 pass; G3 fail; G4 unknown', `- G1 [verified: ${U} "q"]\n- G2 trust me`));
    assert.deepEqual(d.map(x => x.excerpt), ['G2 pass']);
  });
  test('a broken citation does not source a gate', () => assert.equal(lintGates(doc('G1 pass', `- G1 [verified: ${U}]`)).length, 1));
  test('no Gates line, no gate findings', () => assert.deepEqual(lintGates('# Notes\nG1 pass'), []));
  test('coordinates point at the gate token', () => {
    const text = doc('G1 pass; G2 pass', `- G1 [verified: ${U} "q"]`);
    const [d] = lintGates(text);
    assert.equal(text.slice(d.start, d.end), 'G2 pass');
    assert.equal(d.line, 2);
  });
});

describe('parity with the canonical Assayer (docs/demo/demo-app.js)', { skip: !fs.existsSync(CANONICAL_ASSAY) && 'canonical assay not present' }, () => {
  const FAMILY = /^(CITATION_|URL_INVALID|QUOTE_NOT_IN_SOURCE|QUOTE_BLANK)/;
  test('identical citation codes on every grammar case and on quote checks', async () => {
    const { assay } = await import(pathToFileURL(CANONICAL_ASSAY).href);
    const cases = [...TABLE.map(([, t]) => t), `[verified: ${U} "not there"]`, `[verified: ${U} "program page."]`, `[verified: ${U} " "]`];
    for (const t of cases) {
      const theirs = assay(`- **Gates:** G1 unknown\n${t}`, { sources: SRC, now: 0 }).diagnostics.filter(d => FAMILY.test(d.code)).map(d => d.code).sort();
      const ours = lintCitations(t, { sources: SRC }).diagnostics.map(d => d.code).sort();
      assert.deepEqual(ours, theirs, t);
    }
  });
  test('identical GATE_UNSOURCED decisions', async () => {
    const { assay } = await import(pathToFileURL(CANONICAL_ASSAY).href);
    for (const ev of [`- G1 [verified: ${U} "q"]`, '- G1 none', `- G1 G2 [verified: ${U} "q"]`, `- G1 [verified: ${U}]`]) {
      const t = `- **Gates:** G1 pass; G2 pass; G3 unknown; G4 unknown\n${ev}`;
      const theirs = assay(t, { now: 0 }).diagnostics.filter(d => d.code === 'GATE_UNSOURCED').map(d => d.gate).sort();
      const ours = lintGates(t).map(d => +d.excerpt[1]).sort();
      assert.deepEqual(ours, theirs, ev);
    }
  });
});
