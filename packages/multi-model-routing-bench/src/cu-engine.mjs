// Normalized Cost-Unit (CU) engine: prices calls, meters subscription quota and
// simulates multi-cycle autonomous studio workflows. Zero dependencies; runs in
// Node >= 20 and in the browser. Every result is a deterministic expected value.

/** USD per million tokens. Source: Anthropic first-party API rates, 2026-10 snapshot.
 *  A tier applies to the whole request once its prompt exceeds `above` tokens. */
export const PRICING = Object.freeze({
  'claude-opus-5-5':   { input: 4,    cachedInput: 0.20, cacheWrite: 5,     output: 20,   tiers: [] },
  'claude-sonnet-5-5': { input: 2,    cachedInput: 0.20, cacheWrite: 2.5,   output: 10,   tiers: [] },
  'claude-haiku-5-5':  { input: 0.10, cachedInput: 0.01, cacheWrite: 0.125, output: 0.50,
    tiers: [{ above: 100_000, input: 0.50, cachedInput: 0.05, cacheWrite: 0.625, output: 2.50 }] },
});

/** Base CU at `medium` and effort multipliers, from the Claude engine's ARCHITECT_BLUEPRINT.md §4. */
export const CU_MENU = Object.freeze({
  models: { 'claude-opus-5-5': 8.0, 'claude-sonnet-5-5': 1.8, 'claude-haiku-5-5': 0.8 },
  effort: { light: 0.6, medium: 1.0, high: 1.6, 'extra high': 2.5, max: 4.0 },
  bloatPenalty: 5,
  budget: { target: 55, ceiling: 70 },
});

/** Behavioural priors. These are ASSUMPTIONS, not measurements: replace them with
 *  your own eval data. `detect` is the per-look chance a reviewer catches a given
 *  defect; `defectRate` is defects per work item at `medium`; `tokensPerSec` is
 *  output throughput. */
export const PRIORS = Object.freeze({
  models: {
    'claude-opus-5-5':   { detect: 0.55, defectRate: 0.10, tokensPerSec: 60 },
    'claude-sonnet-5-5': { detect: 0.45, defectRate: 0.16, tokensPerSec: 90 },
    'claude-haiku-5-5':  { detect: 0.30, defectRate: 0.25, tokensPerSec: 150 },
  },
  // Share of a reviewer's catch power lost to blind spots it shares with the author.
  correlation: { selfWarm: 0.6, sameModelCold: 0.3, crossModel: 0.05 },
});

/** One cycle = one build wave + its review chain (+ rework). Token counts per call. */
export const DEFAULT_WORKLOAD = Object.freeze({
  itemsPerBuilder: 1,
  baseContext: 20_000,       // warm builder context at cycle 1
  contextGrowth: 6_000,      // warm context added per cycle
  compactAt: 160_000,        // warm context resets to baseContext beyond this
  coldContext: 12_000,       // spec + diff a cold-eye reviewer reads instead
  cachedFraction: 0.7,       // share of a warm prompt served from cache
  output: { build: 6_000, review: 2_000, fix: 3_000 },
  callOverheadSec: 8,
  defectPenalty: 1,          // results lost per escaped defect (raise it if escapes cost more than one item)
});

export const PERIOD_HOURS = Object.freeze({ week: 168, month: 730 });

const EPS = 1e-9;

function need(table, key, what) {
  if (!Object.hasOwn(table, key)) throw new RangeError(`unknown ${what}: ${key}`);
  return table[key];
}

/** Rate card for a prompt of `promptTokens`: the highest tier whose threshold is exceeded. */
export function rateFor(price, promptTokens) {
  let rate = price, above = 0;
  for (const tier of price.tiers ?? []) {
    if (promptTokens > tier.above && tier.above >= above) { rate = tier; above = tier.above; }
  }
  return { rate, above };
}

/** USD for one request. `input` excludes cached and cache-write tokens. */
export function priceCall({ model, input = 0, cachedInput = 0, cacheWrite = 0, output = 0 }, pricing = PRICING) {
  for (const n of [input, cachedInput, cacheWrite, output]) {
    if (!(n >= 0)) throw new RangeError(`token counts must be >= 0, got ${n}`);
  }
  const promptTokens = input + cachedInput + cacheWrite;
  const { rate, above } = rateFor(need(pricing, model, 'model'), promptTokens);
  const usd = (input * rate.input + cachedInput * rate.cachedInput
    + cacheWrite * (rate.cacheWrite ?? rate.input) + output * rate.output) / 1e6;
  return { usd, tierAbove: above, promptTokens };
}

/** Agent CU = Base CU x Effort Multiplier (+ bloat penalty for raw cache reads). */
export function agentCU(model, effort = 'medium', { bloat = false } = {}, menu = CU_MENU) {
  return need(menu.models, model, 'model') * need(menu.effort, effort, 'effort') + (bloat ? menu.bloatPenalty : 0);
}

export function budgetVerdict(cu, { target, ceiling } = CU_MENU.budget) {
  return cu <= target + EPS ? 'within-target' : cu <= ceiling + EPS ? 'over-target' : 'over-ceiling';
}

