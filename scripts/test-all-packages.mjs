#!/usr/bin/env node
// Runs the root suite and every packages/* suite, then prints one Markdown verification table.
//
//   node scripts/test-all-packages.mjs            # print the table; exit 1 if any suite fails
//   node scripts/test-all-packages.mjs --json     # print the raw results as JSON
//   node scripts/test-all-packages.mjs --write    # also refresh docs/portfolio/verification.js and PORTFOLIO.md
//
// A package's suite is its package.json "test" script. `node --test` suites run with the TAP
// reporter and are counted from its summary; any other script is counted from ✓/✗ lines.
// A suite whose declared dependencies are not installed is reported as "needs npm install", not failed.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

function depInstalled(dir, dep) {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, 'node_modules', dep, 'package.json'))) return true;
    if (d === dirname(d) || relative(ROOT, d).startsWith('..')) return false;
  }
}

function discover() {
  const dirs = [ROOT, ...readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => join(ROOT, 'packages', e.name)).sort()];
  return dirs.map((dir) => {
    const pkg = readJson(join(dir, 'package.json'));
    const name = dir === ROOT ? 'EvolveSearcherUniversal (root)' : relative(join(ROOT, 'packages'), dir);
    const script = pkg?.scripts?.test;
    if (!script) return { name, dir, status: 'no suite' };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const missing = deps.filter((d) => !depInstalled(dir, d));
    if (missing.length && !/^node --test\b/.test(script)) return { name, dir, script, status: 'needs npm install', missing };
    const tap = /^node --test\b/.test(script);
    return { name, dir, status: 'run', tap, command: tap ? script.replace(/^node --test\b/, 'node --test --test-reporter=tap') : script };
  });
}

function run({ dir, command }) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const child = spawn(command, { cwd: dir, shell: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    child.on('close', (code) => resolve({ code, out, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
  });
}

function count(s, { out, code }) {
  if (s.tap) {
    const n = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? 0);
    return { tests: n('tests'), passed: n('pass'), failed: n('fail'), skipped: n('skipped') + n('todo') };
  }
  const passed = (out.match(/^\s*✓/gm) || []).length;
  const failed = (out.match(/^\s*✗/gm) || []).length;
  // A non-zero exit with no failing assertion printed is still a failure (crash, missing file).
  return { tests: passed + failed, passed, failed: failed || (code ? 1 : 0), skipped: 0 };
}

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const pct = (p, t) => (t ? `${((100 * p) / t).toFixed(1)}%` : '—');

function table(results, totals) {
  const rows = results.map((r) => r.status === 'run'
    ? `| \`${r.name}\` | ${r.tests} | ${r.passed} | ${r.failed} | ${pct(r.passed, r.tests)} | ${fmtMs(r.ms)} | ${r.failed ? '❌ fail' : '✅ pass'} |`
    : `| \`${r.name}\` | — | — | — | — | — | ${r.status === 'no suite' ? '➖ no suite' : `⚠️ needs \`npm install\` (${r.missing.join(', ')})`} |`);
  return [
    '| Package | Tests | Passed | Failed | Pass rate | Time | Status |',
    '|---|--:|--:|--:|--:|--:|---|',
    ...rows,
    `| **Total (${totals.suites} suites)** | **${totals.tests}** | **${totals.passed}** | **${totals.failed}** | **${pct(totals.passed, totals.tests)}** | **${fmtMs(totals.ms)}** | ${totals.failed ? '❌' : '✅'} |`,
  ].join('\n');
}

const results = [];
for (const s of discover()) {
  if (s.status !== 'run') { results.push(s); continue; }
  if (!args.has('--json')) process.stderr.write(`· ${s.name} … `);
  const r = await run(s);
  const c = count(s, r);
  results.push({ ...s, ...c, ms: r.ms, code: r.code });
  if (!args.has('--json')) process.stderr.write(`${c.failed ? 'FAIL' : 'ok'} (${c.passed}/${c.tests}, ${fmtMs(r.ms)})\n`);
  if (c.failed && process.env.VERBOSE) process.stderr.write(r.out + '\n');
}

const ran = results.filter((r) => r.status === 'run');
const totals = {
  suites: ran.length,
  tests: ran.reduce((a, r) => a + r.tests, 0),
  passed: ran.reduce((a, r) => a + r.passed, 0),
  failed: ran.reduce((a, r) => a + r.failed, 0),
  ms: ran.reduce((a, r) => a + r.ms, 0),
};
const env = `Node ${process.version}, ${os.platform()}/${os.arch()}, ${new Date().toISOString().slice(0, 10)}`;
const md = `${table(results, totals)}\n\n_${env}. Generated by \`node scripts/test-all-packages.mjs\`._`;

if (args.has('--json')) {
  console.log(JSON.stringify({ env, totals, results: results.map(({ dir, out, command, ...r }) => r) }, null, 2));
} else {
  console.log('\n' + md);
}

if (args.has('--write')) {
  const data = {
    generated: new Date().toISOString(), node: process.version, platform: `${os.platform()}/${os.arch()}`, totals,
    packages: Object.fromEntries(results.map((r) => [r.dir === ROOT ? 'EvolveSearcherUniversal' : r.name,
      r.status === 'run' ? { status: r.failed ? 'fail' : 'pass', tests: r.tests, passed: r.passed, failed: r.failed, ms: Math.round(r.ms) } : { status: r.status }])),
  };
  writeFileSync(join(ROOT, 'docs/portfolio/verification.js'),
    `// Generated by scripts/test-all-packages.mjs --write. Do not edit by hand.\nwindow.VERIFICATION = ${JSON.stringify(data, null, 2)};\n`);
  const pf = join(ROOT, 'PORTFOLIO.md');
  const doc = readFileSync(pf, 'utf8');
  const re = /(<!-- verification:start -->)[\s\S]*?(<!-- verification:end -->)/;
  if (!re.test(doc)) throw new Error('PORTFOLIO.md is missing the verification markers');
  writeFileSync(pf, doc.replace(re, (_, a, b) => `${a}\n${md}\n${b}`));
  process.stderr.write('wrote docs/portfolio/verification.js and PORTFOLIO.md\n');
}

process.exitCode = totals.failed ? 1 : 0;
