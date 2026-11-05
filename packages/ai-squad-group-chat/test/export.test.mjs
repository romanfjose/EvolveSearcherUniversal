import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');

const T0 = Date.UTC(2026, 10, 5, 14, 30);
const fixture = () => ({
  id: 'g1', name: 'War Room', emoji: '🎯', mode: 'deliberation', ctx: 40, lenBias: 2, temperature: 0.7,
  mentionUsage: { a: 3 }, dailyStatuses: { date: '2026-11-05' },
  ais: [
    { id: 'a', name: 'Architect', emoji: '🏛️', prompt: 'You are The Architect. Boxes and arrows.', model: 'z-ai/glm-5.2:free', key: 'sk-or-v1-secret', role: 'architect' },
    { id: 'b', name: 'Cold-Eye Skeptic', emoji: '🧊', prompt: 'You are the Skeptic.', key: 'sk-or-v1-secret', muted: true }
  ],
  messages: [
    { id: 'm1', sender: 'system', text: '🎯 War Room: red-team.', ts: T0 },
    { id: 'm2', sender: 'system', text: 'hidden seed', hidden: true, ts: T0 },
    { id: 'm3', sender: 'user', text: 'Ship a CLI first?', ts: T0 + 60000 },
    { id: 'm4', sender: 'system', text: 'Round 1/3 · Opening positions', kind: 'round', ts: T0 + 61000 },
    { id: 'm5', sender: 'a', text: 'Monolith first.', ts: T0 + 120000, reactions: [{ sender: 'b', emoji: '🔥' }] },
    { id: 'm6', sender: 'user', text: 'Why?', ts: T0 + 180000, replyTo: [{ sender: 'a', text: 'Monolith first.' }] },
    { id: 'm7', sender: 'persona:datos', senderName: 'Datos', senderEmoji: '📊', text: 'Source?', ts: T0 + 190000 },
    { id: 'm8', sender: 'a', text: 'half-streamed', streaming: true, ts: T0 + 200000 }
  ]
});
const md = (g, opts) => core.transcriptToMarkdown(g, { now: T0, lang: 'en', ...opts });

