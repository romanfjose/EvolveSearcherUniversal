import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');

const members = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, name: 'M' + i, prompt: '', ...(extra[i] || {}) }));
const groupOf = (ais, mode = 'normal', messages = []) => ({ id: 'g', name: 'G', mode, ais, messages });
const catalogOf = g => g.ais.map(a => ({ name: a.name, source: 'group', ai: a }));
const ids = ais => ais.map(a => a.id);
const plan = (g, input) => core.planTurn(g, { catalog: catalogOf(g), rng: core.seededRng('t'), ...input });

test('first user message: everyone answers when the squad has at most 5 active members', () => {
  const g = groupOf(members(4, { 2: { muted: true } }));
  const p = plan(g, { text: 'hi', isFirstUserMessage: true });
  assert.equal(p.kind, 'first');
  assert.deepEqual(ids(p.ais), ['m0', 'm1', 'm3']);
});

test('first user message in a big squad: exactly 5 distinct members, reproducible with a seed', () => {
  const g = groupOf(members(12));
  const a = plan(g, { text: 'hi', isFirstUserMessage: true }).ais;
  const b = plan(g, { text: 'hi', isFirstUserMessage: true }).ais;
  assert.equal(new Set(ids(a)).size, 5);
  assert.deepEqual(ids(a), ids(b));
});

test('reply targets beat mentions; muted targets are dropped', () => {
  const g = groupOf(members(4, { 1: { muted: true } }));
  const p = plan(g, { text: '@M3 hey', replyTargets: [g.ais[1], g.ais[2], g.ais[2]] });
  assert.equal(p.kind, 'reply');
  assert.deepEqual(ids(p.ais), ['m2']);
});

test('+@ adds a member on top of the normal round', () => {
  const g = groupOf(members(2));
  const guest = { id: 'guest', name: 'Guest', prompt: '' };
  const p = core.planTurn(g, { text: 'also +@Guest', catalog: [...catalogOf(g), { name: 'Guest', source: 'library', ai: guest }] });
  assert.equal(p.kind, 'additive');
  assert.deepEqual(ids(p.ais), ['m0', 'm1', 'guest']);
  assert.deepEqual(ids(p.mentioned), ['guest']);
});

test('@mention routes only to the mentioned members', () => {
  const g = groupOf(members(4));
  const p = plan(g, { text: '@M2 and @M0 only' });
  assert.equal(p.kind, 'mention');
  assert.deepEqual(ids(p.ais), ['m2', 'm0']);
});

test('normal mode: everyone unmuted answers, in roster order', () => {
  const g = groupOf(members(4, { 1: { muted: true } }));
  const p = plan(g, { text: 'thoughts?' });
  assert.equal(p.kind, 'round');
  assert.deepEqual(ids(p.ais), ['m0', 'm2', 'm3']);
});

test('roundRepliers resumes from a start index (regenerate-from-here)', () => {
  const g = groupOf(members(4));
  assert.deepEqual(ids(core.roundRepliers(g, 2)), ['m2', 'm3']);
});

test('deliberation mode: a plain message (even the first) starts the 3-round debate', () => {
  const g = groupOf(members(4), 'deliberation');
  assert.equal(plan(g, { text: 'my idea', isFirstUserMessage: true }).kind, 'deliberation');
  assert.equal(plan(g, { text: '@M1 quick question' }).kind, 'mention');
});

test('chaos mode picks 2-4 distinct active members', () => {
  const g = groupOf(members(20, { 0: { muted: true } }), 'chaos', [{ sender: 'user', text: 'hola' }]);
  for (let seed = 0; seed < 200; seed++) {
    const picked = core.pickChaosRepliers(g, core.seededRng(seed));
    assert.ok(picked.length >= 2 && picked.length <= 4, `seed ${seed}: ${picked.length}`);
    assert.equal(new Set(ids(picked)).size, picked.length);
    assert.ok(!picked.some(a => a.muted));
  }
});

test('chaos mode: members named in the last user message jump the queue', () => {
  const g = groupOf(members(20), 'chaos', [{ sender: 'user', text: 'what do M7 and M13 think?' }]);
  const picked = core.pickChaosRepliers(g, core.seededRng('x'));
  assert.deepEqual(ids(picked.slice(0, 2)), ['m7', 'm13']);
});

test('chaos mode matches whole names only: "lunes" does not summon Lu', () => {
  const ais = [{ id: 'lu', name: 'Lu', prompt: '' }, ...members(20)];
  const g = groupOf(ais, 'chaos', [{ sender: 'user', text: 'M3 y M5: el lunes arranco' }]);
  for (let seed = 0; seed < 50; seed++) {
    assert.deepEqual(ids(core.pickChaosRepliers(g, core.seededRng(seed)).slice(0, 2)), ['m3', 'm5'], `seed ${seed}`);
  }
  const named = core.pickChaosRepliers(groupOf(ais, 'chaos', [{ sender: 'user', text: 'Lu, opinás?' }]), core.seededRng(1));
  assert.equal(named[0].id, 'lu');
});

