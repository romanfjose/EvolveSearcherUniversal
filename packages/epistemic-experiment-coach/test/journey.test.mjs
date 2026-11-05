import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHASES, OUTCOMES, newJourney, canEnter, goTo, goBack, previousPhase, progressIndex, setProblem, applyAnalysis, selectHypothesis,
  clearHypothesis, applyChallenges, selectChallenge, toggleStep, setPrediction, recordOutcome, learningFor,
} from "../src/core/journey.mjs";
import { fallbackUnderstanding, fallbackChallenges, fallbackPlan } from "../src/core/domains.mjs";

function walk(problem = "My API endpoint is slow", { hypothesis = 0, challenge = 0 } = {}) {
  let j = setProblem(newJourney({ now: 1, id: "j1" }), problem);
  j = applyAnalysis(j, fallbackUnderstanding(problem));
  j = selectHypothesis(j, j.hypotheses[hypothesis]);
  j = applyChallenges(j, fallbackChallenges(j));
  return selectChallenge(j, fallbackPlan(j.challenges[challenge]));
}

test("newJourney starts empty in the start phase", () => {
  const j = newJourney({ now: 42, id: "x" });
  assert.deepEqual(j, { id: "x", phase: "start", problem: "", chat: [], checked: [], prediction: null, createdAt: 42, source: "local" });
  assert.notEqual(newJourney().id, newJourney().id);
});

test("happy path walks every phase in order", () => {
  const seen = [];
  let j = setProblem(newJourney(), "I hate cooking"); seen.push(j.phase);
  j = applyAnalysis(j, fallbackUnderstanding(j.problem)); seen.push(j.phase);
  j = selectHypothesis(j, j.hypotheses[0]); seen.push(j.phase);
  j = applyChallenges(j, fallbackChallenges(j)); seen.push(j.phase);
  j = selectChallenge(j, fallbackPlan(j.challenges[0])); seen.push(j.phase);
  j = goTo(j, "debrief"); seen.push(j.phase);
  j = recordOutcome(j, "easier", 99); seen.push(j.phase);
  assert.deepEqual(seen, PHASES);
  assert.equal(j.completedAt, 99);
});

test("transitions are pure: the input journey is never mutated", () => {
  const before = walk();
  const snapshot = structuredClone(before);
  setPrediction(before, 70); toggleStep(before, 0); recordOutcome(before, "stuck"); goBack(before);
  assert.deepEqual(before, snapshot);
});

test("guards block phases whose data is missing", () => {
  const j = newJourney();
  for (const phase of PHASES.slice(1)) assert.equal(canEnter(j, phase), false, phase);
  assert.throws(() => goTo(j, "plan"), /Cannot enter "plan"/);
  assert.throws(() => goTo(j, "nowhere"), TypeError);
  assert.throws(() => recordOutcome(j, "easier"), /plan/);
});

test("applyAnalysis requires hypotheses, records domain and resets downstream state", () => {
  assert.throws(() => applyAnalysis(newJourney(), { hypotheses: [] }));
  const j = applyAnalysis({ ...walk(), problem: "  I freeze in meetings " }, fallbackUnderstanding("I freeze in meetings"), "local");
  assert.equal(j.domain, "social");
  assert.equal(j.analyzedProblem, "I freeze in meetings");
  assert.equal(j.challenge, null);
  assert.deepEqual(j.challenges, []);
});

test("selectHypothesis clears stale challenges; clearHypothesis returns to the list", () => {
  const j = walk();
  const k = selectHypothesis(j, { id: "custom", title: "My own idea" });
  assert.equal(k.phase, "insight");
  assert.equal(k.challenge, null);
  assert.equal(clearHypothesis(k).selectedHypothesis, null);
  assert.throws(() => selectHypothesis(j, {}));
});

test("applyChallenges needs a hypothesis and at least one challenge", () => {
  const analysed = applyAnalysis(setProblem(newJourney(), "cook"), fallbackUnderstanding("cook"));
  assert.throws(() => applyChallenges(analysed, { challenges: [{ title: "a" }] }), /hypothesis/);
  assert.throws(() => applyChallenges(selectHypothesis(analysed, analysed.hypotheses[0]), { challenges: [] }));
});

test("selectChallenge starts a fresh experiment", () => {
  let j = recordOutcome(setPrediction(toggleStep(walk(), 1), 60), "easier");
  j = selectChallenge(j, fallbackPlan({ id: "repro-loop" }));
  assert.equal(j.phase, "plan");
  assert.deepEqual(j.checked, []);
  assert.equal(j.prediction, null);
  assert.equal(j.outcome, null);
  assert.throws(() => selectChallenge(j, { title: "no steps" }));
});

test("toggleStep toggles in range, keeps order and ignores invalid indices", () => {
  let j = walk();
  j = toggleStep(toggleStep(j, 3), 1);
  assert.deepEqual(j.checked, [1, 3]);
  assert.deepEqual(toggleStep(j, 3).checked, [1]);
  assert.equal(toggleStep(j, 99), j);
  assert.equal(toggleStep(j, -1), j);
  assert.equal(toggleStep(j, 1.5), j);
});

test("setPrediction rounds, clamps, clears and rejects non-numbers", () => {
  const j = walk();
  assert.deepEqual(setPrediction(j, "72.6", 5).prediction, { confidence: 73, at: 5 });
  assert.equal(setPrediction(j, 140).prediction.confidence, 100);
  assert.equal(setPrediction(j, -3).prediction.confidence, 0);
  assert.equal(setPrediction(setPrediction(j, 50), null).prediction, null);
  assert.throws(() => setPrediction(j, "abc"), TypeError);
});

test("a forecast is frozen once the outcome is known (no hindsight edits)", () => {
  const done = recordOutcome(setPrediction(walk(), 40), "stuck");
  const back = goBack(goBack(done));
  assert.equal(back.phase, "plan");
  assert.equal(setPrediction(back, 95).prediction.confidence, 40);
});

test("recordOutcome rejects unknown outcomes and maps every known one", () => {
  assert.throws(() => recordOutcome(walk(), "maybe"), /Unknown outcome/);
  for (const o of OUTCOMES) assert.equal(recordOutcome(walk(), o.id).outcome.label, o.label);
});

test("learningFor cites the falsifier and scores the forecast", () => {
  const j = setPrediction(walk(), 80);
  const hit = learningFor(j, "easier");
  assert.match(hit, /falsifier/);
  assert.match(hit, /Brier of 0\.04/);
  assert.match(learningFor(j, "not-done"), /Brier of 0\.64/);
  assert.doesNotMatch(learningFor(walk(), "easier"), /Brier/);
});

test("back navigation and progress follow the three-stage map", () => {
  assert.equal(previousPhase("start"), null);
  assert.equal(goBack(newJourney()).phase, "start");
  assert.deepEqual(PHASES.map(progressIndex), [0, 0, 0, 1, 1, 2, 2]);
  assert.equal(goBack(walk()).phase, "challenges");
});
