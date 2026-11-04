import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING, CU_MENU, PRIORS, DEFAULT_WORKLOAD, ROSTERS, rateFor, priceCall, agentCU, budgetVerdict, roi,
  detectProbability, reviewerCorrelation, RollingQuota, simulateStudio, compareRosters,
} from '../src/cu-engine.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const OPUS = 'claude-opus-5-5', SONNET = 'claude-sonnet-5-5', HAIKU = 'claude-haiku-5-5';
const PLAN = { priceUSD: 200, period: 'month', windowHours: 5, windowCap: 400, weeklyCap: 4000, reserveFraction: 0.2 };

// Pricing ---------------------------------------------------------------------

test('pricing: published per-MTok rates', () => {
  assert.deepEqual([PRICING[OPUS].input, PRICING[OPUS].cachedInput, PRICING[OPUS].output], [4, 0.2, 20]);
  assert.deepEqual([PRICING[SONNET].input, PRICING[SONNET].cachedInput, PRICING[SONNET].output], [2, 0.2, 10]);
  assert.deepEqual([PRICING[HAIKU].input, PRICING[HAIKU].output], [0.1, 0.5]);
  assert.deepEqual(PRICING[HAIKU].tiers[0], { above: 100_000, input: 0.5, cachedInput: 0.05, cacheWrite: 0.625, output: 2.5 });
});

test('pricing: cache reads 0.1x input except Opus 5.5 at 0.05x; 5-minute writes 1.25x', () => {
  close(PRICING[OPUS].cachedInput / PRICING[OPUS].input, 0.05);
  for (const m of [SONNET, HAIKU]) close(PRICING[m].cachedInput / PRICING[m].input, 0.1);
  for (const m of Object.keys(PRICING)) close(PRICING[m].cacheWrite / PRICING[m].input, 1.25);
});

test('priceCall: one million input tokens costs the input rate', () => {
  close(priceCall({ model: OPUS, input: 1e6 }).usd, 4);
  close(priceCall({ model: SONNET, output: 1e6 }).usd, 10);
});

test('priceCall: mixes input, cached, cache-write and output', () => {
  const { usd } = priceCall({ model: OPUS, input: 15_000, cachedInput: 35_000, cacheWrite: 1_000, output: 6_000 });
  close(usd, (15_000 * 4 + 35_000 * 0.2 + 1_000 * 5 + 6_000 * 20) / 1e6);
});

test('priceCall: zero tokens costs nothing', () => {
  assert.deepEqual(priceCall({ model: HAIKU }), { usd: 0, tierAbove: 0, promptTokens: 0 });
});

test('priceCall: Haiku stays on the base card at exactly 100k prompt tokens', () => {
  const r = priceCall({ model: HAIKU, input: 100_000 });
  assert.equal(r.tierAbove, 0);
  close(r.usd, 0.01);
});

test('priceCall: Haiku jumps the whole request to the long-context card above 100k', () => {
  const r = priceCall({ model: HAIKU, input: 100_001, output: 1_000 });
  assert.equal(r.tierAbove, 100_000);
  close(r.usd, (100_001 * 0.5 + 1_000 * 2.5) / 1e6);
});

test('priceCall: cached tokens count toward the tier threshold', () => {
  assert.equal(priceCall({ model: HAIKU, input: 10_000, cachedInput: 95_000 }).tierAbove, 100_000);
});

test('priceCall: output tokens do not count toward the tier threshold', () => {
  assert.equal(priceCall({ model: HAIKU, input: 90_000, output: 50_000 }).tierAbove, 0);
});

test('priceCall: tier jump multiplies Haiku cost 5x for the same tokens', () => {
  const below = priceCall({ model: HAIKU, input: 100_000, output: 4_000 }).usd;
  const above = priceCall({ model: HAIKU, input: 100_001, output: 4_000 }).usd;
  assert.ok(above / below > 4.99 && above / below < 5.01);
});

const STACKED = { m: { input: 1, cachedInput: 0.1, output: 2, tiers: [
  { above: 200_000, input: 3, cachedInput: 0.3, output: 6 },
  { above: 100_000, input: 2, cachedInput: 0.2, output: 4 },
] } };

