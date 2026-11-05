// Brier-score calibration ledger. A forecast is the pre-registered probability that an experiment's
// minimum success will be reached; the outcome is 1 if the debrief says it was done, else 0.
//
// Brier score  BS = (1/N) Σ (f − o)²           0 = perfect, 0.25 = always saying 50 %, 1 = maximally wrong.
// Murphy (1973) decomposition, grouping by distinct forecast value so the identity is exact:
//   BS = REL − RES + UNC
//   REL = (1/N) Σ_k n_k (f_k − ō_k)²   calibration error (lower is better)
//   RES = (1/N) Σ_k n_k (ō_k − ō)²     how much your forecasts separate outcomes (higher is better)
//   UNC = ō (1 − ō)                     difficulty of the outcomes themselves
// Brier skill score vs. always forecasting your base rate: BSS = 1 − BS / UNC (undefined when UNC = 0).
import { outcomeById } from "./journey.mjs";

function assertEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError("Entries must be an array");
  for (const e of entries) {
    if (typeof e?.confidence !== "number" || !(e.confidence >= 0 && e.confidence <= 1)) throw new RangeError(`Confidence must be within [0, 1]: ${e?.confidence}`);
    if (e.outcome !== 0 && e.outcome !== 1) throw new RangeError(`Outcome must be 0 or 1: ${e?.outcome}`);
  }
  return entries;
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Resolved forecasts from completed journeys, oldest first. */
export function ledgerFromJourneys(journeys = []) {
  return journeys
    .filter((j) => Number.isFinite(j?.prediction?.confidence) && outcomeById(j.outcome?.id))
    .map((j) => {
      const outcome = outcomeById(j.outcome.id);
      return {
        id: j.id,
        domain: j.domain || "generic",
        problem: j.problem,
        hypothesis: j.selectedHypothesis?.title ?? null,
        experiment: j.challenge?.title ?? null,
        claim: `I will reach the minimum success: ${j.challenge?.minimum_success ?? "—"}`,
        confidence: Math.min(100, Math.max(0, j.prediction.confidence)) / 100,
        outcome: outcome.hit ? 1 : 0,
        outcomeLabel: outcome.label,
        predictedAt: j.prediction.at ?? null,
        resolvedAt: j.completedAt ?? null,
      };
    })
    .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));
}

export function brierScore(entries) {
  assertEntries(entries);
  return entries.length ? mean(entries.map((e) => (e.confidence - e.outcome) ** 2)) : null;
}

export function murphyDecomposition(entries) {
  assertEntries(entries);
  const n = entries.length;
  if (!n) return null;
  const baseRate = mean(entries.map((e) => e.outcome));
  const groups = new Map();
  for (const e of entries) {
    const g = groups.get(e.confidence) || { n: 0, hits: 0 };
    g.n += 1; g.hits += e.outcome;
    groups.set(e.confidence, g);
  }
  let reliability = 0, resolution = 0;
  for (const [f, g] of groups) {
    const observed = g.hits / g.n;
    reliability += g.n * (f - observed) ** 2;
    resolution += g.n * (observed - baseRate) ** 2;
  }
  return { reliability: reliability / n, resolution: resolution / n, uncertainty: baseRate * (1 - baseRate), baseRate };
}

/** Reliability-diagram bins of equal width over [0, 1]; the top bin includes 1. */
export function calibrationCurve(entries, bins = 5) {
  assertEntries(entries);
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError("bins must be a positive integer");
  const rows = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sumF: 0, hits: 0 }));
  for (const e of entries) {
    const row = rows[Math.min(bins - 1, Math.floor(e.confidence * bins))];
    row.n += 1; row.sumF += e.confidence; row.hits += e.outcome;
  }
  return rows.map(({ lo, hi, n, sumF, hits }) => ({ lo, hi, n, meanConfidence: n ? sumF / n : null, hitRate: n ? hits / n : null }));
}

/** Brier score over a trailing window, one point per resolved forecast. */
export function rollingBrier(entries, window = 5) {
  assertEntries(entries);
  return entries.map((_, i) => brierScore(entries.slice(Math.max(0, i + 1 - window), i + 1)));
}

export function summarize(entries) {
  assertEntries(entries);
  const n = entries.length;
  if (!n) return { n: 0, hits: 0, brier: null, reliability: null, resolution: null, uncertainty: null, baseRate: null, skill: null, meanConfidence: null, overconfidence: null };
  const brier = brierScore(entries);
  const parts = murphyDecomposition(entries);
  const meanConfidence = mean(entries.map((e) => e.confidence));
  return {
    n, hits: entries.reduce((sum, e) => sum + e.outcome, 0), brier, ...parts,
    skill: parts.uncertainty > 0 ? 1 - brier / parts.uncertainty : null,
    meanConfidence,
    overconfidence: meanConfidence - parts.baseRate,
  };
}

