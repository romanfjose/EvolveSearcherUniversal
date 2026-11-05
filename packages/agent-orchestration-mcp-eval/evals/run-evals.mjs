// Native deterministic eval runner. Replays evals/cases.json through callTool() and writes
// evals/results/scorecard.{md,json}. No network, no clock, no randomness: the same code gives the same scorecard.
// Exit code is 0 only if every case passes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSuite, runCase } from './shared.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(here, 'results');

const CATEGORY_LABELS = {
  'seat-routing': 'Seat routing (role and mode)',
  'budget-admission': 'Budget admission (reserve, judgment, breaker, accounting bypasses)',
  'input-validation': 'Input schema compliance',
  'evidence-accept': 'Evidence acceptance (precision on valid responses)',
  'hallucination-rejection': 'Hallucination rejection (anchor, schema, claims, citations)',
  'dossier-lint': 'Dossier dedup and lint',
  'numeric-injection': 'Numeric injection (NaN, Infinity, -0, overflow, float boundaries)',
  'prototype-pollution': 'Prototype pollution and malformed schema keywords',
  'unicode-edge': 'Unicode edge cases (normalization, invisible characters, IDN)',
  'slice-boundary': 'Slice coordinate boundaries',
  'url-canonicalization': 'URL canonicalization and link lint',
};

const suite = loadSuite();
const results = suite.cases.map(runCase);

// Polarity: a case with expect.ok === true is a should-accept fixture; anything else is should-reject.
const categories = {};
for (const c of suite.cases) {
  const r = results.find(x => x.id === c.id);
  const cat = (categories[c.category] ??= {
    label: CATEGORY_LABELS[c.category] ?? c.category,
    total: 0, passed: 0, acceptFixtures: 0, rejectFixtures: 0, falseAccepts: 0, falseRejects: 0,
  });
  cat.total++;
  if (r.pass) cat.passed++;
  if (c.expect.ok === true) {
    cat.acceptFixtures++;
    if (r.actual.ok !== true) cat.falseRejects++;
  } else if (c.expect.ok === false) {
    cat.rejectFixtures++;
    if (r.actual.ok === true) cat.falseAccepts++;
  }
}

const totals = Object.values(categories).reduce(
  (t, c) => ({ total: t.total + c.total, passed: t.passed + c.passed, falseAccepts: t.falseAccepts + c.falseAccepts, falseRejects: t.falseRejects + c.falseRejects }),
  { total: 0, passed: 0, falseAccepts: 0, falseRejects: 0 },
);
const pct = (n, d) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);

const scorecard = {
  suite: suite.suite,
  fixtureVersion: suite.version,
  totals: { ...totals, accuracy: pct(totals.passed, totals.total) },
  categories: Object.fromEntries(Object.entries(categories).map(([k, c]) => [k, { ...c, accuracy: pct(c.passed, c.total) }])),
  failures: results.filter(r => !r.pass).map(r => ({ id: r.id, category: r.category, problems: r.problems })),
  cases: results.map(r => ({ id: r.id, category: r.category, pass: r.pass, ok: r.actual.ok === true })),
};

const md = [];
md.push(`# Eval scorecard: ${suite.suite}`, '');
md.push(`Fixtures: \`evals/cases.json\` (version ${suite.version}). Deterministic: rerunning \`npm run eval\` reproduces this file byte for byte.`, '');
md.push(`**Overall: ${totals.passed}/${totals.total} cases pass (${scorecard.totals.accuracy}). False accepts: ${totals.falseAccepts}. False rejects: ${totals.falseRejects}.**`, '');
md.push('| Category | Pass | Accuracy | Should-accept | False rejects | Should-reject | False accepts |');
md.push('| :--- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const c of Object.values(scorecard.categories)) {
  md.push(`| ${c.label} | ${c.passed}/${c.total} | ${c.accuracy} | ${c.acceptFixtures} | ${c.falseRejects} | ${c.rejectFixtures} | ${c.falseAccepts} |`);
}
md.push('', '## Cases', '', '| Case | Category | Result |', '| :--- | :--- | :---: |');
for (const r of results) md.push(`| \`${r.id}\` | ${r.category} | ${r.pass ? 'PASS' : 'FAIL'} |`);
if (scorecard.failures.length) {
  md.push('', '## Failures', '');
  for (const f of scorecard.failures) md.push(`- \`${f.id}\`: ${f.problems.join('; ')}`);
}
md.push('');

fs.mkdirSync(RESULTS_DIR, { recursive: true });
fs.writeFileSync(path.join(RESULTS_DIR, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(RESULTS_DIR, 'scorecard.md'), md.join('\n'), 'utf8');

for (const r of results) {
  if (r.pass) console.log(`PASS ${r.id}`);
  else console.log(`FAIL ${r.id}: ${r.problems.join('; ')}`);
}
console.log(`\n${suite.suite}: ${totals.passed}/${totals.total} passed (false accepts ${totals.falseAccepts}, false rejects ${totals.falseRejects})`);
console.log(`Scorecard: evals/results/scorecard.md`);
process.exit(totals.passed === totals.total ? 0 : 1);