/** ROI = Results / (Effort x Time x Cost). Null when any factor is zero or missing. */
export function roi({ results, effort, hours, usd }) {
  const denom = effort * hours * usd;
  return denom > 0 && Number.isFinite(denom) ? results / denom : null;
}

/** Catch probability: effort buys independent looks; shared blind spots discount it. */
export function detectProbability(model, effort, correlation = 0, priors = PRIORS, menu = CU_MENU) {
  const q = need(priors.models, model, 'model').detect;
  const looks = need(menu.effort, effort, 'effort');
  return (1 - (1 - q) ** looks) * (1 - correlation);
}

export function reviewerCorrelation(reviewer, builderModel, priors = PRIORS) {
  if (reviewer.model !== builderModel) return priors.correlation.crossModel;
  return reviewer.cold ? priors.correlation.sameModelCold : priors.correlation.selfWarm;
}

/** Rolling subscription quota in CU: a burst window (default 5 h) plus a weekly
 *  ceiling of which `reserveFraction` is held back for interactive use.
 *  Usage at time t counts events in (t - span, t]. */
export class RollingQuota {
  constructor({ windowHours = 5, windowCap, weeklyCap = Infinity, weekHours = 168, reserveFraction = 0 }) {
    if (!(windowCap > 0)) throw new RangeError('windowCap must be > 0');
    if (!(reserveFraction >= 0 && reserveFraction < 1)) throw new RangeError('reserveFraction must be in [0, 1)');
    Object.assign(this, { windowHours, windowCap, weekHours });
    this.weeklyAllowance = weeklyCap * (1 - reserveFraction);
    this.events = [];
  }
  usedIn(t, span) {
    let sum = 0;
    for (const e of this.events) if (e.t > t - span && e.t <= t) sum += e.cu;
    return sum;
  }
  fits(t, cu) {
    return this.usedIn(t, this.windowHours) + cu <= this.windowCap + EPS
      && this.usedIn(t, this.weekHours) + cu <= this.weeklyAllowance + EPS;
  }
  consume(t, cu) {
    const last = this.events.at(-1);
    if (last && t < last.t) throw new RangeError('events must be consumed in time order');
    if (!this.fits(t, cu)) return false;
    this.events.push({ t, cu });
    return true;
  }
  /** Earliest time >= t at which `cu` fits, or Infinity if it never can. */
  nextFit(t, cu) {
    if (cu > this.windowCap + EPS || cu > this.weeklyAllowance + EPS) return Infinity;
    const candidates = [t];
    for (const e of this.events) candidates.push(e.t + this.windowHours, e.t + this.weekHours);
    return candidates.filter(c => c >= t).sort((a, b) => a - b).find(c => this.fits(c, cu)) ?? Infinity;
  }
}

/** Preset rosters. A roster is one homogeneous builder swarm plus an ordered review chain. */
export const ROSTERS = Object.freeze({
  singleModel: ({ model = 'claude-opus-5-5', effort = 'high', builders = 4 } = {}) => ({
    name: `Single-Model Loop (${model}, ${effort})`,
    builders: { model, effort, count: builders },
    reviewers: [{ role: 'self-review', model, effort, cold: false }],
  }),
  triCameral: ({
    builder = { model: 'claude-haiku-5-5', effort: 'medium' }, builders = 4,
    adversary = { model: 'claude-sonnet-5-5', effort: 'high' },
    auditor = { model: 'claude-opus-5-5', effort: 'light' },
  } = {}) => ({
    name: 'Tri-Cameral Role Routing',
    builders: { ...builder, count: builders },
    reviewers: [
      { role: 'adversary', ...adversary, cold: true },
      { role: 'auditor', ...auditor, cold: true, readOnly: true },
    ],
  }),
});

/** Simulates back-to-back cycles of `roster` for `hours` of wall clock.
 *  plan: { priceUSD, period: 'week'|'month', windowHours, windowCap, weeklyCap, reserveFraction } or null (pure API).
 *  overflow: 'api' bills calls the plan cannot admit at API rates; 'wait' sleeps until the window frees. */