test('rateFor: picks the highest exceeded tier regardless of declaration order (>100k / >200k)', () => {
  assert.equal(rateFor(STACKED.m, 50_000).above, 0);
  assert.equal(rateFor(STACKED.m, 150_000).above, 100_000);
  assert.equal(rateFor(STACKED.m, 250_000).above, 200_000);
  close(priceCall({ model: 'm', input: 250_000 }, STACKED).usd, 0.75);
  close(priceCall({ model: 'm', input: 150_000 }, STACKED).usd, 0.3);
});

test('priceCall: cacheWrite falls back to the input rate when a card omits it', () => {
  close(priceCall({ model: 'm', cacheWrite: 50_000 }, STACKED).usd, 0.05);
  close(priceCall({ model: 'm', cacheWrite: 250_000 }, STACKED).usd, 0.75);
});

test('priceCall: rejects unknown models and negative or NaN token counts', () => {
  assert.throws(() => priceCall({ model: 'gpt-x', input: 1 }), /unknown model/);
  assert.throws(() => priceCall({ model: OPUS, input: -1 }), RangeError);
  assert.throws(() => priceCall({ model: OPUS, output: NaN }), RangeError);
});

// CU ----------------------------------------------------------------------------

test('agentCU: Base CU x Effort Multiplier matches the Claude blueprint menu', () => {
  close(agentCU(OPUS, 'medium'), 8);
  close(agentCU(SONNET, 'high'), 2.88);
  close(agentCU(HAIKU, 'light'), 0.48);
  close(agentCU(SONNET, 'extra high'), 4.5);
  close(agentCU(OPUS, 'max'), 32);
});

test('agentCU: bloat penalty adds a flat +5 CU', () => {
  close(agentCU(HAIKU, 'medium', { bloat: true }), 5.8);
});

test('agentCU: effort defaults to medium and unknown keys throw', () => {
  close(agentCU(SONNET), 1.8);
  assert.throws(() => agentCU(SONNET, 'turbo'), /unknown effort/);
  assert.throws(() => agentCU('claude-x', 'medium'), /unknown model/);
});

test('budgetVerdict: 55 CU target and 70 CU ceiling are inclusive', () => {
  assert.equal(budgetVerdict(55), 'within-target');
  assert.equal(budgetVerdict(55.01), 'over-target');
  assert.equal(budgetVerdict(70), 'over-target');
  assert.equal(budgetVerdict(70.01), 'over-ceiling');
  assert.equal(budgetVerdict(10, { target: 5, ceiling: 8 }), 'over-ceiling');
});

// ROI and detection ---------------------------------------------------------------

test('roi: Results / (Effort x Time x Cost)', () => {
  close(roi({ results: 100, effort: 2, hours: 5, usd: 10 }), 1);
});

test('roi: null when any denominator factor is zero or non-finite', () => {
  assert.equal(roi({ results: 5, effort: 0, hours: 1, usd: 1 }), null);
  assert.equal(roi({ results: 5, effort: 1, hours: 1, usd: 0 }), null);
  assert.equal(roi({ results: 5, effort: 1, hours: Infinity, usd: 1 }), null);
});

test('detectProbability: medium effort equals the per-look prior', () => {
  close(detectProbability(SONNET, 'medium'), PRIORS.models[SONNET].detect);
});

test('detectProbability: effort buys independent looks, 1 - (1 - q)^effort', () => {
  close(detectProbability(HAIKU, 'high'), 1 - 0.7 ** 1.6);
  assert.ok(detectProbability(OPUS, 'max') > detectProbability(OPUS, 'high'));
  assert.ok(detectProbability(OPUS, 'max') < 1);
});

test('detectProbability: correlation scales catch power down linearly', () => {
  close(detectProbability(OPUS, 'medium', 0.6), 0.55 * 0.4);
  assert.equal(detectProbability(OPUS, 'medium', 1), 0);
});

