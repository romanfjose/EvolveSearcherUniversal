import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brierScore, murphyDecomposition, calibrationCurve, rollingBrier, summarize, interpret,
  ledgerFromJourneys, toJSON, toMarkdown, calibrationChart,
} from "../src/core/calibration.mjs";

const e = (confidence, outcome, extra = {}) => ({ confidence, outcome, ...extra });
const close = (actual, expected, eps = 1e-12) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

test("Brier score: perfect, maximally wrong, coin-flip and empty", () => {
  assert.equal(brierScore([e(1, 1), e(0, 0)]), 0);
  assert.equal(brierScore([e(1, 0), e(0, 1)]), 1);
  assert.equal(brierScore([e(0.5, 1), e(0.5, 0), e(0.5, 1)]), 0.25);
  assert.equal(brierScore([]), null);
});

test("Brier score matches a hand-computed value", () => {
  // (0.8−1)² + (0.6−0)² + (0.3−0)² = 0.04 + 0.36 + 0.09 = 0.49 → /3
  close(brierScore([e(0.8, 1), e(0.6, 0), e(0.3, 0)]), 0.49 / 3);
});

test("inputs are validated: confidence in [0,1], outcome strictly 0 or 1", () => {
  assert.throws(() => brierScore([e(1.2, 1)]), RangeError);
  assert.throws(() => brierScore([e(-0.1, 1)]), RangeError);
  assert.throws(() => brierScore([e(0.5, true)]), RangeError);
  assert.throws(() => brierScore([e(Number.NaN, 0)]), RangeError);
  assert.throws(() => brierScore("nope"), TypeError);
});

test("Murphy decomposition identity BS = REL − RES + UNC holds exactly", () => {
  const entries = [e(0.9, 1), e(0.9, 1), e(0.9, 0), e(0.6, 1), e(0.6, 0), e(0.2, 0), e(0.2, 1), e(0.2, 0), e(0.75, 1), e(0, 0)];
  const { reliability, resolution, uncertainty, baseRate } = murphyDecomposition(entries);
  close(brierScore(entries), reliability - resolution + uncertainty);
  close(baseRate, 0.5);
  close(uncertainty, 0.25);
});

test("a perfectly calibrated forecaster has zero reliability error", () => {
  const entries = [e(0.5, 1), e(0.5, 0), e(1, 1), e(0, 0)];
  close(murphyDecomposition(entries).reliability, 0);
  assert.equal(murphyDecomposition([]), null);
});

test("always forecasting the base rate scores zero skill; resolution is what adds skill", () => {
  const base = [e(0.5, 1), e(0.5, 0), e(0.5, 1), e(0.5, 0)];
  close(summarize(base).skill, 0);
  const sharp = [e(0.9, 1), e(0.1, 0), e(0.9, 1), e(0.1, 0)];
  assert.ok(summarize(sharp).skill > 0.9);
  assert.ok(summarize(sharp).resolution > summarize(base).resolution);
});

test("skill is undefined when every outcome is identical (no uncertainty)", () => {
  assert.equal(summarize([e(0.7, 1), e(0.9, 1)]).skill, null);
});

test("calibration curve bins equal-width, puts 1.0 in the top bin and reports hit rates", () => {
  const curve = calibrationCurve([e(0, 0), e(0.19, 1), e(0.2, 1), e(1, 1), e(0.8, 0)]);
  assert.equal(curve.length, 5);
  assert.deepEqual(curve.map((b) => b.n), [2, 1, 0, 0, 2]);
  close(curve[0].meanConfidence, 0.095);
  assert.equal(curve[0].hitRate, 0.5);
  assert.equal(curve[2].hitRate, null);
  assert.equal(calibrationCurve([e(0.55, 1)], 10)[5].n, 1);
  assert.throws(() => calibrationCurve([], 0), RangeError);
});

test("rolling Brier tracks the trailing window", () => {
  const series = rollingBrier([e(1, 0), e(1, 0), e(1, 1), e(1, 1)], 2);
  assert.deepEqual(series, [1, 1, 0.5, 0]);
});

test("summary reports over- and underconfidence and interpret explains it", () => {
  const over = Array.from({ length: 6 }, (_, i) => e(0.9, i < 2 ? 1 : 0));
  const s = summarize(over);
  close(s.overconfidence, 0.9 - 2 / 6);
  assert.match(interpret(s), /overconfident by about 57 points/);
  assert.match(interpret(summarize(Array.from({ length: 6 }, () => e(0.2, 1)))), /underconfident/);
  assert.match(interpret(summarize([e(0.5, 1)])), /too few/);
  assert.match(interpret(summarize([])), /No resolved forecasts/);
  assert.match(interpret(summarize([e(1, 1), e(0, 0), e(1, 1), e(0, 0), e(1, 1)])), /well calibrated/);
});

const journeys = [
  { id: "b", domain: "habits", problem: "tired", selectedHypothesis: { title: "Sleep" }, challenge: { title: "Fix wake time", minimum_success: "Wake on time" }, prediction: { confidence: 70, at: 10 }, outcome: { id: "not-done" }, completedAt: 30 },
  { id: "a", problem: "cook", challenge: { title: "Pasta | sauce" }, prediction: { confidence: 90, at: 5 }, outcome: { id: "annoying" }, completedAt: 20 },
  { id: "no-forecast", outcome: { id: "easier" }, completedAt: 1 },
  { id: "unresolved", prediction: { confidence: 50 } },
];

test("ledgerFromJourneys keeps only resolved forecasts, maps outcomes to 0/1 and sorts by resolution", () => {
  const ledger = ledgerFromJourneys(journeys);
  assert.deepEqual(ledger.map((x) => [x.id, x.confidence, x.outcome]), [["a", 0.9, 1], ["b", 0.7, 0]]);
  assert.equal(ledger[0].domain, "generic");
  assert.match(ledger[1].claim, /Wake on time/);
  assert.deepEqual(ledgerFromJourneys(), []);
});

test("JSON export round-trips with summary, curve and ISO timestamps", () => {
  const ledger = ledgerFromJourneys(journeys);
  const data = JSON.parse(toJSON(ledger, { now: Date.UTC(2026, 0, 2) }));
  assert.equal(data.format, "clash-with-reality/calibration-ledger");
  assert.equal(data.exportedAt, "2026-01-02T00:00:00.000Z");
  close(data.summary.brier, (0.01 + 0.49) / 2);
  assert.equal(data.curve.length, 5);
  assert.equal(data.entries[0].resolvedAt, new Date(20).toISOString());
});

test("Markdown export has metric, curve and forecast tables with escaped pipes", () => {
  const md = toMarkdown(ledgerFromJourneys(journeys), { now: 0 });
  assert.match(md, /^# Calibration ledger/);
  assert.match(md, /\| Brier score \(0 best, 0\.25 = coin flip\) \| 0\.250 \|/);
  assert.match(md, /Pasta \\\| sauce/);
  assert.match(md, /\| 2 \| .* \| habits \| Fix wake time \| 70% \| Miss — I didn't do it \| 0\.490 \|/);
  assert.match(toMarkdown([]), /0 resolved forecasts/);
});

test("reliability chart is a labelled SVG with one dot per non-empty bin", () => {
  const svg = calibrationChart([e(0.1, 0), e(0.9, 1), e(0.95, 1)]);
  assert.match(svg, /^<svg [^>]*role="img"[^>]*aria-label="Reliability diagram/);
  assert.equal(svg.match(/<circle /g).length, 2);
  assert.match(svg, /2 forecasts, mean confidence 93%, hit rate 100%/);
  assert.doesNotMatch(calibrationChart([]), /<circle|<path/);
});
