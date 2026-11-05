import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');
const engine = require('../offline-engine.js');
const { WAR_ROOM_PERSONAS } = require('../personas.js');

const panel = WAR_ROOM_PERSONAS.map((p, i) => ({ ...p, id: 'w' + i }));
const squad = (text, extra = {}) => ({
  name: 'Los Pibes', lenBias: 0, ...extra,
  ais: ['Fede', 'Turbo', 'Memo', 'Tano'].map((name, i) => ({ id: 'p' + i, name, prompt: '' })),
  messages: [{ sender: 'user', text }]
});
const IDEAS = {
  overbuilt: 'A mobile app where an LLM agent plans meals, real-time sync, microservices on Kubernetes',
  lean: 'Sell a $9/month subscription CSV export add-on to our 1,200 existing customers',
  crypto: 'An NFT marketplace for freelancers with on-chain reviews'
};

test('casual replies are deterministic: same transcript, same words', () => {
  const a = engine.reply({ ai: squad('').ais[0], group: squad('What should we do this Friday?'), lang: 'en' });
  const b = engine.reply({ ai: squad('').ais[0], group: squad('What should we do this Friday?'), lang: 'en' });
  assert.equal(a, b);
});

test('a round never repeats a line another member just used', () => {
  for (const text of ['What should we do this Friday?', 'I just saw a UFO', 'Tell me a joke', 'hmm']) {
    const g = squad(text);
    const lines = [];
    for (const ai of g.ais.slice(0, 3)) {
      const r = engine.reply({ ai, group: g, lang: 'en' });
      g.messages.push({ sender: ai.id, text: r });
      lines.push(r.replace(engine.voiceFor(ai, 'en'), '').replace(/^.*?(has a point\.|is wrong\.|Building on \S+:)\s*/, ''));
    }
    assert.equal(new Set(lines).size, lines.length, `${text}: ${lines.join(' | ')}`);
  }
});

test('replies speak the UI language and carry the persona voice', () => {
  const g = squad('Chicos, que hacemos este viernes?');
  const es = engine.reply({ ai: g.ais[1], group: g, lang: 'es' });
  const en = engine.reply({ ai: g.ais[1], group: g, lang: 'en' });
  assert.ok(es.includes(engine.VOICES.Turbo.es));
  assert.ok(en.includes(engine.VOICES.Turbo.en));
});

test('topic detection drives the reply (weird sightings quote the keyword)', () => {
  assert.equal(engine.classify('Acabo de ver un OVNI'), 'weird');
  assert.equal(engine.classify('Should I quit or not'), 'decision');
  assert.equal(engine.classify('Me siento muy cansado'), 'feelings');
  assert.equal(engine.classify('ok'), 'default');
  const r = engine.reply({ ai: squad('').ais[0], group: squad('Acabo de ver un OVNI. Opiniones?'), lang: 'es' });
  assert.ok(r.includes('OVNI'), r);
});

test('the hidden welcome seed produces an in-character welcome using the user name', () => {
  const g = squad('');
  g.messages = [{ sender: 'system', hidden: true, text: 'The user just joined the group. Give a brief, natural, in-character welcome.' }];
  assert.ok(engine.reply({ ai: g.ais[0], group: g, lang: 'en', userName: 'Ana' }).includes('Ana'));
});

test('message-length setting shapes offline replies', () => {
  const short = engine.reply({ ai: squad('').ais[1], group: squad('Any plans this weekend?', { lenBias: -5 }), lang: 'en' });
  const long = engine.reply({ ai: squad('').ais[1], group: squad('Any plans this weekend?', { lenBias: 5 }), lang: 'en' });
  assert.ok(!short.includes(engine.VOICES.Turbo.en));
  assert.ok(long.length > short.length && /\?$/.test(long));
});

test('custom characters without a voice get one derived from their prompt', () => {
  const ai = { id: 'c', name: 'Pixel', prompt: 'You are Pixel, the retro game collector. You love CRTs.' };
  assert.equal(engine.voiceFor(ai, 'en'), "Speaking as the retro game collector: that's my take.");
  assert.match(engine.voiceFor(ai, 'es'), /Pixel/);
});

test('idea analysis finds signals and parses user counts', () => {
  const a = engine.analyzeIdea('Rewrite the legacy monolith as microservices with an AI chatbot for 50k users');
  for (const s of ['rewrite', 'scale', 'ai']) assert.ok(a.signals.has(s), s);
  assert.equal(a.userCount, 50000);
  assert.equal(engine.analyzeIdea('una app para 2 millones de usuarios').userCount, 2000000);
  assert.equal(engine.analyzeIdea('a todo list').hasNumbers, false);
});

test('cost estimates are arithmetic on the idea\'s own numbers, not canned', () => {
  assert.deepEqual(engine.llmSpend(1000), { calls: 300000, low: 600, high: 6000 });
  const claim = engine.assess('cost', 'An AI chatbot for our 50k users').rules.find(r => r.id === 'ai').claim;
  assert.ok(claim.en.includes('50,000 daily users x 10 calls is $30,000-300,000 per month'), claim.en);
  assert.ok(claim.es.includes('50.000 usuarios diarios'), claim.es);
});

