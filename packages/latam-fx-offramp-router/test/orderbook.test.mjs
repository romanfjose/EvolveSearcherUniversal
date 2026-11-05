import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBook, walkOrderBook, bookDepth, depthWithin, maxSizeForSlippage,
  slippageCurve, cumulativeDepth, reshapeBook,
} from '../src/orderbook.mjs';
import { walkOrderBook as cliWalk } from '../check-routes.mjs';
import { rng, randomBook, close, SEEDS } from './helpers.mjs';

const BOOK = [
  { price: '1500.00', amount: '100' },
  { price: '1498.00', amount: '200' },
  { price: '1495.00', amount: '300' },
];

test('normalizeBook parses Bitso numeric strings', () => {
  assert.deepEqual(normalizeBook(BOOK)[0], { price: 1500, amount: 100 });
});

test('normalizeBook drops zero, negative and non-numeric levels', () => {
  const b = normalizeBook([{ price: 'x', amount: 1 }, { price: 10, amount: 0 }, { price: -1, amount: 5 }, { price: 9, amount: 2 }, null]);
  assert.deepEqual(b, [{ price: 9, amount: 2 }]);
});

test('normalizeBook sorts bids best (highest) first', () => {
  const b = normalizeBook([{ price: 1, amount: 1 }, { price: 3, amount: 1 }, { price: 2, amount: 1 }]);
  assert.deepEqual(b.map((l) => l.price), [3, 2, 1]);
});

test('normalizeBook sorts asks best (lowest) first', () => {
  const b = normalizeBook([{ price: 3, amount: 1 }, { price: 1, amount: 1 }, { price: 2, amount: 1 }], 'asks');
  assert.deepEqual(b.map((l) => l.price), [1, 2, 3]);
});

test('walk: exact fill of the top level has zero slippage', () => {
  const w = walkOrderBook(BOOK, 100);
  assert.equal(w.filled, 100);
  assert.equal(w.vwap, 1500);
  assert.equal(w.slippagePct, 0);
  assert.equal(w.complete, true);
});

test('walk: partial fill inside a level', () => {
  const w = walkOrderBook(BOOK, 40);
  assert.equal(w.grossArs, 60000);
  assert.equal(w.levelsConsumed, 1);
});

test('walk: VWAP across levels is the exact weighted average', () => {
  const w = walkOrderBook(BOOK, 250);
  assert.equal(w.grossArs, 100 * 1500 + 150 * 1498);
  assert.ok(close(w.vwap, (150000 + 224700) / 250));
  assert.equal(w.levelsConsumed, 2);
  assert.equal(w.worstPrice, 1498);
});

test('walk: thin liquidity leaves an unfilled remainder', () => {
  const w = walkOrderBook(BOOK, 1000);
  assert.equal(w.filled, 600);
  assert.equal(w.unfilled, 400);
  assert.equal(w.complete, false);
  assert.equal(w.levelsConsumed, 3);
});

test('walk: empty book fills nothing and reports zero VWAP', () => {
  const w = walkOrderBook([], 50);
  assert.deepEqual([w.filled, w.unfilled, w.vwap, w.grossArs, w.slippagePct], [0, 50, 0, 0, 0]);
});

test('walk: zero, negative and NaN targets are no-ops', () => {
  for (const q of [0, -5, NaN]) {
    const w = walkOrderBook(BOOK, q);
    assert.equal(w.filled, 0);
    assert.equal(w.unfilled, 0);
    assert.equal(w.complete, true);
  }
});

test('walk: unsorted input is normalized before walking', () => {
  const shuffled = [BOOK[2], BOOK[0], BOOK[1]];
  assert.deepEqual(walkOrderBook(shuffled, 250), walkOrderBook(BOOK, 250));
});

test('walk: presorted=true trusts the caller order', () => {
  const book = [{ price: 1, amount: 10 }, { price: 2, amount: 10 }];
  assert.equal(walkOrderBook(book, 10, { presorted: true }).vwap, 1);
  assert.equal(walkOrderBook(book, 10).vwap, 2);
});

test('walk: target equal to total depth completes despite float dust', () => {
  const book = [{ price: 10, amount: 0.1 }, { price: 9, amount: 0.2 }];
  const w = walkOrderBook(book, 0.1 + 0.2);
  assert.equal(w.complete, true);
  assert.equal(w.unfilled, 0);
});

