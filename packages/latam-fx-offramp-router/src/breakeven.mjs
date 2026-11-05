/**
 * USD yield vs. ARS plazo fijo breakeven. Pure functions, rates as decimals (0.2199 = 21.99%).
 *
 * Plazo fijo quotes TNA (simple, 365-day base): r_ARS = TNA · d/365.
 * USD stablecoin yields quote APY (compounded):  r_USD = (1 + APY)^(d/365) − 1.
 * Parking in USD wins only if ARS depreciates more than
 *   f* = (1 + r_ARS) / ((1 + r_USD)(1 − c_in)(1 − c_out)) − 1
 * where c_in / c_out are the ARS→USD and USD→ARS conversion haircuts (MEP spread, fees).
 */

export function tnaToPeriodRate(tna, days = 30) {
  return tna * (days / 365);
}

export function apyToPeriodRate(apy, days = 30) {
  return Math.pow(1 + apy, days / 365) - 1;
}

/** Round-trip haircut implied by buying USD at `venta` and later selling at `compra` (same-day quotes). */
export function roundTripCostFromQuotes(compra, venta) {
  return venta > 0 ? 1 - compra / venta : 0;
}

export function breakevenDepreciation({ tna, apy, days = 30, costIn = 0, costOut = 0 }) {
  const rArs = tnaToPeriodRate(tna, days);
  const rUsd = apyToPeriodRate(apy, days);
  return (1 + rArs) / ((1 + rUsd) * (1 - costIn) * (1 - costOut)) - 1;
}

/** End-of-period ARS value of 1 ARS under each strategy, for a realized depreciation `f`. */
export function compareOutcomes({ tna, apy, days = 30, costIn = 0, costOut = 0, f }) {
  const ars = 1 + tnaToPeriodRate(tna, days);
  const usd = (1 - costIn) * (1 + apyToPeriodRate(apy, days)) * (1 + f) * (1 - costOut);
  return { ars, usd, winner: usd > ars ? 'usd' : usd < ars ? 'ars' : 'tie', edgePct: (usd / ars - 1) * 100 };
}

/** Grid of f* for every (tna, apy) pair: rows follow `tnas`, columns follow `apys`. */
export function breakevenMatrix(tnas, apys, opts = {}) {
  return tnas.map((tna) => apys.map((apy) => breakevenDepreciation({ ...opts, tna, apy })));
}

/** Market-implied depreciation over the futures tenor: F/S − 1 (e.g. A3/ROFEX month-end DLR). */
export function impliedDepreciation(spot, future) {
  return spot > 0 ? future / spot - 1 : null;
}

/** Rescale a depreciation from `fromDays` to `toDays` assuming a constant compounded rate. */
export function rescaleDepreciation(f, fromDays, toDays = 30) {
  return Math.pow(1 + f, toDays / fromDays) - 1;
}