test('reviewerCorrelation: warm self-review > cold same-model > cross-model', () => {
  const c = PRIORS.correlation;
  assert.equal(reviewerCorrelation({ model: OPUS, cold: false }, OPUS), c.selfWarm);
  assert.equal(reviewerCorrelation({ model: OPUS, cold: true }, OPUS), c.sameModelCold);
  assert.equal(reviewerCorrelation({ model: SONNET, cold: false }, OPUS), c.crossModel);
  assert.ok(c.selfWarm > c.sameModelCold && c.sameModelCold > c.crossModel);
});

// Rolling quota ---------------------------------------------------------------------

test('RollingQuota: admits up to the burst cap and refuses beyond it', () => {
  const q = new RollingQuota({ windowCap: 10 });
  assert.ok(q.consume(0, 6));
  assert.ok(q.consume(1, 4));
  assert.equal(q.consume(2, 0.5), false);
  assert.equal(q.usedIn(2, 5), 10);
});

test('RollingQuota: the 5-hour window rolls; usage expires exactly at t + 5h', () => {
  const q = new RollingQuota({ windowCap: 10 });
  q.consume(0, 10);
  assert.equal(q.fits(4.999, 1), false);
  assert.equal(q.fits(5, 1), true);
});

test('RollingQuota: weekly ceiling binds even when every burst window has room', () => {
  const q = new RollingQuota({ windowCap: 10, weeklyCap: 25 });
  for (const t of [0, 5, 10]) assert.ok(q.consume(t, t === 10 ? 5 : 10));
  assert.equal(q.consume(15, 1), false);
  assert.equal(q.usedIn(15, 168), 25);
});

test('RollingQuota: reserve fraction withholds part of the weekly ceiling', () => {
  const q = new RollingQuota({ windowCap: 100, weeklyCap: 100, reserveFraction: 0.2 });
  assert.equal(q.weeklyAllowance, 80);
  assert.ok(q.consume(0, 80));
  assert.equal(q.consume(10, 1), false);
});

test('RollingQuota: nextFit returns the first expiry that frees enough room', () => {
  const q = new RollingQuota({ windowCap: 10 });
  q.consume(0, 4); q.consume(1, 6);
  assert.equal(q.nextFit(2, 3), 5);
  assert.equal(q.nextFit(2, 7), 6);
  assert.equal(q.nextFit(2, 0), 2);
});

test('RollingQuota: nextFit waits out the weekly window when it binds', () => {
  const q = new RollingQuota({ windowCap: 10, weeklyCap: 10, weekHours: 168 });
  q.consume(0, 10);
  assert.equal(q.nextFit(6, 5), 168);
});

test('RollingQuota: nextFit is Infinity when a request exceeds either cap outright', () => {
  const q = new RollingQuota({ windowCap: 10, weeklyCap: 50, reserveFraction: 0.9 });
  assert.equal(q.nextFit(0, 11), Infinity);
  assert.equal(q.nextFit(0, 6), Infinity);
});

test('RollingQuota: rejects out-of-order events and invalid configuration', () => {
  const q = new RollingQuota({ windowCap: 10 });
  q.consume(3, 1);
  assert.throws(() => q.consume(2, 1), /time order/);
  assert.throws(() => new RollingQuota({ windowCap: 0 }), RangeError);
  assert.throws(() => new RollingQuota({ windowCap: 1, reserveFraction: 1 }), RangeError);
});

// Studio simulation -----------------------------------------------------------------

const tri = ROSTERS.triCameral();
const single = ROSTERS.singleModel();

test('rosters: presets wire the documented roles', () => {
  assert.deepEqual(single.reviewers.map(r => [r.role, r.model, r.cold]), [['self-review', OPUS, false]]);
  assert.deepEqual(tri.reviewers.map(r => [r.role, r.cold, !!r.readOnly]), [['adversary', true, false], ['auditor', true, true]]);
  assert.equal(tri.builders.model, HAIKU);
});

test('simulate: deterministic across runs', () => {
  assert.deepEqual(simulateStudio({ roster: tri, plan: PLAN }), simulateStudio({ roster: tri, plan: PLAN }));
});

