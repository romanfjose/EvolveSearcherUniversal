import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMAINS, DIFFICULTY_ORDER, detectDomain, domainScores, genericDomain, getDomain, challengesFor,
  fallbackUnderstanding, fallbackChallenges, fallbackPlan, localReply,
} from "../src/core/domains.mjs";

const detection = [
  ["I hate cooking because it feels like too much work", "cooking"],
  ["No sé cocinar y la comida me sale mal", "cooking"],
  ["Our API endpoint is slow and the database queries pile up", "software"],
  ["I avoid refactoring the codebase because every bug fix breaks something", "software"],
  ["I want to freelance but don't know if any client would pay", "freelance"],
  ["How should I price my consulting offer?", "freelance"],
  ["I keep avoiding exercise and feel tired every afternoon", "habits"],
  ["Me cuesta dormir y no tengo energía", "habits"],
  ["I want to speak up in meetings but I freeze", "social"],
  ["Small talk with coworkers feels awkward", "social"],
];
for (const [problem, expected] of detection) {
  test(`detectDomain: "${problem}" → ${expected}`, () => assert.equal(detectDomain(problem), expected));
}

test("detectDomain falls back to generic for unrelated or empty input", () => {
  assert.equal(detectDomain("I want to learn the violin"), "generic");
  assert.equal(detectDomain(""), "generic");
  assert.equal(detectDomain(undefined), "generic");
});

test("detectDomain matches word starts only, not substrings", () => {
  assert.equal(domainScores("precooked encode")["cooking"], 0);
  assert.equal(domainScores("precooked encode")["software"], 0);
});

test("detectDomain breaks ties by DOMAINS order and prefers the higher score", () => {
  assert.equal(detectDomain("cook code"), "cooking");
  assert.equal(detectDomain("cook code debug"), "software");
});

const contract = (c, where) => {
  for (const key of ["id", "title", "time", "difficulty", "why", "falsifier", "minimum_success"]) assert.equal(typeof c[key], "string", `${where}.${key}`);
  assert.ok(c.steps.length >= 5 && c.steps.length <= 9, `${where} has 5–9 steps`);
  assert.ok(c.materials.length >= 1 && c.materials.length <= 5, `${where} has 1–5 materials`);
  assert.ok(c.upgrades.length >= 2 && c.upgrades.length <= 3, `${where} has 2–3 upgrades`);
  assert.ok(c.success_signals.length >= 2 && c.success_signals.length <= 3, `${where} has 2–3 success signals`);
};

for (const domain of [...DOMAINS, genericDomain("anything")]) {
  test(`${domain.id}: complete tree — 4 hypotheses, each tested by exactly one full, falsifiable plan`, () => {
    assert.equal(domain.hypotheses.length, 4);
    assert.equal(new Set(domain.hypotheses.map((h) => h.id)).size, 4);
    assert.equal(domain.challenges.length, 4);
    for (const h of domain.hypotheses) assert.equal(domain.challenges.filter((c) => c.tests.includes(h.id)).length, 1, `${domain.id}/${h.id}`);
    for (const c of domain.challenges) {
      contract(c, `${domain.id}/${c.id}`);
      assert.ok(DIFFICULTY_ORDER.includes(c.difficulty), `${c.id} difficulty`);
      assert.ok(c.tests.every((id) => domain.hypotheses.some((h) => h.id === id)), `${c.id} tests known hypotheses`);
    }
    assert.ok(domain.reflection && domain.challenge_intro);
  });

  test(`${domain.id}: challengesFor puts the designed test first, then easiest-first`, () => {
    for (const h of domain.hypotheses) {
      const picked = challengesFor(domain, h.id);
      assert.equal(picked.length, 3);
      assert.ok(picked[0].tests.includes(h.id));
      const rest = picked.slice(1).map((c) => DIFFICULTY_ORDER.indexOf(c.difficulty));
      assert.deepEqual(rest, [...rest].sort((a, b) => a - b));
      assert.equal(picked[0].steps, undefined, "summaries omit plan detail until chosen");
    }
  });
}

test("challenge ids are globally unique so fallbackPlan resolves unambiguously", () => {
  const ids = [...DOMAINS, genericDomain()].flatMap((d) => d.challenges.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("every domain ships an example that detects as itself", () => {
  for (const d of DOMAINS) assert.equal(detectDomain(d.example), d.id, d.id);
});

test("challengesFor with a custom or 'all' hypothesis returns the three easiest", () => {
  const picked = challengesFor(getDomain("software"), "all").map((c) => c.difficulty);
  assert.deepEqual(picked, ["Almost effortless", "Very easy", "Easy"]);
});

test("fallbackUnderstanding is deterministic and returns copies", () => {
  const a = fallbackUnderstanding("my code is slow");
  assert.deepEqual(a, fallbackUnderstanding("my code is slow"));
  assert.equal(a.domain, "software");
  a.hypotheses[0].title = "mutated";
  assert.notEqual(getDomain("software").hypotheses[0].title, "mutated");
});

test("fallbackChallenges honours the stored domain over re-detection", () => {
  const journey = { problem: "cook", domain: "social", selectedHypothesis: { id: "blank" } };
  const result = fallbackChallenges(journey);
  assert.equal(result.challenges[0].id, "prepared-line");
});

test("fallbackPlan resolves known ids across trees and keeps caller fields", () => {
  const plan = fallbackPlan({ id: "time-split", title: "x", extra: 1 });
  assert.equal(plan.extra, 1);
  assert.equal(plan.title, "Split wall time from CPU time");
  contract(plan, "time-split");
});

test("fallbackPlan builds a safe, falsifiable template for custom challenges", () => {
  const plan = fallbackPlan({ id: "custom-1", title: "Bake bread", time: "You decide", difficulty: "Custom", why: "mine" });
  assert.match(plan.minimum_success, /Bake bread/);
  assert.ok(plan.falsifier && plan.steps.length >= 5);
});

test("localReply answers domain questions, complete-phase reflections and unknowns", () => {
  assert.match(localReply({ domain: "cooking", phase: "plan" }, "how much salt?"), /pinches/);
  assert.match(localReply({ domain: "software", phase: "plan" }, "is this an N+1 query?"), /EXPLAIN ANALYZE/);
  assert.match(localReply({ domain: "habits", phase: "plan" }, "should I see a doctor?"), /not medical advice/);
  assert.match(localReply({ phase: "complete" }, "it felt weird"), /worth noticing/);
  assert.match(localReply({ domain: "social", phase: "plan", challenge: { title: "Ask one low-stakes question" } }, "zzz"), /Ask one low-stakes question/);
});
