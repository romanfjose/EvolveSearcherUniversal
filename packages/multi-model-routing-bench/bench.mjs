// Prints the README's tables. Deterministic: `npm run bench` reproduces them byte for byte.
import { pathToFileURL } from 'node:url';
import { PRICING, CU_MENU, ROSTERS, priceCall, agentCU, compareRosters } from './src/cu-engine.mjs';

export const PLAN = { priceUSD: 200, period: 'month', windowHours: 5, windowCap: 400, weeklyCap: 4000, reserveFraction: 0.2 };
export const BENCH_ROSTERS = [
  ROSTERS.singleModel({ model: 'claude-opus-5-5', effort: 'high' }),
  ROSTERS.singleModel({ model: 'claude-sonnet-5-5', effort: 'medium' }),
  ROSTERS.triCameral(),
];

const table = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`,
  ...rows.map(r => `| ${r.join(' | ')} |`),
].join('\n');
const usd = v => v == null ? '—' : `$${v.toFixed(2)}`;
const n = (v, d = 1) => v == null ? '—' : v.toFixed(d);
const h = v => v == null ? 'never' : `${v.toFixed(2)} h`;

export function render() {
  const out = [];

  out.push('### Request pricing and tier jumps', '');
  const shapes = [['50k prompt, 70% cached, 6k out', 50_000], ['150k prompt, 70% cached, 6k out', 150_000]];
  out.push(table(['Model', ...shapes.map(s => s[0])], Object.keys(PRICING).map(model => [
    `\`${model}\``, ...shapes.map(([, p]) => {
      const { usd: u, tierAbove } = priceCall({ model, input: p * 0.3, cachedInput: p * 0.7, output: 6_000 });
      return `$${u.toFixed(4)}${tierAbove ? ` (> ${tierAbove / 1000}k tier)` : ''}`;
    }),
  ])), '');

  out.push('### Agent CU (Base CU x Effort Multiplier)', '');
  const efforts = Object.keys(CU_MENU.effort);
  out.push(table(['Model', ...efforts.map(e => `\`${e}\``)],
    Object.keys(CU_MENU.models).map(m => [`\`${m}\``, ...efforts.map(e => n(agentCU(m, e), 2))])), '');

  const scenarios = [['Pure API', { plan: null }], ['Plan, overflow billed at API rates', { plan: PLAN, overflow: 'api' }], ['Plan, wait for the window', { plan: PLAN, overflow: 'wait' }]];
  for (const [title, opts] of scenarios) {
    out.push(`### 24 h studio: ${title}`, '');
    out.push(table(
      ['Roster', 'Cycles', 'CU / cycle', 'Effective USD', 'API-equiv USD', 'Exhausted at', 'Catch rate', 'Escaped', 'Clean results', 'USD / result', 'ROI'],
      compareRosters(BENCH_ROSTERS, { hours: 24, ...opts }).map(r => [
        r.roster.replace('claude-', ''), r.cycles, `${n(r.cuPerCycle)} (${r.budget})`, usd(r.totalUSD), usd(r.apiEquivalentUSD),
        h(r.quotaExhaustedAtHour), `${(r.catchRate * 100).toFixed(1)}%`, n(r.defectsEscaped), n(r.results), usd(r.usdPerResult), r.roi == null ? '—' : r.roi.toPrecision(3),
      ])), '');
  }
  out.push('### Sensitivity: what an escaped defect costs (plan, wait for the window)', '');
  const penalties = [1, 2, 4, 8];
  out.push(table(['Roster', ...penalties.map(p => `ROI, ${p} lost / escape`)], BENCH_ROSTERS.map(roster => [
    roster.name.replace('claude-', ''), ...penalties.map(p => {
      const [r] = compareRosters([roster], { hours: 24, plan: PLAN, overflow: 'wait', workload: { defectPenalty: p } });
      return r.roi == null ? '—' : r.roi.toPrecision(3);
    }),
  ])), '');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(render());