test('simulate: runs cycles until the horizon and reports it', () => {
  const r = simulateStudio({ roster: tri, hours: 2 });
  assert.equal(r.stoppedReason, 'horizon');
  assert.ok(r.wallHours >= 2 && r.timeline.at(-2).end < 2);
  assert.equal(r.timeline.length, r.cycles);
});

test('simulate: one cycle hand-computed (single-model, no plan)', () => {
  const roster = ROSTERS.singleModel({ model: SONNET, effort: 'medium', builders: 1 });
  const w = { ...DEFAULT_WORKLOAD, contextGrowth: 0 };
  const r = simulateStudio({ roster, hours: 1e-9, workload: w });
  assert.equal(r.cycles, 1);
  const injected = PRIORS.models[SONNET].defectRate;
  const p = PRIORS.models[SONNET].detect * (1 - PRIORS.correlation.selfWarm);
  close(r.defectsInjected, injected);
  close(r.defectsCaught, injected * p);
  close(r.cu, 1.8 * (2 + injected * p));
  const warm = { input: 20_000 * 0.3, cachedInput: 20_000 * 0.7 };
  const usd = priceCall({ model: SONNET, ...warm, output: 6_000 }).usd
    + priceCall({ model: SONNET, input: warm.input + 6_000, cachedInput: warm.cachedInput, output: 2_000 }).usd
    + injected * p * priceCall({ model: SONNET, input: 12_000, output: 3_000 }).usd;
  close(r.apiEquivalentUSD, usd);
  close(r.totalUSD, usd);
  const hrs = (8 + 6000 / 90 + 8 + 2000 / 90 + 8 + 3000 / 90) / 3600;
  close(r.wallHours, hrs);
});

test('simulate: catch rate equals 1 - product of per-layer misses', () => {
  const r = simulateStudio({ roster: tri, hours: 1 });
  const miss = [tri.reviewers[0], tri.reviewers[1]].map(rv =>
    1 - detectProbability(rv.model, rv.effort, reviewerCorrelation(rv, HAIKU)));
  close(r.catchRate, 1 - miss[0] * miss[1]);
});

test('simulate: defect accounting balances (injected = caught + escaped)', () => {
  const r = simulateStudio({ roster: tri, hours: 6, plan: PLAN });
  close(r.defectsInjected, r.defectsCaught + r.defectsEscaped, 1e-6);
  close(r.results, r.items - r.defectsEscaped, 1e-6);
});

test('simulate: tri-cameral catches more defects than a warm single-model loop', () => {
  const a = simulateStudio({ roster: single, hours: 24 });
  const b = simulateStudio({ roster: tri, hours: 24 });
  assert.ok(b.catchRate > 2 * a.catchRate, `${b.catchRate} vs ${a.catchRate}`);
});

test('simulate: tri-cameral is cheaper per clean result than an Opus single-model loop on pure API', () => {
  const [a, b] = compareRosters([single, tri], { hours: 24 });
  assert.ok(b.usdPerResult < a.usdPerResult / 2);
  assert.ok(b.roi > a.roi);
});

test('simulate: Opus high single-model loop breaches the 55 CU target per cycle', () => {
  const r = simulateStudio({ roster: single, hours: 1 });
  assert.equal(r.budget, 'over-target');
  assert.equal(simulateStudio({ roster: tri, hours: 1 }).budget, 'within-target');
});

test('simulate: cold-eye review beats warm self-review on the same model', () => {
  const warm = ROSTERS.singleModel({ model: SONNET, effort: 'high' });
  const cold = { ...warm, reviewers: [{ ...warm.reviewers[0], cold: true }] };
  assert.ok(simulateStudio({ roster: cold, hours: 2 }).catchRate > simulateStudio({ roster: warm, hours: 2 }).catchRate);
});

