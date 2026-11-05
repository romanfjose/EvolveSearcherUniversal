import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keepFactor, stackedHaircutPct, applyLegs, breakevenPriceRatio, parityThresholds,
  CORRIDORS, corridorById, quoteCorridor, quoteAll, flatPrice,
} from '../src/corridors.mjs';
import { walkOrderBook, bookDepth } from '../src/orderbook.mjs';
import { marketFromRaw } from '../src/market.mjs';
import { SNAPSHOT } from '../src/snapshot.mjs';
import { rng, close, SEEDS } from './helpers.mjs';

const M = marketFromRaw(SNAPSHOT);

test('keepFactor: 2.9% then 0.6% keeps 0.965174 (README stacked model)', () => {
  assert.ok(close(keepFactor([2.9, 0.6]), 0.965174));
});

test('stackedHaircutPct is 3.4826%, not the naive 3.5%', () => {
  assert.ok(close(stackedHaircutPct([2.9, 0.6]), 3.4826));
});

test('no legs keep everything', () => {
  assert.equal(keepFactor([]), 1);
  assert.equal(stackedHaircutPct([]), 0);
});

test('property: percentage stacking is order-independent and below the naive sum', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const p = Array.from({ length: 1 + Math.floor(r() * 4) }, () => r() * 10);
    assert.ok(close(keepFactor(p), keepFactor([...p].reverse())));
    assert.ok(stackedHaircutPct(p) <= p.reduce((a, b) => a + b, 0) + 1e-12);
  }
});

test('applyLegs: pct + fixed legs compound in order', () => {
  const r = applyLegs(1000, [{ label: 'a', pct: 1, fixed: 5 }, { label: 'b', pct: 2 }]);
  assert.ok(close(r.steps[0].after, 1000 - 10 - 5));
  assert.ok(close(r.net, 985 * 0.98));
  assert.ok(close(r.totalFee, 1000 - 985 * 0.98));
});

test('applyLegs: fixed fees never drive the amount negative', () => {
  const r = applyLegs(3, [{ fixed: 5 }, { pct: 10 }]);
  assert.equal(r.net, 0);
  assert.equal(r.effectivePct, 100);
  assert.equal(applyLegs(0, [{ fixed: 1 }]).effectivePct, 0);
});

test('property: applyLegs without fixed fees matches stackedHaircutPct', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const p = [r() * 5, r() * 5, r() * 5];
    assert.ok(close(applyLegs(1 + r() * 1e5, p.map((pct) => ({ pct }))).effectivePct, stackedHaircutPct(p)));
  }
});

test('breakeven ratio: stacked Bitso needs bid > 1.0361 × MEP to beat raw MEP', () => {
  assert.equal(breakevenPriceRatio(0.965174).toFixed(4), '1.0361');
});

test('breakeven ratio: stacked Bitso needs bid > 0.9967 × MEP to beat Prex (3.8%)', () => {
  assert.equal(breakevenPriceRatio(0.965174, 0.962).toFixed(4), '0.9967');
});

test('parity: crypto rail flips from losing to winning exactly at MEP/keep', () => {
  const keep = keepFactor([2.9, 0.6]);
  const mep = 1478.4;
  const t = parityThresholds({ mep, ccl: 1501.2, bid: 1, keep });
  assert.ok(close(t.minBidToBeatMep, mep / keep));
  assert.equal(parityThresholds({ mep, ccl: 0, bid: t.minBidToBeatMep * (1 - 1e-9), keep }).cryptoBeatsMepAtBid, false);
  assert.equal(parityThresholds({ mep, ccl: 0, bid: t.minBidToBeatMep * (1 + 1e-9), keep }).cryptoBeatsMepAtBid, true);
});

test('parity: CCL/MEP spread and required premium', () => {
  const t = parityThresholds({ mep: 1000, ccl: 1060, bid: 1040, keep: 0.95 });
  assert.ok(close(t.cclMepSpreadPct, 6));
  assert.ok(close(t.requiredPremiumVsMepPct, (1 / 0.95 - 1) * 100));
  assert.ok(close(t.bidVsCclPct, (1040 / 1060 - 1) * 100));
  assert.equal(t.cryptoBeatsMepAtCcl, true);
  assert.ok(close(t.headroomPct, (1040 * 0.95 / 1000 - 1) * 100));
});

