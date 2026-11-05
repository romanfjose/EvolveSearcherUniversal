// Pure, deterministic routing and budget-admission policy for a multi-agent workload.
// No I/O: every function is a function of its arguments, so the eval harness replays
// the same inputs and gets the same verdicts on every run.

// Generic cost tiers. Weights are relative compute units (CU), not vendor prices.
export const TIERS = Object.freeze({
  cheap: { cu: 0.09, judgment: false },
  mid: { cu: 0.9, judgment: false },
  heavy: { cu: 1.8, judgment: false },
  judgment: { cu: 3.6, judgment: true },
});

// Role -> tier. Unlisted roles are rejected (fail closed).
export const ROLE_TIERS = Object.freeze({
  grunt: 'cheap',
  scout: 'mid',
  mechanic: 'heavy',
  sniper: 'heavy',
  auditor: 'judgment',
});

export const WRITE_MODES = Object.freeze(['read-only', 'workspace-write']);
const READ_ONLY_ROLES = new Set(['auditor']);
export const DEFAULT_FAILURE_THRESHOLD = 3;
// Upper bound on every accounting value. Keeps capacity * (100 - reservePct) and the 4-decimal rounding inside the
// exactly representable integer range, so Number.MAX_VALUE cannot overflow the share to Infinity and get admitted.
export const MAX_CU = 1e9;

const EPS = 1e-9;
const round4 = n => Math.round(n * 10000) / 10000;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Returns a reason string for the first unusable accounting value, or null when all are usable.
// Runs before any arithmetic: NaN, Infinity, strings, negatives and fractional counts are refused.
function firstInvalid(checks) {
  for (const [name, value, rule] of checks) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${name} must be a finite number (fail closed)`;
    if (rule.exclusiveMin !== undefined && !(value > rule.exclusiveMin)) return `${name} must be > ${rule.exclusiveMin} (fail closed)`;
    if (rule.min !== undefined && value < rule.min) return `${name} must be >= ${rule.min} (fail closed)`;
    if (rule.max !== undefined && value > rule.max) return `${name} must be <= ${rule.max} (fail closed)`;
    if (rule.integer && !Number.isInteger(value)) return `${name} must be an integer (fail closed)`;
  }
  return null;
}

export function routeTask({ role, mode = 'read-only' } = {}) {
  if (typeof role !== 'string' || !has(ROLE_TIERS, role)) {
    return { ok: false, reason: `unknown role "${role}"` };
  }
  if (!WRITE_MODES.includes(mode)) {
    return { ok: false, reason: `unknown mode "${mode}"` };
  }
  if (READ_ONLY_ROLES.has(role) && mode !== 'read-only') {
    return { ok: false, reason: `role "${role}" is hard-locked to read-only` };
  }
  const tier = ROLE_TIERS[role];
  return { ok: true, role, mode, tier, cu: TIERS[tier].cu };
}

// Admission for one planned spend.
//  - shareCU = capacityCU * (100 - reservePct) / 100. The reserve floor is never spendable here.
//  - Judgment-tier spend also needs room under judgmentAllowanceCU (default 0, so it is refused unless granted).
//  - Circuit breaker: once consecutiveFailures reaches failureThreshold, every admission is refused.
export function admitSpend(input = {}) {
  const {
    cu,
    tier,
    usedCU = 0,
    capacityCU,
    reservePct = 0,
    judgmentUsedCU = 0,
    judgmentAllowanceCU = 0,
    consecutiveFailures = 0,
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  } = input;

  const invalid = firstInvalid([
    ['cu', cu, { min: 0, max: MAX_CU }],
    ['usedCU', usedCU, { min: 0, max: MAX_CU }],
    ['capacityCU', capacityCU, { exclusiveMin: 0, max: MAX_CU }],
    ['reservePct', reservePct, { min: 0, max: 100 }],
    ['judgmentUsedCU', judgmentUsedCU, { min: 0, max: MAX_CU }],
    ['judgmentAllowanceCU', judgmentAllowanceCU, { min: 0, max: MAX_CU }],
    ['consecutiveFailures', consecutiveFailures, { min: 0, max: MAX_CU, integer: true }],
    ['failureThreshold', failureThreshold, { min: 1, max: MAX_CU, integer: true }],
  ]);
  if (invalid) return { ok: false, reason: invalid };
  if (typeof tier !== 'string' || !has(TIERS, tier)) return { ok: false, reason: `unknown tier "${tier}"` };

  if (consecutiveFailures >= failureThreshold) {
    return {
      ok: false,
      breaker: 'open',
      reason: `circuit breaker open: ${consecutiveFailures} consecutive failures >= threshold ${failureThreshold}`,
    };
  }

  const shareCU = round4(capacityCU * (100 - reservePct) / 100);
  const reserveFloorCU = round4(capacityCU - shareCU);
  const projectedCU = round4(usedCU + cu);
  if (projectedCU > shareCU + EPS) {
    return {
      ok: false,
      breaker: 'closed',
      reason: `agent share exceeded: ${projectedCU} > ${shareCU} CU (${reservePct}% reserved)`,
    };
  }
  if (TIERS[tier].judgment && judgmentUsedCU + cu > judgmentAllowanceCU + EPS) {
    return {
      ok: false,
      breaker: 'closed',
      reason: `judgment allowance exceeded: ${round4(judgmentUsedCU + cu)} > ${judgmentAllowanceCU} CU`,
    };
  }
  return {
    ok: true,
    breaker: 'closed',
    shareCU,
    reserveFloorCU,
    remainingCU: round4(shareCU - projectedCU),
  };
}

// Routing plus admission in one decision. The budget object is the only source of accounting values;
// cu and tier are always derived from the route, never taken from the caller.
export function routeAgentSeat({ role, mode = 'read-only', budget } = {}) {
  const route = routeTask({ role, mode });
  if (!route.ok) return { ok: false, stage: 'route', reason: route.reason };
  if (budget === null || typeof budget !== 'object' || Array.isArray(budget)) {
    return { ok: false, stage: 'admission', reason: 'budget object required (fail closed)' };
  }
  const admission = admitSpend({ ...budget, cu: route.cu, tier: route.tier });
  const base = { role, mode, tier: route.tier, cu: route.cu };
  if (!admission.ok) return { ...base, ok: false, stage: 'admission', reason: admission.reason, breaker: admission.breaker };
  return {
    ...base,
    ok: true,
    stage: 'admitted',
    breaker: admission.breaker,
    shareCU: admission.shareCU,
    remainingCU: admission.remainingCU,
  };
}
