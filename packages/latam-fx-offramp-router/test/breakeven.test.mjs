import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tnaToPeriodRate, apyToPeriodRate, breakevenDepreciation, compareOutcomes,
  breakevenMatrix, impliedDepreciation, rescaleDepreciation, roundTripCostFromQuotes,
} from '../src/breakeven.mjs';
import { rng, close, SEEDS } from './helpers.mjs';

test('TNA is simple interest on a 365-day base: 21.99% → 1.8074% per 30d', () => {
  assert.ok(close(tnaToPeriodRate(0.2199), 0.2199 * 30 / 365));
  assert.equal((tnaToPeriodRate(0.2199) * 100).toFixed(2), '1.81');
});

test('APY compounds: 3.80% → 0.307% per 30d', () => {
  assert.ok(close(apyToPeriodRate(0.038), 1.038 ** (30 / 365) - 1));
  assert.equal((apyToPeriodRate(0.038) * 100).toFixed(2), '0.31');
});

test('f* at 21.99% TNA vs 3.80% APY ≈ 1.50% per 30 days (README figure)', () => {
  assert.equal((breakevenDepreciation({ tna: 0.2199, apy: 0.038 }) * 100).toFixed(2), '1.50');
});

test('f* is zero when both legs earn the same period return', () => {
  const tna = (1.05 ** (30 / 365) - 1) * 365 / 30;
  assert.ok(Math.abs(breakevenDepreciation({ tna, apy: 0.05 })) < 1e-12);
});

test('f* is negative when USD out-yields ARS (USD wins even if the peso appreciates slightly)', () => {
  assert.ok(breakevenDepreciation({ tna: 0.02, apy: 0.1 }) < 0);
});

test('outcomes tie exactly at f*', () => {
  const o = { tna: 0.2199, apy: 0.038, costIn: 0.004, costOut: 0.003 };
  const r = compareOutcomes({ ...o, f: breakevenDepreciation(o) });
  assert.ok(Math.abs(r.edgePct) < 1e-9);
});

test('property: USD wins iff depreciation exceeds f*', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const o = { tna: r() * 0.6, apy: r() * 0.12, days: 1 + Math.floor(r() * 364), costIn: r() * 0.01, costOut: r() * 0.01 };
    const f = breakevenDepreciation(o);
    assert.equal(compareOutcomes({ ...o, f: f + 1e-4 }).winner, 'usd', `seed ${seed}`);
    assert.equal(compareOutcomes({ ...o, f: f - 1e-4 }).winner, 'ars', `seed ${seed}`);
  }
});

test('conversion costs raise the breakeven depreciation', () => {
  const base = breakevenDepreciation({ tna: 0.3, apy: 0.04 });
  assert.ok(breakevenDepreciation({ tna: 0.3, apy: 0.04, costIn: 0.005 }) > base);
  assert.ok(breakevenDepreciation({ tna: 0.3, apy: 0.04, costIn: 0.005, costOut: 0.005 }) >
    breakevenDepreciation({ tna: 0.3, apy: 0.04, costIn: 0.005 }));
});

test('round-trip cost from MEP compra/venta quotes', () => {
  assert.ok(close(roundTripCostFromQuotes(1478.4, 1486.9), 1 - 1478.4 / 1486.9));
  assert.equal(roundTripCostFromQuotes(1, 0), 0);
});

test('matrix shape follows (tnas × apys)', () => {
  const m = breakevenMatrix([0.2, 0.3, 0.4], [0.02, 0.04]);
  assert.equal(m.length, 3);
  assert.equal(m[0].length, 2);
  assert.ok(close(m[1][1], breakevenDepreciation({ tna: 0.3, apy: 0.04 })));
});

test('property: f* rises with TNA and falls with APY', () => {
  const tnas = Array.from({ length: 12 }, (_, i) => 0.05 + i * 0.04);
  const apys = Array.from({ length: 10 }, (_, i) => i * 0.01);
  const m = breakevenMatrix(tnas, apys, { costIn: 0.002 });
  for (let i = 0; i < tnas.length; i++) {
    for (let j = 0; j < apys.length; j++) {
      if (i) assert.ok(m[i][j] > m[i - 1][j]);
      if (j) assert.ok(m[i][j] < m[i][j - 1]);
    }
  }
});

test('longer horizons scale f* up (365d TNA vs APY)', () => {
  const f365 = breakevenDepreciation({ tna: 0.2199, apy: 0.038, days: 365 });
  assert.ok(close(f365, 1.2199 / 1.038 - 1));
  assert.ok(f365 > breakevenDepreciation({ tna: 0.2199, apy: 0.038 }));
});

test('implied depreciation from a futures quote', () => {
  assert.ok(close(impliedDepreciation(1500, 1530), 0.02));
  assert.equal(impliedDepreciation(0, 1), null);
});

test('rescaleDepreciation compounds across tenors and is identity on equal tenors', () => {
  assert.ok(close(rescaleDepreciation(0.02, 30, 30), 0.02));
  assert.ok(close(rescaleDepreciation(0.02, 30, 60), 1.02 ** 2 - 1));
  assert.ok(close(rescaleDepreciation(rescaleDepreciation(0.05, 45, 30), 30, 45), 0.05));
});
