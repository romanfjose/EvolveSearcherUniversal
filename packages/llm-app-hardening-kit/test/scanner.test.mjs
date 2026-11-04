import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runBenchmark, toMarkdown, buildDemoReport } from '../evals/benchmark.mjs';
import { scanSource, lex, RULES, scoreFindings } from '../src/repo-scanner.mjs';
import { renderReport } from '../src/report.mjs';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const bench = await runBenchmark();

test('fixture suite: 25 broken apps, exact rule sets, zero false positives on hardened twins', async (t) => {
  assert.equal(bench.fixtures, 25);
  for (const c of bench.cases) {
    await t.test(`${c.id} (${c.side})`, () => assert.deepEqual(c.got, c.want));
  }
  assert.equal(bench.recall, 1);
  assert.equal(bench.total.fp, 0);
  assert.deepEqual(RULES.filter((r) => bench.perRule[r.id].tp === 0).map((r) => r.id), [], 'every rule is exercised');
  t.diagnostic('\n' + toMarkdown(bench));
});

test('lexer preserves offsets and ignores code inside comments and strings', () => {
  const src = "const s = 'while (true) { openai.chat.completions.create({}) }'; // eval(x)\n/* new Function(a) */ const r = /eval\\(/g;";
  const { code, masked } = lex(src);
  assert.equal(code.length, src.length);
  assert.equal(masked.length, src.length);
  assert.deepEqual(scanSource(src, 'a.ts'), []);
});

test('inline suppression silences only the named rule', () => {
  const src = '// llm-harden-ignore HK010\nconst v = eval(input);\nconst w = eval(other);';
  assert.deepEqual(scanSource(src, 'x.js').map((f) => [f.rule, f.line]), [['HK010', 3]]);
});

test('placeholder keys are not reported', () => {
  assert.deepEqual(scanSource("const k = 'sk-your-key-here-xxxxxxxxxxxxxxxxxxxx';", 'k.ts'), []);
});

test('scores: severity-weighted per category, floored at zero', () => {
  const f = (category, severity) => ({ category, severity });
  const s = scoreFindings([f('cost', 'critical'), f('cost', 'medium'), f('leak', 'critical'), f('leak', 'critical'), f('leak', 'high')]);
  assert.deepEqual(s.categories, { cost: 35, leak: 0, injection: 100, schema: 100, idempotency: 100 });
  assert.equal(s.overall, 67);
});

test('CLI: scan exits 1 on findings, 0 on hardened tree, emits valid JSON', () => {
  const run = (...args) => spawnSync(process.execPath, ['bin/llm-harden.mjs', ...args], { cwd: pkg, encoding: 'utf8' });
  const bad = run('scan', 'evals/sample-app/before', '--json');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).summary.total, 8);
  assert.equal(run('scan', 'evals/sample-app/after').status, 0);
  assert.equal(run('scan', 'evals/sample-app/before', '--fail-on', 'none').status, 0);
  assert.equal(run('bogus').status, 2);
});

test('demo report is reproducible from the sample app', async () => {
  const committed = await readFile(new URL('../docs/demo-report.html', import.meta.url), 'utf8');
  assert.ok((await buildDemoReport()) === committed, 'docs/demo-report.html is stale: run npm run report');
  assert.match(committed, /Before vs\. After Production Hardening/);
  assert.ok(!/<script[^>]+src=/.test(committed), 'report is self-contained');
  assert.doesNotThrow(() => renderReport({ before: { root: '.', filesScanned: 0, findings: [], summary: { total: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } }, score: scoreFindings([]) } }));
});

test('rule text inside string literals is never a finding (self-scan of the kit)', async () => {
  const { scanDir } = await import('../src/repo-scanner.mjs');
  assert.deepEqual((await scanDir(fileURLToPath(new URL('../src', import.meta.url)))).findings, []);
});
