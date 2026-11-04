// Minimal, deterministic HTML parser + DOM for Node replay. It implements only what the engine
// touches (tree, attributes, open shadow roots, form-control state, events) with browser semantics:
// prototype accessors for value/checked (so React-style instance trackers can be emulated), checkbox
// and radio activation on click(), implicit form submission from submit buttons, and capture/bubble
// event paths that cross composed shadow boundaries. Every dispatched event lands in doc.eventLog.

const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', middot: '·', bull: '•' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

export class Event {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.composed = !!init.composed;
    Object.assign(this, Object.fromEntries(Object.entries(init).filter(([k]) => !['bubbles', 'cancelable', 'composed'].includes(k))));
    this.defaultPrevented = false;
    this.target = this.currentTarget = null;
    this._stop = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; }
}
export class InputEvent extends Event {}
export class FocusEvent extends Event {}
export class MouseEvent extends Event {}
export class PointerEvent extends MouseEvent {}
export class KeyboardEvent extends Event {}

class Node {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._listeners = new Map(); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get previousSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) - 1] ?? null : null; }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] ?? null : null; }
  get previousElementSibling() { const s = this.parentNode?.children ?? []; return s[s.indexOf(this) - 1] ?? null; }
  get nextElementSibling() { const s = this.parentNode?.children ?? []; return s[s.indexOf(this) + 1] ?? null; }
  appendChild(n) { n.parentNode?.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { this.parentNode?.removeChild(this); }
  get textContent() { return this.childNodes.map((c) => (c.nodeType === 8 ? '' : c.textContent)).join(''); }
  set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v) this.appendChild(new Text(this.ownerDocument ?? this, String(v))); }
  getRootNode(opts) { let n = this; for (;;) { if (n.parentNode) n = n.parentNode; else if (opts?.composed && n.host) n = n.host; else return n; } }
  get isConnected() { return this.getRootNode({ composed: true }).nodeType === 9; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    const list = this._listeners.get(type);
    if (!list.some((l) => l.fn === fn && l.capture === capture)) list.push({ fn, capture, once: !!opts?.once });
  }
  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    const list = this._listeners.get(type);
    if (list) this._listeners.set(type, list.filter((l) => !(l.fn === fn && l.capture === capture)));
  }
  _invoke(ev, phase) {
    for (const l of [...(this._listeners.get(ev.type) ?? [])]) {
      if ((phase === 'capture' && !l.capture) || (phase === 'bubble' && l.capture)) continue;
      if (l.once) this.removeEventListener(ev.type, l.fn, l.capture);
      ev.currentTarget = this;
      typeof l.fn === 'function' ? l.fn.call(this, ev) : l.fn.handleEvent(ev);
    }
  }
  dispatchEvent(ev) {
    const doc = this.nodeType === 9 ? this : this.ownerDocument;
    const path = [];
    for (let n = this; n;) {
      path.push(n);
      if (n.nodeType === 11 && n.host) { if (!ev.composed) break; n = n.host; } else n = n.parentNode;
    }
    ev.target = this;
    doc?.eventLog.push({ type: ev.type, target: this });
    for (let i = path.length - 1; i > 0 && !ev._stop; i--) path[i]._invoke(ev, 'capture');
    if (!ev._stop) this._invoke(ev, 'target');
    if (ev.bubbles) for (let i = 1; i < path.length && !ev._stop; i++) path[i]._invoke(ev, 'bubble');
    ev.currentTarget = null;
    return !ev.defaultPrevented;
  }
}

class Text extends Node {
  constructor(doc, data) { super(doc); this.data = data; }
  get nodeType() { return 3; }
  get textContent() { return this.data; }
}

function byId(root, id) {
  const stack = [...root.children].reverse();
  while (stack.length) {
    const el = stack.pop();
    if (el.getAttribute('id') === id) return el;
    stack.push(...[...el.children].reverse());
  }
  return null;
}

