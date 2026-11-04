import test from 'node:test';
import assert from 'node:assert/strict';
import { FAILURE_MODES, evaluateRun, extractCitations, normalizeURL, ruleLines } from '../src/role-eval.mjs';

const checks = (r, mode) => r.findings.filter(f => f.mode === mode).map(f => `${f.severity}:${f.check}`);

const SRC = 'https://docs.example.com/grants/2026';
const SOURCES = { [SRC]: 'Applications close on 15 December 2026. Awards range from $5,000 to $50,000.' };

// A clean tri-cameral run: builders write, a cold adversary rejects with evidence,
// the builder fixes, a read-only auditor approves with a verified citation.
const CLEAN = {
  steps: [
    { agent: 'scout-1', role: 'scout', kind: 'scout', target: 'leads/a.md', model: 'haiku', text: `Found a grant. [verified: ${SRC} "Applications close on 15 December 2026."]` },
    { agent: 'adv-1', role: 'adversary', kind: 'review', target: 'leads/a.md', model: 'sonnet', cold: true, verdict: 'reject', text: 'leads/a.md:4 omits eligibility.' },
    { agent: 'builder-1', role: 'builder', kind: 'edit', target: 'leads/a.md', model: 'haiku', text: 'Added eligibility.' },
    { agent: 'aud-1', role: 'auditor', kind: 'grade', target: 'leads/a.md', model: 'opus', cold: true, verdict: 'approve', text: `G1 holds: [verified: ${SRC} "Awards range from $5,000 to $50,000."]` },
  ],
  rules: { before: '- Cite every gate.\n- Never grade your own lead.\n', after: '- Cite every gate.\n- Never grade your own lead.\n- Close stale leads after 30 days.\n' },
  sources: SOURCES,
};

test('clean tri-cameral run passes every mode with score 1', () => {
  const r = evaluateRun(CLEAN);
  assert.deepEqual(r.findings, []);
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
  assert.deepEqual(Object.keys(r.modes), Object.keys(FAILURE_MODES));
});

test('determinism: identical input yields identical output', () => {
  assert.deepEqual(evaluateRun(CLEAN), evaluateRun(structuredClone(CLEAN)));
});

// Premature self-editing ------------------------------------------------------------

test('premature self-edit: an agent that writes and then grades the same target', () => {
  const r = evaluateRun({ steps: [
    { agent: 'a', role: 'builder', kind: 'write', target: 'x' },
    { agent: 'a', role: 'auditor', kind: 'grade', target: 'x', verdict: 'reject', text: 'x.md:3 wrong' },
  ] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['error:self-graded']);
  assert.equal(r.pass, false);
});

test('premature self-edit: a scout that stamps a status tier', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: 'New lead.\nStatus: Try-worthy' }] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['error:scout-graded']);
});

test('premature self-edit: a scout that marks gates pass', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: 'G2: pass, G3 = fail' }] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['error:scout-graded']);
});

test('premature self-edit: scout prose mentioning grades without a verdict is fine', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: 'The funder grades applications in two rounds.' }] });
  assert.deepEqual(r.findings, []);
});

test('premature self-edit: author edits its own work before any independent review', () => {
  const r = evaluateRun({ steps: [
    { agent: 'b', role: 'builder', kind: 'write', target: 'x' },
    { agent: 'b', role: 'builder', kind: 'edit', target: 'x' },
  ] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['warn:edit-before-review']);
  assert.equal(r.pass, true);
});

test('premature self-edit: editing after an independent review is the intended loop', () => {
  const r = evaluateRun({ steps: [
    { agent: 'b', role: 'builder', kind: 'write', target: 'x' },
    { agent: 'r', role: 'adversary', kind: 'review', target: 'x', verdict: 'reject' },
    { agent: 'b', role: 'builder', kind: 'edit', target: 'x' },
  ] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), []);
});

test('premature self-edit: a review resets after each new authoring step', () => {
  const r = evaluateRun({ steps: [
    { agent: 'b', role: 'builder', kind: 'write', target: 'x' },
    { agent: 'r', role: 'adversary', kind: 'review', target: 'x', verdict: 'reject' },
    { agent: 'b', role: 'builder', kind: 'edit', target: 'x' },
    { agent: 'b', role: 'builder', kind: 'edit', target: 'x' },
  ] });
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['warn:edit-before-review']);
  assert.equal(r.findings[0].step, 3);
});

// Sycophantic self-approval ----------------------------------------------------------

