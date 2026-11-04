// Deterministic field classifier: DOM in, scored field map out. No network, no LLM, no randomness;
// the same DOM always yields the same result in the same order.
//
// Pipeline: collect controls (piercing open shadow roots) -> extract text channels per control
// (explicit label, proximity text, aria/placeholder, name/id tokens, ancestor ids, options,
// autocomplete, input type, section headings) -> score every taxonomy entry -> accept the winner
// only if it clears ACCEPT and beats the runner-up by MARGIN -> assign repeater indices ->
// classify buttons (red line / advance / neutral).

import { attr, lower, tagOf, norm, parentOf, walk, find, findAll, byId, isHidden, textOf, isSubmitLike, popupFor, listboxOptions } from './dom.mjs';
import { FIELDS, FIELD, GROUP_CTX } from './taxonomy.mjs';
import { ADAPTERS, detectPlatform } from './adapters/index.mjs';

export { setNativeValue, commitText, planFill, fill } from './fill.mjs';

export const WEIGHTS = { hint: 12, ac: 10, attrs: 6, label: 6, compound: 6, near: 5, aria: 3, anc: 3, section: 3, opt: 3, type: 3, ctx: 4 };
export const ACCEPT = 5;
export const MARGIN = 2;

const INPUT_KINDS = new Set(['checkbox', 'radio', 'file', 'password', 'email', 'tel', 'url', 'number', 'search', 'date', 'month']);
const WIDGET_LIB = /\b(select2|chosen|selectize|nice-select|choices)\b/;
const ID_ATTRS = ['name', 'id', 'data-automation-id', 'data-qa', 'data-testid', 'data-field'];

const role = (el) => lower(attr(el, 'role'));
const isEditable = (el) => ['', 'true', 'plaintext-only'].includes(lower(attr(el, 'contenteditable') ?? 'x'));

function kindOf(el) {
  const t = tagOf(el), r = role(el);
  if (el.disabled || el.hasAttribute?.('disabled')) return null;
  if (t === 'input') {
    const type = lower(attr(el, 'type')) || 'text';
    if (/^(hidden|submit|button|reset|image)$/.test(type)) return null;
    if (r === 'combobox' || lower(attr(el, 'aria-autocomplete')) === 'list' || lower(attr(el, 'aria-haspopup')) === 'listbox') return 'combobox';
    if (INPUT_KINDS.has(type)) return type;
    for (let n = parentOf(el), d = 0; n && d < 3; n = parentOf(n), d++) if (role(n) === 'combobox') return 'combobox';
    return 'text';
  }
  if (t === 'textarea') return 'textarea';
  if (t === 'select') return el.hasAttribute('multiple') ? 'select-multiple' : 'select';
  if (r === 'combobox') return find(el, (c) => tagOf(c) === 'input' || tagOf(c) === 'textarea') ? null : 'listbox-button';
  if ((t === 'button' || r === 'button') && /^(listbox|true)$/.test(lower(attr(el, 'aria-haspopup')))) return 'listbox-button';
  if (r === 'textbox' || isEditable(el)) return parentOf(el) && (isEditable(parentOf(el)) || role(parentOf(el)) === 'textbox') ? null : 'contenteditable';
  return null;
}

/** Part of a widget that merely mirrors a native <select> (select2, chosen, ...): fill the select instead. */
function mirrorsNativeSelect(el) {
  for (let n = parentOf(el), d = 0; n && n.nodeType === 1 && d < 5; n = parentOf(n), d++) {
    if (!WIDGET_LIB.test(lower(attr(n, 'class')))) continue;
    const sib = [...(parentOf(n)?.children ?? [])];
    if (sib.some((s) => tagOf(s) === 'select') || find(n, (c) => tagOf(c) === 'select')) return true;
  }
  return false;
}

/** Label text of one radio/checkbox/button option. */
function optionText(el) {
  if (tagOf(el) === 'button' || role(el) === 'option') return textOf(el) || attr(el, 'aria-label') || '';
  const lab = explicitLabel(el);
  if (lab) return lab;
  for (let s = el.nextSibling; s; s = s.nextSibling) {
    const t = s.nodeType === 3 ? (s.data ?? s.textContent).trim() : s.nodeType === 1 && !kindOf(s) ? textOf(s) : '';
    if (t) return t;
    if (s.nodeType === 1) break;
  }
  return attr(el, 'aria-label') || attr(el, 'value') || '';
}

