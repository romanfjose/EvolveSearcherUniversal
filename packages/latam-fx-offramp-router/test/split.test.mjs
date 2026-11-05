import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOptimalSplit, remainingCapacity, venuesFromCorridors, DEFAULT_SPLIT_VENUES } from '../src/split.mjs';
import { quoteCorridor, corridorById } from '../src/corridors.mjs';
import { walkOrderBook } from '../src/orderbook.mjs';
import { marketFromRaw } from '../src/market.mjs';
import { SNAPSHOT } from '../src/snapshot.mjs';
import { rng, randomBook, close, SEEDS } from './helpers.mjs';

const M = marketFromRaw(SNAPSHOT);
const flat = (id, price, extra = {}) => ({ id, price, ...extra });
const sumUsd = (s) => s.tranches.reduce((a, t) => a + t.usd, 0);
const byId = (s, id) => s.tranches.find((t) => t.id === id);

/** Brute force on a $step grid for two venues, as an independent oracle. */
function bruteTwo(amount, a, b, step) {
  const netOf = (v, x) => {
    if (x <= 0) return 0;
    if (x < (v.minUsd || 0) || x > (v.capUsd ?? Infinity) + 1e-9) return -Infinity;
    const eff = Math.max(0, x - (v.fixedUsd || 0)) * (v.preKeep ?? 1);
    const ars = v.bids ? (walkOrderBook(v.bids, eff, { presorted: true }).complete ? walkOrderBook(v.bids, eff, { presorted: true }).grossArs : -Infinity) : eff * v.price;
    return ars * (v.postKeep ?? 1);
  };
  let best = -Infinity;
  for (let x = 0; x <= amount + 1e-9; x += step) best = Math.max(best, netOf(a, x) + netOf(b, amount - x));
  return best;
}

test('remainingCapacity: daily limit binds', () => {
  assert.deepEqual(remainingCapacity({ dailyUsd: 1000, monthlyUsd: 6000 }), { cap: 1000, binding: 'daily' });
});

test('remainingCapacity: monthly limit binds after usage', () => {
  assert.deepEqual(remainingCapacity({ dailyUsd: 1000, monthlyUsd: 6000 }, { usedMonthUsd: 5600 }), { cap: 400, binding: 'monthly' });
});

test('remainingCapacity: exhausted tiers floor at zero, unlimited tiers have no binding', () => {
  assert.equal(remainingCapacity({ dailyUsd: 1000 }, { usedTodayUsd: 1500 }).cap, 0);
  assert.deepEqual(remainingCapacity({}), { cap: Infinity, binding: null });
});

test('single flat venue takes the whole amount', () => {
  const s = findOptimalSplit(5000, [flat('a', 1400)]);
  assert.equal(s.tranches.length, 1);
  assert.equal(s.netArs, 7_000_000);
  assert.equal(s.unallocatedUsd, 0);
});

test('higher rate venue is filled to its cap before the next', () => {
  const s = findOptimalSplit(3000, [flat('lo', 1400), flat('hi', 1450, { capUsd: 1000 })]);
  assert.equal(byId(s, 'hi').usd, 1000);
  assert.equal(byId(s, 'lo').usd, 2000);
  assert.equal(byId(s, 'hi').binding, 'cap');
});

test('capacity shortfall is reported as unallocated, never over-filled', () => {
  const s = findOptimalSplit(5000, [flat('a', 1400, { capUsd: 1000 }), flat('b', 1300, { capUsd: 1500 })]);
  assert.equal(s.allocatedUsd, 2500);
  assert.equal(s.unallocatedUsd, 2500);
  assert.equal(s.gainVsBestSingleArs, null);
});

test('book venue is used until its marginal rate drops below the flat venue (exact crossover)', () => {
  const bids = [{ price: 1500, amount: 100 }, { price: 1480, amount: 100 }, { price: 1460, amount: 1000 }];
  const s = findOptimalSplit(1000, [{ id: 'book', bids }, flat('mep', 1470)]);
  assert.equal(byId(s, 'book').usd, 200);
  assert.equal(byId(s, 'mep').usd, 800);
  assert.equal(s.netArs, 100 * 1500 + 100 * 1480 + 800 * 1470);
});

test('book depth exhaustion spills into other venues', () => {
  const s = findOptimalSplit(500, [{ id: 'book', bids: [{ price: 2000, amount: 50 }] }, flat('mep', 1000)]);
  assert.equal(byId(s, 'book').usd, 50);
  assert.equal(byId(s, 'mep').usd, 450);
});

