// Fixture benchmark: per-rule recall on broken/ trees, false positives on hardened/ trees.
//   node evals/benchmark.mjs [--json] [--report docs/demo-report.html]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { scanDir, RULES } from '../src/repo-scanner.mjs';
import { renderReport } from '../src/report.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export async function runBenchmark() {
  const { fixtures } = JSON.parse(await readFile(here('./manifest.json'), 'utf8'));
  const per = Object.fromEntries(RULES.map((r) => [r.id, { tp: 0, fn: 0, fp: 0 }]));
  const cases = [];
  for (const fx of fixtures) {
    for (const side of ['broken', 'hardened']) {
      const res = await scanDir(here(`./fixtures/${fx.id}/${side}`));
      const got = [...new Set(res.findings.map((f) => f.rule))].sort();
      const want = side === 'broken' ? [...fx.expect].sort() : [];
      for (const id of want) per[id][got.includes(id) ? 'tp' : 'fn']++;
      for (const id of got) if (!want.includes(id)) per[id].fp++;
      cases.push({ id: fx.id, side, want, got, pass: got.join() === want.join() });
    }
  }
  const total = Object.values(per).reduce((a, r) => ({ tp: a.tp + r.tp, fn: a.fn + r.fn, fp: a.fp + r.fp }), { tp: 0, fn: 0, fp: 0 });
  return { fixtures: fixtures.length, cases, perRule: per, total,
    recall: total.tp / (total.tp + total.fn), precision: total.tp / Math.max(1, total.tp + total.fp) };
}

export function toMarkdown(b) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const rows = RULES.map((r) => {
    const m = b.perRule[r.id], n = b.cases.filter((c) => c.side === 'broken' && c.want.includes(r.id)).length;
    return `| \`${r.id}\` | ${r.title} | ${n} | ${m.tp} | ${m.fn} | ${m.fp} |`;
  });
  const clean = b.cases.filter((c) => c.side === 'hardened' && c.pass).length;
  return ['| Rule | Detects | Expected | Detected | Missed | False positives |', '|---|---|---:|---:|---:|---:|', ...rows,
    `| **Total** | ${b.fixtures} broken + ${b.fixtures} hardened trees | **${b.total.tp + b.total.fn}** | **${b.total.tp}** | **${b.total.fn}** | **${b.total.fp}** |`,
    '', `Recall ${pct(b.recall)} · precision ${pct(b.precision)} · hardened trees clean ${clean}/${b.fixtures}`].join('\n');
}

/** The Before/After report committed at docs/demo-report.html. */
export async function buildDemoReport() {
  const [before, after] = await Promise.all(['before', 'after'].map(async (side) => ({ ...(await scanDir(here(`./sample-app/${side}`))), root: `evals/sample-app/${side}` })));
  return renderReport({
    title: 'Before vs. After Production Hardening',
    subtitle: 'Sample app: Next.js support agent with tool calls, Stripe refunds and a billing webhook',
    before, after,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { json: { type: 'boolean' }, report: { type: 'string' } } });
  const b = await runBenchmark();
  console.log(values.json ? JSON.stringify(b, null, 2) : toMarkdown(b));
  if (values.report) {
    await writeFile(values.report, await buildDemoReport());
    console.error(`wrote ${values.report}`);
  }
  if (b.total.fn || b.total.fp) process.exitCode = 1;
}
