import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createBudgetBreaker, FileStore, BudgetExceededError } from '../src/budget-breaker.mjs';

// Illustrative prices (USD per 1M tokens); 1M input tokens on "big" = $10.
const pricing = { big: { inputPerMTok: 10, outputPerMTok: 30 }, small: { inputPerMTok: 1, outputPerMTok: 2 } };
const clock = (t = Date.UTC(2026, 10, 4)) => { const c = () => t; c.advance = (ms) => { t += ms; }; return c; };

test('routes flagship until its degrade threshold, then falls back, then blocks with retry-after', async () => {
  const now = clock();
  const b = createBudgetBreaker({ pricing, routes: ['big', 'small'], caps: { global: { '5h': { usd: 1 } } }, degradeAt: 0.5, now });
  const req = { model: 'big', inputTokens: 10_000, maxOutputTokens: 0 }; // $0.10 on big, $0.01 on small
  const models = [];
  for (let i = 0; i < 5; i++) models.push((await b.authorize(req)).model);
  assert.deepEqual(models, ['big', 'big', 'big', 'big', 'big']); // $0.50 = 50%
  const d = await b.authorize(req);
  assert.equal(d.model, 'small');
  assert.equal(d.downgraded, true);
  for (let i = 0; i < 49; i++) assert.equal((await b.authorize(req)).ok, true); // $0.50 + $0.50 small = $1.00
  now.advance(60_000);
  const blocked = await b.authorize(req);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'budget_exhausted');
  assert.equal(blocked.retryAfterMs, 300 * 60_000 - 60_000); // first minute bucket rolls out of the 5h window
  now.advance(blocked.retryAfterMs);
  assert.equal((await b.authorize(req)).ok, true);
});

test('settle replaces estimate with actual usage; release refunds; both are idempotent', async () => {
  const b = createBudgetBreaker({ pricing, routes: ['big'], caps: { tenant: { '7d': { tokens: 10_000 } } }, now: clock() });
  const r = await b.authorize({ tenant: 'acme', inputTokens: 1000, maxOutputTokens: 4000 });
  assert.equal((await b.usage({ tenant: 'acme' }))['t:acme']['7d'].tokens, 5000);
  assert.deepEqual(await b.settle(r.reservation, { inputTokens: 1000, outputTokens: 500 }), { tokens: 1500, usd: 0.025 });
  assert.equal(await b.settle(r.reservation, { inputTokens: 9, outputTokens: 9 }), false);
  assert.equal((await b.usage({ tenant: 'acme' }))['t:acme']['7d'].tokens, 1500);
  const r2 = await b.authorize({ tenant: 'acme', inputTokens: 8000 });
  assert.equal(await b.release(r2.reservation), true);
  assert.equal((await b.usage({ tenant: 'acme' }))['t:acme']['7d'].tokens, 1500);
  assert.equal((await b.authorize({ tenant: 'acme', inputTokens: 20_000 })).reason, 'request_exceeds_cap');
  assert.equal((await b.authorize({ tenant: 'other', inputTokens: 8000 })).ok, true, 'tenant caps are isolated');
});

test('idempotency key replays the same reservation instead of double-charging', async () => {
  const b = createBudgetBreaker({ pricing, routes: ['big'], now: clock() });
  const a = await b.authorize({ inputTokens: 100, key: 'turn-1' });
  const again = await b.authorize({ inputTokens: 100, key: 'turn-1' });
  assert.equal(again.reservation, a.reservation);
  assert.equal(again.replayed, true);
  assert.equal((await b.usage()).global['5h'].tokens, 100);
});

test('per-tenant token bucket rate limit', async () => {
  const now = clock();
  const b = createBudgetBreaker({ pricing, routes: ['small'], rateLimit: { capacity: 2, refillPerSec: 0.5 }, now });
  assert.equal((await b.authorize({ tenant: 't' })).ok, true);
  assert.equal((await b.authorize({ tenant: 't' })).ok, true);
  const d = await b.authorize({ tenant: 't' });
  assert.deepEqual([d.reason, d.retryAfterMs], ['rate_limited', 2000]);
  assert.equal((await b.authorize({ tenant: 'u' })).ok, true);
  now.advance(2000);
  assert.equal((await b.authorize({ tenant: 't' })).ok, true);
});

test('run() settles on success, releases on failure, throws BudgetExceededError when blocked', async () => {
  const b = createBudgetBreaker({ pricing, routes: ['small'], caps: { global: { '5h': { tokens: 100 } } }, now: clock() });
  const out = await b.run({ inputTokens: 50, maxOutputTokens: 50 }, async ({ model }) => ({ value: model, usage: { inputTokens: 50, outputTokens: 10 } }));
  assert.deepEqual([out.value, out.charged.tokens], ['small', 60]);
  await assert.rejects(b.run({ inputTokens: 40 }, async () => { throw new Error('provider 500'); }), /provider 500/);
  assert.equal((await b.usage()).global['5h'].tokens, 60);
  await assert.rejects(b.run({ inputTokens: 41 }, async () => ({})), BudgetExceededError);
});

test('FileStore: 4 threads × 50 concurrent updates, none lost or double-applied', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llm-harden-'));
  try {
    const src = `
      const { workerData, parentPort } = require('node:worker_threads');
      import(workerData.mod).then(async ({ createBudgetBreaker, FileStore }) => {
        const b = createBudgetBreaker({ pricing: { m: { inputPerMTok: 1, outputPerMTok: 1 } }, routes: ['m'], store: new FileStore(workerData.dir), now: () => 1e12 });
        for (let i = 0; i < 50; i++) await b.authorize({ tenant: 'w', inputTokens: 1 });
        parentPort.postMessage('done');
      });`;
    const mod = new URL('../src/budget-breaker.mjs', import.meta.url).href;
    await Promise.all(Array.from({ length: 4 }, () => new Promise((res, rej) => {
      const w = new Worker(src, { eval: true, workerData: { dir, mod } });
      w.on('message', res); w.on('error', rej);
    })));
    const b = createBudgetBreaker({ pricing: { m: { inputPerMTok: 1, outputPerMTok: 1 } }, routes: ['m'], store: new FileStore(dir), now: () => 1e12 });
    assert.equal((await b.usage({ tenant: 'w' }))['t:w']['5h'].tokens, 200);
    const versions = (await readdir(dir)).filter((f) => f.startsWith('state.')).map((f) => Number(f.split('.')[1]));
    assert.equal(Math.max(...versions), 200, 'exactly one committed version per update');
    assert.ok(!(await readdir(dir)).some((f) => f.startsWith('.tmp-')), 'no temp files left behind');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
