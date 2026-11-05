/**
 * Multi-tranche withdrawal splitter. Pure functions, no I/O.
 *
 * Each venue turns USD into ARS through a concave piecewise-linear function:
 *   - flat venues (MEP, Belo, wire) are one segment at keep·price ARS/USD;
 *   - book venues contribute one segment per bid level at preKeep·price·postKeep,
 *     each level of `a` USDT spanning a/preKeep gross USD.
 * Maximising Σ netᵢ(xᵢ) s.t. Σ xᵢ = amount, 0 ≤ xᵢ ≤ capᵢ is then solved exactly by
 * taking segments globally in descending rate order. Fixed fees and minimum tickets
 * break concavity, so venues carrying either are enumerated on/off (2^k subsets).
 * Objective: fill as much as caps and depth allow, then maximise net ARS.
 */

import { keepFactor, flatPrice, corridorById } from './corridors.mjs';
import { walkOrderBook } from './orderbook.mjs';

const EPS = 1e-9;
const MAX_OPTIONAL = 16;

/** Remaining capacity today given tier limits and usage so far. */
export function remainingCapacity({ dailyUsd = Infinity, monthlyUsd = Infinity, maxTicketUsd = Infinity } = {},
  { usedTodayUsd = 0, usedMonthUsd = 0 } = {}) {
  const daily = dailyUsd - usedTodayUsd;
  const monthly = monthlyUsd - usedMonthUsd;
  const cap = Math.max(0, Math.min(daily, monthly, maxTicketUsd));
  const binding = cap === maxTicketUsd ? 'ticket' : daily <= monthly ? 'daily' : 'monthly';
  return { cap, binding: Number.isFinite(cap) ? binding : null };
}

/**
 * Venue shape accepted by findOptimalSplit:
 * { id, name, preKeep=1, postKeep=1, fixedUsd=0, minUsd=0, capUsd=Infinity,
 *   price?: number, bids?: [{price, amount}] (best first), capBinding? }
 */
function segmentsOf(v) {
  const pre = v.preKeep ?? 1;
  const post = v.postKeep ?? 1;
  if (v.bids) {
    return v.bids.map((l, i) => ({ rate: pre * l.price * post, usd: l.amount / pre, idx: i }));
  }
  return v.price > 0 ? [{ rate: pre * v.price * post, usd: Infinity, idx: 0 }] : [];
}

function prepare(v, order) {
  const cap = Math.max(0, v.capUsd ?? Infinity);
  const fixed = Math.max(0, v.fixedUsd ?? 0);
  const min = Math.max(0, v.minUsd ?? 0);
  return { v, order, cap, fixed, min, forced: Math.max(min, fixed), segs: segmentsOf(v) };
}

function solveSubset(amount, prepared, activeSet) {
  const alloc = new Map();
  const net = new Map();
  let remaining = amount;
  const pool = [];
  for (const p of prepared) {
    if (!activeSet.has(p)) continue;
    const isOn = p.forced > 0; // forced venues are only in the set when selected
    let room = p.cap;
    let used = 0;
    let ars = 0;
    if (isOn) {
      if (p.forced > p.cap + EPS) return null;
      used = p.fixed; // fixed fee absorbs the first `fixed` USD
      room -= p.fixed;
    }
    let need = isOn ? p.forced - p.fixed : 0;
    for (const s of p.segs) {
      if (room <= EPS) break;
      let len = Math.min(s.usd, room);
      if (need > EPS) {
        const take = Math.min(len, need);
        ars += take * s.rate;
        used += take;
        need -= take;
        room -= take;
        len -= take;
      }
      if (len > EPS) {
        pool.push({ p, rate: s.rate, usd: len, idx: s.idx });
        room -= len;
      }
    }
    if (need > EPS) return null; // depth cannot even cover the minimum ticket
    alloc.set(p, used);
    net.set(p, ars);
    remaining -= used;
  }
  if (remaining < -EPS) return null;
  pool.sort((a, b) => b.rate - a.rate || a.p.order - b.p.order || a.idx - b.idx);
  for (const seg of pool) {
    if (remaining <= EPS) break;
    const take = Math.min(seg.usd, remaining);
    alloc.set(seg.p, alloc.get(seg.p) + take);
    net.set(seg.p, net.get(seg.p) + take * seg.rate);
    remaining -= take;
  }
  let totalNet = 0;
  for (const x of net.values()) totalNet += x;
  return { alloc, net, totalNet, unallocated: Math.max(0, remaining) };
}

function better(a, b) {
  if (!b) return true;
  if (Math.abs(a.unallocated - b.unallocated) > 1e-6) return a.unallocated < b.unallocated;
  if (Math.abs(a.totalNet - b.totalNet) > 1e-6) return a.totalNet > b.totalNet;
  return a.activeCount < b.activeCount;
}