/** Collect logical controls in document order. Radios group by name; same-name checkboxes form a group. */
export function collectControls(root) {
  const out = [];
  const radioGroups = new Map(), checkGroups = new Map();
  const visible = (el, kind) => !isHidden(['file', 'select', 'checkbox', 'radio'].includes(kind) ? parentOf(el) ?? el : el);
  const all = [...walk(root)];
  for (const el of all) {
    const kind = kindOf(el);
    if (kind && visible(el, kind) && !(kind !== 'select' && mirrorsNativeSelect(el))) {
      const scopeKey = (el.getRootNode ? el.getRootNode() : root);
      if (kind === 'radio' || kind === 'checkbox') {
        const name = attr(el, 'name');
        const map = kind === 'radio' ? radioGroups : checkGroups;
        if (name) {
          if (!map.has(scopeKey)) map.set(scopeKey, new Map());
          const g = map.get(scopeKey);
          if (g.has(name)) { g.get(name).members.push(el); continue; }
          const ctrl = { el, kind: kind === 'radio' ? 'radio-group' : 'checkbox', members: [el] };
          g.set(name, ctrl);
          out.push(ctrl);
          continue;
        }
        out.push({ el, kind: kind === 'radio' ? 'radio-group' : 'checkbox', members: [el] });
        continue;
      }
      out.push({ el, kind, members: [el] });
      continue;
    }
    // Yes/No button pairs (Ashby and many React forms).
    const btns = (el.children ? [...el.children] : []).filter((c) => tagOf(c) === 'button' || role(c) === 'button');
    if (btns.length >= 2 && btns.length <= 3 && btns.length === el.children.length && btns.every((b) => /^(yes|no)$/.test(norm(textOf(b)))) && !isHidden(el)) {
      out.push({ el, kind: 'yesno', members: btns });
    }
  }
  for (const c of out) if (c.kind === 'checkbox' && c.members.length > 1) c.kind = 'checkbox-group';
  return out;
}

/** Nearest fieldset / role=radiogroup|group that wraps this control and nothing else. */
function groupOf(ctrl, owners) {
  for (let n = parentOf(ctrl.el), d = 0; n && n.nodeType === 1 && d < 5; n = parentOf(n), d++) {
    if ((owners.get(n)?.size ?? 0) > 1) return null;
    if (tagOf(n) === 'fieldset' || /^(radiogroup|group)$/.test(role(n))) return n;
  }
  return null;
}

function labelsFor(el) {
  const id = attr(el, 'id');
  if (!id) return [];
  const rn = el.getRootNode ? el.getRootNode() : null;
  const scope = rn && rn.nodeType ? rn : el.ownerDocument;
  return findAll(scope, (n) => tagOf(n) === 'label' && attr(n, 'for') === id);
}

/** Accessible-name order: aria-labelledby > aria-label > <label for> > wrapping <label> > custom-element host `label`. */
export function explicitLabel(el, skip = null) {
  const lb = attr(el, 'aria-labelledby');
  if (lb) {
    const t = lb.split(/\s+/).map((id) => byId(el, id)).filter((n) => n && n !== el && !n.contains?.(el)).map((n) => textOf(n, skip)).join(' ').trim();
    if (t) return t;
  }
  if (attr(el, 'aria-label')?.trim()) return attr(el, 'aria-label').trim();
  const own = new Set([el, ...(skip ?? [])]);
  for (const l of labelsFor(el)) { const t = textOf(l, own); if (t) return t; }
  for (let n = parentOf(el), d = 0; n && n.nodeType === 1 && d < 4; n = parentOf(n), d++) {
    if (tagOf(n) === 'label') { const t = textOf(n, own); if (t) return t; }
  }
  const host = el.getRootNode?.()?.host;
  return host ? attr(host, 'label') || attr(host, 'aria-label') || '' : '';
}

/** Label of a small fieldset / role=group wrapping a compound field (split date, split phone): <= 4 controls. */
function compoundLabel(el, owners, except) {
  for (let n = parentOf(el), d = 0; n && n.nodeType === 1 && d < 4; n = parentOf(n), d++) {
    if (tagOf(n) !== 'fieldset' && !/^(group|radiogroup)$/.test(role(n))) continue;
    if (n === except || (owners.get(n)?.size ?? 0) > 4) return '';
    const lg = [...n.children].find((c) => tagOf(c) === 'legend');
    return explicitLabel(n) || (lg ? textOf(lg) : '');
  }
  return '';
}

const isHeading = (n) => /^h[1-6]$/.test(tagOf(n)) || tagOf(n) === 'legend' || role(n) === 'heading';