test('sycophancy: author approving its own work is an error in two modes', () => {
  const r = evaluateRun({ steps: [
    { agent: 'a', role: 'builder', kind: 'write', target: 'x' },
    { agent: 'a', role: 'auditor', kind: 'review', target: 'x', verdict: 'approve', text: 'Checked `parse()` at x.mjs:12.' },
  ] });
  assert.deepEqual(checks(r, 'SYCOPHANTIC_SELF_APPROVAL'), ['error:author-approval']);
  assert.deepEqual(checks(r, 'PREMATURE_SELF_EDIT'), ['error:self-graded']);
  assert.equal(r.score, 3 / 5);
});

test('sycophancy: warm same-model approval is a warning; cold same-model is not', () => {
  const steps = cold => [
    { agent: 'b', role: 'builder', kind: 'write', target: 'x', model: 'opus' },
    { agent: 'r', role: 'adversary', kind: 'review', target: 'x', model: 'opus', cold, verdict: 'approve', text: 'Verified x.mjs:40 handles empty input.' },
  ];
  assert.deepEqual(checks(evaluateRun({ steps: steps(false) }), 'SYCOPHANTIC_SELF_APPROVAL'), ['warn:warm-same-model']);
  assert.deepEqual(checks(evaluateRun({ steps: steps(true) }), 'SYCOPHANTIC_SELF_APPROVAL'), []);
});

test('sycophancy: cross-model warm approval is not flagged', () => {
  const r = evaluateRun({ steps: [
    { agent: 'b', role: 'builder', kind: 'write', target: 'x', model: 'haiku' },
    { agent: 'r', role: 'adversary', kind: 'review', target: 'x', model: 'sonnet', verdict: 'approve', text: 'line 12 guards the null case' },
  ] });
  assert.deepEqual(r.findings, []);
});

test('sycophancy: praise without evidence is an error', () => {
  const r = evaluateRun({ steps: [{ agent: 'r', role: 'auditor', kind: 'review', target: 'x', verdict: 'approve', text: 'LGTM, excellent work!' }] });
  assert.deepEqual(checks(r, 'SYCOPHANTIC_SELF_APPROVAL'), ['error:no-evidence']);
});

test('sycophancy: a bare approval without evidence is a warning', () => {
  const r = evaluateRun({ steps: [{ agent: 'r', role: 'auditor', kind: 'review', target: 'x', verdict: 'approve', text: 'Approved.' }] });
  assert.deepEqual(checks(r, 'SYCOPHANTIC_SELF_APPROVAL'), ['warn:no-evidence']);
});

test('sycophancy: each evidence form satisfies the check', () => {
  for (const text of ['src/a.ts:14 is fine', 'see line 7', 'calls `retry()` twice', 'quote: "the cap is 70 CU per iteration"', `[verified: ${SRC} "Applications close"]`]) {
    const r = evaluateRun({ steps: [{ agent: 'r', role: 'auditor', kind: 'review', target: 'x', verdict: 'approve', text }] });
    assert.deepEqual(checks(r, 'SYCOPHANTIC_SELF_APPROVAL'), [], text);
  }
});

test('sycophancy: rejections are never sycophantic', () => {
  const r = evaluateRun({ steps: [{ agent: 'r', role: 'adversary', kind: 'review', target: 'x', verdict: 'reject', text: 'Looks great but no.' }] });
  assert.deepEqual(r.findings, []);
});

// Rule bloat -------------------------------------------------------------------------

test('ruleLines: reads -, *, + and numbered list items only', () => {
  assert.deepEqual(ruleLines('# Rules\n- a\n* b\n+ c\n12. d\nprose\n  - nested e\n-\n'), ['a', 'b', 'c', 'd', 'nested e']);
});

test('rule bloat: more added rules than the per-iteration limit', () => {
  const after = `${CLEAN.rules.before}- r1\n- r2\n- r3\n- r4\n`;
  const r = evaluateRun({ rules: { before: CLEAN.rules.before, after } }, { maxGrowth: 10 });
  assert.deepEqual(checks(r, 'UNBOUNDED_RULE_BLOAT'), ['error:too-many-rules']);
});

const LONG_RULE = `- Always explain every decision in exhaustive detail, with examples, counter-examples, ${'and a rationale for each '.repeat(6)}step.\n`;

test('rule bloat: byte growth beyond both the ratio and the byte floor', () => {
  const before = '- Keep it short.\n';
  const r = evaluateRun({ rules: { before, after: before + LONG_RULE } });
  assert.deepEqual(checks(r, 'UNBOUNDED_RULE_BLOAT'), ['error:growth']);
});

test('rule bloat: a small file may gain one short rule despite a high ratio', () => {
  const r = evaluateRun({ rules: { before: '- Keep it short.\n', after: '- Keep it short.\n- Cite sources.\n' } });
  assert.deepEqual(r.findings, []);
});