test('transcript: title, export line and member roster', () => {
  const out = md(fixture());
  assert.match(out, /^# 🎯 War Room\n\n> Exported 2026-11-05 14:30 UTC · 4 messages · mode: deliberation\n/);
  assert.match(out, /- 🏛️ \*\*Architect\*\* — You are The Architect\./);
  assert.match(out, /- 🧊 \*\*Cold-Eye Skeptic\*\* _\(muted\)_/);
});

test('transcript: hidden seeds and in-flight streaming bubbles are never exported', () => {
  const out = md(fixture());
  assert.ok(!out.includes('hidden seed'));
  assert.ok(!out.includes('half-streamed'));
});

test('transcript: speakers, timestamps, reply quotes and reactions', () => {
  const out = md(fixture(), { userName: 'Ana' });
  assert.ok(out.includes('**Ana** · 2026-11-05 14:31 UTC\nShip a CLI first?'));
  assert.ok(out.includes('**🏛️ Architect** · 2026-11-05 14:32 UTC\nMonolith first.\n<sub>Reactions: 🔥 Cold-Eye Skeptic</sub>'));
  assert.ok(out.includes('> ↩ replying to 🏛️ Architect: Monolith first.\nWhy?'));
  assert.ok(out.includes('**📊 Datos**'), 'guest personas keep their stored name');
});

test('transcript: system notes are italic, round markers become section breaks', () => {
  const out = md(fixture());
  assert.ok(out.includes('_🎯 War Room: red-team._'));
  assert.ok(out.includes('---\n\n#### Round 1/3 · Opening positions'));
});

test('transcript: decision memos are embedded as Markdown', () => {
  const g = fixture();
  const memo = {
    idea: 'Ship a CLI first?', verdict: 'REVISE', counts: { GO: 1, REVISE: 2, 'NO-GO': 0 },
    sections: core.MEMO_SECTIONS.map(s => ({ key: s.key, title: s.title.en, items: [`${s.key} item`] }))
  };
  g.messages.push({ id: 'm9', sender: 'system', kind: 'memo', memo, text: 'ignored', ts: T0 + 300000 });
  const out = md(g);
  assert.ok(out.includes('### 🧭 Decision Memo — Ship a CLI first?'));
  assert.ok(out.includes('**Go with conditions** (REVISE; GO 1 · REVISE 2 · NO-GO 0)'));
  assert.ok(out.includes('**4. Next steps**\n- next item'));
});

test('transcript: Spanish labels and custom time formatting', () => {
  const out = md(fixture(), { lang: 'es', formatTime: () => 'HH:MM' });
  assert.ok(out.includes('## Integrantes') && out.includes('## Transcripción'));
  assert.ok(out.includes('**Vos** · HH:MM'));
});

test('transcript: deterministic and tidy (single trailing newline, no blank-line runs)', () => {
  const a = md(fixture()), b = md(fixture());
  assert.equal(a, b);
  assert.ok(a.endsWith('\n') && !a.endsWith('\n\n'));
  assert.ok(!/\n{3,}/.test(a));
  assert.ok(md({ ...fixture(), messages: [] }).includes('_No messages._'));
});

test('squad template never leaks keys, ids, usage stats or cached statuses', () => {
  const json = JSON.stringify(core.exportSquadTemplate(fixture(), { includeTranscript: true }));
  for (const leak of ['sk-or', '"id"', 'mentionUsage', 'dailyStatuses', '"key"', 'hidden seed', 'half-streamed']) {
    assert.ok(!json.includes(leak), leak);
  }
});

test('squad template keeps what a recipient needs', () => {
  const t = core.exportSquadTemplate(fixture());
  assert.equal(t.format, core.TEMPLATE_FORMAT);
  assert.equal(t.version, 1);
  assert.deepEqual([t.mode, t.ctx, t.lenBias, t.temperature], ['deliberation', 40, 2, 0.7]);
  assert.deepEqual(t.members[0], { name: 'Architect', emoji: '🏛️', prompt: 'You are The Architect. Boxes and arrows.', role: 'architect', model: 'z-ai/glm-5.2:free' });
  assert.equal(t.members[1].muted, true);
  assert.equal(t.transcript, undefined, 'transcript is opt-in');
});

test('transcript entries reference members by index; library guests are kept by name', () => {
  const t = core.exportSquadTemplate(fixture(), { includeTranscript: true });
  assert.deepEqual(t.transcript.map(m => m.from), ['system', 'user', 'system', 0, 'user', 'guest']);
  assert.deepEqual(t.transcript.at(-1), { from: 'guest', text: 'Source?', ts: T0 + 190000, name: 'Datos', emoji: '📊' });
});

test('export → parse → templateToGroup → export is lossless', () => {
  let n = 0;
  const t1 = core.exportSquadTemplate(fixture(), { includeTranscript: true });
  const parsed = core.parseSquadTemplate(JSON.stringify(t1));
  assert.equal(parsed.ok, true, parsed.errors?.join());
  const g = core.templateToGroup(parsed.template, () => 'n' + n++, () => ({ provider: 'openrouter' }));
  assert.equal(g.ais[0].provider, 'openrouter');
  assert.equal(g.messages[3].sender, g.ais[0].id, 'speaker remapped to the new member id');
  assert.deepEqual(core.exportSquadTemplate(g, { includeTranscript: true }), t1);
});

test('parseSquadTemplate rejects malformed input with useful errors', () => {
  assert.deepEqual(core.parseSquadTemplate('{nope').ok, false);
  assert.match(core.parseSquadTemplate('[]').errors[0], /JSON object/);
  const bad = core.parseSquadTemplate({ format: 'x', version: 2, members: [{ name: '', prompt: '' }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /format/.test(e)));
  assert.ok(bad.errors.some(e => /version/.test(e)));
  assert.ok(bad.errors.some(e => /members\[0\]\.name/.test(e)));
  assert.ok(bad.errors.some(e => /members\[0\]\.prompt/.test(e)));
});

test('parseSquadTemplate sanitizes: clamps numbers, drops odd models, rejects dangling speakers', () => {
  const base = { format: core.TEMPLATE_FORMAT, version: 1, members: [{ name: 'A', prompt: 'p', model: 'javascript:alert(1)' }] };
  const r = core.parseSquadTemplate({ ...base, mode: 'evil', ctx: 9999, temperature: -3, lenBias: 99 });
  assert.equal(r.ok, true);
  assert.deepEqual([r.template.mode, r.template.ctx, r.template.temperature, r.template.lenBias], ['normal', 200, 0.2, 5]);
  assert.equal(r.template.members[0].model, undefined);
  const dangling = core.parseSquadTemplate({ ...base, transcript: [{ from: 3, text: 'who?' }] });
  assert.equal(dangling.ok, false);
  assert.match(dangling.errors[0], /transcript\[0\]\.from/);
});

test('parseSquadTemplate caps squad size', () => {
  const members = Array.from({ length: 65 }, (_, i) => ({ name: 'M' + i, prompt: 'p' }));
  const r = core.parseSquadTemplate({ format: core.TEMPLATE_FORMAT, version: 1, members });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /at most 64/.test(e)));
});