/** One-line plain-language reading of a summary. */
export function interpret(summary) {
  if (!summary.n) return "No resolved forecasts yet. Set a confidence before your next experiment.";
  if (summary.n < 5) return `${summary.n} resolved forecast${summary.n === 1 ? "" : "s"} so far—too few to read a pattern yet.`;
  const gap = Math.round(summary.overconfidence * 100);
  if (Math.abs(gap) <= 10) {
    return summary.reliability <= 0.05
      ? `Your average confidence is within ${Math.abs(gap)} points of your hit rate and individual forecasts track outcomes: well calibrated so far.`
      : `On average your confidence matches your hit rate, but individual forecasts miss in both directions (reliability ${summary.reliability.toFixed(2)}). Save extreme numbers for experiments you have evidence about.`;
  }
  return gap > 0
    ? `You are overconfident by about ${gap} points: you expect to succeed more often than you do. Shrink the next experiment or lower your forecast.`
    : `You are underconfident by about ${-gap} points: you succeed more often than you expect. Your fear is a worse predictor than your track record.`;
}

const fixed = (value, digits = 3) => (value === null || value === undefined ? "—" : value.toFixed(digits));
const pct = (value) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const cell = (text) => String(text ?? "—").replace(/\|/g, "\\|").replace(/\s+/g, " ");

export function toJSON(entries, { now = Date.now() } = {}) {
  return JSON.stringify({
    format: "clash-with-reality/calibration-ledger",
    version: 1,
    exportedAt: iso(now),
    summary: summarize(entries),
    curve: calibrationCurve(entries),
    entries: entries.map((e) => ({ ...e, predictedAt: iso(e.predictedAt), resolvedAt: iso(e.resolvedAt) })),
  }, null, 2);
}

export function toMarkdown(entries, { now = Date.now() } = {}) {
  const s = summarize(entries);
  const lines = [
    "# Calibration ledger",
    "",
    `Exported ${iso(now)} · ${s.n} resolved forecast${s.n === 1 ? "" : "s"}.`,
    "",
    `> ${interpret(s)}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Brier score (0 best, 0.25 = coin flip) | ${fixed(s.brier)} |`,
    `| Reliability (calibration error) | ${fixed(s.reliability)} |`,
    `| Resolution | ${fixed(s.resolution)} |`,
    `| Uncertainty | ${fixed(s.uncertainty)} |`,
    `| Brier skill vs. base rate | ${fixed(s.skill)} |`,
    `| Mean confidence | ${pct(s.meanConfidence)} |`,
    `| Hit rate | ${pct(s.baseRate)} |`,
    "",
    "## Calibration curve",
    "",
    "| Confidence bin | Forecasts | Mean confidence | Hit rate |",
    "| --- | --- | --- | --- |",
    ...calibrationCurve(entries).map((b) => `| ${pct(b.lo)}–${pct(b.hi)} | ${b.n} | ${pct(b.meanConfidence)} | ${pct(b.hitRate)} |`),
    "",
    "## Forecasts",
    "",
    "| # | Resolved | Domain | Experiment | Confidence | Outcome | Brier |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...entries.map((e, i) => `| ${i + 1} | ${cell(iso(e.resolvedAt)?.slice(0, 10))} | ${cell(e.domain)} | ${cell(e.experiment)} | ${pct(e.confidence)} | ${e.outcome ? "Hit" : "Miss"} — ${cell(e.outcomeLabel)} | ${fixed((e.confidence - e.outcome) ** 2)} |`),
    "",
  ];
  return lines.join("\n");
}

/** Reliability diagram as a self-contained SVG string (numbers only, no user text). */
export function calibrationChart(entries, { bins = 5, size = 240 } = {}) {
  const pad = 46, plot = size - pad - 12;
  const x = (v) => pad + v * plot, y = (v) => 12 + (1 - v) * plot;
  const points = calibrationCurve(entries, bins).filter((b) => b.n);
  const ticks = [0, 0.5, 1].map((t) => `<line x1="${x(t)}" y1="${y(0)}" x2="${x(t)}" y2="${y(1)}" class="cal-grid"/><line x1="${x(0)}" y1="${y(t)}" x2="${x(1)}" y2="${y(t)}" class="cal-grid"/><text x="${x(t)}" y="${y(0) + 14}" text-anchor="middle">${t * 100}%</text><text x="${x(0) - 5}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`).join("");
  const path = points.map((b, i) => `${i ? "L" : "M"}${x(b.meanConfidence).toFixed(1)},${y(b.hitRate).toFixed(1)}`).join(" ");
  const dots = points.map((b) => `<circle cx="${x(b.meanConfidence).toFixed(1)}" cy="${y(b.hitRate).toFixed(1)}" r="${(4 + 2 * Math.sqrt(b.n)).toFixed(1)}" class="cal-dot"><title>${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}% bin: ${b.n} forecast${b.n === 1 ? "" : "s"}, mean confidence ${Math.round(b.meanConfidence * 100)}%, hit rate ${Math.round(b.hitRate * 100)}%</title></circle>`).join("");
  return `<svg class="cal-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="Reliability diagram: confidence on the horizontal axis, observed hit rate on the vertical axis; points on the diagonal are perfectly calibrated.">${ticks}<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" class="cal-ideal"/>${points.length > 1 ? `<path d="${path}" class="cal-line"/>` : ""}${dots}<text x="${x(0.5)}" y="${size - 2}" text-anchor="middle" class="cal-axis">Confidence</text><text x="12" y="${y(0.5)}" text-anchor="middle" class="cal-axis" transform="rotate(-90 12 ${y(0.5)})">Hit rate</text></svg>`;
}
