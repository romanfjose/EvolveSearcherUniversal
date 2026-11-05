import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { I18N } = require('../i18n.js');
const core = require('../squad-core.js');
const engine = require('../offline-engine.js');
const { PERSONAS, WAR_ROOM_PERSONAS, SQUAD_TEMPLATES } = require('../personas.js');
const html = read('index.html');
const app = read('app.js');

test('EN and ES dictionaries have exactly the same keys', () => {
  const en = Object.keys(I18N.en).sort();
  const es = Object.keys(I18N.es).sort();
  assert.deepEqual(es.filter(k => !en.includes(k)), [], 'only in es');
  assert.deepEqual(en.filter(k => !es.includes(k)), [], 'only in en');
});

test('no translation is empty or left untranslated by accident', () => {
  for (const L of ['en', 'es']) {
    for (const [k, v] of Object.entries(I18N[L])) assert.ok(typeof v === 'string' && v.trim(), `${L}.${k}`);
  }
  // Long strings identical in both languages are almost always a missed translation.
  const same = Object.keys(I18N.en).filter(k => I18N.en[k] === I18N.es[k] && I18N.en[k].length > 24);
  assert.deepEqual(same, []);
});

test('every data-i18n* attribute in index.html has a key', () => {
  const keys = [...html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 40);
  for (const k of keys) assert.ok(k in I18N.en, k);
});

test('every t("key") call in app.js has a key', () => {
  const keys = [...app.matchAll(/\bt\("([A-Za-z]+)"\)/g)].map(m => m[1]);
  assert.ok(keys.length > 40);
  for (const k of keys) assert.ok(k in I18N.en, k);
});

test('no dead keys: every dictionary key is referenced by app.js or index.html', () => {
  const src = app + html;
  const dead = Object.keys(I18N.en).filter(k => !new RegExp(`["'\`]${k}["'\`]`).test(src));
  assert.deepEqual(dead, []);
});

test('the /help text documents the same commands in both languages', () => {
  const lines = L => I18N[L].helpText.split('\n');
  assert.equal(lines('en').length, lines('es').length);
  for (const cmd of ['@', '+@', '/votar', '📤']) {
    assert.ok(I18N.en.helpText.includes(cmd) && I18N.es.helpText.includes(cmd), cmd);
  }
});

// Walk any data table: every {en, es} pair must have both sides, with matching shape.
function walkPairs(node, where, visit) {
  if (!node || typeof node !== 'object' || node instanceof RegExp) return;
  if ('en' in node || 'es' in node) return visit(node, where);
  for (const [k, v] of Object.entries(node)) walkPairs(v, `${where}.${k}`, visit);
}
function assertPair(pair, where) {
  assert.ok('en' in pair && 'es' in pair, `${where} needs en+es`);
  assert.equal(Array.isArray(pair.en), Array.isArray(pair.es), `${where} shape`);
  if (Array.isArray(pair.en)) assert.equal(pair.en.length, pair.es.length, `${where} length`);
  for (const v of [pair.en, pair.es].flat()) assert.ok(typeof v === 'string' && v.trim(), `${where} empty`);
  const vars = s => [s].flat().join(' ').match(/\{\w+\}/g)?.sort().join() || '';
  assert.equal(vars(pair.en), vars(pair.es), `${where} placeholders differ`);
}

test('offline engine tables are complete in EN and ES (same shape and placeholders)', () => {
  let pairs = 0;
  walkPairs({ VOICES: engine.VOICES, LENSES: engine.LENSES }, 'engine', (p, w) => { assertPair(p, w); pairs++; });
  assert.ok(pairs > 150, `walked ${pairs} pairs`);
});

test('core protocol labels are complete in EN and ES', () => {
  walkPairs({ rounds: core.DELIBERATION_ROUNDS, memo: core.MEMO_SECTIONS, heading: core.MEMO_HEADING }, 'core', assertPair);
  assert.deepEqual(Object.keys(core.VERDICT_LABELS.en), Object.keys(core.VERDICT_LABELS.es));
});

test('squad presets with bilingual moods have both languages', () => {
  for (const t of SQUAD_TEMPLATES) if (typeof t.mood === 'object') assertPair(t.mood, t.id);
});

test('every built-in character has an offline voice in both languages', () => {
  const builtIns = [...PERSONAS, ...WAR_ROOM_PERSONAS].map(p => p.name).concat(['Glim', 'Gema', 'Rok']);
  for (const name of builtIns) assert.ok(engine.VOICES[name], `missing voice: ${name}`);
});

test('every squad preset references characters that exist', () => {
  const known = new Set([...PERSONAS, ...WAR_ROOM_PERSONAS].map(p => p.name));
  for (const t of SQUAD_TEMPLATES) for (const m of t.members) assert.ok(known.has(m), `${t.id}: ${m}`);
});