test('chaos picks are reproducible with the same seed', () => {
  const g = groupOf(members(20), 'chaos', [{ sender: 'user', text: 'hey' }]);
  assert.deepEqual(ids(core.pickChaosRepliers(g, core.seededRng(42))), ids(core.pickChaosRepliers(g, core.seededRng(42))));
});

test('deliberation schedule: 3 rounds, every member speaks once per round, in order', () => {
  const steps = core.deliberationSchedule(members(4));
  assert.equal(steps.length, 12);
  assert.deepEqual(steps.map(s => s.round), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(steps.map(s => s.phase).filter((p, i, a) => a.indexOf(p) === i), ['open', 'cross', 'converge']);
  for (const r of [1, 2, 3]) assert.deepEqual(steps.filter(s => s.round === r).map(s => s.speaker.id), ['m0', 'm1', 'm2', 'm3']);
});

test('cross-examination targets form one cycle: nobody challenges themselves, everyone is challenged once', () => {
  for (const n of [2, 3, 4, 7]) {
    const cross = core.deliberationSchedule(members(n)).filter(s => s.phase === 'cross');
    assert.ok(cross.every(s => s.target && s.target.id !== s.speaker.id));
    assert.equal(new Set(cross.map(s => s.target.id)).size, n);
  }
});

test('deliberation schedule skips muted members', () => {
  const steps = core.deliberationSchedule(members(3, { 1: { muted: true } }));
  assert.ok(steps.every(s => s.speaker.id !== 'm1' && (!s.target || s.target.id !== 'm1')));
  assert.equal(steps.length, 6);
});

test('parseVerdictVote reads votes in EN/ES and markdown, never confusing NO-GO with GO', () => {
  assert.equal(core.parseVerdictVote('VOTE: NO-GO — too risky'), 'NO-GO');
  assert.equal(core.parseVerdictVote('**VOTE:** revise, if we cut scope'), 'REVISE');
  assert.equal(core.parseVerdictVote('Final.\nvote - go'), 'GO');
  assert.equal(core.parseVerdictVote('Voto: no avanzar'), 'NO-GO');
  assert.equal(core.parseVerdictVote('VOTE: NO GO'), 'NO-GO');
  assert.equal(core.parseVerdictVote('I would go for it'), null);
});

test('tallyVerdict: plurality wins, ties break toward caution, no votes means REVISE', () => {
  assert.equal(core.tallyVerdict(['GO', 'GO', 'REVISE']).verdict, 'GO');
  assert.equal(core.tallyVerdict(['GO', 'REVISE']).verdict, 'REVISE');
  assert.equal(core.tallyVerdict(['GO', 'NO-GO', 'REVISE']).verdict, 'NO-GO');
  assert.deepEqual(core.tallyVerdict([undefined, null]), { verdict: 'REVISE', counts: { GO: 0, REVISE: 0, 'NO-GO': 0 } });
});

test('slash commands parse: /votar, /vote, /debate, /debatir and quick prompts', () => {
  assert.deepEqual(core.parseVoteCommand('/votar Pizza o empanadas').options, ['Pizza', 'empanadas']);
  assert.deepEqual(core.parseVoteCommand('/vote tea or coffee vs mate').options, ['tea', 'coffee', 'mate']);
  assert.deepEqual(core.parseVoteCommand('/votar'), { error: true });
  assert.equal(core.parseVoteCommand('votar pizza'), null);
  assert.deepEqual(core.parseDebateCommand('/debate Ship a CLI first'), { idea: 'Ship a CLI first' });
  assert.deepEqual(core.parseDebateCommand('/debatir  '), { error: true });
  assert.equal(core.parseDebateCommand('/debates are fun'), null);
  assert.equal(core.quickSlashCommand('/Chiste por favor'), 'dadjoke');
  assert.equal(core.quickSlashCommand('/unknown'), '');
});

test('parseSSE extracts deltas, skips comments, and stops at [DONE]', () => {
  const buf = ': OPENROUTER PROCESSING\n\n'
    + 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
    + 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
    + 'data: {"choices":[{"delta":{}}]}\n\n'
    + 'data: [DONE]\n\n';
  const r = core.parseSSE(buf);
  assert.deepEqual(r.deltas, ['Hel', 'lo']);
  assert.equal(r.done, true);
  assert.equal(r.error, null);
});

test('parseSSE keeps a partial line for the next chunk', () => {
  const full = 'data: {"choices":[{"delta":{"content":"abc"}}]}\n';
  const first = core.parseSSE(full.slice(0, 20));
  assert.deepEqual(first.deltas, []);
  const second = core.parseSSE(first.rest + full.slice(20));
  assert.deepEqual(second.deltas, ['abc']);
  assert.equal(second.rest, '');
});

test('parseSSE surfaces mid-stream provider errors', () => {
  const r = core.parseSSE('data: {"choices":[{"delta":{"content":"x"}}]}\ndata: {"error":{"message":"Rate limited","code":429}}\n');
  assert.deepEqual(r.deltas, ['x']);
  assert.deepEqual(r.error, { message: 'Rate limited', code: 429 });
});
