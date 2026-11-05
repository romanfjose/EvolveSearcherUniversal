import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, buildReport, computeCashoutRoutes } from '../check-routes.mjs';
import { marketFromRaw, VENUE_IDS } from '../src/market.mjs';
import { SNAPSHOT } from '../src/snapshot.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'check-routes.mjs');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('market: MEP/CCL compra extracted from DolarAPI casas', () => {
  const m = marketFromRaw(SNAPSHOT);
  assert.equal(m.mepBid, 1478.4);
  assert.equal(m.cclBid, 1501.2);
  assert.equal(m.source, 'bundled-illustrative');
});

test('market: bids normalized best-first and venues ranked by best bid', () => {
  const m = marketFromRaw(SNAPSHOT);
  for (let i = 1; i < m.bids.length; i++) assert.ok(m.bids[i - 1].price > m.bids[i].price);
  for (let i = 1; i < m.venueRanking.length; i++) assert.ok(m.venueRanking[i - 1].bestBid >= m.venueRanking[i].bestBid);
  assert.ok(Object.keys(m.venues).every((v) => VENUE_IDS.includes(v)));
  assert.equal(m.venues.belo.bestAsset, 'USDC');
});

test('market: missing CriptoYa data falls back to Bitso top bid as top venue', () => {
  const m = marketFromRaw({ ...SNAPSHOT, criptoyaUsdt: {}, criptoyaUsdc: {} });
  assert.equal(m.topVenue.venue, 'bitso');
  assert.equal(m.topVenue.bestBid, m.bids[0].price);
});

test('market: empty payloads degrade to zeros without throwing', () => {
  const m = marketFromRaw({});
  assert.deepEqual([m.mepBid, m.bids.length, m.topVenue], [0, 0, null]);
});

test('parseArgs: defaults and flags', () => {
  assert.deepEqual(parseArgs([]), { usd: 1000, json: false, offline: false, tna: 0.2199, apy: 0.038 });
  assert.deepEqual(parseArgs(['2500', '--offline', '--json', '--tna=0.3', '--apy=0.05']),
    { usd: 2500, json: true, offline: true, tna: 0.3, apy: 0.05 });
});

test('buildReport: groups, ranking, split and breakeven are consistent', () => {
  const r = buildReport(marketFromRaw(SNAPSHOT), 5000);
  assert.ok(r.payoneerRoutes.every((x) => x.corridor === 'payoneer'));
  assert.ok(r.contractorCorridors.every((x) => x.corridor === 'direct'));
  for (const g of [r.payoneerRoutes, r.contractorCorridors]) for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].netArs >= g[i].netArs);
  assert.equal(r.optimalSplit.allocatedUsd, 5000);
  assert.equal(r.breakeven.fStarPct.toFixed(2), '1.50');
  assert.equal(r.parity.requiredPremiumVsMepPct.toFixed(2), '3.61');
});

test('CLI --offline --json emits parseable JSON from the bundled snapshot', () => {
  const p = run('3000', '--offline', '--json');
  assert.equal(p.status, 0, p.stderr);
  const d = JSON.parse(p.stdout);
  assert.equal(d.source, 'bundled-illustrative');
  assert.equal(d.ticketUsd, 3000);
  assert.ok(d.optimalSplit.tranches.length >= 1);
});

test('CLI --offline text mode flags the snapshot as non-live', () => {
  const p = run('--offline');
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /Offline illustrative snapshot/);
  assert.match(p.stdout, /Optimal split/);
});

test('CLI rejects zero and non-numeric amounts with usage', () => {
  for (const a of ['0', 'abc']) {
    const p = run(a, '--offline');
    assert.equal(p.status, 1);
    assert.match(p.stderr, /Usage/);
  }
});

test('offline runs never write the live cache file', async () => {
  const cache = path.join(ROOT, 'latest-routes.json');
  const before = fs.existsSync(cache) ? fs.statSync(cache).mtimeMs : null;
  await computeCashoutRoutes(1000, { offline: true });
  assert.equal(fs.existsSync(cache) ? fs.statSync(cache).mtimeMs : null, before);
});
