// Value commitment for framework-controlled inputs, plus the dry-run fill planner.
//
// React keeps a per-node "value tracker" as an *instance* property; assigning `el.value = x` updates
// the tracker too, so React sees no change and drops the next input event. Calling the *prototype*
// setter (the `nativeInputValueSetter` trick) moves the DOM value without touching the tracker, and
// the following bubbling `input` event makes React (and Vue v-model, Angular, Svelte) commit it.
// Sequence per text control: focus -> native set -> input -> change -> blur.
//
// Safety: the engine never submits. Every click goes through clickSafe(), which refuses submit-like
// elements and any button the classifier flagged red-line or advance. No Enter key is ever sent.

import { attr, tagOf, isSubmitLike, popupFor, listboxOptions, isHidden, walk, lower } from './dom.mjs';
import { FIELD } from './taxonomy.mjs';
import { matchOption } from './profile.mjs';

const winOf = (el) => el.ownerDocument?.defaultView ?? globalThis;

/** The prototype-chain setter for `prop`, bypassing any own-instance accessor (React's tracker). */
export function nativeSetter(el, prop) {
  for (let p = Object.getPrototypeOf(el); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, prop);
    if (d?.set) return d.set;
  }
  return null;
}

export function setNativeValue(el, value) {
  const set = nativeSetter(el, 'value');
  set ? set.call(el, value) : (el.value = value);
}

export function fire(el, type, ctor = 'Event', init = {}) {
  const win = winOf(el);
  const C = win[ctor] ?? win.Event;
  return el.dispatchEvent(new C(type, { bubbles: true, cancelable: true, composed: true, ...init }));
}

/** Commit text to an input/textarea the way a user edit would be observed by React/Vue/Angular. */
export function commitText(el, value) {
  el.focus?.({ preventScroll: true });
  setNativeValue(el, value);
  fire(el, 'input', 'InputEvent', { inputType: 'insertReplacementText', data: value });
  fire(el, 'change');
  el.blur?.();
}

export class RedLineError extends Error {}

/** Pointer + click sequence, refused for anything that could submit, pay, sign up or advance. */
export function clickSafe(el, guard = new Set()) {
  if (isSubmitLike(el) || guard.has(el)) throw new RedLineError(`refused to click red-line element <${tagOf(el)}>`);
  const P = winOf(el).PointerEvent ? 'PointerEvent' : 'MouseEvent';
  fire(el, 'pointerdown', P); fire(el, 'mousedown', 'MouseEvent');
  fire(el, 'pointerup', P); fire(el, 'mouseup', 'MouseEvent');
  el.click();
}

const sleep = (el, ms) => new Promise((r) => winOf(el).setTimeout(r, ms));

async function findPopup(el, waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const lb = popupFor(el) ?? lastVisibleListbox(el);
    if (lb && listboxOptions(lb).length) return lb;
    if (Date.now() >= deadline) return lb ?? null;
    await sleep(el, 50);
  }
}

function lastVisibleListbox(el) {
  let last = null;
  for (const n of walk(el.ownerDocument)) if (lower(attr(n, 'role')) === 'listbox' && !isHidden(n)) last = n;
  return last;
}

async function pickFromPopup(el, w, guard, waitMs) {
  const lb = await findPopup(el, waitMs);
  const opt = lb && matchOption(listboxOptions(lb), w);
  if (!opt) return null;
  clickSafe(opt.el, guard);
  return opt;
}

