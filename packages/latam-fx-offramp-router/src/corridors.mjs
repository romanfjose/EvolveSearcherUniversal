/**
 * Corridor fee stacking, corridor registry, quoting and MEP/CCL parity thresholds.
 * Pure functions, no I/O. Fee sources: ../README.md §1 (primary links there).
 *
 * Fee legs compound multiplicatively: keep = Π(1 − pᵢ). 2.9% then 0.6% keeps
 * 0.971 × 0.994 = 0.965174, i.e. a 3.4826% effective haircut — not 3.5%.
 */

import { walkOrderBook } from './orderbook.mjs';

/** Fraction kept after percentage legs (pcts in %, e.g. [2.9, 0.6]). */
export function keepFactor(pcts = []) {
  return pcts.reduce((k, p) => k * (1 - p / 100), 1);
}

/** Effective stacked haircut in % for percentage legs. */
export function stackedHaircutPct(pcts = []) {
  return (1 - keepFactor(pcts)) * 100;
}

/**
 * Apply ordered legs { label, pct = 0, fixed = 0 } to an amount.
 * Each leg charges pct of its input plus a fixed fee, floored at zero.
 */
export function applyLegs(amount, legs = []) {
  let cur = Math.max(0, Number(amount) || 0);
  const steps = [];
  for (const { label = '', pct = 0, fixed = 0 } of legs) {
    const fee = Math.min(cur, cur * (pct / 100) + fixed);
    steps.push({ label, before: cur, fee, after: cur - fee });
    cur -= fee;
  }
  const gross = Math.max(0, Number(amount) || 0);
  return { net: cur, totalFee: gross - cur, effectivePct: gross > 0 ? (1 - cur / gross) * 100 : 0, steps };
}

/** Fee-only ratio route B must be beaten by: bid must exceed (keepB / keepA) × B's reference price. */
export function breakevenPriceRatio(keepA, keepB = 1) {
  return keepB / keepA;
}

/**
 * MEP/CCL parity thresholds for a crypto route that keeps `keep` of the USD and sells at `bid`.
 * USDT tracks CCL, not MEP; the crypto rail wins only while bid·keep > MEP.
 */
export function parityThresholds({ mep, ccl, bid, keep }) {
  const minBid = mep / keep;
  return {
    keep,
    minBidToBeatMep: minBid,
    requiredPremiumVsMepPct: (1 / keep - 1) * 100,
    cclMepSpreadPct: mep > 0 && ccl > 0 ? (ccl / mep - 1) * 100 : null,
    bidVsMepPct: mep > 0 && bid > 0 ? (bid / mep - 1) * 100 : null,
    bidVsCclPct: ccl > 0 && bid > 0 ? (bid / ccl - 1) * 100 : null,
    cryptoBeatsMepAtBid: bid > 0 ? bid * keep > mep : null,
    cryptoBeatsMepAtCcl: ccl > 0 ? ccl * keep > mep : null,
    headroomPct: bid > 0 && mep > 0 ? ((bid * keep) / mep - 1) * 100 : null,
  };
}

const PAYONEER_BITSO_LIMITS = { minUsd: 10, dailyUsd: 1000, monthlyUsd: 6000 };
const BELO_LIMITS = { minUsd: 5, dailyUsd: 5000, monthlyUsd: 20000 };

/**
 * Corridor registry (data only). `price` names the ARS price source:
 *   'book'      walk Bitso usdt_ars bids with the post-pre-fee USDT quantity
 *   'mep'       DolarAPI MEP (bolsa) compra
 *   'venue:x'   CriptoYa totalBid for venue x (best of USDT/USDC)
 *   'topVenue'  best CriptoYa totalBid across venues
 * `pre` legs are charged in USD before pricing, `post` legs in ARS after.
 * Limit figures without a cited source are `Infinity` — set real ones per account.
 */
