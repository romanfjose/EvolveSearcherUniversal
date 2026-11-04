// Deterministic token/cost circuit breaker. Zero dependencies.
//
// - Rolling caps over a 5-hour window (1-minute buckets) and a 7-day window (1-hour buckets),
//   enforced globally and per tenant, on both USD and tokens.
// - Per-tenant token-bucket rate limiting.
// - Reserve → settle/release accounting: the worst-case cost (input + max output) is reserved
//   before the call and replaced by actual usage afterwards, so concurrent calls cannot overshoot.
// - Tiered fallback routing: each route tier may only push utilization up to its `until` ratio,
//   so traffic degrades flagship → cheaper models before any hard stop.
// - Money is integer micro-USD (tokens × USD-per-1M-tokens = µUSD), so accounting is exact.
// - State lives in a pluggable store. FileStore is lock-free and multi-process safe:
//   every update publishes an immutable snapshot `state.<version>.json` with link(2),
//   which fails atomically with EEXIST if another writer won that version (compare-and-swap).
//   Snapshots are collected by age, never by count, so a slow writer cannot re-create one (ABA).

import { mkdir, readdir, readFile, writeFile, link, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIN = 60_000, HOUR = 3_600_000;
export const WINDOWS = Object.freeze({
  '5h': { key: 'm', bucketMs: MIN, buckets: 300 },
  '7d': { key: 'h', bucketMs: HOUR, buckets: 168 },
});

export class BudgetExceededError extends Error {
  constructor(decision) {
    super(`LLM call blocked: ${decision.reason}${decision.scope ? ` (${decision.scope} ${decision.window} ${decision.dimension})` : ''}`);
    this.name = 'BudgetExceededError';
    Object.assign(this, decision);
  }
}

// ───────────────────────────── stores ─────────────────────────────

// Store contract: transact(fn) calls fn(state) with a private copy of the latest state (null if none);
// fn returns { state, result } to commit `state`, or { result } (state undefined) to commit nothing.

/** In-process store. Mutations are synchronous, so each transaction is atomic on the event loop. */
export class MemoryStore {
  #state = null;
  async transact(fn) {
    const { state, result } = fn(structuredClone(this.#state));
    if (state !== undefined) this.#state = state;
    return result;
  }
}

/**
 * Lock-free, crash-safe, multi-process file store using versioned immutable snapshots.
 *
 * Commit = link(tmp, state.<v+1>.json), which fails with EEXIST if another writer took v+1.
 * ABA safety: a snapshot is garbage-collected only once it is older than `gcAgeMs`, and a writer
 * abandons (and retries) any attempt whose read→link window exceeds `commitWindowMs`. Because
 * gcAgeMs ≫ commitWindowMs, the file a stale writer would need to re-create always still exists.
 */
export class FileStore {
  constructor(dir, { gcAgeMs = 30_000, commitWindowMs = 2_000, maxAttempts = 1000 } = {}) {
    if (gcAgeMs < 4 * commitWindowMs) throw new Error('FileStore: gcAgeMs must be >= 4 × commitWindowMs');
    this.dir = dir; this.gcAgeMs = gcAgeMs; this.commitWindowMs = commitWindowMs; this.maxAttempts = maxAttempts;
  }

  async #versions() {
    try {
      return (await readdir(this.dir)).map((n) => /^state\.(\d+)\.json$/.exec(n)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }

  async #latest() {
    for (;;) {
      const version = (await this.#versions()).at(-1) ?? 0;
      if (!version) return { version: 0, state: null };
      try { return { version, state: JSON.parse(await readFile(join(this.dir, `state.${version}.json`), 'utf8')) }; }
      catch (e) { if (e.code !== 'ENOENT') throw e; } // superseded and collected under us: re-list
    }
  }

  async #gc(latest) {
    const cutoff = Date.now() - this.gcAgeMs;
    for (const v of await this.#versions()) {
      if (v >= latest) break;
      const p = join(this.dir, `state.${v}.json`);
      try { if ((await stat(p)).mtimeMs < cutoff) await unlink(p); else break; }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }

  async transact(fn) {
    await mkdir(this.dir, { recursive: true });
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const t0 = performance.now();
      const { version, state } = await this.#latest();
      const { state: next, result } = fn(state);
      if (next === undefined) return result;
      const tmp = join(this.dir, `.tmp-${process.pid}-${randomUUID()}`);
      await writeFile(tmp, JSON.stringify(next));
      try {
        if (performance.now() - t0 > this.commitWindowMs) continue; // too slow: the base may be stale
        await link(tmp, join(this.dir, `state.${version + 1}.json`)); // atomic CAS
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        continue; // lost the race: re-read and re-apply
      } finally {
        await unlink(tmp).catch(() => {});
      }
      if ((version + 1) % 16 === 0) await this.#gc(version + 1);
      return result;
    }
    throw new Error(`FileStore: gave up after ${this.maxAttempts} contended attempts`);
  }
}

// ───────────────────────────── breaker ─────────────────────────────

const emptyState = () => ({ v: 1, windows: {}, rate: {}, res: {} });
const micro = (x) => Math.ceil(x - 1e-9);

function sumWindow(scopeBuckets, win, now) {
  const b = scopeBuckets?.[win.key] ?? {};
  const floor = Math.floor(now / win.bucketMs) - win.buckets;
  let tokens = 0, usd = 0;
  for (const [idx, [t, u]] of Object.entries(b)) if (Number(idx) > floor) { tokens += t; usd += u; }
  return { tokens, usd };
}

/** Earliest ms until enough of the window expires that `used - expired + need <= cap`. */
function retryAfter(scopeBuckets, win, now, dimIdx, used, need, cap) {
  if (need > cap) return null;
  const floor = Math.floor(now / win.bucketMs) - win.buckets;
  const live = Object.entries(scopeBuckets?.[win.key] ?? {}).map(([i, v]) => [Number(i), v[dimIdx]]).filter(([i]) => i > floor).sort((a, b) => a[0] - b[0]);
  let remaining = used;
  for (const [idx, amount] of live) {
    remaining -= amount;
    if (remaining + need <= cap) return Math.max(0, (idx + win.buckets) * win.bucketMs - now);
  }
  return 0;
}

function addUsage(state, scope, t, tokens, usd) {
  const s = (state.windows[scope] ??= {});
  for (const win of Object.values(WINDOWS)) {
    const b = (s[win.key] ??= {}), idx = Math.floor(t / win.bucketMs);
    const cur = b[idx] ?? [0, 0];
    b[idx] = [Math.max(0, cur[0] + tokens), Math.max(0, cur[1] + usd)];
  }
}

function prune(state, now) {
  for (const s of Object.values(state.windows)) {
    for (const win of Object.values(WINDOWS)) {
      const floor = Math.floor(now / win.bucketMs) - win.buckets;
      for (const idx of Object.keys(s[win.key] ?? {})) if (Number(idx) <= floor) delete s[win.key][idx];
    }
  }
  for (const [id, r] of Object.entries(state.res)) if (now - r.t > 7 * 24 * HOUR) delete state.res[id];
}

/**
 * @param {object} opts
 * @param {Record<string,{inputPerMTok:number, outputPerMTok:number}>} opts.pricing  USD per 1M tokens, per model
 * @param {Array<string|{model:string, until?:number}>} opts.routes  most capable → cheapest
 * @param {{global?:Caps, tenant?:Caps}} [opts.caps]  Caps = {'5h'?:{usd?,tokens?}, '7d'?:{usd?,tokens?}}
 * @param {number} [opts.degradeAt=0.8]  default `until` for every route except the last (which gets 1)
 * @param {{capacity:number, refillPerSec:number}} [opts.rateLimit]  per-tenant token bucket
 * @param {{transact:Function}} [opts.store]
 * @param {() => number} [opts.now]
 */
export function createBudgetBreaker({ pricing, routes, caps = {}, degradeAt = 0.8, rateLimit, store = new MemoryStore(), now = Date.now }) {
  if (!routes?.length) throw new Error('routes: at least one model is required');
  const tiers = routes.map((r, i) => {
    const t = typeof r === 'string' ? { model: r } : { ...r };
    t.until ??= i === routes.length - 1 ? 1 : degradeAt;
    if (!pricing?.[t.model]) throw new Error(`pricing missing for model ${t.model}`);
    return t;
  });
  const cost = (model, input, output) => micro(input * pricing[model].inputPerMTok + output * pricing[model].outputPerMTok);
  const scopesFor = (tenant) => [['global', caps.global], ...(tenant != null ? [[`t:${tenant}`, caps.tenant]] : [])];

  /** First violated cap for adding (tokens, usd) at the given utilization ceiling, or null. */
  function violation(state, tenant, t, tokens, usd, ceiling) {
    for (const [scope, scopeCaps] of scopesFor(tenant)) {
      for (const [wname, win] of Object.entries(WINDOWS)) {
        const cap = scopeCaps?.[wname]; if (!cap) continue;
        const used = sumWindow(state.windows[scope], win, t);
        for (const [dim, idx, need] of [['tokens', 0, tokens], ['usd', 1, usd]]) {
          const limit = dim === 'usd' ? (cap.usd == null ? null : micro(cap.usd * 1e6)) : cap.tokens;
          if (limit == null) continue;
          if (used[dim] + need > limit * ceiling) {
            return { scope, window: wname, dimension: dim, used: used[dim], limit,
              retryAfterMs: retryAfter(state.windows[scope], win, t, idx, used[dim], need, limit * ceiling) };
          }
        }
      }
    }
    return null;
  }

  async function authorize({ tenant, model, inputTokens = 0, maxOutputTokens = 0, key } = {}) {
    const t = now();
    return store.transact((prev) => {
      const state = prev ?? emptyState();
      prune(state, t);
      if (key && state.res[key]) {
        const r = state.res[key];
        return { result: { ok: true, reservation: key, model: r.model, downgraded: r.downgraded, estimate: { tokens: r.tokens, usd: r.usd / 1e6 }, replayed: true } };
      }
      const start = model == null ? 0 : tiers.findIndex((x) => x.model === model);
      if (start < 0) return { result: { ok: false, reason: 'unknown_model', model } };

      let bucket;
      if (rateLimit && tenant != null) {
        const [level, last] = state.rate[tenant] ?? [rateLimit.capacity, t];
        bucket = Math.min(rateLimit.capacity, level + ((t - last) / 1000) * rateLimit.refillPerSec);
        if (bucket < 1) {
          return { result: { ok: false, reason: 'rate_limited', scope: `t:${tenant}`, retryAfterMs: Math.ceil(((1 - bucket) / rateLimit.refillPerSec) * 1000) } };
        }
      }

      let blocked = null;
      for (let i = start; i < tiers.length; i++) {
        const tier = tiers[i], tokens = inputTokens + maxOutputTokens, usd = cost(tier.model, inputTokens, maxOutputTokens);
        const v = violation(state, tenant, t, tokens, usd, tier.until);
        if (v) { blocked = v; continue; } // report the cheapest tier's blocker
        const id = key ?? randomUUID();
        for (const [scope] of scopesFor(tenant)) addUsage(state, scope, t, tokens, usd);
        state.res[id] = { t, tenant: tenant ?? null, model: tier.model, tokens, usd, downgraded: i > start };
        if (bucket !== undefined) state.rate[tenant] = [bucket - 1, t];
        return { state, result: { ok: true, reservation: id, model: tier.model, downgraded: i > start, estimate: { tokens, usd: usd / 1e6 } } };
      }
      return { result: { ok: false, reason: blocked.retryAfterMs === null ? 'request_exceeds_cap' : 'budget_exhausted', ...blocked } };
    });
  }

  /** Replace a reservation's estimate with actual usage. Idempotent: returns false if unknown/already settled. */
  async function settle(reservation, { inputTokens = 0, outputTokens = 0 } = {}) {
    return store.transact((state) => {
      const r = state?.res[reservation];
      if (!r) return { result: false };
      const tokens = inputTokens + outputTokens, usd = cost(r.model, inputTokens, outputTokens);
      for (const [scope] of scopesFor(r.tenant ?? undefined)) addUsage(state, scope, r.t, tokens - r.tokens, usd - r.usd);
      delete state.res[reservation];
      return { state, result: { tokens, usd: usd / 1e6 } };
    });
  }

  /** Drop a reservation without charging (call never reached the provider). */
  const release = (reservation) => settle(reservation, { inputTokens: 0, outputTokens: 0 }).then(Boolean);

  /** Current rolling usage per scope and window, in tokens and USD. */
  async function usage({ tenant } = {}) {
    const t = now();
    const state = await store.transact((s) => ({ result: s ?? emptyState() }));
    const out = {};
    for (const [scope, scopeCaps] of scopesFor(tenant)) {
      out[scope] = {};
      for (const [wname, win] of Object.entries(WINDOWS)) {
        const u = sumWindow(state.windows[scope], win, t), cap = scopeCaps?.[wname];
        out[scope][wname] = { tokens: u.tokens, usd: u.usd / 1e6, ...(cap && { cap: { ...cap } }) };
      }
    }
    return out;
  }

  /**
   * Authorize → call → settle. `fn({model})` must resolve to `{ value, usage: {inputTokens, outputTokens} }`.
   * Throws BudgetExceededError when blocked; releases the reservation if `fn` throws.
   */
  async function run(request, fn) {
    const decision = await authorize(request);
    if (!decision.ok) throw new BudgetExceededError(decision);
    let out;
    try { out = await fn({ model: decision.model, downgraded: decision.downgraded }); }
    catch (err) { await release(decision.reservation); throw err; }
    const charged = await settle(decision.reservation, out?.usage ?? { inputTokens: request.inputTokens, outputTokens: request.maxOutputTokens });
    return { value: out?.value, model: decision.model, downgraded: decision.downgraded, charged };
  }

  return { authorize, settle, release, usage, run };
}
