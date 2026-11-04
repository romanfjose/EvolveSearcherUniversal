// Deterministic test & benchmark suite for the Assayer / lead-lint pipeline and the static demo (docs/demo/).
// Ground truth: each engine's tools/lead-lint.mjs and ui/data.mjs. The demo's in-browser port must match them exactly.
// Prints a Markdown scorecard after the run. Fixed clock: 2026-11-04T12:00:00Z.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lintRow, lintCorpus, assay, canonicalUrl, field, dashboardField, gateValues } from '../docs/demo/demo-app.js';
import { canonicalURL as dataCanonicalURL, field as dataField } from './data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(ROOT, 'docs', 'demo');
const TEMPLATE = path.join(ROOT, '0-SelfEvolveUniversalTemplate');
const ENGINES = fs.readdirSync(TEMPLATE).filter(d => fs.existsSync(path.join(TEMPLATE, d, 'tools', 'lead-lint.mjs')));
const canonicalLinters = await Promise.all(ENGINES.map(async e => [e, (await import(pathToFileURL(path.join(TEMPLATE, e, 'tools', 'lead-lint.mjs')).href)).lintLeads]));
const data = JSON.parse(fs.readFileSync(path.join(DEMO, 'demo-data.json'), 'utf8'));
const NOW = Date.parse('2026-11-04T12:00:00Z');

// ---------- scorecard bookkeeping ----------
const results = [], bench = [], corpus = [];
function check(category, name, fn, texts = []) {
  corpus.push(...texts);
  test(name, async () => {
    const t0 = performance.now();
    try { await fn(); results.push({ category, ok: true, ms: performance.now() - t0 }); }
    catch (e) { results.push({ category, ok: false, ms: performance.now() - t0 }); throw e; }
  });
}

// ---------- fixtures ----------
const U = 'https://grants.example.org/programs/case';
const cite = (q = 'quoted source text', u = U) => `[verified: ${u} "${q}"]`;
const EVID = [1, 2, 3, 4].map(n => `- G${n} ${cite('evidence ' + n)}`);
const SNAP = { [U]: 'Program page. Evidence 1. Evidence 2. Evidence 3. Evidence 4. It’s open to “independent” teams.' };
function doc({ status = 'Verify', gates = 'G1 pass; G2 pass; G3 pass; G4 pass', evidence = EVID, head = [], fields = [], tail = [] } = {}) {
  return ['# Lead: Synthetic Case', ...head, '- **Opportunity ID:** T-1', `- **Canonical URL:** ${U}`,
    status === null ? null : `- **Status:** ${status}`, gates === null ? null : `- **Gates:** ${gates}`, '- **Fit %:** 60%', ...fields,
    '', '## Gate evidence', ...evidence, ...tail].filter(l => l !== null).join('\n');
}
const A = (text, opts = {}) => assay(text, { now: NOW, ...opts });
const codes = (a, sev) => a.diagnostics.filter(d => !sev || d.severity === sev).map(d => d.code);
const has = (a, code) => codes(a).includes(code);
const count = (a, code) => codes(a).filter(c => c === code).length;