test('pre-fee keep converts USDT depth into gross USD capacity', () => {
  const s = findOptimalSplit(1000, [{ id: 'book', preKeep: 0.5, bids: [{ price: 2000, amount: 100 }] }, flat('mep', 900)]);
  assert.equal(byId(s, 'book').usd, 200);
  assert.ok(close(byId(s, 'book').netArs, 100 * 2000));
});

test('fixed fee: a small ticket avoids the fixed-fee venue', () => {
  const s = findOptimalSplit(100, [flat('wire', 1500, { fixedUsd: 50 }), flat('mep', 1400)]);
  assert.equal(byId(s, 'wire'), undefined);
  assert.equal(s.netArs, 140000);
});

test('fixed fee: a large ticket pays it once and routes through the better rate', () => {
  const s = findOptimalSplit(10000, [flat('wire', 1500, { fixedUsd: 50 }), flat('mep', 1400)]);
  assert.equal(byId(s, 'wire').usd, 10000);
  assert.equal(s.netArs, 9950 * 1500);
});

test('minimum ticket: a venue whose minimum exceeds the amount is skipped', () => {
  const s = findOptimalSplit(400, [flat('belo', 1500, { minUsd: 500 }), flat('mep', 1400)]);
  assert.equal(byId(s, 'belo'), undefined);
  assert.equal(s.unallocatedUsd, 0);
});

test('minimum ticket: when used, the venue gets at least its minimum', () => {
  const s = findOptimalSplit(1000, [flat('a', 1500, { capUsd: 300 }), flat('b', 1450, { minUsd: 200 }), flat('c', 1400)]);
  for (const t of s.tranches) if (t.id === 'b') assert.ok(t.usd >= 200);
  assert.equal(s.netArs, 300 * 1500 + 700 * 1450);
});

test('minimum above cap makes the venue infeasible rather than over-filled', () => {
  const s = findOptimalSplit(1000, [flat('a', 1500, { capUsd: 100, minUsd: 200 }), flat('b', 1400)]);
  assert.equal(byId(s, 'a'), undefined);
  assert.equal(s.netArs, 1_400_000);
});

test('equal-rate venues break ties by input order (deterministic)', () => {
  const s = findOptimalSplit(1500, [flat('first', 1400, { capUsd: 1000 }), flat('second', 1400, { capUsd: 1000 })]);
  assert.equal(byId(s, 'first').usd, 1000);
  assert.equal(byId(s, 'second').usd, 500);
  assert.deepEqual(findOptimalSplit(1500, [flat('first', 1400, { capUsd: 1000 }), flat('second', 1400, { capUsd: 1000 })]), s);
});

test('empty venue list or zero amount', () => {
  assert.equal(findOptimalSplit(1000, []).unallocatedUsd, 1000);
  const z = findOptimalSplit(0, [flat('a', 1)]);
  assert.equal(z.netArs, 0);
  assert.equal(z.tranches.length, 0);
});

test('more than 16 fixed-fee/minimum venues is rejected', () => {
  const vs = Array.from({ length: 17 }, (_, i) => flat(`v${i}`, 1000, { minUsd: 1 }));
  assert.throws(() => findOptimalSplit(100, vs), RangeError);
});

test('property: allocations respect caps and sum to the filled amount', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const venues = [
      { id: 'book', preKeep: 0.971, postKeep: 0.994, capUsd: r() * 3000, bids: randomBook(r, { top: 1500 }) },
      flat('a', 1300 + r() * 200, { capUsd: r() * 8000, minUsd: r() * 50 }),
      flat('b', 1300 + r() * 200, { fixedUsd: r() * 30 }),
    ];
    const amount = 1000 + r() * 24000;
    const s = findOptimalSplit(amount, venues);
    for (const t of s.tranches) assert.ok(t.usd <= venues.find((v) => v.id === t.id).capUsd + 1e-6 || !Number.isFinite(venues.find((v) => v.id === t.id).capUsd));
    assert.ok(close(sumUsd(s), s.allocatedUsd, 1e-9));
    assert.ok(close(s.allocatedUsd + s.unallocatedUsd, amount, 1e-9));
    assert.ok(close(s.tranches.reduce((a, t) => a + t.netArs, 0), s.netArs, 1e-9));
  }
});

