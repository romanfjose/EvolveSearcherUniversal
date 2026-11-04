import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateSchema, redact, createStreamGuard, verifyCitations, guardOutput } from '../src/output-guard.mjs';

test('extractJson: fences, prose, truncation, trailing commas, raw newlines', () => {
  const cases = [
    ['Sure!\n```json\n{"a": 1}\n```\nAnything else?', { a: 1 }, false],
    ['```json\n{"items": [{"id": 1}, {"id": 2, "name": "Wid', { items: [{ id: 1 }, { id: 2, name: 'Wid' }] }, true],
    ['{"a": 1, "b": [1, 2,], }', { a: 1, b: [1, 2] }, false],
    ['{"total": 12.5, "cur', { total: 12.5 }, true],
    ['{"n": 1.', {}, true],
    ['{"ok": tru', {}, true],
    ['Result: [1, 2, 3]. Hope that helps!', [1, 2, 3], false],
    ['{"text": "line one\nline two"}', { text: 'line one\nline two' }, false],
    ['{"esc": "tab\\tq\\"x\\u00e9\\u00', { esc: 'tab\tq"xé' }, true],
  ];
  for (const [input, value, truncated] of cases) {
    const r = extractJson(input);
    assert.equal(r.ok, true, input);
    assert.deepEqual(r.value, value, input);
    assert.equal(r.truncated, truncated, input);
  }
  assert.equal(extractJson('no json here').ok, false);
});

test('validateSchema: strict contracts with JSON-pointer errors', () => {
  const schema = { type: 'object', required: ['id', 'tags'], properties: {
    id: { type: 'integer', minimum: 1 }, tags: { type: 'array', items: { enum: ['a', 'b'] }, uniqueItems: true },
    email: { type: 'string', pattern: '^[^@]+@[^@]+$' } } };
  assert.deepEqual(validateSchema({ id: 3, tags: ['a'] }, schema), { valid: true, errors: [] });
  const r = validateSchema({ id: 0.5, tags: ['a', 'c', 'a'], email: 'x', extra: 1 }, schema);
  assert.deepEqual(r.errors.map((e) => e.path).sort(), ['/email', '/extra', '/id', '/tags', '/tags/1'].sort());
  assert.equal(validateSchema({ id: 1, tags: [], extra: 1 }, schema, { strict: false }).valid, true);
  assert.equal(validateSchema(5, { oneOf: [{ type: 'integer' }, { type: 'number' }] }).valid, false);
});

const KEY = 'sk-' + 'proj-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
const SYSTEM = 'You are the Acme refund agent. Never approve refunds above two hundred dollars without a supervisor code.';

test('redact: provider keys, caller secrets and verbatim system-prompt fragments', () => {
  const out = redact(`Debug: key=${KEY}. My rules say never approve refunds above two hundred dollars without a supervisor code, ok? canary-7731`, { systemPrompt: SYSTEM, secrets: ['canary-7731'] });
  assert.equal(out.text, 'Debug: key=[REDACTED:openai-key]. My rules say [REDACTED:system-prompt], ok? [REDACTED:secret]');
  assert.equal(redact('Refunds above $200 need a supervisor.', { systemPrompt: SYSTEM }).redactions.length, 0, 'paraphrase is not a leak');
});

test('stream guard: secrets and prompt fragments split across arbitrary chunk boundaries', () => {
  const text = `Here you go: ${KEY} and the rules: never approve refunds above two hundred dollars without a supervisor code. Bye.`;
  const expected = redact(text, { systemPrompt: SYSTEM }).text;
  for (const size of [1, 3, 7, 40]) {
    const g = createStreamGuard({ systemPrompt: SYSTEM, holdback: 128 });
    let out = '';
    for (let i = 0; i < text.length; i += size) out += g.push(text.slice(i, i + size));
    out += g.end();
    assert.equal(out, expected, `chunk size ${size}`);
    assert.ok(!out.includes(KEY.slice(0, 12)));
  }
});

test('verifyCitations: unknown ids and fabricated quotes fail', () => {
  const sources = [{ id: 1, text: 'Q3 revenue rose 12 percent year over year.' }, { id: 2, text: 'Churn was flat.' }];
  assert.equal(verifyCitations('Revenue "rose 12 percent year over year" [1]; churn was flat [2].', sources).valid, true);
  const bad = verifyCitations('Revenue "rose 40 percent in a single quarter" [1] and margins doubled [3].', sources);
  assert.deepEqual([bad.valid, bad.missing, bad.unverifiedQuotes.length, bad.uncited], [false, ['3'], 1, ['2']]);
  assert.equal(verifyCitations('No citations at all.', sources).valid, false);
});

test('guardOutput: one-call pipeline', () => {
  const r = guardOutput('```json\n{"answer": "See policy", "key": "' + KEY + '"', {
    schema: { type: 'object', properties: { answer: { type: 'string' }, key: { type: 'string' } } },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.json.value, { answer: 'See policy', key: '[REDACTED:openai-key]' });
  assert.equal(guardOutput('{"answer": 3}', { schema: { type: 'object', properties: { answer: { type: 'string' } } } }).ok, false);
});
