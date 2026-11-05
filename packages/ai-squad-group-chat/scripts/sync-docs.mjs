// Regenerates the docs/ artifacts. test/docs.test.mjs fails if either drifts from its source.
//  - docs/index.html: the canonical index.html with every local asset pointed one level up,
//    so the GitHub Pages copy always runs the exact same app code.
//  - docs/war-room.squad.json: a shareable War Room template whose transcript is a full offline
//    deliberation; import it from 📤 and it replays.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');
const engine = require('../offline-engine.js');
const { WAR_ROOM_PERSONAS, SQUAD_TEMPLATES } = require('../personas.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTE = '<!-- Generated from ../index.html by scripts/sync-docs.mjs. Edit the canonical file, then run `npm run docs`. -->';

export function mirror(html) {
  return html
    .replace('<head>', `<head>\n${NOTE}`)
    .replace(/\b(src|href)="(?!https?:|#|data:|mailto:|\.\.\/)([^"]+)"/g, '$1="../$2"');
}

export const SAMPLE_IDEA = 'Rewrite our legacy PHP monolith as microservices on Kubernetes in 3 months, and add an AI support chatbot for our 50k users.';

export function sampleTemplate() {
  const preset = SQUAD_TEMPLATES.find(t => t.id === 'war-room');
  let n = 0, ts = Date.UTC(2026, 0, 1, 12, 0);
  const ais = preset.members.map(name => ({ ...WAR_ROOM_PERSONAS.find(p => p.name === name), id: `m${n++}` }));
  const group = { name: preset.name, emoji: preset.emoji, mode: preset.mode, ctx: 40, ais, messages: [] };
  const say = (sender, text, extra) => group.messages.push({ id: `x${n++}`, sender, text, ts: (ts += 60000), ...extra });
  say('user', SAMPLE_IDEA);
  let round = 0;
  for (const step of core.deliberationSchedule(ais)) {
    if (step.round !== round) {
      round = step.round;
      say('system', `Round ${round}/3 · ${core.DELIBERATION_ROUNDS[round - 1].label.en}`, { kind: 'round' });
    }
    const turn = engine.deliberationTurn({
      ai: step.speaker, index: ais.indexOf(step.speaker), phase: step.phase,
      target: step.target, targetIndex: step.target ? ais.indexOf(step.target) : 0, idea: SAMPLE_IDEA, lang: 'en'
    });
    say(step.speaker.id, turn.text);
  }
  const votes = ais.map(ai => core.parseVerdictVote([...group.messages].reverse().find(m => m.sender === ai.id).text));
  const memo = engine.synthesizeMemo({ idea: SAMPLE_IDEA, members: ais, votes, lang: 'en' });
  say('system', core.memoToMarkdown(memo, 'en'), { kind: 'memo', memo });
  return core.exportSquadTemplate(group, { includeTranscript: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'docs/index.html'), mirror(html));
  fs.writeFileSync(path.join(ROOT, 'docs/war-room.squad.json'), JSON.stringify(sampleTemplate(), null, 2) + '\n');
  console.log('docs/index.html and docs/war-room.squad.json synced');
}
