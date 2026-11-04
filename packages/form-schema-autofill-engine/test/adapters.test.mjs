// Fixture-driven replay suite. Each test/fixtures/*.html file is self-describing:
//   <html data-expect-platform="lever">           detected adapter
//   <meta name="fixture-url" content="...">        URL passed to detection
//   data-expect="key[:part][#index]"               on a control (first radio/checkbox of a group, or the yes/no container)
//   data-expect="-" | "?" | "hidden"               unmapped | ambiguous | not collected at all
//   data-expect="redline" | "advance" | "neutral"  on a button
//   data-expect-value / -checked / -clicked / -state   post-fill DOM value, checkedness, click received, framework state
// Every collected field and every non-neutral button must be annotated, so fixtures are complete oracles.
// Invariant on every fixture: the fill never submits a form and never touches a red-line or advance button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { replay, transcript, emulateFramework } from '../src/replay.mjs';
import { parseHTML } from '../src/mini-dom.mjs';
import { walk, attr, describe } from '../src/dom.mjs';
import { commitText, clickSafe, RedLineError, buildPreview } from '../src/index.mjs';

const dir = new URL('./fixtures/', import.meta.url);
const profile = JSON.parse(readFileSync(new URL('profile.json', dir), 'utf8'));
const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();

test('fixture corpus has 50+ realistic layouts', () => assert.ok(files.length >= 50, `${files.length} fixtures`));

for (const file of files) {
  test(file, async () => {
    const html = readFileSync(new URL(file, dir), 'utf8');
    const r = await replay(html, { profile });
    const { doc, result, outcomes, state, events } = r;
    const log = `\n--- ${file}\n${transcript({ ...r, events: [] })}`;
    const els = [...walk(doc)];

    const platform = attr(doc.documentElement, 'data-expect-platform');
    if (platform) assert.equal(result.platform, platform, `platform${log}`);

    const fieldOf = (el) => result.fields.find((f) => f.el === el || f.members.includes(el));
    const buttonOf = (el) => result.buttons.find((b) => b.el === el);
    const annotated = new Set();

    for (const el of els) {
      const exp = attr(el, 'data-expect');
      if (exp == null) continue;
      const where = `${describe(el)} expected ${exp}`;
      if (/^(redline|advance|neutral)$/.test(exp)) {
        const b = buttonOf(el);
        assert.ok(b, `${where}: button not classified${log}`);
        assert.equal(b.status, exp, `${where}${log}`);
        annotated.add(b);
        continue;
      }
      const f = fieldOf(el);
      if (exp === 'hidden') { assert.ok(!f && !buttonOf(el), `${where}: should not be collected${log}`); continue; }
      assert.ok(f, `${where}: control not collected${log}`);
      annotated.add(f);
      if (exp === '-') { assert.equal(f.status, 'unmapped', `${where}: got ${f.key ?? f.status} (${JSON.stringify(f.candidates)})${log}`); continue; }
      if (exp === '?') { assert.equal(f.status, 'ambiguous', `${where}: got ${f.key ?? f.status}${log}`); continue; }
      const [, key, part, index] = /^([\w.]+)(?::(\w+))?(?:#(\d+))?$/.exec(exp);
      assert.equal(f.key, key, `${where}: got ${f.key ?? f.status} ${JSON.stringify(f.candidates)}${log}`);
      if (part) assert.equal(f.part, part, `${where}: part${log}`);
      if (index) assert.equal(f.index, +index, `${where}: index${log}`);
    }
    for (const f of result.fields) assert.ok(annotated.has(f), `unannotated field ${describe(f.el)} -> ${f.key ?? f.status}${log}`);
    for (const b of result.buttons) if (b.status !== 'neutral') assert.ok(annotated.has(b), `unannotated ${b.status} button "${b.text}"${log}`);

    for (const el of els) {
      const v = attr(el, 'data-expect-value');
      if (v != null) assert.equal('value' in el ? el.value : el.textContent, v, `${describe(el)} value${log}`);
      const c = attr(el, 'data-expect-checked');
      if (c != null) assert.equal(String(el.checked), c, `${describe(el)} checked${log}`);
      if (el.hasAttribute('data-expect-clicked')) assert.ok(events.some((e) => e.type === 'click' && e.target === el), `${describe(el)} not clicked${log}`);
      const s = attr(el, 'data-expect-state');
      if (s != null) assert.equal(String(state.get(el)), s, `${describe(el)} framework state${log}`);
    }

    const guarded = new Set(result.buttons.filter((b) => b.status !== 'neutral').map((b) => b.el));
    for (const e of events) {
      assert.notEqual(e.type, 'submit', `form submitted by ${describe(e.target)}${log}`);
      assert.ok(!guarded.has(e.target), `${e.type} reached guarded button ${describe(e.target)}${log}`);
    }
    assert.ok(!outcomes.some((o) => o.status === 'error'), `fill error: ${outcomes.filter((o) => o.status === 'error').map((o) => o.reason)}${log}`);

    const preview = buildPreview(result);
    assert.equal(preview.items.length, result.fields.length + guarded.size);

    const again = await replay(html, { profile });
    assert.equal(transcript(again), transcript(r), 'replay must be deterministic');
  });
}

test('React value tracker: plain assignment is swallowed, native setter + input commits', () => {
  const doc = parseHTML('<input id="a"><input id="b">');
  const [a, b] = [doc.getElementById('a'), doc.getElementById('b')];
  const state = {};
  emulateFramework(a, 'react', (v) => { state.a = v; });
  emulateFramework(b, 'react', (v) => { state.b = v; });
  a.value = 'naive';
  a.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
  assert.equal(state.a, undefined, 'naive assignment must not reach React state (proves the emulation is faithful)');
  commitText(b, 'Ada');
  assert.equal(state.b, 'Ada');
  assert.deepEqual(doc.eventLog.filter((e) => e.target === b).map((e) => e.type), ['focus', 'focusin', 'input', 'change', 'blur', 'focusout']);
});

test('clickSafe refuses submit-like elements, including type-less buttons inside forms', () => {
  const doc = parseHTML('<form><button id="a">Go</button><input id="b" type="submit"><button id="c" type="button">Add</button></form>');
  assert.throws(() => clickSafe(doc.getElementById('a')), RedLineError);
  assert.throws(() => clickSafe(doc.getElementById('b')), RedLineError);
  clickSafe(doc.getElementById('c'));
  assert.ok(!doc.eventLog.some((e) => e.type === 'submit'));
});