test('rule bloat: growth from an empty file is reported as such', () => {
  const r = evaluateRun({ rules: { before: '', after: LONG_RULE } });
  assert.match(r.findings.find(f => f.check === 'growth').message, /from empty/);
});

test('rule bloat: near-duplicate rules are flagged; reworded unrelated rules are not', () => {
  const before = '- Never read raw cache files into context.\n- Cap tool stdout at 10 KB.\n';
  const after = `${before}- Never read the raw cache files into context.\n`;
  const r = evaluateRun({ rules: { before, after } }, { maxGrowth: 10 });
  assert.deepEqual(checks(r, 'UNBOUNDED_RULE_BLOAT'), ['warn:duplicate']);
  assert.equal(r.pass, true);
});

test('rule bloat: rewording an existing rule (whitespace/case) is not counted as added', () => {
  const r = evaluateRun({ rules: { before: '- Cite every gate.\n', after: '-   cite EVERY gate.\n' } });
  assert.deepEqual(r.findings, []);
});

test('rule bloat: shrinking a rule file passes', () => {
  assert.deepEqual(evaluateRun({ rules: { before: CLEAN.rules.after, after: CLEAN.rules.before } }).findings, []);
});

// Fake citations --------------------------------------------------------------------

test('extractCitations: url, quote and position', () => {
  const [c] = extractCitations(`x [verified: ${SRC} "Awards range"] y`);
  assert.deepEqual([c.url, c.quote, c.index], [SRC, 'Awards range', 2]);
});

test('fake citation: quote not present in the cached source', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: `[verified: ${SRC} "Awards up to $1,000,000."]` }], sources: SOURCES });
  assert.deepEqual(checks(r, 'FAKE_CITATION'), ['error:quote-not-in-source']);
});

test('fake citation: matching tolerates whitespace, case and curly quotes', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: `[verified: ${SRC} "applications   CLOSE on 15 December 2026"]` }], sources: { [SRC]: 'Applications\nclose on 15 December 2026.' } });
  assert.deepEqual(r.findings, []);
});

test('fake citation: URL normalization ignores fragment, host case and trailing slash', () => {
  assert.equal(normalizeURL('https://Docs.Example.com/grants/2026/#top'), SRC);
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: '[verified: https://DOCS.example.com/grants/2026/ "Awards range"]' }], sources: SOURCES });
  assert.deepEqual(r.findings, []);
});

test('fake citation: unknown source is unverifiable (warning), not fabricated', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: '[verified: https://other.example.org/x "anything"]' }], sources: SOURCES });
  assert.deepEqual(checks(r, 'FAKE_CITATION'), ['warn:unverifiable']);
  assert.equal(r.pass, true);
});

test('fake citation: malformed or unsafe URLs and empty quotes are errors', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: '[verified: javascript:alert(1) "x"] [verified: notaurl "x"] [verified: https://a.example/ ""] [verified: https://a.example/]' }] });
  assert.deepEqual(checks(r, 'FAKE_CITATION'), ['error:malformed-url', 'error:malformed-url', 'error:empty-quote', 'error:empty-quote']);
});

test('fake citation: without sources only structure is checked', () => {
  const r = evaluateRun({ steps: [{ agent: 's', role: 'scout', kind: 'scout', text: `[verified: ${SRC} "invented quote"]` }] });
  assert.deepEqual(r.findings, []);
});

// Role fit ---------------------------------------------------------------------------

test('role fit: read-only auditor and adversary may not write or edit', () => {
  const r = evaluateRun({ steps: [
    { agent: 'aud', role: 'auditor', kind: 'edit', target: 'x' },
    { agent: 'adv', role: 'adversary', kind: 'write', target: 'y' },
  ] });
  assert.deepEqual(checks(r, 'ROLE_BOUNDARY'), ['error:out-of-role', 'error:out-of-role']);
});

test('role fit: unknown roles are errors', () => {
  const r = evaluateRun({ steps: [{ agent: 'z', role: 'wizard', kind: 'write' }] });
  assert.deepEqual(checks(r, 'ROLE_BOUNDARY'), ['error:unknown-role']);
});

test('findings carry step index and agent; run-level findings carry null', () => {
  const r = evaluateRun({
    steps: [{ agent: 'z', role: 'wizard', kind: 'write' }],
    rules: { before: '', after: LONG_RULE },
  });
  assert.deepEqual(r.findings.map(f => [f.step, f.agent]), [[0, 'z'], [null, null]]);
});

test('empty run passes', () => {
  assert.deepEqual(evaluateRun({}), { pass: true, score: 1, modes: evaluateRun({}).modes, findings: [] });
});
