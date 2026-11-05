// Journey state machine. Every transition is a pure function (journey, ...) → new journey.
// Guards make illegal states unrepresentable: you cannot reach `plan` without a plan,
// or `complete` without an outcome, and a forecast is frozen once its outcome is known.
import { detectDomain } from "./domains.mjs";

export const PHASES = ["start", "hypotheses", "insight", "challenges", "plan", "debrief", "complete"];

export const OUTCOMES = [
  { id: "easier", label: "Done—it was easier than expected", hit: true, lesson: "The activity may be less unpleasant when decisions and difficulty are reduced. The next test can add only one optional upgrade." },
  { id: "annoying", label: "Done—but it was annoying", hit: true, lesson: "You can complete the activity, but some friction remains. The next useful step is identifying whether setup, execution, or cleanup caused it." },
  { id: "stuck", label: "I started and got stuck", hit: false, lesson: "Starting was possible; a specific step became the real constraint. That is useful evidence, and the next challenge should simplify only that step." },
  { id: "not-done", label: "I didn't do it", hit: false, lesson: "The proposed action was still too large, badly timed, or not meaningful enough. The next experiment should be smaller rather than demanding more motivation." },
];

const PREVIOUS = { hypotheses: "start", insight: "hypotheses", challenges: "insight", plan: "challenges", debrief: "plan", complete: "debrief" };

const hasPlan = (j) => Array.isArray(j.challenge?.steps) && j.challenge.steps.length > 0;
const GUARDS = {
  start: () => true,
  hypotheses: (j) => Array.isArray(j.hypotheses) && j.hypotheses.length > 0,
  insight: (j) => Boolean(j.selectedHypothesis),
  challenges: (j) => Boolean(j.selectedHypothesis) && Array.isArray(j.challenges) && j.challenges.length > 0,
  plan: hasPlan,
  debrief: hasPlan,
  complete: (j) => Boolean(j.outcome),
};

export function newJourney({ now = Date.now(), id } = {}) {
  return { id: id || `${now}-${Math.random().toString(36).slice(2, 7)}`, phase: "start", problem: "", chat: [], checked: [], prediction: null, createdAt: now, source: "local" };
}

export const previousPhase = (phase) => PREVIOUS[phase] || null;

export function progressIndex(phase) {
  if (["start", "hypotheses", "insight"].includes(phase)) return 0;
  if (["challenges", "plan"].includes(phase)) return 1;
  return 2;
}

export function canEnter(journey, phase) {
  return Boolean(GUARDS[phase]?.(journey));
}

export function goTo(journey, phase) {
  if (!PHASES.includes(phase)) throw new TypeError(`Unknown phase: ${phase}`);
  if (!canEnter(journey, phase)) throw new Error(`Cannot enter "${phase}" from "${journey.phase}"`);
  return { ...journey, phase };
}

export function goBack(journey) {
  const target = previousPhase(journey.phase);
  return target ? goTo(journey, target) : journey;
}

export const setProblem = (journey, problem) => ({ ...journey, problem: String(problem ?? "") });

export function applyAnalysis(journey, result, source = "local") {
  if (!Array.isArray(result?.hypotheses) || !result.hypotheses.length) throw new Error("Analysis returned no hypotheses");
  const problem = journey.problem.trim();
  return {
    ...journey, reflection: result.reflection, hypotheses: result.hypotheses, analyzedProblem: problem,
    domain: result.domain || detectDomain(problem), selectedHypothesis: null, challenges: [], challenge: null, source, phase: "hypotheses",
  };
}

export function selectHypothesis(journey, hypothesis) {
  if (!hypothesis?.title) throw new Error("A hypothesis needs a title");
  return { ...journey, selectedHypothesis: hypothesis, challenges: [], challenge: null, phase: "insight" };
}

export const clearHypothesis = (journey) => ({ ...journey, selectedHypothesis: null, phase: "hypotheses" });

export function applyChallenges(journey, result, source = "local") {
  if (!journey.selectedHypothesis) throw new Error("Choose a hypothesis before challenges");
  if (!Array.isArray(result?.challenges) || !result.challenges.length) throw new Error("No challenges were returned");
  return { ...journey, challenge_intro: result.challenge_intro, challenges: result.challenges, challenge: null, source, phase: "challenges" };
}

/** Choosing (or rebuilding) a plan starts a fresh experiment: progress, forecast and outcome reset. */
export function selectChallenge(journey, detail, source = "local") {
  if (!detail?.title || !Array.isArray(detail.steps) || !detail.steps.length) throw new Error("A plan needs a title and steps");
  return { ...journey, challenge: detail, checked: [], prediction: null, outcome: null, learning: null, completedAt: null, source, phase: "plan" };
}

export function toggleStep(journey, index) {
  if (!Number.isInteger(index) || index < 0 || index >= (journey.challenge?.steps?.length || 0)) return journey;
  const checked = journey.checked || [];
  return { ...journey, checked: checked.includes(index) ? checked.filter((i) => i !== index) : [...checked, index].sort((a, b) => a - b) };
}

/** Pre-registered forecast (0–100 %) that the minimum success will be reached. Frozen once an outcome exists. */
export function setPrediction(journey, percent, now = Date.now()) {
  if (journey.outcome) return journey;
  if (percent === null || percent === undefined || percent === "") return { ...journey, prediction: null };
  const value = Number(percent);
  if (!Number.isFinite(value)) throw new TypeError("Confidence must be a number from 0 to 100");
  return { ...journey, prediction: { confidence: Math.round(Math.min(100, Math.max(0, value))), at: now } };
}

export const outcomeById = (id) => OUTCOMES.find((outcome) => outcome.id === id);

export function learningFor(journey, outcomeId) {
  const outcome = outcomeById(outcomeId);
  if (!outcome) throw new Error(`Unknown outcome: ${outcomeId}`);
  const parts = [outcome.lesson];
  const falsifier = journey.challenge?.falsifier;
  if (falsifier) parts.push(`Hold it against the falsifier you set: ${falsifier}`);
  if (journey.prediction) {
    const p = journey.prediction.confidence / 100;
    const brier = (p - (outcome.hit ? 1 : 0)) ** 2;
    parts.push(`You gave ${journey.prediction.confidence}% to reaching the minimum success and ${outcome.hit ? "reached it" : "didn't"}: this forecast scores a Brier of ${brier.toFixed(2)} (0 is perfect, 0.25 is a coin flip).`);
  }
  return parts.join(" ");
}

export function recordOutcome(journey, outcomeId, now = Date.now()) {
  if (!hasPlan(journey)) throw new Error("Choose a plan before recording an outcome");
  const outcome = outcomeById(outcomeId);
  if (!outcome) throw new Error(`Unknown outcome: ${outcomeId}`);
  return { ...journey, outcome: { id: outcome.id, label: outcome.label }, learning: learningFor(journey, outcomeId), completedAt: now, phase: "complete" };
}
