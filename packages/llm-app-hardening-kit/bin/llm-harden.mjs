#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { scanDir, exceeds, RULES, CATEGORIES } from '../src/repo-scanner.mjs';
import { renderReport } from '../src/report.mjs';

const USAGE = `llm-harden: audit an LLM app for production failure modes

Usage:
  llm-harden scan <dir> [--json] [--html <file>] [--fail-on critical|high|medium|low|none]
  llm-harden compare <before-dir> <after-dir> [--json] [--html <file>]
  llm-harden rules

Exit codes: 0 clean, 1 findings at or above --fail-on (default: high), 2 usage error.
Suppress a reviewed line with a comment: // llm-harden-ignore HK005`;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const SEV = { critical: '1;31', high: '31', medium: '33', low: '36' };

function printScan(r) {
  let file = null;
  for (const f of r.findings) {
    if (f.path !== file) { file = f.path; console.log('\n' + c('1;4', file)); }
    console.log(`  ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${c(SEV[f.severity], f.severity.padEnd(8))} ${c('2', f.rule)}  ${f.title}`);
    console.log(`           ${c('2', f.snippet)}`);
    console.log(`           ${c('32', '↳ ' + f.fix)}`);
  }
  const s = r.summary.bySeverity;
  console.log(`\n${r.filesScanned} files · ${r.summary.total} findings (${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low)`);
  console.log(`Score ${r.score.overall}/100 · ` + Object.entries(r.score.categories).map(([k, v]) => `${CATEGORIES[k]} ${v}`).join(' · '));
}

async function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    json: { type: 'boolean' }, html: { type: 'string' }, 'fail-on': { type: 'string', default: 'high' }, help: { type: 'boolean', short: 'h' },
  } });
  const [cmd, ...dirs] = positionals;
  if (values.help || !cmd) { console.log(USAGE); return cmd || values.help ? 0 : 2; }

  if (cmd === 'rules') {
    for (const r of RULES) console.log(`${r.id}  ${r.severity.padEnd(8)}  ${CATEGORIES[r.category].padEnd(32)}  ${r.title}`);
    return 0;
  }
  if (cmd === 'scan' && dirs.length === 1) {
    const r = await scanDir(dirs[0]);
    if (values.html) await writeFile(values.html, renderReport({ before: r, subtitle: dirs[0] }));
    if (values.json) console.log(JSON.stringify(r, null, 2)); else printScan(r);
    return exceeds(r.findings, values['fail-on']) ? 1 : 0;
  }
  if (cmd === 'compare' && dirs.length === 2) {
    const [before, after] = await Promise.all(dirs.map((d) => scanDir(d)));
    if (values.html) await writeFile(values.html, renderReport({ before, after, subtitle: `${dirs[0]} → ${dirs[1]}` }));
    if (values.json) console.log(JSON.stringify({ before, after }, null, 2));
    else console.log(`Overall ${before.score.overall} → ${after.score.overall}\n` + Object.entries(CATEGORIES).map(([k, v]) => `  ${v.padEnd(32)} ${String(before.score.categories[k]).padStart(3)} → ${after.score.categories[k]}`).join('\n'));
    return exceeds(after.findings, values['fail-on']) ? 1 : 0;
  }
  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`llm-harden: ${err.message}`); process.exitCode = 2; });