/** Fill one classified field with a want ({text, match, bool?} from profile.mjs). */
export async function fillField(field, w, { guard = new Set(), waitMs = 1500 } = {}) {
  const { el, kind } = field;
  switch (kind) {
    case 'text': case 'email': case 'tel': case 'url': case 'search': case 'date': case 'month': case 'textarea':
      commitText(el, w.text); return { status: 'filled', value: w.text };
    case 'number': { const v = w.text.replace(/[^\d.]/g, ''); commitText(el, v); return { status: 'filled', value: v }; }
    case 'contenteditable':
      el.focus?.({ preventScroll: true }); el.textContent = w.text; fire(el, 'input', 'InputEvent', { inputType: 'insertReplacementText', data: w.text }); el.blur?.();
      return { status: 'filled', value: w.text };
    case 'select': {
      const o = matchOption(field.options, w);
      if (!o) return { status: 'skipped', reason: 'no-matching-option' };
      el.focus?.({ preventScroll: true });
      (nativeSetter(el, 'value') ?? ((v) => { el.value = v; })).call(el, o.value);
      fire(el, 'input', 'InputEvent'); fire(el, 'change'); el.blur?.();
      return { status: 'filled', value: o.text };
    }
    case 'radio-group': case 'checkbox-group': case 'yesno': {
      const o = matchOption(field.options, w);
      if (!o) return { status: 'skipped', reason: 'no-matching-option' };
      if (!o.el.checked) clickSafe(o.el, guard);
      return { status: 'filled', value: o.text };
    }
    case 'checkbox': {
      if (w.bool == null) return { status: 'skipped', reason: 'not-boolean' };
      if (!!el.checked !== w.bool) clickSafe(el, guard);
      return { status: 'filled', value: w.bool };
    }
    case 'combobox': {
      el.focus?.({ preventScroll: true });
      fire(el, 'mousedown', 'MouseEvent');
      let o = popupFor(el) ? await pickFromPopup(el, w, guard, 0) : null;
      if (!o) {
        setNativeValue(el, w.text);
        fire(el, 'input', 'InputEvent', { inputType: 'insertText', data: w.text });
        o = await pickFromPopup(el, w, guard, waitMs);
      }
      el.blur?.();
      return o ? { status: 'filled', value: o.text } : { status: 'pending', reason: 'no-matching-option', typed: w.text };
    }
    case 'listbox-button': {
      clickSafe(el, guard);
      const o = await pickFromPopup(el, w, guard, waitMs);
      return o ? { status: 'filled', value: o.text } : { status: 'pending', reason: 'no-matching-option' };
    }
    case 'file': {
      const win = winOf(el);
      if (!w || typeof w.name !== 'string' || !win.DataTransfer) return { status: 'skipped', reason: 'needs-user-file' };
      const dt = new win.DataTransfer();
      dt.items.add(w);
      el.files = dt.files;
      fire(el, 'input'); fire(el, 'change');
      return { status: 'filled', value: w.name };
    }
    default:
      return { status: 'skipped', reason: `unsupported-kind:${kind}` };
  }
}

/** Dry-run plan: what would be filled with which value, and why everything else is skipped. Touches nothing. */
export function planFill(result, profile = {}) {
  const steps = result.fields.map((field) => {
    if (field.status !== 'mapped') return { field, action: 'skip', reason: field.status };
    const def = FIELD[field.key];
    if (def.human) return { field, action: 'skip', reason: 'requires-human' };
    const w = def.value?.(profile, field) ?? null;
    if (w == null) return { field, action: 'skip', reason: 'no-profile-value' };
    return { field, action: 'fill', want: w };
  });
  const guard = new Set(result.buttons.filter((b) => b.status !== 'neutral').map((b) => b.el));
  return { platform: result.platform, steps, guard };
}

/** Execute a plan sequentially (deterministic order). Never submits; red-line and advance buttons are guarded. */
export async function fill(plan, { waitMs = 1500 } = {}) {
  const out = [];
  for (const step of plan.steps) {
    if (step.action !== 'fill') { out.push({ field: step.field, status: 'skipped', reason: step.reason }); continue; }
    try {
      out.push({ field: step.field, ...(await fillField(step.field, step.want, { guard: plan.guard, waitMs })) });
    } catch (e) {
      out.push({ field: step.field, status: e instanceof RedLineError ? 'blocked' : 'error', reason: e.message });
    }
  }
  return out;
}
