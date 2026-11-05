import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');
const { PERSONAS, WAR_ROOM_PERSONAS } = require('../personas.js');

const ai = (name, extra) => ({ id: 'id:' + name, name, emoji: '🤖', prompt: '', ...extra });
const catalogOf = (group, library = []) => [
  ...group.map(a => ({ name: a.name, source: 'group', ai: a })),
  ...library.map(a => ({ name: a.name, source: 'library', ai: a }))
];
const names = ais => ais.map(a => a.name);

const bruno = ai('Bruno'), marta = ai('Tía Marta'), paz = ai('Paz'), licPaz = ai('Lic. Paz'), skeptic = ai('Cold-Eye Skeptic');
const catalog = catalogOf([bruno, marta, paz, skeptic], [licPaz]);

test('@name routes to that member', () => {
  assert.deepEqual(names(core.findMentions(catalog, 'hey @Bruno what do you think', false)), ['Bruno']);
});

test('mentions are accent- and case-insensitive', () => {
  assert.deepEqual(names(core.findMentions(catalog, '@tia marta are you there?', false)), ['Tía Marta']);
});

test('the longest overlapping name wins: "@Lic. Paz" does not also summon "Paz"', () => {
  assert.deepEqual(names(core.findMentions(catalog, 'ask @Lic. Paz about it', false)), ['Lic. Paz']);
  assert.deepEqual(names(core.findMentions(catalog, 'ask @Paz about it', false)), ['Paz']);
});

test('multi-word and hyphenated names match whole', () => {
  assert.deepEqual(names(core.findMentions(catalog, '@Cold-Eye Skeptic, poke holes', false)), ['Cold-Eye Skeptic']);
});

test('a mention must start a token: emails do not route', () => {
  assert.deepEqual(core.findMentions(catalog, 'mail me at someone@Bruno.dev', false), []);
});

test('a mention must end at a boundary: "@Brunox" is not "@Bruno"', () => {
  assert.deepEqual(core.findMentions(catalog, '@Brunox hi', false), []);
  assert.deepEqual(names(core.findMentions(catalog, 'hi @Bruno!', false)), ['Bruno']);
});

test('muted group members are not routed', () => {
  const muted = ai('Gus', { muted: true });
  assert.deepEqual(core.findMentions(catalogOf([muted]), '@Gus wake up', false), []);
});

test('+@ is additive-only, @ is direct-only', () => {
  assert.deepEqual(names(core.findMentions(catalog, 'and +@Lic. Paz too', true)), ['Lic. Paz']);
  assert.deepEqual(core.findMentions(catalog, 'and +@Lic. Paz too', false), []);
  assert.deepEqual(core.findMentions(catalog, 'and @Lic. Paz too', true), []);
});

test('multiple mentions come back in written order, deduplicated', () => {
  assert.deepEqual(names(core.findMentions(catalog, '@Paz then @Bruno then @Paz again', false)), ['Paz', 'Bruno']);
});

test('every library persona is reachable by its own @name', () => {
  const lib = [...PERSONAS, ...WAR_ROOM_PERSONAS].map(p => ai(p.name));
  const cat = catalogOf([], lib);
  for (const p of lib) {
    assert.deepEqual(names(core.findMentions(cat, `yo @${p.name} what's up`, false)), [p.name], p.name);
  }
});

test('mentionQueryAt finds the token under the caret', () => {
  const v = 'hola @Bru';
  assert.deepEqual(core.mentionQueryAt(v, v.length), { start: 5, query: 'Bru', additive: false });
});

test('mentionQueryAt reports additive tokens from the "+"', () => {
  const v = 'hi +@So';
  assert.deepEqual(core.mentionQueryAt(v, v.length), { start: 3, query: 'So', additive: true });
});

test('mentionQueryAt ignores emails and closed tokens', () => {
  assert.equal(core.mentionQueryAt('a@b', 3), null);
  assert.equal(core.mentionQueryAt('@Bruno, hi', 10), null);
});

test('commandQueryAt only fires while typing a leading /command', () => {
  assert.deepEqual(core.commandQueryAt('/vo', 3), { start: 0, query: 'vo' });
  assert.equal(core.commandQueryAt('/votar pizza', 12), null);
  assert.equal(core.commandQueryAt('hi /vo', 6), null);
});

test('mention options rank by usage, then prefix match, then name', () => {
  const cat = catalogOf([ai('Sofi'), ai('Rosa'), ai('Osvaldo')]);
  const opts = core.sortMentionOptions(cat, { query: 'os', usage: {} });
  assert.deepEqual(opts.map(o => o.name), ['Osvaldo', 'Rosa']);
  const used = core.sortMentionOptions(cat, { query: 'os', usage: { 'id:Rosa': 3 } });
  assert.deepEqual(used.map(o => o.name), ['Rosa', 'Osvaldo']);
});

test('additive option lists exclude members already in the group', () => {
  const opts = core.sortMentionOptions(catalog, { query: '', additive: true });
  assert.deepEqual(opts.map(o => o.name), ['Lic. Paz']);
});
