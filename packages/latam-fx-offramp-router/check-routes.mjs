#!/usr/bin/env node
/**
 * CashoutRails — USD → ARS route, order-book, split and treasury-breakeven comparator.
 * Usage: node check-routes.mjs [usd_amount] [--offline] [--json] [--tna=0.2199] [--apy=0.038]
 * Default amount 1000 USD. --offline uses the bundled illustrative snapshot (src/snapshot.mjs).
 * Math lives in src/; this file only fetches, composes and prints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORRIDORS, quoteCorridor, keepFactor, parityThresholds, corridorById } from './src/corridors.mjs';
import { findOptimalSplit, venuesFromCorridors, DEFAULT_SPLIT_VENUES } from './src/split.mjs';
import { breakevenDepreciation, tnaToPeriodRate, apyToPeriodRate } from './src/breakeven.mjs';
import { fetchLiveRaw, marketFromRaw } from './src/market.mjs';
import { SNAPSHOT } from './src/snapshot.mjs';

export { walkOrderBook } from './src/orderbook.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(HERE, 'latest-routes.json');
const r2 = (n) => (n == null ? null : Number(n.toFixed(2)));

export function buildReport(market, usdAmount, { tna = 0.2199, apy = 0.038 } = {}) {
  const shape = (q) => ({
    id: q.id, corridor: q.group, name: q.name, netArs: r2(q.netArs), effRate: r2(q.effRate),
    vsMepPct: r2(q.vsMepPct), haircutPct: Number(q.haircutPct.toFixed(4)), vwap: r2(q.vwap),
    slippagePct: Number(q.slippagePct.toFixed(4)), unfilledUnits: r2(q.unfilledUnits),
  });
  const quotes = CORRIDORS.map((d) => quoteCorridor(d, usdAmount, market)).sort((a, b) => b.netArs - a.netArs);
  const payoneerRoutes = quotes.filter((q) => q.group === 'payoneer').map(shape);
  const contractorCorridors = quotes.filter((q) => q.group === 'direct').map(shape);

  const stacked = corridorById('payo_bitso_stacked');
  const parity = parityThresholds({
    mep: market.mepBid, ccl: market.cclBid, bid: market.bids[0]?.price ?? 0,
    keep: keepFactor([...stacked.pre, ...stacked.post].map((l) => l.pct)),
  });

  const split = findOptimalSplit(usdAmount, venuesFromCorridors(DEFAULT_SPLIT_VENUES, market), { mepBid: market.mepBid });

  const bestPayo = payoneerRoutes[0];
  const conservative = payoneerRoutes.find((r) => r.id === 'payo_bitso_stacked') || bestPayo;
  const bestDirect = contractorCorridors[0];
  const mep = market.mepBid || bestPayo.effRate || 1;
  const perK = usdAmount / 1000;
  const edge = (a, b) => {
    const ars = a.netArs - b.netArs;
    return { ars: r2(ars), usd: r2(ars / mep), annualUsdAt5kMo: Math.round((ars / mep / perK) * 5 * 12) };
  };

  return {
    generatedAt: market.stamp,
    source: market.source,
    ticketUsd: usdAmount,
    benchmarks: {
      mepCompra: market.mepBid, cclCompra: market.cclBid, mepUpdatedAt: market.mepUpdatedAt,
      rawMepArs: r2(usdAmount * market.mepBid), bitsoTopBid: market.bids[0]?.price ?? null,
    },
    parity: Object.fromEntries(Object.entries(parity).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(4)) : v])),
    payoneerRoutes,
    contractorCorridors,
    venueQuotes: market.venueRanking.map((v) => ({ venue: v.venue, usdtBid: v.usdtBid, usdcBid: v.usdcBid, bestBid: v.bestBid, bestAsset: v.bestAsset })),
    optimalSplit: {
      ...split,
      netArs: r2(split.netArs), effRate: r2(split.effRate), vsMepPct: r2(split.vsMepPct),
      gainVsBestSingleArs: r2(split.gainVsBestSingleArs),
      tranches: split.tranches.map((t) => ({ ...t, usd: r2(t.usd), netArs: r2(t.netArs), effRate: r2(t.effRate),
        vwap: r2(t.vwap), slippagePct: Number(t.slippagePct.toFixed(4)), feesUsd: r2(t.feesUsd),
        capUsd: Number.isFinite(t.capUsd) ? t.capUsd : null })),
      bestSingle: split.bestSingle && { ...split.bestSingle, netArs: r2(split.bestSingle.netArs) },
    },
    breakeven: {
      tna, apy, days: 30,
      arsPeriodPct: Number((tnaToPeriodRate(tna) * 100).toFixed(4)),
      usdPeriodPct: Number((apyToPeriodRate(apy) * 100).toFixed(4)),
      fStarPct: Number((breakevenDepreciation({ tna, apy }) * 100).toFixed(4)),
    },
    arbitrageSummary: {
      bestPayoneerRoute: bestPayo.name,
      bestPayoneerEffRate: bestPayo.effRate,
      conservativePayoneerEffRate: conservative.effRate,
      bestDirectRoute: bestDirect.name,
      bestDirectEffRate: bestDirect.effRate,
      vsBestPayoneer: edge(bestDirect, bestPayo),
      vsConservativePayoneer: edge(bestDirect, conservative),
    },
  };
}

export async function computeCashoutRoutes(usdAmount = 1000, { offline = false, ...opts } = {}) {
  const raw = offline ? SNAPSHOT : await fetchLiveRaw(usdAmount);
  const report = buildReport(marketFromRaw(raw), usdAmount, opts);
  if (!offline) {
    try { fs.writeFileSync(CACHE_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8'); } catch {}
  }
  return report;
}

const ars = (n) => 'ARS ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n, d = 2) => (n == null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`);

function print(d) {
  const b = d.benchmarks;
  console.log(`\n=== CashoutRails | USD ${d.ticketUsd.toFixed(2)} | ${d.generatedAt} | ${d.source} ===`);
  if (d.source !== 'live') console.log('  ! Offline illustrative snapshot — not a live quote.');
  console.log(`\nBenchmarks: MEP compra ${ars(b.mepCompra)} · CCL compra ${ars(b.cclCompra)} · Bitso top bid ${ars(b.bitsoTopBid)}`);
  const p = d.parity;
  console.log(`Parity (2.9% + 0.6% stack, keep ${p.keep}): bid must exceed ${ars(p.minBidToBeatMep)} (MEP ${pct(p.requiredPremiumVsMepPct, 3)}); ` +
    `now ${pct(p.bidVsMepPct)} vs MEP, CCL/MEP gap ${pct(p.cclMepSpreadPct)} → ${p.cryptoBeatsMepAtBid ? 'crypto rail wins' : 'MEP wins'} (headroom ${pct(p.headroomPct, 3)})`);

  const table = (title, rows) => {
    console.log(`\n${title}`);
    for (const r of rows) {
      const extra = r.slippagePct ? ` | slip ${r.slippagePct.toFixed(3)}%` : '';
      console.log(`  ${r.name.padEnd(52)} | ${ars(r.netArs).padStart(17)} | eff ${r.effRate.toFixed(2).padStart(8)} | vs MEP ${pct(r.vsMepPct).padStart(7)}${extra}`);
    }
  };
  table('Payoneer corridors:', d.payoneerRoutes);
  table('Direct contractor corridors (no Payoneer rail fee):', d.contractorCorridors);
  const e = d.arbitrageSummary.vsConservativePayoneer;
  console.log(`  -> Edge vs Payoneer stacked: ${ars(e.ars)} (USD ${e.usd}/ticket · ~USD ${e.annualUsdAt5kMo}/yr at $5k/mo)`);

  const s = d.optimalSplit;
  console.log(`\nOptimal split (today's tier capacity): ${ars(s.netArs)} · eff ${s.effRate.toFixed(2)} · vs MEP ${pct(s.vsMepPct)}` +
    (s.unallocatedUsd > 0 ? ` · UNALLOCATED USD ${s.unallocatedUsd.toFixed(2)}` : ''));
  for (const t of s.tranches) {
    console.log(`  ${t.name.padEnd(52)} | USD ${t.usd.toFixed(2).padStart(10)} | ${ars(t.netArs).padStart(17)} | eff ${t.effRate.toFixed(2)}` +
      (t.slippagePct ? ` | slip ${t.slippagePct.toFixed(3)}%` : '') + (t.binding ? ` | ${t.binding} cap` : ''));
  }
  if (s.gainVsBestSingleArs != null) console.log(`  -> vs best single venue (${s.bestSingle.id}): +${ars(s.gainVsBestSingleArs)}`);

  const k = d.breakeven;
  console.log(`\nTreasury 30d: plazo fijo ${(k.tna * 100).toFixed(2)}% TNA = ${k.arsPeriodPct.toFixed(3)}% · USD ${(k.apy * 100).toFixed(2)}% APY = ${k.usdPeriodPct.toFixed(3)}% → USD wins only if ARS depreciates > f* = ${k.fStarPct.toFixed(3)}%`);

  console.log('\nVenue quotes (CriptoYa totalBid):');
  for (const v of d.venueQuotes) {
    console.log(`  ${v.venue.padEnd(12)} | USDT ${v.usdtBid ? v.usdtBid.toFixed(2).padStart(9) : '      N/A'} | USDC ${v.usdcBid ? v.usdcBid.toFixed(2).padStart(9) : '      N/A'}`);
  }
  console.log('');
}

export function parseArgs(argv) {
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const num = argv.find((a) => !a.startsWith('-'));
  return {
    usd: parseFloat(num ?? '1000'),
    json: argv.includes('--json'),
    offline: argv.includes('--offline'),
    tna: flag('tna') != null ? parseFloat(flag('tna')) : 0.2199,
    apy: flag('apy') != null ? parseFloat(flag('apy')) : 0.038,
  };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!(a.usd > 0) || !Number.isFinite(a.tna) || !Number.isFinite(a.apy)) {
    console.error('Usage: node check-routes.mjs [usd_amount] [--offline] [--json] [--tna=0.2199] [--apy=0.038]');
    process.exit(1);
  }
  const data = await computeCashoutRoutes(a.usd, { offline: a.offline, tna: a.tna, apy: a.apy });
  if (a.json) console.log(JSON.stringify(data, null, 2));
  else print(data);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Error:', err.message, '(try --offline)');
    process.exit(1);
  });
}