test('simulate: cold-eye reviewer pays for a small prompt, warm reviewer for the full context', () => {
  const warm = ROSTERS.singleModel({ model: SONNET, effort: 'medium' });
  const cold = { ...warm, reviewers: [{ ...warm.reviewers[0], cold: true }] };
  const w = { contextGrowth: 40_000, compactAt: 1e9 };
  assert.ok(simulateStudio({ roster: cold, hours: 4, workload: w }).apiEquivalentUSD
    < simulateStudio({ roster: warm, hours: 4, workload: w }).apiEquivalentUSD);
});

test('simulate: context growth past 100k triggers Haiku tier jumps; compaction resets them', () => {
  const roster = ROSTERS.triCameral();
  const grown = simulateStudio({ roster, hours: 4, workload: { contextGrowth: 10_000, compactAt: 1e9 } });
  const flat = simulateStudio({ roster, hours: 4, workload: { contextGrowth: 0 } });
  assert.ok(grown.tierJumpCalls > 0);
  assert.equal(flat.tierJumpCalls, 0);
  assert.ok(grown.timeline.every(c => c.ctx <= 20_000 + 10_000 * (c.cycle - 1)));
  const compacted = simulateStudio({ roster, hours: 4, workload: { contextGrowth: 10_000, compactAt: 90_000 } });
  assert.equal(compacted.tierJumpCalls, 0);
  assert.ok(compacted.timeline.every(c => c.ctx <= 90_000));
});

test('simulate: no plan means everything is billed and nothing is exhausted', () => {
  const r = simulateStudio({ roster: tri, hours: 3 });
  close(r.apiUSD, r.apiEquivalentUSD);
  assert.equal(r.subscriptionUSD, 0);
  assert.equal(r.quotaExhaustedAtHour, null);
});

test('simulate: a roomy plan absorbs all calls and costs only its prorated price', () => {
  const plan = { ...PLAN, windowCap: 1e9, weeklyCap: 1e12 };
  const r = simulateStudio({ roster: tri, hours: 24, plan });
  assert.equal(r.apiUSD, 0);
  assert.equal(r.quotaExhaustedAtHour, null);
  close(r.subscriptionUSD, 200 * r.wallHours / 730);
  close(r.totalUSD, r.subscriptionUSD);
});

test('simulate: weekly plans prorate over 168 hours', () => {
  const plan = { ...PLAN, period: 'week', priceUSD: 50, windowCap: 1e9, weeklyCap: 1e12 };
  const r = simulateStudio({ roster: tri, hours: 10, plan });
  close(r.subscriptionUSD, 50 * r.wallHours / 168);
});

test('simulate: overflow "api" keeps the pace and bills the excess', () => {
  const r = simulateStudio({ roster: single, hours: 24, plan: PLAN, overflow: 'api' });
  const free = simulateStudio({ roster: single, hours: 24 });
  assert.equal(r.cycles, free.cycles);
  assert.ok(r.quotaExhaustedAtHour > 0 && r.quotaExhaustedAtHour < 1);
  assert.ok(r.overflowCalls > 0 && r.apiUSD > 0 && r.apiUSD < r.apiEquivalentUSD);
  assert.equal(r.waitedHours, 0);
});

test('simulate: overflow "wait" bills nothing extra but loses wall-clock to the window', () => {
  const r = simulateStudio({ roster: single, hours: 24, plan: PLAN, overflow: 'wait' });
  assert.equal(r.apiUSD, 0);
  assert.ok(r.waitedHours > 12);
  assert.ok(r.cycles < simulateStudio({ roster: single, hours: 24 }).cycles / 5);
});

test('simulate: "wait" never exceeds the burst cap in any 5-hour window', () => {
  const r = simulateStudio({ roster: tri, hours: 24, plan: PLAN, overflow: 'wait' });
  for (const c of r.timeline) {
    const inWindow = r.timeline.filter(d => d.start > c.end - 5 && d.end <= c.end).reduce((s, d) => s + d.cu, 0);
    assert.ok(inWindow <= PLAN.windowCap + 1e-6, `${inWindow} CU in window ending ${c.end}`);
  }
});