function withLeads(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-bench-'));
  const leads = path.join(dir, 'engine', 'leads');
  fs.mkdirSync(leads, { recursive: true });
  try {
    for (const f of files) fs.writeFileSync(path.join(leads, f.file), f.text);
    return fn(leads, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const stripDay = r => ({ ...r, today_utc: undefined });

// =====================================================================
describe('Malformed gates', () => {
  const cases = [
    ['canonical form', 'G1 pass; G2 pass; G3 pass; G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['colons after gate ids', 'G1: pass; G2: fail; G3: unknown; G4: pass', ['pass', 'fail', 'unknown', 'pass'], []],
    ['mixed case ids and values', 'g1 PASS; g2 Fail; G3 UNKNOWN; G4 pass', ['pass', 'fail', 'unknown', 'pass'], []],
    ['comma separators hide G2–G4', 'G1 pass, G2 pass, G3 pass, G4 pass', ['pass', 'unknown', 'unknown', 'unknown'], ['GATE_UNPARSED', 'GATE_UNPARSED', 'GATE_UNPARSED']],
    ['"passed" is not pass', 'G1 passed; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['"passes" is not pass', 'G1 passes; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['"ok" is not a grade', 'G1 ok; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['emoji is not a grade', 'G1 ✅; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['hyphen separator', 'G1 - pass; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['equals separator', 'G1 = pass; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_UNPARSED']],
    ['missing G4', 'G1 pass; G2 pass; G3 pass', ['pass', 'pass', 'pass', 'unknown'], ['GATE_MISSING']],
    ['G12 is not G1', 'G12 pass; G2 pass; G3 pass; G4 pass', ['unknown', 'pass', 'pass', 'pass'], ['GATE_MISSING']],
    ['glued value "G1pass" is accepted', 'G1pass; G2 pass; G3 pass; G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['no spaces around semicolons', ';G1 pass;G2 pass;G3 pass;G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['ragged whitespace', 'G1 pass ;  G2 pass ;G3 pass;    G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['duplicate gate: first wins (pass)', 'G1 pass; G1 fail; G2 pass; G3 pass; G4 pass', ['pass', 'pass', 'pass', 'pass'], ['GATE_DUPLICATE']],
    ['duplicate gate: first wins (fail)', 'G1 fail; G1 pass; G2 pass; G3 pass; G4 pass', ['fail', 'pass', 'pass', 'pass'], ['GATE_DUPLICATE']],
    ['invalid then valid duplicate', 'G1 passed; G1 fail; G2 pass; G3 pass; G4 pass', ['fail', 'pass', 'pass', 'pass'], ['GATE_DUPLICATE']],
    ['qualifier is ignored', 'G1 pass (partial); G2 pass; G3 pass; G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['slash qualifier reads as pass', 'G1 pass/fail; G2 pass; G3 pass; G4 pass', ['pass', 'pass', 'pass', 'pass'], []],
    ['all unknown', 'G1 unknown; G2 unknown; G3 unknown; G4 unknown', ['unknown', 'unknown', 'unknown', 'unknown'], []],
    ['out-of-order gates', 'G4 pass; G3 fail; G2 unknown; G1 pass', ['pass', 'unknown', 'fail', 'pass'], []],
  ];
  for (const [name, gl, values, warns] of cases) {
    const text = doc({ gates: gl });
    check('Malformed gates', `gates: ${name}`, () => {
      assert.deepEqual(gateValues(gl), values);
      const a = A(text);
      assert.deepEqual(a.gates.map(g => g.value), values);
      assert.deepEqual(codes(a, 'warn').filter(c => c.startsWith('GATE')).sort(), [...warns].sort());
      assert.equal(a.row.gates, values.filter(v => v !== 'pass').length);
    }, [text]);
  }
  check('Malformed gates', 'qualifier surfaces as GATE_QUALIFIED note', () => {
    const a = A(doc({ gates: 'G1 pass (partial); G2 pass; G3 pass; G4 pass' }));
    assert.ok(has(a, 'GATE_QUALIFIED'));
    assert.equal(a.diagnostics.find(d => d.code === 'GATE_QUALIFIED').excerpt, 'G1 pass (partial)');
  });
  const unreadable = [
    ['empty Gates value', doc({ gates: '' })],
    ['no Gates line', doc({ gates: null })],
    ['asterisk bullet', doc({ gates: null, fields: ['* **Gates:** G1 pass; G2 pass; G3 pass; G4 pass'] })],
    ['indented bullet', doc({ gates: null, fields: ['  - **Gates:** G1 pass; G2 pass; G3 pass; G4 pass'] })],
    ['colon outside bold', doc({ gates: null, fields: ['- **Gates**: G1 pass; G2 pass; G3 pass; G4 pass'] })],
  ];
  for (const [name, text] of unreadable) check('Malformed gates', `NO_GATES_LINE: ${name}`, () => {
    const a = A(text);
    assert.equal(a.row.gates_line, null);
    assert.deepEqual(a.row.flags.slice(0, 1), ['NO_GATES_LINE']);
    assert.equal(a.row.gates, 4);
    assert.ok(has(a, 'NO_GATES_LINE'));
  }, [text]);
  check('Malformed gates', 'lowercase field name is still read', () => {
    const a = A(doc({ gates: null, fields: ['- **gates:** G1 pass; G2 pass; G3 pass; G4 pass'] }));
    assert.equal(a.row.gates, 0);
  });
  check('Malformed gates', 'second Gates line is ignored and flagged', () => {
    const a = A(doc({ fields: ['- **Gates:** G1 fail; G2 fail; G3 fail; G4 fail'] }));
    assert.equal(a.row.gates, 0);
    assert.ok(has(a, 'GATES_DUPLICATE'));
  });
  check('Malformed gates', 'CRLF line endings do not change grades', () => {
    const lf = doc({ gates: 'G1 pass; G2 fail; G3 unknown; G4 pass' });
    assert.deepEqual(A(lf.replace(/\n/g, '\r\n')).gates.map(g => g.value), A(lf).gates.map(g => g.value));
    assert.deepEqual(lintRow(lf.replace(/\n/g, '\r\n'), { now: NOW }), lintRow(lf, { now: NOW }));
  });
});

// =====================================================================
describe('Citations & quotes', () => {
  const one = (line, gates = 'G1 pass; G2 unknown; G3 unknown; G4 unknown') => doc({ gates, evidence: [line] });
  const cases = [
    ['straight quotes source the gate', `- G1 ${cite()}`, { stale: false, errors: [] }],
    ['curly quotes source the gate', `- G1 [verified: ${U} “quoted source text”]`, { stale: false, errors: [] }],
    ['mixed quote styles are accepted', `- G1 [verified: ${U} "quoted source text”]`, { stale: false, errors: [] }],
    ['quote containing ] is accepted', `- G1 [verified: ${U} "clause [3] applies"]`, { stale: false, errors: [] }],
    ['missing quote', `- G1 [verified: ${U}]`, { stale: true, errors: ['CITATION_MISSING_QUOTE', 'GATE_UNSOURCED'] }],
    ['single quotes do not count', `- G1 [verified: ${U} 'quoted']`, { stale: true, errors: ['CITATION_MISSING_QUOTE', 'GATE_UNSOURCED'] }],
    ['empty quote', `- G1 [verified: ${U} ""]`, { stale: true, errors: ['CITATION_EMPTY_QUOTE', 'GATE_UNSOURCED'] }],
    ['capitalised tag', `- G1 [Verified: ${U} "quoted"]`, { stale: true, errors: ['CITATION_CASE', 'GATE_UNSOURCED'] }],
    ['spaced tag', `- G1 [ verified: ${U} "quoted"]`, { stale: true, errors: ['CITATION_CASE', 'GATE_UNSOURCED'] }],
    ['no URL', '- G1 [verified: "quoted"]', { stale: true, errors: ['CITATION_NO_URL', 'GATE_UNSOURCED'] }],
    ['ftp scheme', '- G1 [verified: ftp://files.example.org/r.txt "quoted"]', { stale: true, errors: ['CITATION_UNSAFE_SCHEME', 'GATE_UNSOURCED'] }],
    ['javascript scheme', '- G1 [verified: javascript:alert(1) "quoted"]', { stale: true, errors: ['CITATION_UNSAFE_SCHEME', 'GATE_UNSOURCED'] }],
    ['uppercase HTTPS scheme', '- G1 [verified: HTTPS://grants.example.org/x "quoted"]', { stale: true, errors: ['CITATION_MALFORMED', 'GATE_UNSOURCED'] }],
    ['quote glued to URL', `- G1 [verified: ${U}"quoted"]`, { stale: true, errors: ['CITATION_MALFORMED', 'GATE_UNSOURCED'] }],
    ['unclosed citation', `- G1 [verified: ${U} "quoted"`, { stale: true, errors: ['CITATION_UNCLOSED', 'GATE_UNSOURCED'] }],
    ['citation on a line not naming the gate', `- Evidence ${cite()}`, { stale: true, errors: ['GATE_UNSOURCED'] }],
    ['G10 does not name G1', `- G10 ${cite()}`, { stale: true, errors: ['GATE_UNSOURCED'] }],
    ['fail needs no citation', '- G1 failed review', { stale: false, errors: [] }, 'G1 fail; G2 unknown; G3 unknown; G4 unknown'],
    ['unknown needs no citation', '- nothing read yet', { stale: false, errors: [] }, 'G1 unknown; G2 unknown; G3 unknown; G4 unknown'],
    ['one valid + one broken on a line still sources', `- G1 [verified: ${U}] and ${cite()}`, { stale: false, errors: ['CITATION_MISSING_QUOTE'] }],
  ];
  for (const [name, line, exp, gates] of cases) {
    const text = one(line, gates);
    check('Citations & quotes', `citation: ${name}`, () => {
      const a = A(text);
      assert.equal(a.row.flags.includes('STALE_GRADE'), exp.stale);
      assert.deepEqual(codes(a, 'error').sort(), [...exp.errors].sort());
    }, [text]);
  }
  check('Citations & quotes', 'whitespace-only quote passes lead-lint but warns', () => {
    const a = A(one(`- G1 [verified: ${U} " "]`));
    assert.ok(!a.row.flags.includes('STALE_GRADE'));
    assert.ok(has(a, 'QUOTE_BLANK'));
  });
  check('Citations & quotes', '"G1-G4" range sources only G1 and G4', () => {
    const a = A(doc({ evidence: [`- G1-G4 ${cite()}`] }));
    assert.deepEqual(a.gates.map(g => g.sourced), [true, false, false, true]);
    assert.equal(count(a, 'GATE_UNSOURCED'), 2);
  });
  check('Citations & quotes', 'one citation on the Gates line sources every gate (CITATION_SHARED)', () => {
    const a = A(doc({ gates: `G1 pass; G2 pass; G3 pass; G4 pass ${cite()}`, evidence: [] }));
    assert.deepEqual(a.row.flags, []);
    assert.ok(has(a, 'CITATION_SHARED'));
  });
  check('Citations & quotes', 'citation in a code fence still counts but warns', () => {
    const a = A(doc({ evidence: ['```', ...EVID, '```'] }));
    assert.deepEqual(a.row.flags, []);
    assert.equal(count(a, 'CITATION_IN_CODE_FENCE'), 4);
  });
  check('Citations & quotes', 'fabricated quote is refuted by the cached snapshot', () => {
    const a = A(doc({ status: 'Try-worthy', evidence: [...EVID.slice(0, 3), `- G4 ${cite('applicants of any kind')}`] }), { sources: SNAP });
    assert.ok(has(a, 'QUOTE_NOT_IN_SOURCE'));
    assert.equal(a.gates[3].effective, false);
    assert.deepEqual(a.row.flags, [], 'lead-lint alone cannot see the fabrication');
    assert.equal(a.assayerTier, 'Verify');
  });
  check('Citations & quotes', 'snapshot match ignores case, whitespace and curly punctuation', () => {
    const a = A(doc({ evidence: [...EVID.slice(0, 3), `- G4 [verified: ${U} "IT'S OPEN   to \\"independent\\" teams"]`.replace(/\\"/g, '“')] }), { sources: SNAP });
    assert.ok(!has(a, 'QUOTE_NOT_IN_SOURCE'));
    assert.equal(a.citations.at(-1).snapshot, 'found');
  });
  check('Citations & quotes', 'no snapshot means unchecked, not refuted', () => {
    const a = A(doc(), { sources: {} });
    assert.ok(a.citations.every(c => c.snapshot === 'none'));
    assert.ok(a.gates.every(g => g.effective));
  });
  check('Citations & quotes', 'snapshot keyed by a tracking URL matches the canonical citation', () => {
    const a = A(doc(), { sources: { [U + '/?utm_source=feed#top']: SNAP[U] } });
    assert.ok(a.citations.every(c => c.snapshot === 'found'));
  });
  check('Citations & quotes', 'unparseable URL is sourced for lead-lint but not effective', () => {
    const a = A(doc({ evidence: [...EVID.slice(1), '- G1 [verified: https://[bad "quoted"]'] }));
    assert.ok(!a.row.flags.includes('STALE_GRADE'));
    assert.ok(has(a, 'URL_INVALID'));
    assert.equal(a.gates[0].effective, false);
  });
  check('Citations & quotes', 'plain http source is noted', () => {
    assert.ok(has(A(doc({ evidence: [...EVID.slice(1), `- G1 ${cite('q', 'http://grants.example.org/x')}`] })), 'URL_INSECURE'));
  });
});

// =====================================================================
describe('URL canonicalization', () => {
  const cases = [
    ['https://example.org/a', 'example.org/a'],
    ['https://example.org/a/', 'example.org/a'],
    ['https://example.org/a///', 'example.org/a'],
    ['https://example.org', 'example.org'],
    ['https://www.example.org/a', 'example.org/a'],
    ['https://www.www.example.org/a', 'www.example.org/a'],
    ['https://example.org/a#section', 'example.org/a'],
    ['https://example.org/a?utm_source=x&utm_medium=y', 'example.org/a'],
    ['https://example.org/a?UTM_Source=x', 'example.org/a'],
    ['https://example.org/a?fbclid=1&gclid=2', 'example.org/a'],
    ['https://example.org/a?fbclidx=1', 'example.org/a?fbclidx=1'],
    ['https://example.org/a?xutm_a=1', 'example.org/a?xutm_a=1'],
    ['https://example.org/a?b=2&a=1', 'example.org/a?a=1&b=2'],
    ['https://example.org/a?id=7&utm_campaign=z', 'example.org/a?id=7'],
    ['https://example.org/a?', 'example.org/a'],
    ['https://EXAMPLE.org/Path', 'example.org/Path'],
    ['https://example.org:443/a', 'example.org/a'],
    ['https://example.org:8443/a', 'example.org:8443/a'],
    ['http://example.org/a', 'example.org/a'],
    ['https://bücher.example/a', 'xn--bcher-kva.example/a'],
    ['https://example.org/a b', 'example.org/a%20b'],
    ['ftp://example.org/a', ''],
    ['javascript:alert(1)', ''],
    ['not a url', ''],
    ['', ''],
  ];
  for (const [input, expected] of cases) check('URL canonicalization', `canonical: ${input || '(empty)'}`, () => {
    assert.equal(canonicalUrl(input), expected);
    assert.equal(canonicalUrl(input), dataCanonicalURL(input), 'demo port must equal ui/data.mjs canonicalURL');
  });
  check('URL canonicalization', 'non-canonical Canonical URL field is noted with its fix', () => {
    const a = A(doc().replace(`- **Canonical URL:** ${U}`, `- **Canonical URL:** ${U}/?utm_source=mail#apply`));
    const d = a.diagnostics.find(x => x.code === 'URL_NONCANONICAL');
    assert.equal(d.canonical, 'grants.example.org/programs/case');
    assert.equal(d.excerpt, `${U}/?utm_source=mail#apply`);
  });
  check('URL canonicalization', 'missing opportunity URL warns', () => {
    assert.ok(has(A(doc().replace(`- **Canonical URL:** ${U}\n`, '')), 'URL_MISSING'));
  });
});

// =====================================================================
describe('Status smuggling', () => {
  const ready = `- **Ready evidence:** 2026-10-30 maintainer reply ${cite('evidence 1')}`;
  const cases = [
    ['Ready over an unknown gate', doc({ status: 'Ready', gates: 'G1 pass; G2 pass; G3 unknown; G4 pass', fields: [ready] }), 'Verify', ['STATUS_SMUGGLING']],
    ['Try-worthy over a failed gate', doc({ status: 'Try-worthy', gates: 'G1 pass; G2 fail; G3 pass; G4 pass' }), 'Verify', ['STATUS_SMUGGLING']],
    ['Try-worthy over an unsourced pass', doc({ status: 'Try-worthy', evidence: EVID.slice(0, 3) }), 'Verify', ['GATE_UNSOURCED', 'STATUS_SMUGGLING']],
    ['Try-worthy over comma-hidden gates', doc({ status: 'Try-worthy', gates: 'G1 pass, G2 pass, G3 pass, G4 pass' }), 'Verify', ['STATUS_SMUGGLING']],
    ['Ready without Ready evidence', doc({ status: 'Ready' }), 'Try-worthy', ['READY_UNVALIDATED']],
    ['Ready evidence without a date', doc({ status: 'Ready', fields: [`- **Ready evidence:** maintainer reply ${cite('evidence 1')}`] }), 'Try-worthy', ['READY_UNVALIDATED']],
    ['Ready evidence without a citation', doc({ status: 'Ready', fields: ['- **Ready evidence:** 2026-10-30 maintainer said yes'] }), 'Try-worthy', ['READY_UNVALIDATED']],
    ['Ready with dated, cited evidence', doc({ status: 'Ready', fields: [ready] }), 'Ready', []],
    ['Try-worthy fully sourced', doc({ status: 'Try-worthy' }), 'Try-worthy', []],
    ['Waiting on Commander with an open gate', doc({ status: 'Waiting on Commander', gates: 'G1 pass; G2 pass; G3 pass; G4 unknown' }), 'Waiting on Commander', []],
    ['Verify with an open gate', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown' }), 'Verify', []],
    ['decorated Ready over open gate', doc({ status: 'Ready (pending G3)', gates: 'G1 pass; G2 pass; G3 unknown; G4 pass' }), 'Verify', ['STATUS_DECORATED', 'STATUS_SMUGGLING']],
    ['unrecognised status (grade follows evidence)', doc({ status: 'Approved' }), 'Try-worthy', ['STATUS_UNRECOGNIZED']],
    ['missing status (grade follows evidence)', doc({ status: null }), 'Try-worthy', ['STATUS_MISSING']],
  ];
  for (const [name, text, tier, errors] of cases) check('Status smuggling', `status: ${name}`, () => {
    const a = A(text);
    assert.equal(a.assayerTier, tier);
    assert.deepEqual(codes(a, 'error').sort(), [...errors].sort());
  }, [text]);
  check('Status smuggling', 'Notes line smuggles Ready past the dashboard (ground truth via ui/data.mjs)', () => {
    const text = doc({ head: ['- **Notes:** reviewer said **Status:** Ready'], gates: 'G1 pass; G2 pass; G3 unknown; G4 pass' });
    assert.equal(dataField(text, 'Status'), 'Ready', 'the real dashboard reader is fooled');
    assert.equal(lintRow(text).status, 'Verify', 'the real lead-lint reader is not');
    const a = A(text);
    assert.ok(has(a, 'STATUS_DIVERGENT') && has(a, 'STATUS_SMUGGLING'));
  });
  check('Status smuggling', 'bold-only Status is unread by lead-lint', () => {
    const text = doc({ status: null, head: ['**Status:** Ready'] });
    assert.equal(lintRow(text).status, 'Unknown');
    assert.equal(dataField(text, 'Status'), 'Ready');
    assert.ok(has(A(text), 'STATUS_UNREAD'));
  });
  check('Status smuggling', 'conflicting Status lines: first wins, conflict flagged', () => {
    const a = A(doc({ fields: ['- **Status:** Ready'] }));
    assert.equal(a.row.status, 'Verify');
    assert.ok(has(a, 'STATUS_CONFLICT'));
  });
  check('Status smuggling', 'identical duplicate Status warns only', () => {
    const a = A(doc({ fields: ['- **Status:** Verify'] }));
    assert.ok(has(a, 'STATUS_DUPLICATE') && !has(a, 'STATUS_CONFLICT'));
  });
  check('Status smuggling', 'lowercase tier is not counted by lead-lint', () => {
    const text = doc({ status: 'ready', fields: [`- **Ready evidence:** 2026-10-30 ${cite('evidence 1')}`] });
    const r = lintCorpus([{ file: 'a.md', text }], { now: NOW });
    assert.equal(r.tiers.ready, 0);
    assert.equal(r.statuses.ready, 1);
    assert.ok(has(A(text), 'STATUS_CASE'));
  });
  check('Status smuggling', 'decorated tier is not counted by lead-lint', () => {
    const r = lintCorpus([{ file: 'a.md', text: doc({ status: 'Try-worthy (strong)' }) }], { now: NOW });
    assert.equal(r.tiers.try_worthy, 0);
  });
  check('Status smuggling', 'all-sourced Verify is PROMOTABLE', () => {
    const a = A(doc());
    assert.ok(has(a, 'PROMOTABLE'));
    assert.equal(a.counts.error, 0);
  });
  check('Status smuggling', 'BOM hides a line-1 Status from lead-lint', () => {
    const text = '﻿- **Status:** Ready\n' + doc({ status: null });
    const a = A(text);
    assert.equal(a.row.status, 'Unknown');
    assert.ok(has(a, 'BOM_PRESENT') && has(a, 'STATUS_UNREAD'));
  });
  check('Status smuggling', 'rejected dossiers skip tier rules but need a reason', () => {
    const a = A(doc({ status: 'Rejected', gates: 'G1 pass; G2 pass; G3 fail; G4 unknown' }), { rejected: true });
    assert.equal(a.assayerTier, 'Rejected');
    assert.deepEqual(codes(a, 'error'), []);
    assert.ok(has(a, 'REJECTION_REASON_MISSING'));
  });
});

// =====================================================================
const located = (text, d) => {
  assert.equal(text.slice(d.start, d.end), d.excerpt, `${d.code} excerpt`);
  assert.ok(d.start >= 0 && d.end >= d.start && d.end <= text.length, `${d.code} span in range`);
  const before = text.slice(0, d.start);
  assert.equal(d.line, before.split('\n').length, `${d.code} line`);
  assert.equal(d.col, d.start - (before.lastIndexOf('\n') + 1) + 1, `${d.code} col`);
  assert.ok(!d.excerpt.includes('\n'), `${d.code} excerpt stays on one line`);
};
describe('Coordinate slices', () => {
  check('Coordinate slices', 'every demo dossier diagnostic slices back to its excerpt', () => {
    for (const d of data.dossiers) { const t = d.markdown.join('\n'); for (const x of A(t, { rejected: d.rejected, sources: data.sources }).diagnostics) located(t, x); }
  });
  check('Coordinate slices', 'every sandbox preset diagnostic slices back to its excerpt', () => {
    for (const p of data.presets) { const t = p.markdown.join('\n'); for (const x of A(t, { sources: data.sources }).diagnostics) located(t, x); }
  });
  check('Coordinate slices', 'CRLF: columns match, excerpts exclude \\r', () => {
    const t = doc({ status: 'Ready', gates: 'G1 pass, G2 pass; G3 pass; G4 pass' }).replace(/\n/g, '\r\n');
    const a = A(t);
    assert.ok(a.diagnostics.length >= 2);
    for (const d of a.diagnostics) { located(t, d); assert.ok(!d.excerpt.includes('\r')); }
  });
  check('Coordinate slices', 'BOM occupies offset 0 and shifts line-1 columns only', () => {
    const t = '﻿' + doc({ evidence: [`- G1 [verified: ${U}]`] });
    const a = A(t);
    const bom = a.diagnostics.find(d => d.code === 'BOM_PRESENT');
    assert.deepEqual([bom.start, bom.end, bom.line, bom.col], [0, 1, 1, 1]);
    const c = a.diagnostics.find(d => d.code === 'CITATION_MISSING_QUOTE');
    assert.equal(c.col, 6);
    a.diagnostics.forEach(d => located(t, d));
  });
  check('Coordinate slices', 'astral characters count as two UTF-16 units', () => {
    const t = doc({ evidence: [`- G1 🚀🚀 [verified: ${U}]`] });
    const d = A(t).diagnostics.find(x => x.code === 'CITATION_MISSING_QUOTE');
    assert.equal(d.col, 11);
    located(t, d);
  });
  check('Coordinate slices', 'combining marks keep exact offsets', () => {
    const t = doc({ evidence: [`- G1 été [verified: ${U}]`] });
    A(t).diagnostics.forEach(d => located(t, d));
  });
  check('Coordinate slices', 'tabs count as one column', () => {
    const t = doc({ evidence: [`-\tG1\t[verified: ${U}]`] });
    const d = A(t).diagnostics.find(x => x.code === 'CITATION_MISSING_QUOTE');
    assert.equal(d.col, 6);
  });
  check('Coordinate slices', 'several citations on one line get distinct ordered spans', () => {
    const t = doc({ evidence: [`- G1 [verified: ${U}] [verified: ${U} ""] [Verified: ${U} "x"]`] });
    const ds = A(t).diagnostics.filter(d => d.code.startsWith('CITATION'));
    assert.deepEqual(ds.map(d => d.code), ['CITATION_MISSING_QUOTE', 'CITATION_EMPTY_QUOTE', 'CITATION_CASE']);
    for (let i = 1; i < ds.length; i++) assert.ok(ds[i].start >= ds[i - 1].end);
    ds.forEach(d => located(t, d));
  });
  check('Coordinate slices', 'last line without trailing newline', () => {
    const t = doc({ evidence: [...EVID.slice(1), `- G1 [verified: ${U}`] });
    const d = A(t).diagnostics.find(x => x.code === 'CITATION_UNCLOSED');
    assert.equal(d.end, t.length);
    located(t, d);
  });
  check('Coordinate slices', 'citation at line 1, column 1', () => {
    const t = `[verified: ${U}]\n` + doc();
    const d = A(t).diagnostics.find(x => x.code === 'CITATION_MISSING_QUOTE');
    assert.deepEqual([d.line, d.col, d.start], [1, 1, 0]);
  });
  check('Coordinate slices', 'empty dossier yields zero-width spans, no throw', () => {
    const a = A('');
    assert.ok(a.diagnostics.length > 0);
    a.diagnostics.forEach(d => { located('', d); assert.equal(d.start, 0); });
  });
  check('Coordinate slices', 'gate token spans point at the offending token', () => {
    const t = doc({ gates: 'G1 pass; G2 passed; G3 pass; G4 pass' });
    const d = A(t).diagnostics.find(x => x.code === 'GATE_UNPARSED');
    assert.equal(d.excerpt, 'G2 passed');
  });
  check('Coordinate slices', 'unsourced gate span is the gate grade on the Gates line', () => {
    const t = doc({ evidence: EVID.slice(0, 2) });
    assert.deepEqual(A(t).diagnostics.filter(x => x.code === 'GATE_UNSOURCED').map(x => x.excerpt), ['; G3 pass', '; G4 pass']);
  });
  check('Coordinate slices', 'divergent status span is the smuggled value', () => {
    const t = doc({ head: ['- **Notes:** x **Status:** Ready now'] });
    assert.equal(A(t).diagnostics.find(x => x.code === 'STATUS_DIVERGENT').excerpt, 'Ready now');
  });
  check('Coordinate slices', 'field spans exclude trailing whitespace', () => {
    const t = doc({ status: 'Approved   ' });
    assert.equal(A(t).diagnostics.find(x => x.code === 'STATUS_UNRECOGNIZED').excerpt, 'Approved');
  });
  check('Coordinate slices', 'diagnostics are sorted by start offset', () => {
    for (const t of corpus) { const ds = A(t).diagnostics; for (let i = 1; i < ds.length; i++) assert.ok(ds[i].start >= ds[i - 1].start); }
  });
  check('Coordinate slices', '10k-character line keeps exact columns', () => {
    const pad = 'x'.repeat(10000);
    const t = doc({ evidence: [`- G1 ${pad} [verified: ${U}]`] });
    const d = A(t).diagnostics.find(x => x.code === 'CITATION_MISSING_QUOTE');
    assert.equal(d.col, 10007);
    located(t, d);
  });
  check('Coordinate slices', 'bare \\r line breaks never crash and stay in range', () => {
    const t = doc().replace(/\n/g, '\r');
    A(t).diagnostics.forEach(d => assert.equal(t.slice(d.start, d.end), d.excerpt));
  });
  check('Coordinate slices', 'every catalog case satisfies the slice invariant', () => {
    assert.ok(corpus.length > 60);
    for (const t of corpus) A(t, { sources: SNAP }).diagnostics.forEach(d => located(t, d));
  });
});

// =====================================================================
describe('lead-lint flags', () => {
  const flagCases = [
    ['CLOSABLE with one open gate', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown' }), ['CLOSABLE']],
    ['CLOSABLE with two open gates', doc({ gates: 'G1 pass; G2 pass; G3 unknown; G4 unknown' }), ['CLOSABLE']],
    ['not CLOSABLE with three open gates', doc({ gates: 'G1 pass; G2 unknown; G3 unknown; G4 unknown' }), []],
    ['not CLOSABLE with a failed gate', doc({ gates: 'G1 pass; G2 pass; G3 fail; G4 unknown' }), []],
    ['PARKED on fast-paste', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown', fields: ['- **Verification gaps:** G4 fast-paste needed'] }), ['PARKED']],
    ['PARKED on "fast paste"', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown', fields: ['- **Verification gaps:** G4 fast paste needed'] }), ['PARKED']],
    ['PARKED on Commander paste', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown', fields: ['- **Verification gaps:** G4 needs a Commander paste'] }), ['PARKED']],
    ['PARKED on waiting on Commander', doc({ gates: 'G1 pass; G2 pass; G3 pass; G4 unknown', fields: ['- **Verification gaps:** waiting on commander'] }), ['PARKED']],
    ['closability only applies to Verify', doc({ status: 'Waiting on Commander', gates: 'G1 pass; G2 pass; G3 pass; G4 unknown' }), []],
    ['past deadline queued for review', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 2026-11-03'] }), ['DEADLINE_PAST_REVIEW']],
    ['deadline today is still open', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 2026-11-04'] }), []],
    ['future deadline', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 2027-01-01'] }), []],
    ['non-ISO deadline is skipped', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 1 Nov 2026'] }), []],
    ['rolled-over calendar date still compares', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 2026-02-30'] }), ['DEADLINE_PAST_REVIEW']],
    ['month 13 never compares', doc({ status: 'Try-worthy', fields: ['- **Deadline:** 2026-13-01'] }), []],
    ['unsourced pass is STALE_GRADE', doc({ status: 'Try-worthy', evidence: [] }), ['STALE_GRADE']],
  ];
  for (const [name, text, flags] of flagCases) check('lead-lint flags', `flags: ${name}`, () => assert.deepEqual(lintRow(text, { now: NOW }).flags, flags), [text]);
  check('lead-lint flags', 'charter newer than dossier marks STALE_GRADE', () => {
    assert.deepEqual(lintRow(doc({ status: 'Try-worthy' }), { now: NOW, mtimeMs: 1000, charterMtimeMs: 2000 }).flags, ['STALE_GRADE']);
    assert.ok(has(A(doc({ status: 'Try-worthy' }), { mtimeMs: 1000, charterMtimeMs: 2000 }), 'STALE_GRADE'));
  });
  check('lead-lint flags', 'deadline diagnostics: unparsed, invalid, past', () => {
    assert.ok(has(A(doc({ fields: ['- **Deadline:** Rolling'] })), 'DEADLINE_UNPARSED'));
    const rolled = A(doc({ fields: ['- **Deadline:** 2026-02-30'] }));
    assert.ok(has(rolled, 'DEADLINE_INVALID') && has(rolled, 'DEADLINE_PAST_REVIEW'));
    assert.ok(has(A(doc({ fields: ['- **Deadline:** 2026-13-01'] })), 'DEADLINE_INVALID'));
  });
  check('lead-lint flags', 'Value and gates_line are trimmed or null', () => {
    const r = lintRow(doc({ fields: ['- **Value:**   USD 10,000   '] }));
    assert.equal(r.value, 'USD 10,000');
    assert.equal(r.gates_line, 'G1 pass; G2 pass; G3 pass; G4 pass');
    assert.equal(lintRow(doc({ gates: null })).value, null);
  });
  check('lead-lint flags', 'corpus sorts by open gates, then file name; counts unknown statuses', () => {
    const r = lintCorpus([
      { file: 'b.md', text: doc({ gates: 'G1 pass; G2 unknown; G3 pass; G4 pass' }) },
      { file: 'a.md', text: doc({ gates: 'G1 pass; G2 unknown; G3 pass; G4 pass' }) },
      { file: 'c.md', text: doc({ status: null }) },
      { file: 'screened.md', text: 'ledger' }, { file: 'notes.txt', text: 'x' },
    ], { now: NOW });
    assert.deepEqual(r.rows.map(x => x.file), ['c.md', 'a.md', 'b.md']);
    assert.equal(r.statuses.Unknown, 1);
    assert.equal(r.leads, 3);
    assert.equal(r.today_utc, '2026-11-04');
  });
  check('lead-lint flags', 'regate_needed is "none" when clean', () => {
    assert.equal(lintCorpus([{ file: 'a.md', text: doc({ status: 'Try-worthy' }) }], { now: NOW }).regate_needed, 'none');
  });
  check('lead-lint flags', 'field reader matches the canonical anchored form', () => {
    assert.equal(field('- **Status:** Ready', 'Status'), 'Ready');
    assert.equal(field('x - **Status:** Ready', 'Status'), '');
    assert.equal(field('- **Status:**', 'Status'), '');
    assert.equal(field('- **Status:**\n- **Gates:** G1 pass', 'Status'), '', 'an empty field never swallows the next line');
  });
});

// =====================================================================
describe('Canonical parity', () => {
  for (const [engine, lintLeads] of canonicalLinters) {
    check('Canonical parity', `catalog corpus equals ${engine} lintLeads`, () => {
      const files = [...new Set(corpus)].map((text, i) => ({ file: `case-${String(i).padStart(3, '0')}.md`, text }));
      withLeads(files, dir => {
        const now = Date.now();
        assert.deepEqual(stripDay(lintCorpus(files, { now })), stripDay(lintLeads(dir)));
      });
    });
    check('Canonical parity', `demo corpus equals ${engine} lintLeads per lane/engine folder`, () => {
      for (const lane of data.lanes) for (const e of data.engines) {
        const files = data.dossiers.filter(d => d.lane === lane.id && d.engine === e.id && !d.rejected).map(d => ({ file: d.file.split('/').pop(), text: d.markdown.join('\n') }));
        if (!files.length) continue;
        withLeads(files, dir => assert.deepEqual(stripDay(lintCorpus(files, { now: Date.now() })), stripDay(lintLeads(dir))));
      }
    });
  }
  check('Canonical parity', 'charter mtime staleness matches lintLeads', () => {
    const [, lintLeads] = canonicalLinters[0];
    const files = [{ file: 'old.md', text: doc({ status: 'Try-worthy' }) }, { file: 'new.md', text: doc({ status: 'Try-worthy' }) }];
    withLeads(files, (dir, root) => {
      const charter = path.join(root, 'engine', 'RecallCharter.md');
      fs.writeFileSync(charter, '# charter');
      fs.utimesSync(path.join(dir, 'old.md'), new Date(1e12), new Date(1e12));
      fs.utimesSync(charter, new Date(2e12), new Date(2e12));
      fs.utimesSync(path.join(dir, 'new.md'), new Date(3e12), new Date(3e12));
      const mt = f => fs.statSync(path.join(dir, f)).mtimeMs;
      const mine = lintCorpus(files.map(f => ({ ...f, mtimeMs: mt(f.file) })), { now: Date.now(), charterMtimeMs: fs.statSync(charter).mtimeMs });
      const real = lintLeads(dir);
      assert.deepEqual(stripDay(mine), stripDay(real));
      assert.deepEqual(real.regate_needed, ['old.md']);
    });
  });
  check('Canonical parity', 'dashboard field reader equals ui/data.mjs field', () => {
    for (const t of corpus) for (const name of ['Status', 'Gates', 'Fit %', 'Canonical URL', 'Notes', 'Deadline'])
      assert.equal(dashboardField(t, name), dataField(t, name));
  });
});

// =====================================================================
describe('Demo corpus', () => {
  for (const d of data.dossiers) check('Demo corpus', `dossier behaves as labelled: ${d.engine} ${d.file}`, () => {
    const a = A(d.markdown.join('\n'), { file: d.file, rejected: d.rejected, sources: data.sources });
    assert.equal(a.assayerTier, d.expect.tier);
    assert.deepEqual(a.row.flags, d.expect.flags);
    assert.deepEqual(codes(a, 'error').sort(), [...d.expect.errors].sort());
    assert.deepEqual(codes(a, 'warn').sort(), [...d.expect.warns].sort());
  });
  check('Demo corpus', 'covers Ready, Try-worthy, Verify, Waiting and Rejected in every lane', () => {
    for (const lane of data.lanes) {
      const tiers = new Set(data.dossiers.filter(d => d.lane === lane.id).map(d => d.rejected ? 'Rejected' : lintRow(d.markdown.join('\n')).status));
      for (const t of ['Verify', 'Rejected']) assert.ok(tiers.has(t), `${lane.id} lacks ${t}`);
    }
    const all = new Set(data.dossiers.map(d => d.rejected ? 'Rejected' : lintRow(d.markdown.join('\n')).status));
    assert.deepEqual([...all].sort(), ['Ready', 'Rejected', 'Try-worthy', 'Verify', 'Waiting on Commander']);
  });
  check('Demo corpus', 'every URL uses an RFC 2606 reserved host', () => {
    const urls = JSON.stringify(data).match(/[a-z]+:\/\/[^\s"\\\])]+/gi);
    assert.ok(urls.length > 40);
    for (const u of urls) {
      let h;
      try { h = new URL(u).hostname; } catch { continue; }
      assert.match(h, /(^|\.)(example\.(com|net|org)|[a-z0-9-]+\.example|example)$/i, u);
    }
  });
  check('Demo corpus', 'no personal identifiers in the demo or README', () => {
    const files = [...fs.readdirSync(DEMO).map(f => path.join(DEMO, f)), path.join(ROOT, 'README.md')];
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(t, /[\w.+-]+@(?!example\.)[\w-]+\.[\w.]+/i, `${f}: e-mail address`);
      assert.doesNotMatch(t, /(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, `${f}: phone number`);
      assert.doesNotMatch(t, /\b(?:\d{1,3}\.){3}\d{1,3}\b(?<!127\.0\.0\.1)/, `${f}: IP address`);
    }
  });
  check('Demo corpus', 'static page is self-contained and GitHub Pages friendly', () => {
    const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["'](https?:)?\/\//i, 'no remote scripts or styles');
    assert.match(html, /<script type="module" src="demo-app\.js">/);
    const js = fs.readFileSync(path.join(DEMO, 'demo-app.js'), 'utf8');
    assert.doesNotMatch(js, /^\s*import\s/m, 'demo-app.js has no imports');
    assert.match(js, /fetch\('demo-data\.json'/);
  });
});

// =====================================================================
describe('Determinism & benchmark', () => {
  check('Determinism & benchmark', 'assay output is identical across runs and source orderings', () => {
    const reversed = Object.fromEntries(Object.entries(data.sources).reverse());
    for (const d of data.dossiers) {
      const t = d.markdown.join('\n');
      assert.deepEqual(A(t, { sources: data.sources }), A(t, { sources: data.sources }));
      assert.deepEqual(A(t, { sources: data.sources }), A(t, { sources: reversed }));
    }
  });
  check('Determinism & benchmark', 'throughput: in-memory port vs canonical fs linter', () => {
    const texts = data.dossiers.map(d => d.markdown.join('\n'));
    const run = (name, ops, fn) => { fn(); const t0 = performance.now(); fn(); const ms = performance.now() - t0; bench.push({ name, ops, ms }); return ms; };
    const N = 100, files = Array.from({ length: N * texts.length }, (_, i) => ({ file: `l${i}.md`, text: texts[i % texts.length] }));
    run('lintRow (port, per dossier)', files.length, () => files.forEach(f => lintRow(f.text, { now: NOW })));
    run('assay (full Assayer, per dossier)', files.length, () => files.forEach(f => assay(f.text, { now: NOW, sources: data.sources })));
    run('lintCorpus (port, whole folder)', files.length, () => lintCorpus(files, { now: NOW }));
    const [engine, lintLeads] = canonicalLinters[0];
    withLeads(files, dir => run(`lintLeads (canonical ${engine.replace('SelfEvolvingArchitecture', '')}, fs)`, files.length, () => lintLeads(dir)));
    for (const b of bench) assert.ok(b.ms > 0 && Number.isFinite(b.ms));
  });
});

// ---------- scorecard ----------
after(() => {
  const cats = [...new Set(results.map(r => r.category))];
  const rows = cats.map(c => {
    const rs = results.filter(r => r.category === c), pass = rs.filter(r => r.ok).length;
    return `| ${c} | ${rs.length} | ${pass} | ${rs.length - pass} | ${rs.reduce((s, r) => s + r.ms, 0).toFixed(1)} |`;
  });
  const total = results.length, passed = results.filter(r => r.ok).length;
  const lines = [
    '', '## Pipeline benchmark scorecard', '',
    '| Category | Cases | Passed | Failed | Time (ms) |', '|---|---:|---:|---:|---:|', ...rows,
    `| **Total** | **${total}** | **${passed}** | **${total - passed}** | **${results.reduce((s, r) => s + r.ms, 0).toFixed(1)}** |`,
  ];
  if (bench.length) lines.push('', '| Benchmark | Dossiers | Time (ms) | Dossiers/s |', '|---|---:|---:|---:|',
    ...bench.map(b => `| ${b.name} | ${b.ops.toLocaleString('en-US')} | ${b.ms.toFixed(1)} | ${Math.round(b.ops / (b.ms / 1000)).toLocaleString('en-US')} |`));
  process.stdout.write(lines.join('\n') + '\n\n');
});
