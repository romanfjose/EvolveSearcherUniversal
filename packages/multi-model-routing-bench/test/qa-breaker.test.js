/**
 * Helmet 03 — Synthetic José QA ("Where's the Bathroom?" Breaker)
 * Simultaneous Quota-Exhaustion & Latency-Spike Failover Test Suite.
 *
 * Verifies multi-model studio routing under real-world catastrophic failure modes:
 * - Simultaneous burst-window / weekly quota exhaustion and sudden latency spikes
 * - Policy failover dynamics ('api' vs 'wait') under severe latency delays
 * - Out-of-order calls, boundary conditions, and zero-headroom edge cases
 * - High concurrency / multi-phase starvation and dead-lock prevention
 * - Escaped defect accounting and ROI collapse under asymmetric stress
 *
 * Zero external dependencies. Uses Node.js native test runner and assert/strict.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING,
  CU_MENU,
  PRIORS,
  DEFAULT_WORKLOAD,
  ROSTERS,
  RollingQuota,
  simulateStudio,
  compareRosters,
  priceCall,
  agentCU,
  detectProbability,
  reviewerCorrelation,
} from '../src/cu-engine.mjs';
import { evaluateRun, FAILURE_MODES } from '../src/role-eval.mjs';

const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';

const close = (a, b, eps = 1e-9) => {
  assert.ok(
    Math.abs(a - b) <= eps,
    `Expected |${a} - ${b}| <= ${eps}, difference was ${Math.abs(a - b)}`
  );
};

// ============================================================================
// 1. ANGLE 1: SIMULTANEOUS QUOTA EXHAUSTION + LATENCY SPIKE (CATASTROPHIC COLD REALITY)
// ============================================================================

test('breaker: simultaneous quota exhaustion and latency spike under "api" overflow routes with receipts', () => {
  // Scenario: Quota is razor-thin (exhausts on the very first builder wave),
  // and simultaneously network/model tokensPerSec drops from 60/90/150 to 1 token/sec (massive latency spike).
  const tightPlan = {
    priceUSD: 100,
    period: 'month',
    windowHours: 5,
    windowCap: 1.0, // Barely fits part of one build wave
    weeklyCap: 10.0,
    reserveFraction: 0.1,
  };

  const spikyPriors = {
    ...PRIORS,
    models: {
      [OPUS]: { ...PRIORS.models[OPUS], tokensPerSec: 1 },
      [SONNET]: { ...PRIORS.models[SONNET], tokensPerSec: 2 },
      [HAIKU]: { ...PRIORS.models[HAIKU], tokensPerSec: 5 },
    },
  };

  const spikyWorkload = {
    ...DEFAULT_WORKLOAD,
    callOverheadSec: 60, // Heavy network lag
    output: { build: 10_000, review: 5_000, fix: 4_000 },
  };

  const roster = ROSTERS.triCameral({ builders: 2 });
  const sim = simulateStudio({
    roster,
    hours: 24,
    plan: tightPlan,
    overflow: 'api',
    priors: spikyPriors,
    workload: spikyWorkload,
  });

  // Verification invariants:
  // 1. Quota must exhaust immediately at t = 0 (receipt of exhaustion)
  assert.equal(sim.quotaExhaustedAtHour, 0, 'Quota must be flagged exhausted at t=0');
  assert.equal(sim.waitedHours, 0, 'Overflow "api" should never wait');
  assert.ok(sim.overflowCalls > 0, 'Must record overflowing calls billed to API');
  assert.ok(sim.apiUSD > 0, 'API dollar overflow must be strictly positive');
  assert.ok(sim.wallHours > 0, 'Wall clock must advance despite latency spike');

  // 2. Timeline must remain monotonic and unbroken
  for (let i = 1; i < sim.timeline.length; i++) {
    assert.ok(
      sim.timeline[i].start >= sim.timeline[i - 1].end - 1e-12,
      `Cycle ${sim.timeline[i].cycle} start time is not monotonic`
    );
  }

  // 3. Defect accounting must balance perfectly
  close(sim.defectsInjected, sim.defectsCaught + sim.defectsEscaped, 1e-6);
  close(sim.results, sim.items - spikyWorkload.defectPenalty * sim.defectsEscaped, 1e-6);
});

test('breaker: simultaneous quota exhaustion and latency spike under "wait" overflow halts cleanly without infinite loop', () => {
  // Scenario: Plan cannot admit the builder call, and token throughput is sluggish.
  // The system must NOT lock in an infinite loop; it must exit with stoppedReason === 'quota'.
  const suffocatedPlan = {
    priceUSD: 500,
    period: 'month',
    windowHours: 5,
    windowCap: 0.2, // Impossible for any builder wave to fit
    weeklyCap: 10,
    reserveFraction: 0,
  };

  const sluggishPriors = {
    ...PRIORS,
    models: {
      [HAIKU]: { ...PRIORS.models[HAIKU], tokensPerSec: 0.1 },
    },
  };

  const roster = ROSTERS.triCameral();
  const sim = simulateStudio({
    roster,
    hours: 24,
    plan: suffocatedPlan,
    overflow: 'wait',
    priors: sluggishPriors,
  });

  assert.equal(sim.stoppedReason, 'quota');
  assert.equal(sim.cycles, 0);
  assert.equal(sim.items, 0);
  assert.equal(sim.results, 0);
  assert.equal(sim.roi, null);
});

// ============================================================================
// 2. ANGLE 2: ROLLING QUOTA CORNER CASES (WHERE'S THE BATHROOM?)
// ============================================================================

test('breaker: RollingQuota nextFit edge-of-window micro-tick precision', () => {
  const q = new RollingQuota({ windowHours: 5, windowCap: 10, weeklyCap: 100 });

  // Consume full window at t = 1.000000
  assert.ok(q.consume(1.0, 10));

  // At t = 5.999999, window from (1.0, 6.0] still holds 10 CU -> cannot fit 1 CU
  assert.equal(q.fits(5.999999, 1), false);

  // At t = 6.000000, 1.0 is exactly outside (6.0 - 5.0, 6.0] -> exactly fits!
  assert.equal(q.fits(6.0, 1), true);

  // nextFit from t = 2.0 should point exactly to 6.0
  assert.equal(q.nextFit(2.0, 5), 6.0);

  // Over-capacity request should return Infinity immediately
  assert.equal(q.nextFit(2.0, 10.0001), Infinity);
});

test('breaker: RollingQuota weekly allowance boundary saturation and reserve lockout', () => {
  // 100 weekly cap with 25% reserve -> 75 allowance
  const q = new RollingQuota({
    windowHours: 5,
    windowCap: 50,
    weeklyCap: 100,
    weekHours: 168,
    reserveFraction: 0.25,
  });

  assert.equal(q.weeklyAllowance, 75);

  // Consume 50 at t = 0 (burst cap hit)
  assert.ok(q.consume(0, 50));

  // Advance to t = 5 (burst freed, but weekly has 50 used)
  assert.equal(q.fits(5, 30), false, '50 + 30 = 80 > 75 allowance');
  assert.equal(q.fits(5, 25), true, '50 + 25 = 75 <= 75 allowance');

  assert.ok(q.consume(5, 25)); // Weekly now fully exhausted at 75

  // Next fit for any positive CU must wait for the earliest weekly event to expire at t = 168
  assert.equal(q.nextFit(6, 10), 168);
});

test('breaker: RollingQuota rejects negative, NaN, or non-finite inputs', () => {
  assert.throws(() => new RollingQuota({ windowCap: -5 }), RangeError);
  assert.throws(() => new RollingQuota({ windowCap: NaN }), RangeError);
  assert.throws(() => new RollingQuota({ windowCap: 10, reserveFraction: -0.1 }), RangeError);
  assert.throws(() => new RollingQuota({ windowCap: 10, reserveFraction: 1.0 }), RangeError);
  assert.throws(() => new RollingQuota({ windowCap: 10, reserveFraction: 1.5 }), RangeError);

  const q = new RollingQuota({ windowCap: 10 });
  assert.ok(q.consume(1, 5));
  assert.throws(() => q.consume(0.5, 2), /time order/);
});

// ============================================================================
// 3. ANGLE 3: ASYMMETRIC FAILOVER BETWEEN TRI-CAMERAL AND SINGLE-MODEL UNDER SPIKE
// ============================================================================

test('breaker: failover comparison under severe latency spikes preserves tri-cameral ROI advantage', () => {
  // When prompt latency shoots up 10x due to network degradation:
  const degradedWorkload = {
    ...DEFAULT_WORKLOAD,
    callOverheadSec: 80, // 10x overhead
    output: { build: 12_000, review: 4_000, fix: 6_000 },
  };

  const plan = {
    priceUSD: 200,
    period: 'month',
    windowHours: 5,
    windowCap: 400,
    weeklyCap: 4000,
    reserveFraction: 0.2,
  };

  const single = ROSTERS.singleModel({ model: OPUS, effort: 'high' });
  const tri = ROSTERS.triCameral();

  const [resSingle, resTri] = compareRosters([single, tri], {
    hours: 24,
    plan,
    overflow: 'api',
    workload: degradedWorkload,
  });

  // Both run under the same latency spike
  assert.ok(resSingle.cycles > 0);
  assert.ok(resTri.cycles > 0);

  // Tri-cameral should catch dramatically higher defects (quality moat)
  assert.ok(
    resTri.catchRate > resSingle.catchRate * 2,
    `Tri-cameral catch rate (${resTri.catchRate}) should exceed 2x single (${resSingle.catchRate})`
  );

  // Tri-cameral cost per clean result must remain lower than single Opus
  assert.ok(
    resTri.usdPerResult < resSingle.usdPerResult,
    `Tri-cameral USD/result (${resTri.usdPerResult}) should be lower than single (${resSingle.usdPerResult})`
  );
});

test('breaker: sudden rework avalanche when builders inject high defect rate under tight quota', () => {
  // Builder defect rate spikes to 0.90 (90% defective items), creating an avalanche of rework fix calls
  const avalanchePriors = {
    ...PRIORS,
    models: {
      ...PRIORS.models,
      [HAIKU]: { ...PRIORS.models[HAIKU], defectRate: 0.90 },
    },
  };

  const plan = {
    priceUSD: 200,
    period: 'month',
    windowHours: 5,
    windowCap: 50, // Constrained burst cap
    weeklyCap: 500,
    reserveFraction: 0.1,
  };

  const roster = ROSTERS.triCameral({ builders: 4 });
  const res = simulateStudio({
    roster,
    hours: 12,
    plan,
    overflow: 'wait',
    priors: avalanchePriors,
  });

  assert.ok(res.cycles > 0, 'Simulation should handle rework avalanche without crashing');
  assert.ok(res.defectsCaught > 0, 'Reviewers should catch the bulk of injected defects');
  assert.ok(res.waitedHours > 0, 'Window wait times must increase due to rework phase charges');
});

// ============================================================================
// 4. ANGLE 4: ROLE-EVAL RUNTIME DEFECT HARNESS UNDER STRAIN
// ============================================================================

test('breaker: role-eval flags sycophantic approval and premature self-edit during failover chaos', () => {
  // During failover, an agent attempts to cut corners by reviewing its own code
  // and issuing a sycophantic praise without verified citations.
  const chaoticRun = {
    steps: [
      { agent: 'builder-rogue', role: 'builder', kind: 'write', target: 'src/failover.js', model: 'haiku' },
      { agent: 'builder-rogue', role: 'auditor', kind: 'review', target: 'src/failover.js', verdict: 'approve', text: 'LGTM, looks flawless!' },
    ],
  };

  const evalResult = evaluateRun(chaoticRun);
  assert.equal(evalResult.pass, false);

  const errors = evalResult.findings.filter((f) => f.severity === 'error').map((f) => f.check);
  assert.ok(errors.includes('self-graded'), 'Must flag self-grading');
  assert.ok(errors.includes('author-approval'), 'Must flag author approval');
  assert.ok(errors.includes('no-evidence'), 'Must flag praise without evidence as error');
});

test('breaker: role-eval catches fake citations injected during emergency recovery', () => {
  const source = 'https://status.anthropic.com/incidents/failover';
  const realBody = 'All systems operational. Failover completed in 120ms.';
  const fakeRun = {
    steps: [
      {
        agent: 'scout-1',
        role: 'scout',
        kind: 'scout',
        target: 'status.md',
        text: `Incident resolved: [verified: ${source} "All systems went down for 48 hours."]`
      },
    ],
    sources: { [source]: realBody },
  };

  const res = evaluateRun(fakeRun);
  assert.equal(res.pass, false);
  const fakeErrors = res.findings.filter((f) => f.mode === 'FAKE_CITATION');
  assert.equal(fakeErrors.length, 1);
  assert.equal(fakeErrors[0].check, 'quote-not-in-source');
});

// ============================================================================
// 5. ANGLE 5: EXTREME SCALE & ZERO-HEADROOM BOUNDARIES
// ============================================================================

test('breaker: extreme horizon with micro-cycles never causes floating point drift or unhandled exceptions', () => {
  // Run 1000 micro-cycles under zero context growth to verify numerical convergence
  const roster = ROSTERS.triCameral({ builders: 1 });
  const staticWorkload = {
    ...DEFAULT_WORKLOAD,
    contextGrowth: 0,
    itemsPerBuilder: 1,
  };

  const sim = simulateStudio({
    roster,
    hours: 500,
    workload: staticWorkload,
    maxCycles: 500,
  });

  assert.equal(sim.cycles, 500);
  assert.ok(Number.isFinite(sim.cu));
  assert.ok(Number.isFinite(sim.totalUSD));
  assert.ok(Number.isFinite(sim.results));
  assert.ok(!Number.isNaN(sim.roi));

  // Verify timeline consistency
  const last = sim.timeline.at(-1);
  close(last.cumCU, sim.cu, 1e-6);
  close(last.cumUSD, sim.apiEquivalentUSD, 1e-6);
});