export const CORRIDORS = Object.freeze([
  { id: 'payo_bitso_inclusive', group: 'payoneer', name: 'Payoneer → Bitso book (2.9%, if inclusive)',
    pre: [{ label: 'Payoneer→Bitso', pct: 2.9 }], post: [], price: 'book', limits: PAYONEER_BITSO_LIMITS },
  { id: 'payo_bitso_stacked', group: 'payoneer', name: 'Payoneer → Bitso book (2.9% + 0.6% taker)',
    pre: [{ label: 'Payoneer→Bitso', pct: 2.9 }], post: [{ label: 'Bitso ARS taker', pct: 0.6 }], price: 'book', limits: PAYONEER_BITSO_LIMITS },
  { id: 'payo_santander_wire', group: 'payoneer', name: 'Payoneer → Santander USD wire (3.3%) → MEP',
    pre: [{ label: 'Payoneer→bank', pct: 3.3 }], post: [{ label: 'MEP bond leg (assumed)', pct: 0.5 }], price: 'mep',
    limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity } },
  { id: 'payo_prex_mep', group: 'payoneer', name: 'Payoneer → Prex (3.8% @ MEP compra)',
    pre: [{ label: 'Payoneer→Prex', pct: 3.8 }], post: [], price: 'mep',
    limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity } },
  { id: 'payo_belo_usdc', group: 'payoneer', name: 'Payoneer → Belo (4.0% + in-app bid)',
    pre: [{ label: 'Payoneer→Belo', pct: 4.0 }], post: [], price: 'venue:belo', limits: BELO_LIMITS },
  { id: 'direct_crypto_top_venue', group: 'direct', name: 'Direct USDT/USDC payout → top venue (0%)',
    pre: [], post: [], price: 'topVenue', limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity } },
  { id: 'us_ach_virtual_bridge', group: 'direct', name: 'US ACH → virtual USD account → top venue (~0.5%)',
    pre: [{ label: 'ACH→USDC bridge', pct: 0.5 }], post: [], price: 'topVenue', limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity } },
  { id: 'direct_bitso_book', group: 'direct', name: 'Direct USDT → Bitso book (0.5% fee)',
    pre: [], post: [{ label: 'Bitso book fee', pct: 0.5 }], price: 'book', limits: { minUsd: 0, dailyUsd: Infinity, monthlyUsd: Infinity } },
]);

export const corridorById = (id) => CORRIDORS.find((c) => c.id === id);

/** Flat ARS-per-unit price for a non-book source, or null. */
export function flatPrice(source, market) {
  if (source === 'mep') return market.mepBid || null;
  if (source === 'ccl') return market.cclBid || null;
  if (source === 'topVenue') return market.topVenue?.bestBid || null;
  if (source.startsWith('venue:')) {
    const v = market.venues?.[source.slice(6)];
    return v ? Math.max(v.usdtBid || 0, v.usdcBid || 0) || null : null;
  }
  return null;
}

/** Quote one corridor for `usd` gross against a normalized market (see market.mjs). */
export function quoteCorridor(def, usd, market) {
  const preKeep = keepFactor(def.pre.map((l) => l.pct));
  const postKeep = keepFactor(def.post.map((l) => l.pct));
  const units = usd * preKeep;
  let grossArs;
  let vwap;
  let slippagePct = 0;
  let unfilledUnits = 0;
  if (def.price === 'book') {
    const w = walkOrderBook(market.bids, units, { presorted: true });
    grossArs = w.grossArs;
    vwap = w.vwap;
    slippagePct = w.slippagePct;
    unfilledUnits = w.unfilled;
  } else {
    vwap = flatPrice(def.price, market) || 0;
    grossArs = units * vwap;
  }
  const netArs = grossArs * postKeep;
  const rawMepArs = usd * (market.mepBid || 0);
  return {
    id: def.id,
    group: def.group,
    name: def.name,
    netArs,
    effRate: usd > 0 ? netArs / usd : 0,
    vsMepPct: rawMepArs > 0 ? (netArs / rawMepArs - 1) * 100 : null,
    haircutPct: (1 - preKeep * postKeep) * 100,
    vwap,
    slippagePct,
    unfilledUnits,
    limits: def.limits,
  };
}

/** Quote every corridor, ranked by net ARS within each group. */
export function quoteAll(usd, market, corridors = CORRIDORS) {
  return corridors.map((d) => quoteCorridor(d, usd, market)).sort((a, b) => b.netArs - a.netArs);
}
