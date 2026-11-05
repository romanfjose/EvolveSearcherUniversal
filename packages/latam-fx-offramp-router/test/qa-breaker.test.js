/**
 * Sovereign Core — Helmet 03: Synthetic José QA ("Where's the Bathroom?" Breaker)
 * Stress test suite for latam-fx-offramp-router.
 *
 * Attacks edge scenarios that standard happy-path mocks gloss over:
 *   [Angle 1] Extreme FX Spread Spikes & Flash Devaluations / Crashes
 *   [Angle 2] Stale, Degraded, and Inverted Order Books
 *   [Angle 3] Zero-Liquidity Legs, Ghost Depths & Float Dust Shortfalls
 *   [Angle 4] Negative Fee Injection, Rebate Smuggling & Free Money Exploits
 *   [Angle 5] High-Stress Adversarial Concurrency & Fuzzing Invariants
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBook,
  walkOrderBook,
  bookDepth,
  depthWithin,
  maxSizeForSlippage,
  slippageCurve,
  cumulativeDepth,
  reshapeBook,
} from '../src/orderbook.mjs';

import {
  keepFactor,
  stackedHaircutPct,
  applyLegs,
  breakevenPriceRatio,
  parityThresholds,
  flatPrice,
  quoteCorridor,
  quoteAll,
  corridorById,
  CORRIDORS,
} from '../src/corridors.mjs';

import {
  findOptimalSplit,
  remainingCapacity,
  venuesFromCorridors,
  DEFAULT_SPLIT_VENUES,
} from '../src/split.mjs';

import {
  tnaToPeriodRate,
  apyToPeriodRate,
  breakevenDepreciation,
  compareOutcomes,
  breakevenMatrix,
  impliedDepreciation,
  rescaleDepreciation,
  roundTripCostFromQuotes,
} from '../src/breakeven.mjs';

import { marketFromRaw } from '../src/market.mjs';
import { SNAPSHOT } from '../src/snapshot.mjs';

// Deterministic helper
function lcg(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Helmet 03 [Angle 1]: Extreme FX Spread Spikes & Flash Crashes', () => {
  test('massive 99.9% spread flash crash: best bid collapses to fraction of cent', () => {
    // Normal ask at 1500, but bids flash crash to 0.0001
    const crashedBids = [
      { price: 0.001, amount: 500000 },
      { price: 0.0001, amount: 1000000 },
    ];
    const w = walkOrderBook(crashedBids, 1000);
    assert.equal(w.filled, 1000);
    assert.ok(w.vwap > 0 && Number.isFinite(w.vwap), 'VWAP must remain positive and finite');
    assert.equal(w.grossArs, 1.0); // 1000 * 0.001
    assert.equal(w.slippagePct, 0); // Single level filled, 0% slippage against top bid
  });

  test('hyperinflation runaway: price at 1e12 ARS/USD does not overflow to Infinity or NaN', () => {
    const hyperBids = [
      { price: 1e12, amount: 50 },
      { price: 9e11, amount: 50 },
    ];
    const w = walkOrderBook(hyperBids, 100);
    assert.equal(w.complete, true);
    assert.ok(Number.isFinite(w.grossArs));
    assert.equal(w.grossArs, 50 * 1e12 + 50 * 9e11);
    assert.equal(w.vwap, 9.5e11);
    assert.ok(Number.isFinite(w.slippagePct));
    assert.ok(w.slippagePct > 0 && w.slippagePct < 100);
  });

  test('parityThresholds with extreme inverted MEP vs CCL spread (CCL at 10x MEP or MEP at 10x CCL)', () => {
    // Flash divergence: CCL = 15,000, MEP = 1,500
    const runawayCcl = parityThresholds({ mep: 1500, ccl: 15000, bid: 14900, keep: 0.965 });
    assert.equal(runawayCcl.cclMepSpreadPct, 900); // 900% spread
    assert.equal(runawayCcl.cryptoBeatsMepAtBid, true);
    assert.ok(runawayCcl.headroomPct > 800);

    // Inverted scenario: MEP = 2,000, CCL = 1,000, bid = 1,000
    const inverted = parityThresholds({ mep: 2000, ccl: 1000, bid: 1000, keep: 0.965 });
    assert.equal(inverted.cclMepSpreadPct, -50);
    assert.equal(inverted.cryptoBeatsMepAtBid, false);
    assert.ok(inverted.headroomPct < 0);
  });

  test('roundTripCostFromQuotes with inverted quotes (compra > venta) returns negative cost without crashing', () => {
    // When market is crossed or arb opportunity exists: compra 1600, venta 1500
    const cost = roundTripCostFromQuotes(1600, 1500);
    assert.ok(Number.isFinite(cost));
    assert.ok(cost < 0, 'Negative round-trip cost indicates negative spread / arb');
    assert.ok(Math.abs(cost - (1 - 1600 / 1500)) < 1e-12);
  });

  test('breakevenDepreciation with extreme hyper-yield rates (TNA 500%, APY 1000%)', () => {
    const fStar = breakevenDepreciation({ tna: 5.0, apy: 10.0, days: 30 });
    assert.ok(Number.isFinite(fStar));
    // TNA simple interest (5.0 * 30 / 365 = 41.1%) vs APY compounded (11^(30/365) - 1 = 21.8%)
    // Since ARS period rate exceeds USD period rate, breakeven depreciation f* > 0
    assert.ok(fStar > 0);
    const outcome = compareOutcomes({ tna: 5.0, apy: 10.0, days: 30, f: fStar });
    assert.ok(Math.abs(outcome.edgePct) < 1e-6);

    // Conversely, when APY heavily out-yields TNA (e.g., TNA 10%, APY 5000%), f* must be negative
    const fStarNeg = breakevenDepreciation({ tna: 0.1, apy: 50.0, days: 30 });
    assert.ok(Number.isFinite(fStarNeg));
    assert.ok(fStarNeg < 0);
    const outcomeNeg = compareOutcomes({ tna: 0.1, apy: 50.0, days: 30, f: fStarNeg });
    assert.ok(Math.abs(outcomeNeg.edgePct) < 1e-6);
  });
});

describe('Helmet 03 [Angle 2]: Stale, Degraded & Inverted Order Books', () => {
  test('stale market with null/undefined/missing fields in marketFromRaw', () => {
    const corrupt = {
      meta: { stamp: '1970-01-01T00:00:00.000Z', source: 'corrupted' },
      bitsoBook: null,
      dolares: [
        { casa: 'bolsa', compra: null, venta: undefined },
        { casa: 'contadoconliqui', compra: 'invalid-number' },
      ],
      criptoyaUsdt: {
        bitsoalpha: { totalBid: '0' },
        fiwind: null,
      },
      criptoyaUsdc: null,
    };
    const m = marketFromRaw(corrupt);
    assert.equal(m.mepBid, 0);
    assert.equal(m.cclBid, 0);
    assert.deepEqual(m.bids, []);
    assert.deepEqual(m.asks, []);
    assert.equal(m.topVenue, null);

    // Corridors quoting against degraded market should produce 0 netArs gracefully without crashing
    const q = quoteCorridor(corridorById('payo_bitso_stacked'), 1000, m);
    assert.equal(q.netArs, 0);
    assert.equal(q.unfilledUnits, 1000 * keepFactor([2.9]));
  });

  test('book with duplicate price levels preserves exact volume and preserves stability', () => {
    const dupeBids = [
      { price: 1500, amount: 100 },
      { price: 1500, amount: 200 },
      { price: 1500, amount: 300 },
    ];
    const norm = normalizeBook(dupeBids);
    assert.equal(norm.length, 3);
    const w = walkOrderBook(norm, 550);
    assert.equal(w.filled, 550);
    assert.equal(w.vwap, 1500);
    assert.equal(w.grossArs, 550 * 1500);
    assert.equal(w.slippagePct, 0);
  });

  test('book with inverted or negative prices and amounts is sanitized cleanly', () => {
    const dirtyBids = [
      { price: -100, amount: 50 },
      { price: 0, amount: 50 },
      { price: 1500, amount: -10 },
      { price: 'NaN', amount: 50 },
      { price: 1450, amount: 'Infinity' }, // Non-finite amount must be dropped
      { price: 1400, amount: 100 },
      { price: 1500, amount: 50 },
    ];
    const norm = normalizeBook(dirtyBids);
    assert.equal(norm.length, 2);
    assert.equal(norm[0].price, 1500);
    assert.equal(norm[0].amount, 50);
    assert.equal(norm[1].price, 1400);
    assert.equal(norm[1].amount, 100);
  });

  test('reshapeBook on single-level book or zero depth multiplier', () => {
    const single = [{ price: 1000, amount: 10 }];
    const reshapedZero = reshapeBook(single, { bestPrice: 2000, depthMult: 0 });
    assert.equal(reshapedZero[0].price, 2000);
    assert.equal(reshapedZero[0].amount, 0);

    const reshapedSame = reshapeBook(single, { bestPrice: 1000, depthMult: 1 });
    assert.deepEqual(reshapedSame, [{ price: 1000, amount: 10 }]);
  });
});

describe('Helmet 03 [Angle 3]: Zero-Liquidity Legs, Ghost Depths & Shortfalls', () => {
  test('book with exactly 0 total depth reports complete=false and 100% unfilled', () => {
    const emptyBook = [];
    assert.equal(bookDepth(emptyBook), 0);
    assert.equal(depthWithin(emptyBook, 1.0), 0);
    assert.equal(maxSizeForSlippage(emptyBook, 5.0), 0);
    assert.deepEqual(cumulativeDepth(emptyBook), []);

    const w = walkOrderBook(emptyBook, 500);
    assert.equal(w.filled, 0);
    assert.equal(w.unfilled, 500);
    assert.equal(w.complete, false);
    assert.equal(w.vwap, 0);
    assert.equal(w.grossArs, 0);
  });

  test('optimal split when all venues have 0 capacity reports 100% unallocated', () => {
    const venues = [
      { id: 'v1', price: 1500, capUsd: 0 },
      { id: 'v2', price: 1400, capUsd: 0 },
    ];
    const split = findOptimalSplit(1000, venues);
    assert.equal(split.amountUsd, 1000);
    assert.equal(split.allocatedUsd, 0);
    assert.equal(split.unallocatedUsd, 1000);
    assert.equal(split.netArs, 0);
    assert.equal(split.tranches.length, 0);
  });

  test('venue whose minimum ticket exceeds available book liquidity is rejected or skipped', () => {
    // Venue b has minUsd: 500, but only 100 depth in bids
    const venues = [
      { id: 'shallow', minUsd: 500, bids: [{ price: 1500, amount: 100 }] },
      { id: 'flatFallback', price: 1300 },
    ];
    const s = findOptimalSplit(600, venues);
    // shallow cannot satisfy its minimum ticket because depth is only 100
    assert.equal(s.tranches.find((t) => t.id === 'shallow'), undefined);
    assert.equal(s.tranches.find((t) => t.id === 'flatFallback')?.usd, 600);
    assert.equal(s.netArs, 600 * 1300);
  });

  test('floating-point microscopic dust targets do not leave phantom fractions', () => {
    const book = [{ price: 1500, amount: 1000 }];
    const target = 1e-12;
    const w = walkOrderBook(book, target);
    assert.ok(w.filled <= 1e-12);
    assert.equal(w.complete, true);
    assert.ok(Number.isFinite(w.grossArs));
  });

  test('remainingCapacity with negative usage (overflow/refund state) floors gracefully', () => {
    const cap = remainingCapacity({ dailyUsd: 1000, monthlyUsd: 5000 }, { usedTodayUsd: -50, usedMonthUsd: -200 });
    // daily limit binds at 1050 if negative usage adds back capacity
    assert.ok(cap.cap >= 1000);
    assert.ok(Number.isFinite(cap.cap));
  });
});

describe('Helmet 03 [Angle 4]: Negative Fee Injection, Rebate Smuggling & Free Money Exploits', () => {
  test('negative percentage fee injection in keepFactor creates multiplier > 1', () => {
    // A negative fee is a rebate / subsidy: -5% fee means 1 - (-0.05) = 1.05 keep factor
    const rebateKeep = keepFactor([-5]);
    assert.equal(rebateKeep, 1.05);
    const stackedRebate = keepFactor([2.9, -1.0]);
    assert.ok(Math.abs(stackedRebate - (0.971 * 1.01)) < 1e-12);
  });

  test('applyLegs with negative fixed fee acts as bonus without crashing', () => {
    // Attack: what if an attacker passes negative fixed fee { fixed: -50 }?
    // cur - fee => fee is Math.min(cur, cur * pct + fixed).
    const r = applyLegs(100, [{ label: 'negativeFixed', pct: 0, fixed: -50 }]);
    assert.ok(Number.isFinite(r.net));
    assert.ok(Number.isFinite(r.totalFee));
    assert.equal(r.net + r.totalFee, 100);
  });

  test('applyLegs with 100% or >100% fee drains entire amount to 0, never negative', () => {
    const drained = applyLegs(1000, [{ label: 'vampire', pct: 150 }]);
    assert.equal(drained.net, 0);
    assert.equal(drained.totalFee, 1000);
    assert.equal(drained.effectivePct, 100);

    const drainedFixed = applyLegs(50, [{ label: 'fixedGouge', fixed: 200 }]);
    assert.equal(drainedFixed.net, 0);
    assert.equal(drainedFixed.totalFee, 50);
  });

  test('split optimizer with negative fixed fee is bounded by caps and does not generate infinite ARS', () => {
    const venues = [
      { id: 'normal', price: 1400, capUsd: 1000 },
      { id: 'bribe', price: 1400, capUsd: 1000, fixedUsd: -50 }, // -50 fixed fee
    ];
    const s = findOptimalSplit(1500, venues);
    assert.ok(Number.isFinite(s.netArs));
    assert.ok(s.allocatedUsd <= 1500 + 1e-6);
  });

  test('corridor quoting with extreme 99% stacked fees', () => {
    const customDef = {
      id: 'ruinous_corridor',
      group: 'adversarial',
      name: '99% fee corridor',
      pre: [{ label: 'pre90', pct: 90 }],
      post: [{ label: 'post90', pct: 90 }],
      price: 'mep',
      limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity },
    };
    const m = marketFromRaw(SNAPSHOT);
    const q = quoteCorridor(customDef, 1000, m);
    // keep = 0.1 * 0.1 = 0.01 (1%)
    assert.ok(Math.abs(q.haircutPct - 99.0) < 1e-9);
    assert.ok(Math.abs(q.netArs - (1000 * 0.01 * m.mepBid)) < 1e-6);
    assert.ok(q.effRate < m.mepBid * 0.02);
  });
});

describe('Helmet 03 [Angle 5]: High-Stress Adversarial Fuzzing & Invariants', () => {
  test('fuzz walkOrderBook with randomized dirty price-amount levels', () => {
    const rand = lcg(424242);
    for (let iter = 0; iter < 100; iter++) {
      const levelCount = Math.floor(rand() * 50);
      const rawLevels = [];
      for (let j = 0; j < levelCount; j++) {
        // Randomly introduce weird strings, negative numbers, zeros, NaNs
        const rType = rand();
        if (rType < 0.1) rawLevels.push({ price: 'NaN', amount: 100 });
        else if (rType < 0.2) rawLevels.push({ price: -rand() * 100, amount: rand() * 50 });
        else if (rType < 0.3) rawLevels.push({ price: 1000 + rand() * 500, amount: 0 });
        else if (rType < 0.4) rawLevels.push(null);
        else rawLevels.push({ price: 1000 + rand() * 500, amount: rand() * 1000 });
      }

      const target = rand() * 10000;
      const w = walkOrderBook(rawLevels, target);
      assert.ok(Number.isFinite(w.filled), `filled must be finite at iter ${iter}`);
      assert.ok(Number.isFinite(w.unfilled), `unfilled must be finite at iter ${iter}`);
      assert.ok(Number.isFinite(w.vwap), `vwap must be finite at iter ${iter}`);
      assert.ok(Number.isFinite(w.grossArs), `grossArs must be finite at iter ${iter}`);
      assert.ok(Number.isFinite(w.slippagePct), `slippagePct must be finite at iter ${iter}`);
      assert.ok(w.filled >= 0, `filled >= 0 at iter ${iter}`);
      assert.ok(w.unfilled >= 0, `unfilled >= 0 at iter ${iter}`);
      assert.ok(w.filled <= target + 1e-6, `filled <= target at iter ${iter}`);
    }
  });

  test('fuzz findOptimalSplit with extreme erratic caps and minimums', () => {
    const rand = lcg(888888);
    for (let iter = 0; iter < 50; iter++) {
      const venues = [
        {
          id: 'v_book',
          preKeep: 0.95 + rand() * 0.05,
          postKeep: 0.95 + rand() * 0.05,
          capUsd: rand() * 5000,
          bids: [
            { price: 1400 + rand() * 200, amount: rand() * 2000 },
            { price: 1300 + rand() * 100, amount: rand() * 2000 },
          ],
        },
        {
          id: 'v_fixed',
          price: 1350 + rand() * 150,
          capUsd: rand() * 10000,
          fixedUsd: rand() * 100,
          minUsd: rand() * 500,
        },
        {
          id: 'v_flat',
          price: 1300 + rand() * 150,
          capUsd: rand() * 10000,
        },
      ];

      const ticket = rand() * 15000;
      const s = findOptimalSplit(ticket, venues);
      assert.ok(Number.isFinite(s.allocatedUsd));
      assert.ok(Number.isFinite(s.unallocatedUsd));
      assert.ok(Number.isFinite(s.netArs));
      assert.ok(s.allocatedUsd <= ticket + 1e-6);
      assert.ok(Math.abs((s.allocatedUsd + s.unallocatedUsd) - ticket) < 1e-6);
    }
  });

  test('breakevenMatrix with zero or negative APY/TNA inputs', () => {
    const tnas = [0, -0.05, 0.2];
    const apys = [-0.02, 0, 0.05];
    const m = breakevenMatrix(tnas, apys);
    assert.equal(m.length, 3);
    assert.equal(m[0].length, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assert.ok(Number.isFinite(m[r][c]), `matrix value at [${r}][${c}] must be finite`);
      }
    }
  });

  test('quoteAll with snapshot and adversarial ticket values: 0, 1e-9, 1e8', () => {
    const m = marketFromRaw(SNAPSHOT);
    for (const usd of [0, 1e-9, 1e8]) {
      const quotes = quoteAll(usd, m);
      assert.equal(quotes.length, CORRIDORS.length);
      for (const q of quotes) {
        assert.ok(Number.isFinite(q.netArs), `netArs must be finite for usd=${usd}`);
        assert.ok(Number.isFinite(q.effRate), `effRate must be finite for usd=${usd}`);
        assert.ok(q.netArs >= 0, `netArs >= 0 for usd=${usd}`);
      }
    }
  });
});