export class Element extends Node {
  constructor(doc, name) { super(doc); this.localName = name.toLowerCase(); this.attributes = new Map(); this.shadowRoot = null; }
  get nodeType() { return 1; }
  get tagName() { return this.localName.toUpperCase(); }
  get nodeName() { return this.tagName; }
  get id() { return this.getAttribute('id') ?? ''; }
  get className() { return this.getAttribute('class') ?? ''; }
  get hidden() { return this.hasAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  get name() { return this.getAttribute('name') ?? ''; }
  getAttribute(n) { n = n.toLowerCase(); return this.attributes.has(n) ? this.attributes.get(n) : null; }
  setAttribute(n, v) { this.attributes.set(n.toLowerCase(), String(v)); }
  hasAttribute(n) { return this.attributes.has(n.toLowerCase()); }
  removeAttribute(n) { this.attributes.delete(n.toLowerCase()); }
  getAttributeNames() { return [...this.attributes.keys()]; }
  attachShadow({ mode = 'open' } = {}) { const sr = new ShadowRoot(this.ownerDocument, this, mode); if (mode === 'open') this.shadowRoot = sr; return sr; }
  closest(tag) { for (let n = this; n?.nodeType === 1; n = n.parentNode) if (n.localName === tag) return n; return null; }
  get form() { return this.closest('form'); }
  focus() {
    const d = this.ownerDocument;
    if (d.activeElement === this) return;
    d.activeElement?.blur?.();
    d.activeElement = this;
    this.dispatchEvent(new FocusEvent('focus', { composed: true }));
    this.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
  }
  blur() {
    const d = this.ownerDocument;
    if (d.activeElement !== this) return;
    d.activeElement = null;
    this.dispatchEvent(new FocusEvent('blur', { composed: true }));
    this.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  }
  click() { return this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })); }
}
export class HTMLElement extends Element {}

const fire = (el, type, C = Event) => el.dispatchEvent(new C(type, { bubbles: true, composed: type === 'input' }));