test('lens routing: explicit role, inferred from persona, else rotation over all four', () => {
  assert.deepEqual(panel.map((p, i) => engine.lensFor(p, i)), ['architect', 'skeptic', 'ux', 'cost']);
  assert.equal(engine.lensFor({ name: 'Datos', prompt: 'You are Datos, the analyst.' }, 0), 'cost');
  assert.deepEqual([0, 1, 2, 3, 4].map(i => engine.lensFor({ name: 'X' + i, prompt: '' }, i)), ['architect', 'skeptic', 'ux', 'cost', 'architect']);
});

test('assessments scale with risk: a lean, priced, evidenced idea passes; an over-built one does not', () => {
  const lean = engine.synthesizeMemo({ idea: IDEAS.lean, members: panel, lang: 'en' });
  const over = engine.synthesizeMemo({ idea: IDEAS.overbuilt, members: panel, lang: 'en' });
  assert.equal(lean.verdict, 'GO');
  assert.notEqual(over.verdict, 'GO');
  assert.ok(engine.assess('cost', IDEAS.overbuilt).rules.some(r => r.id === '!monetization'), 'no price → cost flag');
  assert.ok(engine.assess('skeptic', IDEAS.crypto).rules.some(r => r.id === 'marketplace'));
});

test('every round-3 turn states a vote that parses back to the lens assessment', () => {
  for (const idea of Object.values(IDEAS)) {
    for (const lang of ['en', 'es']) {
      panel.forEach((ai, index) => {
        const turn = engine.deliberationTurn({ ai, index, phase: 'converge', idea, lang });
        assert.equal(core.parseVerdictVote(turn.text), turn.vote, `${ai.name}/${lang}: ${turn.text}`);
        assert.equal(turn.vote, engine.assess(turn.lens, idea).vote);
      });
    }
  }
});

test('cross-examination turns address their target and cite the target\'s own top risk', () => {
  const [architect, skeptic] = panel;
  const turn = engine.deliberationTurn({ ai: architect, index: 0, phase: 'cross', target: skeptic, targetIndex: 1, idea: IDEAS.overbuilt, lang: 'en' });
  const skepticTop = engine.assess('skeptic', IDEAS.overbuilt).rules[0].label.en;
  assert.ok(turn.text.startsWith(`@${skeptic.name}, you flagged ${skepticTop}.`), turn.text);
});

test('a full offline deliberation is reproducible end to end', () => {
  const run = () => core.deliberationSchedule(panel).map(s => engine.deliberationTurn({
    ai: s.speaker, index: panel.indexOf(s.speaker), phase: s.phase, target: s.target,
    targetIndex: s.target ? panel.indexOf(s.target) : 0, idea: IDEAS.overbuilt, lang: 'es'
  }).text);
  const a = run();
  assert.equal(a.length, 12);
  assert.deepEqual(a, run());
});

test('the decision memo has the 4 canonical parts and a verdict that matches the tally', () => {
  const memo = engine.synthesizeMemo({ idea: IDEAS.overbuilt, members: panel, lang: 'en' });
  assert.deepEqual(memo.sections.map(s => s.key), ['decision', 'rationale', 'risks', 'next']);
  assert.deepEqual(memo.sections.map(s => s.title), ['Decision', 'Rationale', 'Risks & mitigations', 'Next steps']);
  assert.equal(memo.sections[1].items.length, panel.length, 'one rationale line per panelist');
  assert.ok(memo.sections[2].items.length >= 1 && memo.sections[2].items.length <= 3);
  assert.match(memo.sections[3].items.at(-1), /Re-run the War Room/);
  const votes = panel.map((ai, i) => engine.assess(engine.lensFor(ai, i), IDEAS.overbuilt).vote);
  assert.deepEqual(memo.verdict, core.tallyVerdict(votes).verdict);
});

test('live votes override the offline assessment in the memo', () => {
  const memo = engine.synthesizeMemo({ idea: IDEAS.overbuilt, members: panel, votes: ['GO', 'GO', 'GO', undefined], lang: 'en' });
  assert.equal(memo.counts.GO, 3);
  assert.equal(memo.verdict, 'GO');
});

test('memo Markdown round-trips through the live-memo parser', () => {
  const memo = engine.synthesizeMemo({ idea: IDEAS.lean, members: panel, lang: 'es' });
  const parsed = core.parseMemoSections(core.memoToMarkdown(memo, 'es'));
  assert.deepEqual(parsed.map(s => s.items), memo.sections.map(s => s.items));
});

test('parseMemoSections accepts common LLM heading styles and rejects incomplete memos', () => {
  const styles = [
    '## 1. Decision\nGo.\n## 2. Rationale\n- a\n## 3. Risks & mitigations\n- b\n## 4. Next steps\n- c',
    '**1. Decision:** Go now.\n**2. Rationale:** cheap\n**3. Risks:** none\n**4. Next steps:** ship'
  ];
  for (const s of styles) {
    const parsed = core.parseMemoSections(s);
    assert.ok(parsed, s);
    assert.deepEqual(parsed.map(x => x.key), ['decision', 'rationale', 'risks', 'next']);
  }
  assert.equal(core.parseMemoSections('1. Decision\nGo\n2. Rationale\nx\n4. Next steps\ny'), null);
  assert.equal(core.parseMemoSections('Sounds good to me!'), null);
});
