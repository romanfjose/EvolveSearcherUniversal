/**
 * Order-book math. Pure functions, no I/O.
 * A level is { price, amount } (numbers or numeric strings, as Bitso returns them).
 * `side: 'bids'` sorts best (highest) first — you are selling base into bids.
 * `side: 'asks'` sorts best (lowest) first — you are buying base from asks.
 */

const EPS = 1e-9;

export function normalizeBook(levels = [], side = 'bids') {
  const out = [];
  for (const l of levels) {
    const price = Number(l?.price);
    const amount = Number(l?.amount);
    if (Number.isFinite(price) && Number.isFinite(amount) && price > 0 && amount > 0) {
      out.push({ price, amount });
    }
  }
  out.sort(side === 'asks' ? (a, b) => a.price - b.price : (a, b) => b.price - a.price);
  return out;
}

/**
 * Walk a book for `targetQty` base units.
 * Returns quote proceeds (`grossArs` for usdt_ars), VWAP, fill status and
 * slippage of the VWAP vs. the top-of-book price (positive = worse for you).
 */
export function walkOrderBook(levels, targetQty, { side = 'bids', presorted = false } = {}) {
  const book = presorted ? levels : normalizeBook(levels, side);
  const target = Math.max(0, Number(targetQty) || 0);
  let remaining = target;
  let gross = 0;
  let levelsConsumed = 0;
  let worstPrice = 0;
  for (const { price, amount } of book) {
    if (remaining <= EPS) break;
    const take = Math.min(remaining, amount);
    gross += take * price;
    remaining -= take;
    levelsConsumed += 1;
    worstPrice = price;
  }
  if (remaining < EPS) remaining = 0;
  const filled = target - remaining;
  const bestPrice = book.length ? book[0].price : 0;
  const vwap = filled > 0 ? gross / filled : 0;
  const slippagePct = filled > 0 && bestPrice > 0
    ? (side === 'asks' ? vwap / bestPrice - 1 : 1 - vwap / bestPrice) * 100
    : 0;
  return {
    filled,
    unfilled: remaining,
    complete: remaining === 0,
    vwap,
    grossArs: gross,
    bestPrice,
    worstPrice,
    levelsConsumed,
    slippagePct,
  };
}

/** Total base quantity resting in the book. */
export function bookDepth(levels, side = 'bids') {
  return normalizeBook(levels, side).reduce((s, l) => s + l.amount, 0);
}

/** Base quantity available within `pct` % of top-of-book. */
export function depthWithin(levels, pct, side = 'bids') {
  const book = normalizeBook(levels, side);
  if (!book.length) return 0;
  const best = book[0].price;
  const limit = side === 'asks' ? best * (1 + pct / 100) : best * (1 - pct / 100);
  let q = 0;
  for (const l of book) {
    if (side === 'asks' ? l.price > limit + EPS : l.price < limit - EPS) break;
    q += l.amount;
  }
  return q;
}

/** Largest size whose VWAP slippage stays ≤ `maxSlippagePct` (exact, piecewise-linear inverse). */
export function maxSizeForSlippage(levels, maxSlippagePct, side = 'bids') {
  const book = normalizeBook(levels, side);
  if (!book.length) return 0;
  const best = book[0].price;
  const sgn = side === 'asks' ? 1 : -1;
  // Constraint: Σ q_i (p_i - target) * sgn ≤ 0 where target = best(1 + sgn·s)
  const target = best * (1 + sgn * (maxSlippagePct / 100));
  let qty = 0;
  let slack = 0; // Σ q_i (target - p_i)·(-sgn) → must stay ≥ 0
  for (const { price, amount } of book) {
    const perUnit = (target - price) * sgn; // ≥ 0 while level is inside the band
    if (slack + perUnit * amount >= -EPS) {
      slack += perUnit * amount;
      qty += amount;
    } else {
      return qty + (perUnit < 0 ? slack / -perUnit : 0);
    }
  }
  return qty;
}

/** Sample VWAP/slippage at each size in `sizes` (for depth & slippage curves). */
export function slippageCurve(levels, sizes, side = 'bids') {
  const book = normalizeBook(levels, side);
  return sizes.map((qty) => {
    const w = walkOrderBook(book, qty, { side, presorted: true });
    return { qty, vwap: w.vwap, slippagePct: w.slippagePct, filled: w.filled, complete: w.complete };
  });
}

/** Cumulative depth steps: [{ price, cumQty, cumQuote }]. */
export function cumulativeDepth(levels, side = 'bids') {
  let cumQty = 0;
  let cumQuote = 0;
  return normalizeBook(levels, side).map(({ price, amount }) => {
    cumQty += amount;
    cumQuote += amount * price;
    return { price, cumQty, cumQuote };
  });
}

/** Re-center and re-scale a book: shift so top-of-book = `bestPrice`, multiply sizes by `depthMult`. */
export function reshapeBook(levels, { bestPrice, depthMult = 1, side = 'bids' } = {}) {
  const book = normalizeBook(levels, side);
  if (!book.length) return [];
  const k = bestPrice ? bestPrice / book[0].price : 1;
  return book.map(({ price, amount }) => ({ price: price * k, amount: amount * depthMult }));
}
