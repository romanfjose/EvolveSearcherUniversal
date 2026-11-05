/**
 * Helmet 03 — Synthetic José QA ("Where's the Bathroom?" QA Breaker)
 * Stress Suite for Epistemic Experiment Coach
 *
 * Attacks the epistemic engine from adversarial real-world angles:
 * 1. Extreme-Prior Stress: boundary forecasts (0.0, 1.0, ε, 1-ε), massive over/underconfidence,
 *    numerical stability without floating point corruption or NaN leaks.
 * 2. Zero-Variance Sample Stress: all hits, all misses, zero-uncertainty Brier skill fallback,
 *    identical forecast values, n=1 singletons, degenerate reliability bins.
 * 3. P-Hacking & HARKing Prevention: post-hoc prediction tampering / freeze enforcement,
 *    hypothesis hopping without downstream resets, pre-registration integrity in ledger export,
 *    defending against premature pattern reading when sample size is too small.
 * 4. "Where's the Bathroom?" Out-of-Order & Saboteur State Attacks: walking phases backwards,
 *    jumping illegally, malformed input types, null/empty injections, non-numeric confidence inputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  brierScore,
  murphyDecomposition,
  calibrationCurve,
  rollingBrier,
  summarize,
  interpret,
  ledgerFromJourneys,
  toJSON,
  toMarkdown,
  calibrationChart,
} from "../src/core/calibration.mjs";

import {
  PHASES,
  OUTCOMES,
  newJourney,
  canEnter,
  goTo,
  goBack,
  setProblem,
  applyAnalysis,
  selectHypothesis,
  clearHypothesis,
  applyChallenges,
  selectChallenge,
  toggleStep,
  setPrediction,
  recordOutcome,
  learningFor,
} from "../src/core/journey.mjs";

import {
  detectDomain,
  fallbackUnderstanding,
  fallbackChallenges,
  fallbackPlan,
  localReply,
} from "../src/core/domains.mjs";

const close = (actual, expected, eps = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `Expected ${actual} to be close to ${expected} (eps=${eps})`
  );
};

const e = (confidence, outcome, extra = {}) => ({ confidence, outcome, ...extra });

describe("Helmet 03: Extreme-Prior & Boundary Forecast Stress", () => {
  it("survives absolute 0.0 and 1.0 boundary priors under all outcome distributions", () => {
    // Forecaster with total certainty (1.0 or 0.0) and 100% correct
    const allRight = [e(1.0, 1), e(0.0, 0), e(1.0, 1), e(0.0, 0)];
    assert.equal(brierScore(allRight), 0);
    const sRight = summarize(allRight);
    assert.equal(sRight.brier, 0);
    assert.equal(sRight.reliability, 0);
    assert.equal(sRight.resolution, 0.25);
    assert.equal(sRight.uncertainty, 0.25);
    close(sRight.skill, 1.0);

    // Forecaster with total certainty (1.0 or 0.0) but 100% wrong (maximally wrong)
    const allWrong = [e(1.0, 0), e(0.0, 1)];
    assert.equal(brierScore(allWrong), 1.0);
    const sWrong = summarize(allWrong);
    assert.equal(sWrong.brier, 1.0);
    assert.equal(sWrong.reliability, 1.0);
    assert.equal(sWrong.resolution, 0.25);
    assert.equal(sWrong.uncertainty, 0.25);
    close(sWrong.skill, -3.0);
    close(sWrong.brier, sWrong.reliability - sWrong.resolution + sWrong.uncertainty);
  });

  it("handles high-precision near-boundary priors without floating point divergence", () => {
    const eps = 1e-7;
    const extremeEntries = [
      e(eps, 0),
      e(1 - eps, 1),
      e(eps, 0),
      e(1 - eps, 1),
    ];
    const bs = brierScore(extremeEntries);
    assert.ok(bs >= 0 && bs < 1e-10, `Brier score should be ~0: ${bs}`);
    const murphy = murphyDecomposition(extremeEntries);
    assert.ok(Number.isFinite(murphy.reliability));
    assert.ok(Number.isFinite(murphy.resolution));
    assert.ok(Number.isFinite(murphy.uncertainty));
    close(bs, murphy.reliability - murphy.resolution + murphy.uncertainty, 1e-9);
  });

  it("clamps and sanitizes out-of-bounds user confidence in setPrediction and ledgerFromJourneys", () => {
    let j = newJourney({ id: "clamp-test" });
    j = setProblem(j, "Testing extreme bounds");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));
    j = selectHypothesis(j, j.hypotheses[0]);
    j = applyChallenges(j, fallbackChallenges(j));
    j = selectChallenge(j, fallbackPlan(j.challenges[0]));

    // Saboteur inputs numbers far beyond [0, 100]
    const clampedHigh = setPrediction(j, 9999);
    assert.equal(clampedHigh.prediction.confidence, 100);

    const clampedLow = setPrediction(j, -9999);
    assert.equal(clampedLow.prediction.confidence, 0);

    // Negative float / weird string float
    const clampedFloatStr = setPrediction(j, "105.4");
    assert.equal(clampedFloatStr.prediction.confidence, 100);

    // Journey with corrupted confidence directly in raw object feeding ledgerFromJourneys
    const rogueJourneys = [
      {
        id: "rogue-1",
        prediction: { confidence: 500, at: 1000 },
        outcome: { id: "easier" },
        challenge: { title: "Rogue High", minimum_success: "Test" },
        completedAt: 2000,
      },
      {
        id: "rogue-2",
        prediction: { confidence: -50, at: 1000 },
        outcome: { id: "not-done" },
        challenge: { title: "Rogue Low", minimum_success: "Test" },
        completedAt: 3000,
      },
    ];
    const ledger = ledgerFromJourneys(rogueJourneys);
    assert.equal(ledger[0].confidence, 1.0); // clamped to 1.0 (100%)
    assert.equal(ledger[1].confidence, 0.0); // clamped to 0.0 (0%)
    assert.doesNotThrow(() => summarize(ledger));
  });

  it("diagnoses extreme overconfidence and underconfidence correctly in interpret()", () => {
    // 100% confidence on all attempts, but 0% hits (extreme delusion)
    const delusion = Array.from({ length: 10 }, () => e(1.0, 0));
    const sDelusion = summarize(delusion);
    const interpDelusion = interpret(sDelusion);
    assert.match(interpDelusion, /overconfident by about 100 points/i);
    assert.match(interpDelusion, /Shrink the next experiment or lower your forecast/i);

    // 0% confidence on all attempts, but 100% hits (imposter syndrome)
    const imposter = Array.from({ length: 10 }, () => e(0.0, 1));
    const sImposter = summarize(imposter);
    const interpImposter = interpret(sImposter);
    assert.match(interpImposter, /underconfident by about 100 points/i);
    assert.match(interpImposter, /fear is a worse predictor than your track record/i);
  });
});

describe("Helmet 03: Zero-Variance Sample Stress & Degenerate Conditions", () => {
  it("prevents division by zero when uncertainty is zero (all hits or all misses)", () => {
    // All hits -> baseRate = 1.0, uncertainty = 0
    const allHits = [e(0.8, 1), e(0.9, 1), e(0.85, 1), e(0.95, 1), e(0.7, 1)];
    const sHits = summarize(allHits);
    assert.equal(sHits.uncertainty, 0);
    assert.equal(sHits.baseRate, 1.0);
    assert.equal(sHits.skill, null, "BSS must be null when uncertainty is zero to avoid division by zero");
    assert.equal(murphyDecomposition(allHits).uncertainty, 0);

    // All misses -> baseRate = 0.0, uncertainty = 0
    const allMisses = [e(0.2, 0), e(0.1, 0), e(0.3, 0), e(0.05, 0), e(0.15, 0)];
    const sMisses = summarize(allMisses);
    assert.equal(sMisses.uncertainty, 0);
    assert.equal(sMisses.baseRate, 0.0);
    assert.equal(sMisses.skill, null, "BSS must be null when uncertainty is zero");
  });

  it("handles constant forecast with zero forecast variance", () => {
    // Forecaster always predicts 0.70 across varying outcomes
    const constantForecast = [
      e(0.7, 1),
      e(0.7, 0),
      e(0.7, 1),
      e(0.7, 1),
      e(0.7, 0),
    ];
    const s = summarize(constantForecast);
    assert.equal(s.resolution, 0, "Resolution must be zero when forecasts never vary");
    assert.equal(s.meanConfidence, 0.7);
    close(s.brier, s.reliability - s.resolution + s.uncertainty);
  });

  it("survives n=1 singleton and n=0 empty entries without throwing or NaN", () => {
    // Empty
    assert.equal(brierScore([]), null);
    assert.equal(murphyDecomposition([]), null);
    const emptySummary = summarize([]);
    assert.equal(emptySummary.n, 0);
    assert.equal(emptySummary.brier, null);
    assert.equal(emptySummary.skill, null);
    assert.match(interpret(emptySummary), /No resolved forecasts yet/);

    // n=1
    const single = [e(0.5, 1)];
    const sSingle = summarize(single);
    assert.equal(sSingle.n, 1);
    assert.equal(sSingle.brier, 0.25);
    assert.equal(sSingle.uncertainty, 0); // single outcome -> baseRate=1, unc=0
    assert.equal(sSingle.skill, null);
    assert.match(interpret(sSingle), /too few to read a pattern yet/);
  });

  it("handles reliability diagram bins under zero-variance distributions", () => {
    // All forecasts clustered exactly at 1.0 (boundary bin inclusion)
    const ones = [e(1.0, 1), e(1.0, 1), e(1.0, 0)];
    const curveOnes = calibrationCurve(ones, 5);
    assert.equal(curveOnes.length, 5);
    assert.equal(curveOnes[4].n, 3, "1.0 must be placed in the top bin [0.8, 1.0]");
    close(curveOnes[4].hitRate, 2 / 3);
    for (let i = 0; i < 4; i++) {
      assert.equal(curveOnes[i].n, 0);
      assert.equal(curveOnes[i].hitRate, null);
    }

    // SVG generation on zero-variance and empty entries
    const svgEmpty = calibrationChart([]);
    assert.doesNotMatch(svgEmpty, /<circle|<path/);
    const svgAllHits = calibrationChart(ones);
    assert.match(svgAllHits, /<circle /);
  });
});

describe("Helmet 03: P-Hacking & HARKing Prevention Stress", () => {
  function createReadyJourney() {
    let j = newJourney({ id: "anti-phack" });
    j = setProblem(j, "My backend microservice times out under load");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));
    j = selectHypothesis(j, j.hypotheses[0]);
    j = applyChallenges(j, fallbackChallenges(j));
    j = selectChallenge(j, fallbackPlan(j.challenges[0]));
    return j;
  }

  it("freezes prediction permanently once outcome is known (no hindsight editing)", () => {
    let j = createReadyJourney();
    j = setPrediction(j, 30);
    assert.equal(j.prediction.confidence, 30);

    // Record outcome
    j = recordOutcome(j, "easier");
    assert.equal(j.phase, "complete");
    assert.equal(j.outcome.id, "easier");

    // Attempted P-Hacking / HARKing: user sees success and tries to change confidence to 99%
    const tampered = setPrediction(j, 99);
    assert.equal(tampered.prediction.confidence, 30, "Prediction must be immutable once outcome is recorded");

    // Even if user navigates back to 'plan' phase, prediction remains frozen
    const steppedBack = goBack(goBack(j));
    assert.equal(steppedBack.phase, "plan");
    const tamperedAfterBack = setPrediction(steppedBack, 95);
    assert.equal(tamperedAfterBack.prediction.confidence, 30, "Prediction must remain frozen even when navigating back");
  });

  it("wipes downstream challenges and plans when hypothesis is switched (no hypothesis hopping)", () => {
    let j = createReadyJourney();
    assert.ok(j.challenge);
    assert.ok(j.challenges.length > 0);

    // User hops to a different hypothesis
    const newHyp = j.hypotheses[1];
    const hopped = selectHypothesis(j, newHyp);

    assert.equal(hopped.phase, "insight");
    assert.equal(hopped.selectedHypothesis.id, newHyp.id);
    assert.equal(hopped.challenge, null, "Active plan must be cleared on hypothesis hop");
    assert.deepEqual(hopped.challenges, [], "Stale challenges must be cleared on hypothesis hop");
    assert.equal(canEnter(hopped, "plan"), false, "Cannot leap into plan without fresh challenge selection");
  });

  it("resets challenges and active plan when re-analyzing the problem", () => {
    let j = createReadyJourney();
    j = setPrediction(j, 80);
    j = toggleStep(j, 0);

    // User changes mind and analyzes new problem text
    const reanalyzed = applyAnalysis(
      setProblem(j, "I cannot cook pasta properly"),
      fallbackUnderstanding("I cannot cook pasta properly")
    );

    assert.equal(reanalyzed.domain, "cooking");
    assert.equal(reanalyzed.phase, "hypotheses");
    assert.equal(reanalyzed.selectedHypothesis, null);
    assert.deepEqual(reanalyzed.challenges, []);
    assert.equal(reanalyzed.challenge, null);
    assert.equal(canEnter(reanalyzed, "challenges"), false);
    assert.equal(canEnter(reanalyzed, "plan"), false);
  });

  it("enforces falsifier citation and immutable score calculation in learning debrief", () => {
    let j = createReadyJourney();
    j = setPrediction(j, 75);

    // Learning citation must hold the experiment's stated falsifier
    const debriefMiss = learningFor(j, "not-done");
    assert.match(debriefMiss, new RegExp(j.challenge.falsifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // Brier for 75% predicting miss (outcome 0) = (0.75 - 0)^2 = 0.5625 -> 0.56
    assert.match(debriefMiss, /Brier of 0\.56/);

    const debriefHit = learningFor(j, "easier");
    // Brier for 75% predicting hit (outcome 1) = (0.75 - 1)^2 = 0.0625 -> 0.06
    assert.match(debriefHit, /Brier of 0\.06/);
  });

  it("filters unverified journeys from calibration ledger (pre-registration audit)", () => {
    const rawJourneys = [
      // 1. Valid resolved forecast
      {
        id: "valid-1",
        prediction: { confidence: 60, at: 100 },
        outcome: { id: "annoying" },
        challenge: { title: "Staging Test Run", minimum_success: "Deploy to staging" },
        completedAt: 500,
      },
      // 2. Unresolved (still in progress) - must NOT contaminate ledger
      {
        id: "in-flight",
        prediction: { confidence: 80, at: 200 },
        outcome: null,
      },
      // 3. Debrief completed without pre-registered prediction - must NOT contaminate ledger
      {
        id: "unpredicted",
        prediction: null,
        outcome: { id: "easier" },
        completedAt: 600,
      },
      // 4. Invalid outcome id (bogus / corrupted)
      {
        id: "bogus-outcome",
        prediction: { confidence: 50, at: 300 },
        outcome: { id: "magical-fix" },
        completedAt: 700,
      },
    ];

    const ledger = ledgerFromJourneys(rawJourneys);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].id, "valid-1");
    assert.equal(ledger[0].outcome, 1);
    assert.equal(ledger[0].confidence, 0.6);
    assert.match(ledger[0].claim, /Deploy to staging/);

    // Export formats must preserve sanitized state
    const jsonStr = toJSON(ledger);
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.entries[0].id, "valid-1");

    const mdStr = toMarkdown(ledger);
    assert.match(mdStr, /Staging Test Run/);
  });
});

describe("Helmet 03: 'Where's the Bathroom?' Out-of-Order & Saboteur State Attacks", () => {
  it("rejects invalid out-of-order phase jumps immediately and loudly", () => {
    const fresh = newJourney();

    // Impatient user tries to skip straight to complete or plan from blank start
    assert.throws(() => goTo(fresh, "complete"), /Cannot enter "complete"/);
    assert.throws(() => goTo(fresh, "plan"), /Cannot enter "plan"/);
    assert.throws(() => goTo(fresh, "challenges"), /Cannot enter "challenges"/);
    assert.throws(() => goTo(fresh, "insight"), /Cannot enter "insight"/);
    assert.throws(() => goTo(fresh, "hypotheses"), /Cannot enter "hypotheses"/);

    // Alien phase that doesn't exist
    assert.throws(() => goTo(fresh, "bathroom"), TypeError);
  });

  it("handles repeated, idempotent back-navigation and boundary retreat safely", () => {
    let j = newJourney();
    assert.equal(goBack(j).phase, "start");
    assert.equal(goBack(goBack(goBack(j))).phase, "start");

    // Walk forward 2 steps
    j = setProblem(j, "I get nervous pitching");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));
    assert.equal(j.phase, "hypotheses");

    j = selectHypothesis(j, j.hypotheses[0]);
    assert.equal(j.phase, "insight");

    // Back to hypotheses
    j = goBack(j);
    assert.equal(j.phase, "hypotheses");

    // Back to start
    j = goBack(j);
    assert.equal(j.phase, "start");

    // Cannot go back further than start
    j = goBack(j);
    assert.equal(j.phase, "start");
  });

  it("refuses garbage input types across transition methods", () => {
    let j = newJourney();
    j = setProblem(j, "Trouble focusing on code");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));

    // Garbage hypothesis
    assert.throws(() => selectHypothesis(j, null), /A hypothesis needs a title/);
    assert.throws(() => selectHypothesis(j, {}), /A hypothesis needs a title/);
    assert.throws(() => selectHypothesis(j, { title: "" }), /A hypothesis needs a title/);

    // Garbage challenges
    assert.throws(() => applyChallenges(j, { challenges: [] }), /Choose a hypothesis/);
    j = selectHypothesis(j, j.hypotheses[0]);
    assert.throws(() => applyChallenges(j, null), /No challenges were returned/);
    assert.throws(() => applyChallenges(j, { challenges: [] }), /No challenges were returned/);

    // Garbage plan
    assert.throws(() => selectChallenge(j, null), /A plan needs a title and steps/);
    assert.throws(() => selectChallenge(j, { title: "No steps" }), /A plan needs a title and steps/);
    assert.throws(() => selectChallenge(j, { title: "T", steps: [] }), /A plan needs a title and steps/);

    // Garbage outcome
    assert.throws(() => recordOutcome(j, "easier"), /Choose a plan/);
    j = applyChallenges(j, fallbackChallenges(j));
    j = selectChallenge(j, fallbackPlan(j.challenges[0]));
    assert.throws(() => recordOutcome(j, "exploded"), /Unknown outcome: exploded/);
    assert.throws(() => recordOutcome(j, null), /Unknown outcome: null/);
  });

  it("toggles step checkboxes safely against NaN, negative, out-of-range, and float indices", () => {
    let j = newJourney();
    j = setProblem(j, "Software bug investigation");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));
    j = selectHypothesis(j, j.hypotheses[0]);
    j = applyChallenges(j, fallbackChallenges(j));
    j = selectChallenge(j, fallbackPlan(j.challenges[0]));

    const stepCount = j.challenge.steps.length;
    assert.ok(stepCount > 0);

    // Normal toggling
    j = toggleStep(j, 0);
    assert.deepEqual(j.checked, [0]);
    j = toggleStep(j, 0);
    assert.deepEqual(j.checked, []);

    // Saboteur inputs
    assert.equal(toggleStep(j, -1), j);
    assert.equal(toggleStep(j, stepCount + 10), j);
    assert.equal(toggleStep(j, 2.718), j);
    assert.equal(toggleStep(j, "0"), j);
    assert.equal(toggleStep(j, NaN), j);
    assert.equal(toggleStep(j, null), j);
    assert.equal(toggleStep(j, undefined), j);
  });

  it("handles offline coach localReply under bizarre prompt inquiries", () => {
    let j = newJourney();
    j = setProblem(j, "I get distracted after lunch");
    j = applyAnalysis(j, fallbackUnderstanding(j.problem));
    j = selectHypothesis(j, j.hypotheses[0]);
    j = applyChallenges(j, fallbackChallenges(j));
    j = selectChallenge(j, fallbackPlan(j.challenges[0]));

    // Ask where the bathroom is
    const replyBathroom = localReply(j, "Where is the bathroom?");
    assert.ok(typeof replyBathroom === "string" && replyBathroom.length > 0);

    // Empty query
    const replyEmpty = localReply(j, "");
    assert.ok(typeof replyEmpty === "string" && replyEmpty.length > 0);

    // Complete phase reflection question
    j = recordOutcome(j, "annoying");
    const replyComplete = localReply(j, "What should I do next?");
    assert.ok(typeof replyComplete === "string" && replyComplete.length > 0);
  });
});