test('parity: missing quotes yield nulls, not NaN', () => {
  const t = parityThresholds({ mep: 1000, ccl: 0, bid: 0, keep: 0.97 });
  assert.equal(t.cclMepSpreadPct, null);
  assert.equal(t.bidVsMepPct, null);
  assert.equal(t.cryptoBeatsMepAtBid, null);
});

test('registry: ids unique, every corridor has limits and a known price source', () => {
  const ids = CORRIDORS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CORRIDORS) {
    assert.ok(c.limits && 'dailyUsd' in c.limits, c.id);
    assert.ok(['book', 'mep', 'topVenue'].includes(c.price) || c.price.startsWith('venue:'), c.id);
  }
});

test('quote: Prex = USD × 0.962 × MEP compra', () => {
  const q = quoteCorridor(corridorById('payo_prex_mep'), 1000, M);
  assert.ok(close(q.netArs, 1000 * 0.962 * M.mepBid));
  assert.ok(close(q.vsMepPct, -3.8));
});

test('quote: Bitso stacked = book walk of 0.971·USD, then × 0.994', () => {
  const q = quoteCorridor(corridorById('payo_bitso_stacked'), 2500, M);
  const w = walkOrderBook(M.bids, 2500 * 0.971);
  assert.ok(close(q.netArs, w.grossArs * 0.994));
  assert.ok(close(q.haircutPct, 3.4826));
  assert.ok(q.slippagePct > 0);
});

test('quote: Belo prices at the better of its USDT/USDC bids', () => {
  const b = M.venues.belo;
  assert.equal(flatPrice('venue:belo', M), Math.max(b.usdtBid, b.usdcBid));
  assert.ok(close(quoteCorridor(corridorById('payo_belo_usdc'), 100, M).netArs, 96 * Math.max(b.usdtBid, b.usdcBid)));
});

test('quote: unknown venue prices at zero instead of throwing', () => {
  assert.equal(flatPrice('venue:nope', M), null);
  const q = quoteCorridor({ ...corridorById('payo_belo_usdc'), price: 'venue:nope' }, 100, M);
  assert.equal(q.netArs, 0);
});

test('quote: direct top-venue corridor is 0% fee at the top CriptoYa bid', () => {
  const q = quoteCorridor(corridorById('direct_crypto_top_venue'), 1000, M);
  assert.equal(q.netArs, 1000 * M.topVenue.bestBid);
  assert.equal(q.haircutPct, 0);
});

test('quote: thin book reports unfilled units and only credits filled ARS', () => {
  const thin = { ...M, bids: [{ price: 1500, amount: 100 }] };
  const q = quoteCorridor(corridorById('direct_bitso_book'), 1000, thin);
  assert.equal(q.unfilledUnits, 900);
  assert.ok(close(q.netArs, 100 * 1500 * 0.995));
});

test('quoteAll returns every corridor ranked by net ARS', () => {
  const all = quoteAll(1000, M);
  assert.equal(all.length, CORRIDORS.length);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].netArs >= all[i].netArs);
});

test('property: skipping the Payoneer rail always beats the same book via Payoneer', () => {
  const depth = bookDepth(M.bids);
  for (const seed of SEEDS) {
    const usd = 1 + rng(seed)() * depth * 0.9;
    const direct = quoteCorridor(corridorById('direct_bitso_book'), usd, M).netArs;
    const payo = quoteCorridor(corridorById('payo_bitso_stacked'), usd, M).netArs;
    assert.ok(direct > payo, `usd ${usd}`);
  }
});

test('property: effective rate is net ARS per gross USD for every corridor', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const usd = 1 + rng(seed)() * 20000;
    for (const q of quoteAll(usd, M)) assert.ok(close(q.effRate * usd, q.netArs));
  }
});
