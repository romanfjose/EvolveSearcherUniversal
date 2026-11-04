// Deterministic replay harness: HTML string -> mini-DOM -> classify -> plan -> fill, with a full
// event log. Optional framework emulation (data-framework="react" | "vue" on a control) reproduces
// how those frameworks observe DOM edits, so tests prove the fill actually reaches app state.

import { parseHTML } from './mini-dom.mjs';
import { classify } from './classifier.mjs';
import { planFill, fill } from './fill.mjs';
import { walk, attr, describe } from './dom.mjs';

/**
 * React: an own-instance accessor on `value`/`checked` records every JS assignment (the value
 * tracker); onChange fires only when the DOM value differs from the tracked one. Text listens to
 * input/change, checkable inputs to click, selects to change.
 * Vue v-model: reads el.value on `input` (text) or `change` (select/checkbox/radio); no tracker.
 */
export function emulateFramework(el, framework, onState) {
  const type = el.type ?? attr(el, 'type');
  const checkable = type === 'checkbox' || type === 'radio';
  const read = () => (checkable ? el.checked : el.value);
  if (framework === 'vue') {
    const evt = checkable || el.localName === 'select' ? 'change' : 'input';
    el.addEventListener(evt, () => onState(read()));
    return;
  }
  if (el.localName === 'select') { el.addEventListener('change', () => onState(el.value)); return; }
  const prop = checkable ? 'checked' : 'value';
  let proto = Object.getPrototypeOf(el), d;
  while (proto && !(d = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
  let tracked = String(d.get.call(el));
  Object.defineProperty(el, prop, {
    configurable: true,
    get() { return d.get.call(this); },
    set(v) { tracked = String(v); d.set.call(this, v); },
  });
  const onEvent = () => {
    const now = String(d.get.call(el));
    if (now !== tracked) { tracked = now; onState(read()); }
  };
  for (const t of checkable ? ['click'] : ['input', 'change']) el.addEventListener(t, onEvent);
}

/** Replay a fixture. Returns the DOM, classification, plan, fill outcomes, framework state and event log. */
export async function replay(html, { url, profile = null, adapter, waitMs = 0 } = {}) {
  const doc = parseHTML(html);
  const meta = [...walk(doc)].find((el) => el.localName === 'meta' && attr(el, 'name') === 'fixture-url');
  url ??= attr(meta, 'content') ?? '';
  const state = new Map();
  for (const el of walk(doc)) {
    const fw = attr(el, 'data-framework');
    if (fw) emulateFramework(el, fw, (v) => state.set(el, v));
  }
  const result = classify(doc, { url, adapter });
  const plan = planFill(result, profile ?? {});
  doc.eventLog.length = 0;
  const outcomes = profile ? await fill(plan, { waitMs }) : [];
  return { doc, url, result, plan, outcomes, state, events: doc.eventLog };
}

/** Stable, human-readable transcript of a replay (for snapshots, diffs and the playground log). */
export function transcript({ result, outcomes, events }) {
  const lines = [`platform ${result.platform}`];
  for (const f of result.fields) lines.push(`${f.id} ${f.kind} ${f.key ?? `(${f.status})`}${f.part ? `:${f.part}` : ''}${f.index != null ? `#${f.index}` : ''} score=${f.score} "${f.label}"`);
  for (const b of result.buttons) lines.push(`button ${b.status} "${b.text}"`);
  for (const o of outcomes) lines.push(`fill ${o.field.id} ${o.status}${o.value != null ? ` = ${JSON.stringify(o.value)}` : ''}${o.reason ? ` (${o.reason})` : ''}`);
  for (const e of events) lines.push(`event ${e.type} ${describe(e.target)}`);
  return lines.join('\n');
}