test('property: split is never worse than the best single venue', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const venues = [
      { id: 'book', preKeep: 0.97, bids: randomBook(r, { top: 1500 }) },
      flat('a', 1350 + r() * 150, { capUsd: 2000 + r() * 6000 }),
      flat('b', 1300 + r() * 150),
    ];
    const s = findOptimalSplit(1000 + r() * 24000, venues);
    if (s.gainVsBestSingleArs != null) assert.ok(s.gainVsBestSingleArs >= -1e-6, `seed ${seed}`);
  }
});

test('property: matches a $1-grid brute-force oracle on two venues', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const r = rng(seed);
    const amount = 200 + Math.floor(r() * 800);
    const a = { id: 'book', preKeep: 0.98, postKeep: 0.995, bids: randomBook(r, { top: 1500, levels: 8 }).map((l) => ({ ...l, amount: l.amount / 20 })) };
    const b = flat('mep', 1380 + r() * 100, { fixedUsd: Math.floor(r() * 3) * 10 });
    const s = findOptimalSplit(amount, [a, b]);
    const oracle = bruteTwo(amount, a, b, 1);
    if (s.unallocatedUsd === 0) assert.ok(s.netArs >= oracle - 1e-6, `seed ${seed}: ${s.netArs} < ${oracle}`);
  }
});

test('property: net ARS is non-decreasing in the withdrawal amount', () => {
  const venues = venuesFromCorridors(DEFAULT_SPLIT_VENUES, M);
  let prev = 0;
  for (let usd = 1000; usd <= 25000; usd += 500) {
    const s = findOptimalSplit(usd, venues);
    assert.ok(s.netArs >= prev);
    prev = s.netArs;
  }
});

test('venuesFromCorridors carries registry fees and tier limits', () => {
  const [bitso] = venuesFromCorridors(['payo_bitso_stacked'], M);
  assert.ok(close(bitso.preKeep, 0.971));
  assert.ok(close(bitso.postKeep, 0.994));
  assert.equal(bitso.capUsd, 1000);
  assert.equal(bitso.minUsd, 10);
  assert.equal(bitso.bids, M.bids);
});

test('venuesFromCorridors applies usage and overrides; unknown ids throw', () => {
  const [b] = venuesFromCorridors(['payo_bitso_stacked'], M, { payo_bitso_stacked: { usedMonthUsd: 5800 } });
  assert.equal(b.capUsd, 200);
  assert.equal(b.capBinding, 'monthly');
  const [w] = venuesFromCorridors(['payo_santander_wire'], M, {}, { payo_santander_wire: { fixedUsd: 25 } });
  assert.equal(w.fixedUsd, 25);
  assert.throws(() => venuesFromCorridors(['nope'], M), /unknown corridor/);
});

test('snapshot $1,000: entire ticket goes to the Bitso book', () => {
  const s = findOptimalSplit(1000, venuesFromCorridors(DEFAULT_SPLIT_VENUES, M), { mepBid: M.mepBid });
  assert.deepEqual(s.tranches.map((t) => t.id), ['payo_bitso_stacked']);
  assert.ok(close(s.netArs, quoteCorridor(corridorById('payo_bitso_stacked'), 1000, M).netArs));
});

test('snapshot $25,000: Bitso and Belo at daily caps, remainder via USD wire', () => {
  const s = findOptimalSplit(25000, venuesFromCorridors(DEFAULT_SPLIT_VENUES, M), { mepBid: M.mepBid });
  assert.equal(byId(s, 'payo_bitso_stacked').usd, 1000);
  assert.equal(byId(s, 'payo_bitso_stacked').binding, 'daily');
  assert.equal(byId(s, 'payo_belo_usdc').usd, 5000);
  assert.ok(close(byId(s, 'payo_santander_wire').usd, 19000));
  assert.equal(byId(s, 'payo_prex_mep'), undefined);
  assert.ok(s.gainVsBestSingleArs > 0);
});

test('snapshot: Bitso tranche net matches the standalone corridor quote', () => {
  const s = findOptimalSplit(7000, venuesFromCorridors(DEFAULT_SPLIT_VENUES, M));
  const t = byId(s, 'payo_bitso_stacked');
  assert.ok(close(t.netArs, quoteCorridor(corridorById('payo_bitso_stacked'), t.usd, M).netArs, 1e-9));
  assert.ok(t.slippagePct >= 0);
});

test('tranche fees: USD-equivalent fee equals gross minus post-fee units', () => {
  const s = findOptimalSplit(1000, [flat('a', 1000, { preKeep: 0.97, postKeep: 0.99, fixedUsd: 10 })]);
  assert.ok(close(s.tranches[0].feesUsd, 1000 - 990 * 0.97 * 0.99));
});
