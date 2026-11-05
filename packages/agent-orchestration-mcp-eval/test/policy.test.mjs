import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admitSpend, routeAgentSeat, routeTask } from '../src/policy.mjs';

const base = { cu: 0.09, tier: 'cheap', usedCU: 0, capacityCU: 10, reservePct: 0 };

test('negative accounting values are refused before arithmetic (MCP bypass regression)', () => {
  assert.equal(admitSpend({ ...base, usedCU: -100 }).ok, false);
  assert.match(admitSpend({ ...base, usedCU: -100 }).reason, /usedCU must be >= 0/);
  assert.equal(admitSpend({ ...base, cu: -1 }).ok, false);
  assert.equal(admitSpend({ ...base, judgmentUsedCU: -100, tier: 'judgment', cu: 3.6, judgmentAllowanceCU: 3.6 }).ok, false);
});

test('capacity must stay strictly positive', () => {
  for (const capacityCU of [0, -5]) {
    assert.equal(admitSpend({ ...base, capacityCU }).ok, false);
  }
  assert.match(admitSpend({ ...base, capacityCU: 0 }).reason, /capacityCU must be > 0/);
});

test('non-numeric and non-finite values are refused', () => {
  for (const v of ['0', null, NaN, Infinity, -Infinity]) {
    assert.equal(admitSpend({ ...base, usedCU: v }).ok, false, `usedCU=${String(v)}`);
  }
});

test('reserve percentage removes the floor from agent share', () => {
  const r = admitSpend({ ...base, capacityCU: 10, reservePct: 20, usedCU: 7.91 });
  assert.equal(r.ok, true);
  assert.equal(r.shareCU, 8);
  assert.equal(r.reserveFloorCU, 2);
  assert.equal(admitSpend({ ...base, capacityCU: 10, reservePct: 20, usedCU: 7.92 }).ok, false);
});

test('reserve percentage must be within [0, 100]', () => {
  assert.equal(admitSpend({ ...base, reservePct: -1 }).ok, false);
  assert.equal(admitSpend({ ...base, reservePct: 100.5 }).ok, false);
});

test('judgment-tier spend needs an explicit allowance', () => {
  const judgment = { ...base, cu: 3.6, tier: 'judgment' };
  assert.equal(admitSpend(judgment).ok, false);
  assert.equal(admitSpend({ ...judgment, judgmentAllowanceCU: 3.6 }).ok, true);
  assert.equal(admitSpend({ ...judgment, judgmentUsedCU: 0.5, judgmentAllowanceCU: 3.6 }).ok, false);
});

test('circuit breaker opens at the failure threshold and default threshold is 3', () => {
  assert.equal(admitSpend({ ...base, consecutiveFailures: 2 }).ok, true);
  const open = admitSpend({ ...base, consecutiveFailures: 3 });
  assert.equal(open.ok, false);
  assert.equal(open.breaker, 'open');
  assert.equal(admitSpend({ ...base, consecutiveFailures: 1, failureThreshold: 1 }).ok, false);
});

test('unknown roles, modes and tiers fail closed; auditor is hard-locked read-only', () => {
  assert.equal(routeTask({ role: 'constructor' }).ok, false);
  assert.equal(routeTask({ role: 'grunt', mode: 'root-shell' }).ok, false);
  assert.equal(routeTask({ role: 'auditor', mode: 'workspace-write' }).ok, false);
  assert.equal(admitSpend({ ...base, tier: 'toString' }).ok, false);
});

test('routeAgentSeat derives cu and tier from the route, never from the caller', () => {
  const r = routeAgentSeat({ role: 'scout', budget: { usedCU: 0, capacityCU: 5, reservePct: 0, cu: 0, tier: 'cheap' } });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 'mid');
  assert.equal(r.cu, 0.9);
  assert.equal(r.remainingCU, 4.1);
});

test('routeAgentSeat requires a budget object (fail closed)', () => {
  assert.equal(routeAgentSeat({ role: 'grunt' }).ok, false);
  assert.equal(routeAgentSeat({ role: 'grunt', budget: [] }).ok, false);
});

test('accounting values above MAX_CU are refused, so the share cannot overflow to Infinity', () => {
  const r = admitSpend({ ...base, capacityCU: Number.MAX_VALUE });
  assert.equal(r.ok, false);
  assert.match(r.reason, /capacityCU must be <= 1000000000/);
  assert.equal(admitSpend({ ...base, capacityCU: 1e9 }).ok, true);
  assert.equal(admitSpend({ ...base, usedCU: 1e9 + 1, capacityCU: 1e9 }).ok, false);
  assert.equal(admitSpend({ ...base, failureThreshold: 1e9 + 1 }).ok, false);
});

test('NaN and Infinity are refused in every accounting field', () => {
  const fields = ['cu', 'usedCU', 'capacityCU', 'reservePct', 'judgmentUsedCU', 'judgmentAllowanceCU', 'consecutiveFailures', 'failureThreshold'];
  for (const field of fields) {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = admitSpend({ ...base, [field]: v });
      assert.equal(r.ok, false, `${field}=${v}`);
      assert.match(r.reason, new RegExp(`${field} must be a finite number`));
    }
  }
});

test('prototype keys are never roles or tiers', () => {
  for (const role of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(routeTask({ role }).ok, false, role);
  }
  for (const tier of ['__proto__', 'constructor', 'toString']) {
    assert.equal(admitSpend({ ...base, tier }).ok, false, tier);
  }
});