test('simulate: "wait" stops with reason "quota" when a phase can never fit', () => {
  const plan = { ...PLAN, windowCap: 10 };
  const r = simulateStudio({ roster: single, hours: 24, plan, overflow: 'wait' });
  assert.equal(r.stoppedReason, 'quota');
  assert.equal(r.cycles, 0);
  assert.equal(r.quotaExhaustedAtHour, 0);
  assert.equal(r.roi, null);
});

test('simulate: earlier exhaustion for the heavier roster under the same plan', () => {
  const [a, b] = compareRosters([single, tri], { hours: 24, plan: PLAN });
  assert.ok(a.quotaExhaustedAtHour < b.quotaExhaustedAtHour);
});

test('simulate: higher builder effort injects fewer defects per item', () => {
  const lo = simulateStudio({ roster: ROSTERS.triCameral({ builder: { model: HAIKU, effort: 'light' } }), hours: 1 });
  const hi = simulateStudio({ roster: ROSTERS.triCameral({ builder: { model: HAIKU, effort: 'max' } }), hours: 1 });
  assert.ok(hi.defectsInjected / hi.items < lo.defectsInjected / lo.items);
});

test('simulate: defectPenalty scales the results lost per escape', () => {
  const r1 = simulateStudio({ roster: single, hours: 2 });
  const r4 = simulateStudio({ roster: single, hours: 2, workload: { defectPenalty: 4 } });
  close(r1.items - r4.results, 4 * r4.defectsEscaped, 1e-6);
});

test('simulate: penalty for escapes flips the capped-plan winner toward tri-cameral', () => {
  const sonnet = ROSTERS.singleModel({ model: SONNET, effort: 'medium' });
  const at = p => compareRosters([sonnet, tri], { hours: 24, plan: PLAN, overflow: 'wait', workload: { defectPenalty: p } });
  const [a1, b1] = at(1), [a4, b4] = at(4);
  assert.ok(a1.roi > b1.roi);
  assert.ok(b4.roi > a4.roi);
});

test('simulate: partial workload overrides keep the other defaults', () => {
  const r = simulateStudio({ roster: tri, hours: 1, workload: { output: { build: 1_000 } } });
  assert.ok(r.cycles > simulateStudio({ roster: tri, hours: 1 }).cycles);
});

test('simulate: timeline is monotonic and cumulative fields agree with totals', () => {
  const r = simulateStudio({ roster: tri, hours: 8, plan: PLAN, overflow: 'wait' });
  for (let i = 1; i < r.timeline.length; i++) {
    assert.ok(r.timeline[i].start >= r.timeline[i - 1].end - 1e-12);
    assert.ok(r.timeline[i].cumCU > r.timeline[i - 1].cumCU);
  }
  const lastCycle = r.timeline.at(-1);
  close(lastCycle.cumCU, r.cu, 1e-6);
  close(lastCycle.cumUSD, r.apiEquivalentUSD, 1e-9);
  close(lastCycle.cumEscaped, r.defectsEscaped, 1e-9);
});

test('simulate: rejects bad configuration', () => {
  assert.throws(() => simulateStudio({ roster: tri, overflow: 'panic' }), /overflow/);
  assert.throws(() => simulateStudio({ roster: { builders: { model: HAIKU, effort: 'medium', count: 0 }, reviewers: [] } }), /builder/);
  assert.throws(() => simulateStudio({ roster: ROSTERS.singleModel({ model: 'nope' }) }), /unknown model/);
});

test('simulate: maxCycles caps the run', () => {
  assert.equal(simulateStudio({ roster: tri, hours: 24, maxCycles: 3 }).cycles, 3);
});

test('simulate: a 24-hour single-model + tri-cameral comparison runs well under a second', () => {
  const t0 = performance.now();
  compareRosters([single, tri], { hours: 24, plan: PLAN, overflow: 'wait' });
  assert.ok(performance.now() - t0 < 1000);
});

test('CU_MENU and PRIORS are frozen so callers cannot mutate shared defaults by accident', () => {
  assert.ok(Object.isFrozen(CU_MENU) && Object.isFrozen(PRIORS) && Object.isFrozen(PRICING));
});