function sectionsOf(el, owners) {
  const out = [];
  for (let cur = el; cur && cur.nodeType === 1 && out.length < 3; cur = parentOf(cur)) {
    if (cur !== el) {
      if (tagOf(cur) === 'fieldset') { const lg = [...cur.children].find((c) => tagOf(c) === 'legend'); if (lg) { out.push(textOf(lg)); continue; } }
      if ((/^(section|fieldset)$/.test(tagOf(cur)) || /^(group|region)$/.test(role(cur))) && attr(cur, 'aria-label')) { out.push(attr(cur, 'aria-label')); continue; }
    }
    for (let s = cur.previousElementSibling; s; s = s.previousElementSibling) {
      if (isHeading(s)) { out.push(textOf(s)); break; }
      if (!owners.has(s)) { const hs = findAll(s, isHeading); if (hs.length) { out.push(textOf(hs[hs.length - 1])); break; } }
    }
  }
  return out.filter(Boolean);
}

/** Text near a control with no explicit label: the largest ancestor that owns only this control, else the nearest preceding sibling text. */
function proximity(ctrl, owners, skip) {
  const own = (n) => owners.get(n)?.size ?? 0;
  let wrapper = null;
  for (let cur = ctrl.group ?? ctrl.el, d = 0; d < 6; d++) {
    const p = parentOf(cur);
    if (!p || p.nodeType !== 1 || /^(form|body|html)$/.test(tagOf(p)) || own(p) > 1) break;
    wrapper = cur = p;
  }
  if (ctrl.group && !wrapper) wrapper = ctrl.group;
  const keep = new Set();
  for (let n = parentOf(ctrl.el); n && n !== wrapper; n = parentOf(n)) keep.add(n);
  let text = wrapper ? textOf(wrapper, skip, 400, keep) : '';
  if (!text) {
    let cur = wrapper ?? ctrl.el;
    for (let d = 0; d < 4 && !text && cur && !/^(form|body|html)$/.test(tagOf(cur)); d++, cur = parentOf(cur)) {
      let blocked = false;
      for (let s = cur.previousElementSibling; s; s = s.previousElementSibling) {
        if (own(s)) { blocked = true; break; }
        const t = textOf(s);
        if (t) { text = t; break; }
      }
      if (blocked) break;
    }
  }
  return { wrapper, text };
}

function optionsOf(ctrl) {
  const { el, kind } = ctrl;
  if (kind === 'select' || kind === 'select-multiple') return [...el.options].map((o) => ({ text: o.text ?? textOf(o), value: o.value, el: o }));
  if (kind === 'radio-group' || kind === 'checkbox-group' || kind === 'yesno') return ctrl.members.map((m) => ({ text: optionText(m), value: attr(m, 'value') ?? optionText(m), el: m }));
  if (kind === 'combobox' || kind === 'listbox-button') { const lb = popupFor(el); return lb ? listboxOptions(lb) : []; }
  return [];
}

function idTokens(el) { return ID_ATTRS.map((a) => attr(el, a)).filter(Boolean); }

