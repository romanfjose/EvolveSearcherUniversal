import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMission, planMission, mulberry32, DEFAULT_MIX } from '../src/simulate.mjs';

const roomy = { usedCU: 0, capacityCU: 10000, reservePct: 0, judgmentAllowanceCU: 10000 };

test('mulberry32 and planMission are deterministic for a seed', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.deepEqual(planMission({ seed: 42 }), planMission({ seed: 42 }));
  assert.notDeepEqual(planMission({ seed: 42 }), planMission({ seed: 43 }));
});

test('default 100-step mission: bicameral routing costs at least 70% less than naive flagship routing', () => {
  const r = simulateMission({ steps: 100, seed: 42, budget: roomy });
  assert.equal(r.naive.plannedCU, 360);
  assert.equal(r.costReductionPct, 77);
  assert.ok(r.costReductionPct >= 70);
  assert.equal(r.bicameral.admitted, 100);
  assert.equal(r.naive.admitted, 100);
});

test('the mean reduction over seeds 1..200 is above 70% (expected value is 75% for the default mix)', () => {
  let sum = 0;
  for (let seed = 1; seed <= 200; seed++) sum += simulateMission({ seed, budget: roomy }).costReductionPct;
  const mean = sum / 200;
  assert.ok(mean > 70 && mean < 80, `mean ${mean}`);
});

test('every step is admitted through the real policy: an open breaker refuses all of them', () => {
  const r = simulateMission({ budget: { ...roomy, consecutiveFailures: 3 } });
  assert.equal(r.naive.admitted, 0);
  assert.equal(r.bicameral.admitted, 0);
  assert.equal(r.bicameral.spentCU, 0);
});

test('under a tight budget, spend never exceeds the agent share and judgment never exceeds its allowance', () => {
  const budget = { usedCU: 0, capacityCU: 50, reservePct: 20, judgmentAllowanceCU: 7.2 };
  const r = simulateMission({ budget });
  assert.ok(r.bicameral.spentCU <= 40 + 1e-9);
  assert.ok(r.naive.spentCU <= 7.2 + 1e-9, 'naive is all judgment-tier, so the allowance caps it');
  assert.equal(r.naive.admitted, 2);
  assert.ok(r.bicameral.admitted > r.naive.admitted);
  assert.equal(r.bicameral.cumulative.length, 100);
});

test('invalid mixes and step counts throw', () => {
  assert.throws(() => planMission({ steps: 0 }));
  assert.throws(() => planMission({ steps: 1.5 }));
  assert.throws(() => planMission({ mix: { grunt: -1 } }));
  assert.throws(() => planMission({ mix: { grunt: 0 } }));
  assert.throws(() => planMission({ mix: { ...DEFAULT_MIX, scout: NaN } }));
  assert.throws(() => simulateMission({}));
});