/**
 * Optimal split of `amountUsd` across venues. Returns tranches (only venues that receive USD),
 * blended rate, and the comparison against the best single venue at the same amount.
 */
export function findOptimalSplit(amountUsd, venues, { mepBid } = {}) {
  const amount = Math.max(0, Number(amountUsd) || 0);
  const prepared = venues.map(prepare);
  const free = prepared.filter((p) => p.forced === 0);
  const optional = prepared.filter((p) => p.forced > 0);
  if (optional.length > MAX_OPTIONAL) throw new RangeError(`at most ${MAX_OPTIONAL} venues with fixed fees/minimums`);

  let best = null;
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const active = new Set(free);
    optional.forEach((p, i) => { if (mask & (1 << i)) active.add(p); });
    const r = solveSubset(amount, prepared, active);
    if (!r) continue;
    r.activeCount = [...r.alloc.values()].filter((x) => x > EPS).length;
    if (better(r, best)) best = r;
  }
  if (!best) best = { alloc: new Map(), net: new Map(), totalNet: 0, unallocated: amount, activeCount: 0 };

  const tranches = [];
  for (const p of prepared) {
    const usd = best.alloc.get(p) || 0;
    if (usd <= EPS) continue;
    tranches.push(describeTranche(p, usd, best.net.get(p) || 0));
  }
  const allocatedUsd = amount - best.unallocated;
  const singles = prepared.map((p) => {
    const r = solveSubset(amount, prepared, new Set([p]));
    return r ? { id: p.v.id, netArs: r.totalNet, allocatedUsd: amount - r.unallocated } : null;
  }).filter(Boolean)
    .sort((a, b) => (b.allocatedUsd - a.allocatedUsd) || (b.netArs - a.netArs));
  const bestSingle = singles[0] || null;
  return {
    amountUsd: amount,
    allocatedUsd,
    unallocatedUsd: best.unallocated,
    netArs: best.totalNet,
    effRate: allocatedUsd > 0 ? best.totalNet / allocatedUsd : 0,
    vsMepPct: mepBid > 0 && allocatedUsd > 0 ? (best.totalNet / (allocatedUsd * mepBid) - 1) * 100 : null,
    tranches,
    bestSingle,
    gainVsBestSingleArs: bestSingle && bestSingle.allocatedUsd >= allocatedUsd - 1e-6 ? best.totalNet - bestSingle.netArs : null,
  };
}

function describeTranche(p, usd, netArs) {
  const { v } = p;
  const pre = v.preKeep ?? 1;
  const post = v.postKeep ?? 1;
  const units = Math.max(0, usd - p.fixed) * pre;
  let vwap = v.price ?? 0;
  let slippagePct = 0;
  if (v.bids) {
    const w = walkOrderBook(v.bids, units, { presorted: true });
    vwap = w.vwap;
    slippagePct = w.slippagePct;
  }
  const atCap = Number.isFinite(p.cap) && usd >= p.cap - 1e-6;
  return {
    id: v.id,
    name: v.name ?? v.id,
    usd,
    netArs,
    effRate: usd > 0 ? netArs / usd : 0,
    vwap,
    slippagePct,
    feesUsd: usd - units * post, // USD-equivalent of all fees (pre, fixed and post legs) at the venue's own price
    capUsd: p.cap,
    binding: atCap ? v.capBinding ?? 'cap' : null,
  };
}

/** Build splitter venues from registry corridors plus a normalized market and per-venue usage. */
export function venuesFromCorridors(ids, market, usage = {}, overrides = {}) {
  return ids.map((id) => {
    const def = corridorById(id);
    if (!def) throw new Error(`unknown corridor ${id}`);
    const o = overrides[id] || {};
    const limits = { ...def.limits, ...o.limits };
    const { cap, binding } = remainingCapacity(limits, usage[id]);
    const base = {
      id,
      name: def.name,
      preKeep: keepFactor(def.pre.map((l) => l.pct)),
      postKeep: keepFactor(def.post.map((l) => l.pct)),
      fixedUsd: o.fixedUsd ?? def.fixedUsd ?? 0,
      minUsd: limits.minUsd ?? 0,
      capUsd: cap,
      capBinding: binding,
    };
    return def.price === 'book' ? { ...base, bids: market.bids } : { ...base, price: flatPrice(def.price, market) || 0 };
  });
}

/** The four default liquidity venues for a Payoneer-balance withdrawal. */
export const DEFAULT_SPLIT_VENUES = Object.freeze(['payo_bitso_stacked', 'payo_santander_wire', 'payo_prex_mep', 'payo_belo_usdc']);
