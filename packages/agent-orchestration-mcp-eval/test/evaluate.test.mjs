import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentResponse } from '../src/evaluate.mjs';

const source = ['alpha', 'beta', 'gamma'];
const good = 'ANCHOR: t1\nBody.\nslice: L1-L2 "alpha\\nbeta"';

test('accepts a response that satisfies every check', () => {
  const r = evaluateAgentResponse({ response: good, contract: { anchor: 't1', source, forbiddenClaims: ['guaranteed'] } });
  assert.equal(r.ok, true);
  assert.equal(r.checks.coordinates.citations, 1);
  assert.equal(r.checks.schema.status, 'skipped');
});

test('rejects a citation whose quoted text differs from the source', () => {
  const r = evaluateAgentResponse({ response: 'ANCHOR: t1\nslice: L2-L3 "beta"', contract: { anchor: 't1', source } });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].check, 'coordinates');
});

test('rejects a slice that runs past the source', () => {
  const r = evaluateAgentResponse({ response: 'ANCHOR: t1\nslice: L3-L4 "gamma"', contract: { anchor: 't1', source } });
  assert.match(r.violations[0].message, /past the end/);
});

test('checks the JSON payload against the schema subset', () => {
  const schema = { type: 'object', required: ['n'], properties: { n: { type: 'integer', minimum: 1 } }, additionalProperties: false };
  const ok = evaluateAgentResponse({ response: 'ANCHOR: t1\n```json\n{"n": 2}\n```', contract: { anchor: 't1', schema } });
  assert.equal(ok.ok, true);
  const bad = evaluateAgentResponse({ response: 'ANCHOR: t1\n```json\n{"n": 0, "x": 1}\n```', contract: { anchor: 't1', schema } });
  assert.equal(bad.ok, false);
  assert.equal(bad.violations.length, 2);
});

test('an unsupported schema keyword is an error, not a silent pass', () => {
  assert.throws(
    () => evaluateAgentResponse({ response: 'ANCHOR: t1', contract: { anchor: 't1', schema: { pattern: '.*' } } }),
    /unsupported keyword "pattern"/,
  );
});

test('a contract without an anchor is rejected', () => {
  const r = evaluateAgentResponse({ response: 'hello', contract: { forbiddenClaims: ['x'] } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid contract');
});

test('forbidden claims match through Unicode folding', async () => {
  const { foldForMatch } = await import('../src/evaluate.mjs');
  assert.equal(foldForMatch('ｇｕａｒａｎｔｅｅｄ'), 'guaranteed');
  assert.equal(foldForMatch('guar​an­teed'), 'guaranteed');
  assert.equal(foldForMatch('İMPOSSIBLE'), 'impossible');
  assert.equal(foldForMatch('ﬁnal \n answer'), 'final answer');
  const r = evaluateAgentResponse({ response: 'ANCHOR: t1\n‮guaranteed', contract: { anchor: 't1', forbiddenClaims: ['Guaranteed'] } });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].message, 'forbidden claim present: "Guaranteed"');
});

test('near-miss citations are flagged as malformed, not skipped', () => {
  for (const line of ['slice: L١-L١ "alpha"', 'SLICE: L1-L1 "alpha"', 'slice: L1 - L1 "alpha"', 'slice: L1-L1 alpha', 'slice:']) {
    const r = evaluateAgentResponse({ response: `ANCHOR: t1\n${line}`, contract: { anchor: 't1', source } });
    assert.equal(r.ok, false, line);
    assert.match(r.violations[0].message, /malformed slice citation/);
  }
  const huge = evaluateAgentResponse({ response: 'ANCHOR: t1\nslice: L1-L99999999999999999999 "alpha"', contract: { anchor: 't1', source } });
  assert.match(huge.violations[0].message, /out of range/);
});

test('a __proto__ payload is rejected and pollutes nothing', () => {
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, additionalProperties: false };
  const r = evaluateAgentResponse({ response: 'ANCHOR: t1\n```json\n{"ok": true, "__proto__": {"polluted": true}}\n```', contract: { anchor: 't1', schema } });
  assert.equal(r.ok, false);
  assert.match(r.violations[0].message, /unexpected property "__proto__"/);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});