export function simulateStudio({
  roster, hours = 24, plan = null, overflow = 'api', workload = DEFAULT_WORKLOAD,
  pricing = PRICING, menu = CU_MENU, priors = PRIORS, maxCycles = 100_000,
}) {
  if (!['api', 'wait'].includes(overflow)) throw new RangeError(`unknown overflow policy: ${overflow}`);
  const w = { ...DEFAULT_WORKLOAD, ...workload, output: { ...DEFAULT_WORKLOAD.output, ...workload.output } };
  const b = roster.builders;
  if (!(b.count >= 1)) throw new RangeError('roster needs at least one builder');
  const quota = plan ? new RollingQuota(plan) : null;
  const tps = model => need(priors.models, model, 'model').tokensPerSec;
  const latencyH = (model, out) => (w.callOverheadSec + out / tps(model)) / 3600;

  const s = {
    cycles: 0, t: 0, ctx: w.baseContext, items: 0, injected: 0, caught: 0, escaped: 0,
    cu: 0, effortSum: 0, calls: 0, apiUSD: 0, apiEquivalentUSD: 0, tierCalls: 0,
    overflowCalls: 0, waitedHours: 0, exhaustedAt: null, stoppedReason: 'horizon', timeline: [],
  };

  // Charges `calls` identical requests of `model` (may be fractional: expected rework).
  // Returns false when the plan can never admit the phase under the 'wait' policy.
  const charge = (model, effort, calls, tokens) => {
    if (calls <= 0) return true;
    const cu = agentCU(model, effort, {}, menu) * calls;
    const { usd, tierAbove } = priceCall({ model, ...tokens }, pricing);
    let billed = !quota;
    if (quota && !quota.consume(s.t, cu)) {
      s.exhaustedAt ??= s.t;
      if (overflow === 'api') { billed = true; s.overflowCalls += calls; }
      else {
        const at = quota.nextFit(s.t, cu);
        if (at === Infinity) return false;
        s.waitedHours += at - s.t; s.t = at;
        quota.consume(s.t, cu);
      }
    }
    s.cu += cu; s.calls += calls; s.effortSum += menu.effort[effort] * calls;
    s.apiEquivalentUSD += usd * calls;
    if (billed) s.apiUSD += usd * calls;
    if (tierAbove > 0) s.tierCalls += calls;
    return true;
  };

  const warm = ctx => ({ input: ctx * (1 - w.cachedFraction), cachedInput: ctx * w.cachedFraction });
  while (s.t < hours && s.cycles < maxCycles) {
    const start = s.t, cuBefore = s.cu, usdBefore = s.apiEquivalentUSD;
    const items = b.count * w.itemsPerBuilder;
    const buildOut = w.output.build * w.itemsPerBuilder;
    if (!charge(b.model, b.effort, b.count, { ...warm(s.ctx), output: buildOut })) { s.stoppedReason = 'quota'; break; }
    s.t += latencyH(b.model, buildOut);

    let remaining = items * need(priors.models, b.model, 'model').defectRate / Math.sqrt(menu.effort[b.effort]);
    const injected = remaining;
    let stopped = false;
    for (const r of roster.reviewers) {
      const diff = buildOut * b.count;
      const prompt = r.cold ? { input: w.coldContext + diff } : { ...warm(s.ctx), input: warm(s.ctx).input + diff };
      if (!charge(r.model, r.effort, 1, { ...prompt, output: w.output.review })) { stopped = true; break; }
      s.t += latencyH(r.model, w.output.review);
      remaining -= remaining * detectProbability(r.model, r.effort, reviewerCorrelation(r, b.model, priors), priors, menu);
    }
    if (stopped) { s.stoppedReason = 'quota'; break; }
    const caught = injected - remaining;
    if (caught > EPS) {
      if (!charge(b.model, b.effort, caught, { input: w.coldContext, output: w.output.fix })) { s.stoppedReason = 'quota'; break; }
      s.t += latencyH(b.model, w.output.fix);
    }

    s.cycles++; s.items += items; s.injected += injected; s.caught += caught; s.escaped += remaining;
    s.timeline.push({ cycle: s.cycles, start, end: s.t, ctx: s.ctx, cu: s.cu - cuBefore, usd: s.apiEquivalentUSD - usdBefore, cumCU: s.cu, cumUSD: s.apiEquivalentUSD, cumBilledUSD: s.apiUSD, cumEscaped: s.escaped });
    s.ctx += w.contextGrowth;
    if (s.ctx > w.compactAt) s.ctx = w.baseContext;
  }

  const subscriptionUSD = plan ? plan.priceUSD * s.t / need(PERIOD_HOURS, plan.period ?? 'month', 'period') : 0;
  const totalUSD = s.apiUSD + subscriptionUSD;
  const results = s.items - w.defectPenalty * s.escaped;
  const meanEffort = s.calls ? s.effortSum / s.calls : 0;
  const cuPerCycle = s.cycles ? s.cu / s.cycles : 0;
  return {
    roster: roster.name ?? 'custom', cycles: s.cycles, wallHours: s.t, stoppedReason: s.stoppedReason,
    items: s.items, results, defectsInjected: s.injected, defectsCaught: s.caught, defectsEscaped: s.escaped,
    catchRate: s.injected ? s.caught / s.injected : 0,
    cu: s.cu, cuPerCycle, budget: budgetVerdict(cuPerCycle, menu.budget), meanEffort,
    apiUSD: s.apiUSD, apiEquivalentUSD: s.apiEquivalentUSD, subscriptionUSD, totalUSD,
    quotaExhaustedAtHour: s.exhaustedAt, waitedHours: s.waitedHours, overflowCalls: s.overflowCalls,
    tierJumpCalls: s.tierCalls, usdPerResult: results > 0 ? totalUSD / results : null,
    roi: roi({ results, effort: meanEffort, hours: s.t, usd: totalUSD }),
    timeline: s.timeline,
  };
}

/** Runs every roster under the same plan and workload. */
export function compareRosters(rosters, options = {}) {
  return rosters.map(roster => simulateStudio({ ...options, roster }));
}