export class HTMLInputElement extends HTMLElement {
  get type() { return (this.getAttribute('type') || 'text').toLowerCase(); }
  get value() { return this._value ?? this.getAttribute('value') ?? (/^(checkbox|radio)$/.test(this.type) ? 'on' : ''); }
  set value(v) { this._value = String(v ?? ''); }
  get checked() { return this._checked ?? this.hasAttribute('checked'); }
  set checked(v) { this._setChecked(!!v); }
  get files() { return this._files ?? []; }
  set files(v) { this._files = v; }
  _setChecked(v) {
    this._checked = v;
    if (v && this.type === 'radio' && this.name) {
      const scope = this.form ?? this.getRootNode();
      const stack = [...scope.children];
      while (stack.length) {
        const el = stack.pop();
        if (el !== this && el instanceof HTMLInputElement && el.type === 'radio' && el.name === this.name) el._checked = false;
        stack.push(...el.children);
      }
    }
  }
  click() {
    if (this.disabled) return;
    const t = this.type, was = this.checked;
    if (t === 'checkbox') this._checked = !was;
    if (t === 'radio') this._setChecked(true);
    const ok = this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    if (!ok) { if (t === 'checkbox' || t === 'radio') this._checked = was; return; }
    if (t === 'checkbox' || (t === 'radio' && !was)) { fire(this, 'input', InputEvent); fire(this, 'change'); }
    if ((t === 'submit' || t === 'image') && this.form) this.form.requestSubmit();
  }
}
export class HTMLTextAreaElement extends HTMLElement {
  get type() { return 'textarea'; }
  get value() { return this._value ?? this.textContent; }
  set value(v) { this._value = String(v ?? ''); }
}
export class HTMLOptionElement extends HTMLElement {
  get text() { return this.textContent.replace(/\s+/g, ' ').trim(); }
  get value() { return this.getAttribute('value') ?? this.text; }
  get selected() { return this._selected ?? this.hasAttribute('selected'); }
  set selected(v) { this._selected = !!v; }
}
export class HTMLSelectElement extends HTMLElement {
  get type() { return this.multiple ? 'select-multiple' : 'select-one'; }
  get multiple() { return this.hasAttribute('multiple'); }
  get options() {
    const out = [], stack = [...this.children].reverse();
    while (stack.length) { const el = stack.pop(); if (el instanceof HTMLOptionElement) out.push(el); else stack.push(...[...el.children].reverse()); }
    return out;
  }
  get selectedIndex() {
    const o = this.options, i = o.findIndex((x) => x.selected);
    return i < 0 && !this.multiple && o.length ? 0 : i;
  }
  set selectedIndex(i) { this.options.forEach((o, k) => { o._selected = k === i; }); }
  get value() { const i = this.selectedIndex; return i < 0 ? '' : this.options[i].value; }
  set value(v) { const o = this.options, i = o.findIndex((x) => x.value === String(v)); o.forEach((x, k) => { x._selected = k === i; }); }
}
export class HTMLButtonElement extends HTMLElement {
  get type() { const t = (this.getAttribute('type') || 'submit').toLowerCase(); return /^(button|reset)$/.test(t) ? t : 'submit'; }
  click() {
    if (this.disabled) return;
    const ok = super.click();
    if (ok && this.type === 'submit' && this.form) this.form.requestSubmit();
  }
}
export class HTMLFormElement extends HTMLElement {
  requestSubmit() { this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
  submit() { this.ownerDocument.eventLog.push({ type: 'submit()', target: this }); }
}

export class ShadowRoot extends Node {
  constructor(doc, host, mode) { super(doc); this.host = host; this.mode = mode; }
  get nodeType() { return 11; }
  getElementById(id) { return byId(this, id); }
}

const CLASSES = { input: HTMLInputElement, textarea: HTMLTextAreaElement, select: HTMLSelectElement, option: HTMLOptionElement, button: HTMLButtonElement, form: HTMLFormElement };

export class Document extends Node {
  constructor() {
    super(null);
    this.eventLog = [];
    this.activeElement = null;
    this.defaultView = { document: this, Event, InputEvent, FocusEvent, MouseEvent, PointerEvent, KeyboardEvent, Element, HTMLElement, HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, HTMLOptionElement, HTMLButtonElement, HTMLFormElement, setTimeout, clearTimeout };
  }
  get nodeType() { return 9; }
  get documentElement() { return this.children[0] ?? null; }
  get head() { return this.documentElement?.children.find((e) => e.localName === 'head') ?? null; }
  get body() { return this.documentElement?.children.find((e) => e.localName === 'body') ?? this.documentElement; }
  createElement(name) { return new (CLASSES[name.toLowerCase()] ?? HTMLElement)(this, name); }
  createTextNode(s) { return new Text(this, s); }
  getElementById(id) { return byId(this, id); }
}

const AUTO_CLOSE = { option: ['option'], optgroup: ['option', 'optgroup'], li: ['li'], p: ['p'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'] };
const ATTR = /\s*([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;

/** Parse an HTML string into a Document. Declarative shadow roots (<template shadowrootmode>) attach to their parent. */
export function parseHTML(html) {
  const doc = new Document();
  const stack = [doc];
  const top = () => stack[stack.length - 1];
  const tagOf = (n) => n._tpl ?? n.localName;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0 || lt > i) { const t = html.slice(i, lt < 0 ? html.length : lt); if (top() !== doc || t.trim()) top().appendChild(new Text(doc, decode(t))); if (lt < 0) break; }
    i = lt;
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); i = e < 0 ? html.length : e + 3; continue; }
    if (html[i + 1] === '!' || html[i + 1] === '?') { const e = html.indexOf('>', i); i = e < 0 ? html.length : e + 1; continue; }
    if (html[i + 1] === '/') {
      const e = html.indexOf('>', i);
      const name = html.slice(i + 2, e).trim().toLowerCase();
      const at = stack.map(tagOf).lastIndexOf(name);
      if (at > 0) stack.length = at;
      i = e + 1;
      continue;
    }
    const m = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 64));
    if (!m) { top().appendChild(new Text(doc, '<')); i++; continue; }
    const name = m[1].toLowerCase();
    i += m[0].length;
    const attrs = [];
    for (;;) {
      ATTR.lastIndex = i;
      const a = ATTR.exec(html);
      if (!a || a.index !== i) break;
      attrs.push([a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      i = ATTR.lastIndex;
    }
    const close = html.indexOf('>', i);
    const selfClosing = html[close - 1] === '/';
    i = close + 1;
    const closes = AUTO_CLOSE[name];
    if (closes && closes.includes(tagOf(top()))) stack.pop();
    const shadowMode = name === 'template' && (attrs.find(([k]) => k === 'shadowrootmode' || k === 'shadowroot')?.[1]);
    if (shadowMode && top().nodeType === 1) {
      const sr = top().attachShadow({ mode: shadowMode });
      sr._tpl = 'template';
      stack.push(sr);
      continue;
    }
    const el = doc.createElement(name);
    for (const [k, v] of attrs) el.setAttribute(k, v);
    top().appendChild(el);
    if (VOID.has(name) || selfClosing) continue;
    if (RAW.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      const raw = html.slice(i, end < 0 ? html.length : end);
      if (raw) el.appendChild(new Text(doc, name === 'textarea' || name === 'title' ? decode(raw.replace(/^\n/, '')) : raw));
      i = end < 0 ? html.length : html.indexOf('>', end) + 1;
      continue;
    }
    stack.push(el);
  }
  return doc;
}
