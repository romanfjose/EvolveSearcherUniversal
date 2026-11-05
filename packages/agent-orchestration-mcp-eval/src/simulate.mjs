// Deterministic multi-agent mission simulator. Pure: a seeded PRNG plans the steps, and every admission goes through
// routeAgentSeat(), the same policy the MCP tool enforces. Used by the Web Inspector, the tests and the benchmark.
import { routeAgentSeat, ROLE_TIERS, TIERS } from './policy.mjs';

export const SEAT_ROLES = Object.freeze(Object.keys(ROLE_TIERS));
export const FLAGSHIP_ROLE = 'auditor';

// Relative step weights for a typical mission: mostly mechanical work, some scouting, a little heavy editing,
// and a small share of judgment calls. Weights need not sum to 100.
export const DEFAULT_MIX = Object.freeze({ grunt: 50, scout: 25, mechanic: 8, sniper: 7, auditor: 10 });

// Which mode each role asks for in the simulated mission. auditor is read-only by policy.
const ROLE_MODE = Object.freeze({ grunt: 'read-only', scout: 'read-only', mechanic: 'workspace-write', sniper: 'read-only', auditor: 'read-only' });

const round4 = n => Math.round(n * 10000) / 10000;

// mulberry32: small, fast, deterministic 32-bit PRNG. Same seed, same sequence, on every engine.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeMix(mix) {
  const entries = SEAT_ROLES.map(role => [role, Number(mix?.[role] ?? 0)]);
  if (entries.some(([, w]) => !Number.isFinite(w) || w < 0)) throw new Error('mix weights must be finite and >= 0');
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) throw new Error('mix must have at least one positive weight');
  return entries.map(([role, w]) => [role, w / total]);
}

// Returns the ordered list of seats the mission needs: [{ step, role, mode }].
export function planMission({ steps = 100, seed = 42, mix = DEFAULT_MIX } = {}) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 100000) throw new Error('steps must be an integer in [1, 100000]');
  const weights = normalizeMix(mix);
  const rand = mulberry32(seed);
  const plan = [];
  for (let step = 1; step <= steps; step++) {
    const r = rand();
    let acc = 0;
    let role = weights[weights.length - 1][0];
    for (const [name, w] of weights) {
      acc += w;
      if (r < acc) { role = name; break; }
    }
    plan.push({ step, role, mode: ROLE_MODE[role] });
  }
  return plan;
}

// Replays one strategy against a budget, admitting each step through routeAgentSeat with the running totals.
function replay(plan, budget, pick) {
  let usedCU = budget.usedCU ?? 0;
  let judgmentUsedCU = budget.judgmentUsedCU ?? 0;
  let plannedCU = 0;
  let admitted = 0;
  const cumulative = [];
  const refusals = {};
  const trace = plan.map(seat => {
    const { role, mode } = pick(seat);
    plannedCU += TIERS[ROLE_TIERS[role]].cu;
    const r = routeAgentSeat({ role, mode, budget: { ...budget, usedCU, judgmentUsedCU } });
    if (r.ok) {
      admitted++;
      usedCU = round4(usedCU + r.cu);
      if (TIERS[r.tier].judgment) judgmentUsedCU = round4(judgmentUsedCU + r.cu);
    } else {
      const key = r.reason.replace(/[\d.]+/g, '#');
      refusals[key] = (refusals[key] ?? 0) + 1;
    }
    cumulative.push(round4(usedCU - (budget.usedCU ?? 0)));
    return { step: seat.step, role, ok: r.ok, reason: r.ok ? null : r.reason };
  });
  return {
    plannedCU: round4(plannedCU),
    spentCU: round4(usedCU - (budget.usedCU ?? 0)),
    admitted,
    refused: plan.length - admitted,
    refusals,
    cumulative,
    trace,
  };
}

// Compares naive flagship routing (every step on the judgment-tier seat) with bicameral seat routing (each step on
// the cheapest seat that fits its role). costReductionPct compares the cost of completing the whole mission;
// the admitted / refused counts show what the same budget policy lets each strategy actually run.
export function simulateMission({ steps = 100, seed = 42, mix = DEFAULT_MIX, budget } = {}) {
  if (budget === null || typeof budget !== 'object') throw new Error('budget object required');
  const plan = planMission({ steps, seed, mix });
  const naive = replay(plan, budget, () => ({ role: FLAGSHIP_ROLE, mode: 'read-only' }));
  const bicameral = replay(plan, budget, seat => seat);
  const roleCounts = Object.fromEntries(SEAT_ROLES.map(r => [r, plan.filter(s => s.role === r).length]));
  return {
    steps,
    seed,
    roleCounts,
    naive,
    bicameral,
    costReductionPct: round4(100 * (1 - bicameral.plannedCU / naive.plannedCU)),
  };
}