function features(ctrl, owners, root) {
  const { el, kind } = ctrl;
  const memberLabels = new Set();
  if (ctrl.members.length > 1 || kind === 'yesno') for (const m of ctrl.members) {
    labelsFor(m).forEach((l) => memberLabels.add(l));
    for (let n = parentOf(m), d = 0; n && d < 2; n = parentOf(n), d++) if (tagOf(n) === 'label') memberLabels.add(n);
  }
  const labelSrc = ctrl.group ?? el;
  const multi = kind === 'radio-group' || kind === 'checkbox-group' || kind === 'yesno';
  const g = multi ? ctrl.group ?? (kind === 'yesno' ? el : null) : null;
  const legend = g && tagOf(g) === 'fieldset' ? [...g.children].find((c) => tagOf(c) === 'legend') : null;
  const label = multi ? (g ? explicitLabel(g, memberLabels) || (legend ? textOf(legend) : '') || attr(g, 'aria-label') || '' : '') : explicitLabel(el);
  const near = label ? null : proximity(ctrl, owners, memberLabels);
  const fallback = label || near?.text ? '' : attr(el, 'title') || attr(el, 'placeholder') || '';
  const host = el.getRootNode?.()?.host;
  const anc = [];
  for (let n = parentOf(labelSrc), d = 0; n && n.nodeType === 1 && d < 3; n = parentOf(n), d++) anc.push(...ID_ATTRS.slice(1, 5).map((a) => attr(n, a)).filter(Boolean));
  const ctxIds = [];
  for (let n = parentOf(labelSrc); n && n.nodeType === 1 && n !== root; n = parentOf(n)) ctxIds.push(...['id', 'data-automation-id'].map((a) => attr(n, a)).filter(Boolean));
  const described = (attr(el, 'aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((id) => byId(el, id)).filter(Boolean).map((n) => textOf(n)).join(' ');
  const sections = sectionsOf(labelSrc, owners);
  const options = optionsOf(ctrl);
  const raw = [...idTokens(el), ...(host ? idTokens(host) : [])];
  const f = {
    label: norm(label || near?.text || fallback),
    labelText: (label || near?.text || fallback || '').slice(0, 160),
    compound: norm(compoundLabel(labelSrc, owners, ctrl.group)),
    labelExplicit: !!label,
    aria: norm([fallback ? '' : attr(el, 'placeholder'), fallback ? '' : attr(el, 'title'), described].join(' ')),
    attrs: norm(raw.join(' ')),
    raw,
    anc: norm(anc.join(' ')),
    ac: lower(attr(el, 'autocomplete')).split(/\s+/).filter((t) => t && t !== 'on' && t !== 'off'),
    type: tagOf(el) === 'input' ? lower(attr(el, 'type')) || 'text' : '',
    options,
    opt: norm(options.slice(0, 80).map((o) => o.text).join(' | ')),
    section: sections[0] ?? '',
    sectionN: norm(sections[0]),
    wrapper: near?.wrapper ?? null,
  };
  f.ctx = norm([...sections, ...ctxIds, ...f.raw, label].join(' '));
  return f;
}

function hintsFor(adapter, f, el) {
  const out = new Set();
  for (const [re, key] of adapter.fields ?? []) {
    for (const v of f.raw) {
      const m = re.exec(v);
      if (!m) continue;
      const k = typeof key === 'function' ? key(m, el) : key;
      if (k) out.add(k);
    }
  }
  return out;
}

function scoreAll(f, kind, hints) {
  const ctxGroups = Object.entries(GROUP_CTX).filter(([, r]) => r.test(f.ctx)).map(([g]) => g);
  const scored = [];
  FIELDS.forEach((def, order) => {
    if (!def.kinds.includes(kind)) return;
    if (def.ctx && !ctxGroups.includes(def.group)) return;
    let s = 0;
    const ch = (str, w) => { if (str && def.re.test(str)) s += def.not?.test(str) ? -w : w; };
    ch(f.attrs, WEIGHTS.attrs);
    ch(f.label, f.labelExplicit ? WEIGHTS.label : WEIGHTS.near);
    ch(f.aria, WEIGHTS.aria);
    ch(f.anc, WEIGHTS.anc);
    ch(f.compound, WEIGHTS.compound);
    ch(f.sectionN, WEIGHTS.section);
    if (def.ac && f.ac.some((t) => def.ac.includes(t))) s += WEIGHTS.ac;
    if (def.types?.includes(f.type)) s += WEIGHTS.type;
    if (def.opt?.test(f.opt)) s += WEIGHTS.opt;
    if (hints.has(def.key)) s += WEIGHTS.hint;
    if (s > 0 && def.group && ctxGroups.includes(def.group)) s += WEIGHTS.ctx;
    if (s > 0 && def.solo && ctxGroups.length) s -= WEIGHTS.ctx;
    if (s > 0) scored.push({ key: def.key, score: s, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map(({ key, score }) => ({ key, score }));
}

function partOf(f) {
  const s = `${f.attrs} ${f.aria} ${f.label.length < 40 ? f.label : ''}`;
  const hits = [['month', /\b(month|mm)\b/], ['year', /\b(year|yyyy|yy)\b/], ['day', /\b(day|dd)\b/]].filter(([, r]) => r.test(s)).map(([p]) => p);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0 && f.options.length > 3) {
    const real = f.options.map((o) => norm(o.text)).filter(Boolean);
    if (real.filter((t) => /^(19|20)\d\d$/.test(t)).length >= real.length - 1) return 'year';
    if (real.filter((t) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t)).length >= 11) return 'month';
  }
  return null;
}

function rawIndex(f) {
  const toks = norm(`${f.raw.join(' ')} ${f.ctx}`).split(' ');
  const n = toks.find((t) => /^\d{1,2}$/.test(t));
  return n == null ? null : +n;
}

const BUTTONISH = (el) => {
  const t = tagOf(el);
  return t === 'button' || (t === 'input' && /^(submit|button|image|reset)$/.test(lower(attr(el, 'type')))) || role(el) === 'button';
};
export const REDLINE = /\b(submit|apply|send|finish|complete (my )?(application|purchase|order|registration)|sign ?up|sign ?in|log ?in|create (an |my )?account|register|pay|payment|purchase|buy|checkout|check out|place (order|bid)|bid|confirm (and )?(submit|order|payment|purchase)|withdraw|accept|e ?sign|sign)\b/;
export const ADVANCE = /\b(next|continue|proceed|review|go to step)\b/;

/** Classify actionable buttons. "redline" = would submit, pay, bid, sign up or sign in; "advance" = wizard step. Neither is ever clicked by the engine. */
export function classifyButtons(root, owned, adapter) {
  const out = [];
  for (const el of walk(root)) {
    if (!BUTTONISH(el) || owned.has(el) || kindOf(el) === 'listbox-button' || isHidden(el)) continue;
    const text = textOf(el) || attr(el, 'value') || attr(el, 'aria-label') || attr(el, 'title') || attr(el, 'data-automation-id') || '';
    const n = norm(text);
    let status = REDLINE.test(n) ? 'redline' : ADVANCE.test(n) ? 'advance' : isSubmitLike(el) ? 'redline' : 'neutral';
    status = adapter.button?.(el, text, status) ?? status;
    out.push({ el, text: text.trim().slice(0, 80), status, submitLike: isSubmitLike(el) });
  }
  return out;
}

/**
 * Classify every control under `target` (a Document, element or shadow root).
 * @param {object} [opts] url (for platform detection), adapter (id or object; default auto-detect)
 */
export function classify(target, { url = '', adapter } = {}) {
  const doc = target.nodeType === 9 ? target : target.ownerDocument;
  const a = typeof adapter === 'string' ? ADAPTERS[adapter] : adapter ?? detectPlatform(doc, url || doc?.defaultView?.location?.href || '');
  const root = target.nodeType === 9 ? (target.body ?? target) : target;
  const controls = collectControls(root);

  const owners = new Map();
  const owned = new Set();
  controls.forEach((c, i) => {
    for (const m of [c.el, ...c.members]) {
      owned.add(m);
      for (let n = m; n && n.nodeType === 1; n = parentOf(n)) {
        if (!owners.has(n)) owners.set(n, new Set());
        const s = owners.get(n);
        if (s.has(i)) break;
        s.add(i);
      }
    }
  });

  for (const c of controls) if (/^(radio-group|checkbox-group)$/.test(c.kind)) c.group = groupOf(c, owners) ?? undefined;

  const fields = controls.map((c, i) => {
    const f = features(c, owners, root);
    const ranked = scoreAll(f, c.kind, hintsFor(a, f, c.el));
    const [best, second] = ranked;
    const margin = best ? best.score - (second?.score ?? 0) : 0;
    const status = !best || best.score < ACCEPT ? 'unmapped' : margin < MARGIN ? 'ambiguous' : 'mapped';
    const key = status === 'mapped' ? best.key : null;
    const def = key ? FIELD[key] : null;
    return {
      id: `f${i + 1}`,
      el: c.el,
      members: c.members,
      kind: c.kind,
      options: f.options,
      anchor: ['file', 'radio-group', 'checkbox-group'].includes(c.kind) ? (c.group ?? f.wrapper ?? parentOf(c.el) ?? c.el) : c.el,
      label: f.labelText,
      section: f.section,
      key,
      part: def?.date ? partOf(f) : null,
      index: null,
      _raw: def?.group ? rawIndex(f) : null,
      status,
      score: best?.score ?? 0,
      margin,
      candidates: ranked.slice(0, 3),
      sensitive: !!def?.sensitive,
      human: !!def?.human,
    };
  });

  // Repeater indices: dense rank of explicit numbers per group, else per-key occurrence order.
  for (const g of Object.keys(GROUP_CTX)) {
    const members = fields.filter((f) => f.key && FIELD[f.key].group === g);
    const raws = [...new Set(members.map((f) => f._raw).filter((r) => r != null))].sort((x, y) => x - y);
    const seen = new Map();
    for (const f of members) {
      const k = `${f.key}:${f.part}`;
      const occ = seen.get(k) ?? 0;
      seen.set(k, occ + 1);
      f.index = f._raw != null ? raws.indexOf(f._raw) : occ;
    }
  }
  for (const f of fields) delete f._raw;

  return { platform: a.id, adapter: a, url, root, fields, buttons: classifyButtons(root, owned, a) };
}