test('walk: asks side reports positive slippage when buying', () => {
  const asks = [{ price: 100, amount: 1 }, { price: 110, amount: 1 }];
  const w = walkOrderBook(asks, 2, { side: 'asks' });
  assert.equal(w.vwap, 105);
  assert.ok(close(w.slippagePct, 5));
});

test('walk: bids slippage is (1 - vwap/best)·100', () => {
  const w = walkOrderBook(BOOK, 600);
  assert.ok(close(w.slippagePct, (1 - w.vwap / 1500) * 100));
});

test('check-routes re-exports the same walkOrderBook (back-compat)', () => {
  assert.equal(cliWalk, walkOrderBook);
});

test('bookDepth sums resting quantity', () => {
  assert.equal(bookDepth(BOOK), 600);
});

test('depthWithin includes levels exactly on the band edge', () => {
  assert.equal(depthWithin(BOOK, 0), 100);
  assert.equal(depthWithin(BOOK, (1 - 1498 / 1500) * 100), 300);
  assert.equal(depthWithin([], 1), 0);
});

test('maxSizeForSlippage: zero tolerance returns the top level', () => {
  assert.equal(maxSizeForSlippage(BOOK, 0), 100);
});

test('maxSizeForSlippage: generous tolerance returns full depth', () => {
  assert.equal(maxSizeForSlippage(BOOK, 50), 600);
  assert.equal(maxSizeForSlippage([], 1), 0);
});

test('property: maxSizeForSlippage is the exact inverse of walk slippage', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const book = randomBook(r);
    const s = r() * 0.5;
    const q = maxSizeForSlippage(book, s);
    const w = walkOrderBook(book, q);
    if (q < bookDepth(book) - 1e-6) assert.ok(close(w.slippagePct, s, 1e-7), `seed ${seed}`);
    assert.ok(w.slippagePct <= s + 1e-7, `seed ${seed}`);
  }
});

test('property: VWAP lies between worst consumed and best price', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const book = randomBook(r);
    const w = walkOrderBook(book, r() * bookDepth(book) * 1.2);
    if (w.filled === 0) continue;
    assert.ok(w.vwap <= w.bestPrice + 1e-9 && w.vwap >= w.worstPrice - 1e-9, `seed ${seed}`);
  }
});

test('property: slippage curve is monotone non-decreasing in size', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const book = randomBook(r);
    const depth = bookDepth(book);
    const curve = slippageCurve(book, Array.from({ length: 40 }, (_, i) => (depth * (i + 1)) / 40));
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i].slippagePct >= curve[i - 1].slippagePct - 1e-9, `seed ${seed}`);
  }
});

test('property: proceeds are concave (marginal price never rises)', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const book = randomBook(r);
    const step = bookDepth(book) / 25;
    let prev = Infinity;
    for (let q = step; q <= bookDepth(book); q += step) {
      const m = walkOrderBook(book, q).grossArs - walkOrderBook(book, q - step).grossArs;
      assert.ok(m <= prev + 1e-6, `seed ${seed}`);
      prev = m;
    }
  }
});

test('property: filled + unfilled always equals the target', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const book = randomBook(r);
    const t = r() * 2 * bookDepth(book);
    const w = walkOrderBook(book, t);
    assert.ok(close(w.filled + w.unfilled, t), `seed ${seed}`);
  }
});

test('cumulativeDepth ends at total qty and total quote', () => {
  const c = cumulativeDepth(BOOK);
  assert.equal(c.length, 3);
  assert.equal(c.at(-1).cumQty, 600);
  assert.equal(c.at(-1).cumQuote, walkOrderBook(BOOK, 600).grossArs);
});

test('reshapeBook re-centres top-of-book and scales depth, preserving relative spacing', () => {
  const b = reshapeBook(BOOK, { bestPrice: 3000, depthMult: 2 });
  assert.equal(b[0].price, 3000);
  assert.ok(close(b[2].price / b[0].price, 1495 / 1500));
  assert.equal(b[1].amount, 400);
  assert.deepEqual(reshapeBook([], { bestPrice: 1 }), []);
});
