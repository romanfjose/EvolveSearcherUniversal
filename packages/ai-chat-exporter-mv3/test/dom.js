/* ============================================================
   Zero-dependency DOM for the regression suite.

   Just enough of the platform for the extension's own files (md.js,
   adapters.js, search.js, product*.js) to run unmodified under
   `node --test`: an HTML parser, a selector engine, Range/Selection,
   events and the handful of layout reads the adapters make.

   Two browser behaviours are reproduced on purpose because the code
   under test depends on them:
     - elements inside <svg>/<math> keep a lowercase tagName (real
       browsers do this; code comparing against "SVG" silently fails);
     - geometry comes from data-box="left,top,width,height", inherited
       from the nearest boxed ancestor, so alignment-based role
       inference can be exercised without a layout engine.
   ============================================================ */

"use strict";

const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const RAW = new Set(["script", "style", "textarea", "title"]);
// Opening one of these implicitly closes an open <p>.
const CLOSES_P = new Set("address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul".split(" "));
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", copy: "©", laquo: "«", raquo: "»", times: "×", rarr: "→", larr: "←", middot: "·", bull: "•" };

const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e.toLowerCase()] ?? m;
});
const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/* ---------------- selectors ---------------- */

function parseSelectorList(src) {
  let i = 0;
  const s = src.trim();
  const err = () => { throw new SyntaxError(`'${src}' is not a valid selector`); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const ident = () => {
    let out = "";
    while (i < s.length) {
      const c = s[i];
      if (c === "\\") { out += s[i + 1]; i += 2; continue; }
      if (/[\w\- -￿]/.test(c)) { out += c; i++; continue; }
      break;
    }
    return out;
  };
  function compound() {
    const c = { tag: null, id: null, classes: [], attrs: [], nots: [] };
    let any = false;
    if (s[i] === "*") { i++; any = true; }
    else if (/[\w-]/.test(s[i] || "")) { c.tag = ident().toLowerCase(); any = true; }
    for (;;) {
      const ch = s[i];
      if (ch === "#") { i++; c.id = ident(); any = true; }
      else if (ch === ".") { i++; const n = ident(); if (!n) err(); c.classes.push(n); any = true; }
      else if (ch === "[") {
        i++; ws();
        const name = ident().toLowerCase(); if (!name) err();
        ws();
        let op = null, val = null, ci = false;
        const m = /^([~^$*|]?=)/.exec(s.slice(i));
        if (m) {
          op = m[1]; i += op.length; ws();
          const q = s[i];
          if (q === '"' || q === "'") {
            i++; val = "";
            while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; val += s[i++]; }
            if (s[i] !== q) err();
            i++;
          } else val = ident();
          ws();
          if (/[is]/i.test(s[i] || "") && /[\s\]]/.test(s[i + 1] || "")) { ci = s[i].toLowerCase() === "i"; i++; ws(); }
        }
        if (s[i] !== "]") err();
        i++;
        c.attrs.push({ name, op, val, ci });
        any = true;
      } else if (ch === ":") {
        i++;
        const name = ident().toLowerCase();
        if (name === "not" || name === "is") {
          if (s[i] !== "(") err();
          i++;
          let depth = 1, start = i;
          while (i < s.length && depth) { if (s[i] === "(") depth++; else if (s[i] === ")") depth--; i++; }
          const inner = parseSelectorList(s.slice(start, i - 1));
          if (name === "not") c.nots.push(inner); else c.attrs.push({ is: inner });
        } else if (name === "first-child" || name === "last-child") c.attrs.push({ pseudo: name });
        else err();
        any = true;
      } else break;
    }
    if (!any) err();
    return c;
  }
  const list = [];
  for (;;) {
    ws();
    const chain = [{ comb: null, c: compound() }];
    for (;;) {
      const before = i; ws();
      const ch = s[i];
      if (i >= s.length || ch === ",") break;
      let comb = " ";
      if (ch === ">" || ch === "+" || ch === "~") { comb = ch; i++; ws(); }
      else if (before === i) err();
      chain.push({ comb, c: compound() });
    }
    list.push(chain);
    if (s[i] === ",") { i++; continue; }
    if (i < s.length) err();
    break;
  }
  return list;
}

const selCache = new Map();
const compile = (sel) => {
  if (!selCache.has(sel)) selCache.set(sel, parseSelectorList(String(sel)));
  return selCache.get(sel);
};

function matchCompound(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id != null && el.getAttribute("id") !== c.id) return false;
  if (c.classes.length) {
    const have = (el.getAttribute("class") || "").split(/\s+/);
    if (!c.classes.every((k) => have.includes(k))) return false;
  }
  for (const a of c.attrs) {
    if (a.is) { if (!matchList(el, a.is)) return false; continue; }
    if (a.pseudo === "first-child") { if (el.parentElement?.firstElementChild !== el) return false; continue; }
    if (a.pseudo === "last-child") { if (el.parentElement?.lastElementChild !== el) return false; continue; }
    let v = el.getAttribute(a.name);
    if (v == null) return false;
    if (!a.op) continue;
    let w = a.val;
    if (a.ci) { v = v.toLowerCase(); w = w.toLowerCase(); }
    const ok = a.op === "=" ? v === w
      : a.op === "^=" ? !!w && v.startsWith(w)
      : a.op === "$=" ? !!w && v.endsWith(w)
      : a.op === "*=" ? !!w && v.includes(w)
      : a.op === "~=" ? v.split(/\s+/).includes(w)
      : a.op === "|=" ? v === w || v.startsWith(w + "-") : false;
    if (!ok) return false;
  }
  for (const n of c.nots) if (matchList(el, n)) return false;
  return true;
}

function matchChain(el, chain, k = chain.length - 1) {
  if (!matchCompound(el, chain[k].c)) return false;
  if (k === 0) return true;
  const comb = chain[k].comb;
  if (comb === ">") return !!el.parentElement && matchChain(el.parentElement, chain, k - 1);
  if (comb === " ") {
    for (let a = el.parentElement; a; a = a.parentElement) if (matchChain(a, chain, k - 1)) return true;
    return false;
  }
  if (comb === "+") return !!el.previousElementSibling && matchChain(el.previousElementSibling, chain, k - 1);
  for (let p = el.previousElementSibling; p; p = p.previousElementSibling) if (matchChain(p, chain, k - 1)) return true;
  return false;
}
const matchList = (el, list) => list.some((chain) => matchChain(el, chain));

/* ---------------- nodes ---------------- */

class Node {
  constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this._ls = {}; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
  get isConnected() { let a = this; while (a.parentNode) a = a.parentNode; return a.nodeType === 9; }
  get textContent() { return this.childNodes.map((c) => (c.nodeType === 8 ? "" : c.textContent)).join(""); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (v !== "" && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))); }
  contains(n) { for (let a = n; a; a = a.parentNode) if (a === this) return true; return false; }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (n.nodeType === 11) { for (const c of n.childNodes.slice()) this.insertBefore(c, ref); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx < 0) this.childNodes.push(n); else this.childNodes.splice(idx, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { this.parentNode?.removeChild(this); }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n); }
  prepend(...ns) { const f = this.firstChild; for (const n of ns) this.insertBefore(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n, f); }
  replaceChildren(...ns) { this.textContent = ""; this.append(...ns); }
  before(...ns) { for (const n of ns) this.parentNode?.insertBefore(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n, this); }
  after(...ns) { const nx = this.nextSibling; for (const n of ns) this.parentNode?.insertBefore(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n, nx); }
  replaceWith(...nodes) {
    const p = this.parentNode; if (!p) return;
    for (const n of nodes) p.insertBefore(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n, this);
    p.removeChild(this);
  }
  compareDocumentPosition(other) {
    if (other === this) return 0;
    const path = (n) => { const out = []; for (let a = n; a; a = a.parentNode) out.unshift(a); return out; };
    const a = path(this), b = path(other);
    if (a[0] !== b[0]) return 1;
    let i = 0; while (a[i] === b[i]) i++;
    if (i === a.length) return 20; // other is a descendant: CONTAINED_BY | FOLLOWING
    if (i === b.length) return 10; // other is an ancestor: CONTAINS | PRECEDING
    const sib = a[i - 1].childNodes;
    return sib.indexOf(b[i]) > sib.indexOf(a[i]) ? 4 : 2;
  }
  addEventListener(t, fn) { (this._ls[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this._ls[t] = (this._ls[t] || []).filter((f) => f !== fn); }
  dispatchEvent(ev) {
    ev.target ||= this;
    for (let a = this; a; a = a.parentNode || (a.nodeType === 9 ? a.defaultView : null)) {
      ev.currentTarget = a;
      for (const fn of (a._ls?.[ev.type] || []).slice()) fn.call(a, ev);
      if (!ev.bubbles || ev._stop) break;
    }
    return !ev.defaultPrevented;
  }
}
Object.assign(Node, { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_CONTAINS: 8, DOCUMENT_POSITION_CONTAINED_BY: 16 });

class Text extends Node {
  constructor(doc, v) { super(doc); this.nodeType = 3; this.nodeName = "#text"; this.nodeValue = v; }
  get data() { return this.nodeValue; }
  set data(v) { this.nodeValue = v; }
  get textContent() { return this.nodeValue; }
  set textContent(v) { this.nodeValue = String(v); }
  cloneNode() { return new Text(this.ownerDocument, this.nodeValue); }
}
class Comment extends Node {
  constructor(doc, v) { super(doc); this.nodeType = 8; this.nodeName = "#comment"; this.nodeValue = v; }
  get textContent() { return ""; }
  cloneNode() { return new Comment(this.ownerDocument, this.nodeValue); }
}

function queryAll(root, sel) {
  const list = compile(sel);
  const out = [];
  const visit = (n) => { for (const c of n.childNodes) if (c.nodeType === 1) { if (matchList(c, list)) out.push(c); visit(c); } };
  visit(root);
  return out;
}

class Element extends Node {
  constructor(doc, name, foreign) {
    super(doc);
    this.nodeType = 1;
    this.localName = name.toLowerCase();
    this.tagName = foreign ? this.localName : this.localName.toUpperCase();
    this.nodeName = this.tagName;
    this._attrs = new Map();
    this._foreign = foreign;
    this.style = {};
    this.scrollTop = 0;
  }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
  getAttribute(n) { const v = this._attrs.get(String(n).toLowerCase()); return v === undefined ? null : v; }
  setAttribute(n, v) { this._attrs.set(String(n).toLowerCase(), String(v)); }
  hasAttribute(n) { return this._attrs.has(String(n).toLowerCase()); }
  removeAttribute(n) { this._attrs.delete(String(n).toLowerCase()); }
  toggleAttribute(n, force) { const on = force ?? !this.hasAttribute(n); if (on) this.setAttribute(n, ""); else this.removeAttribute(n); return on; }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get classList() {
    const el = this;
    const toks = () => el.className.split(/\s+/).filter(Boolean);
    const api = {
      contains: (c) => toks().includes(c),
      add: (...cs) => { el.className = [...new Set([...toks(), ...cs])].join(" "); },
      remove: (...cs) => { el.className = toks().filter((t) => !cs.includes(t)).join(" "); },
      toggle: (c, f) => { const on = f ?? !toks().includes(c); if (on) api.add(c); else api.remove(c); return on; },
      get length() { return toks().length; },
    };
    return api;
  }
  get dataset() {
    const el = this;
    return new Proxy({}, {
      get: (_, k) => el.getAttribute("data-" + String(k).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())) ?? undefined,
      set: (_, k, v) => { el.setAttribute("data-" + String(k).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()), v); return true; },
    });
  }
  get hidden() { return this.hasAttribute("hidden"); }
  set hidden(v) { this.toggleAttribute("hidden", !!v); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { this.toggleAttribute("disabled", !!v); }
  get checked() { return this._checked ?? this.hasAttribute("checked"); }
  set checked(v) { this._checked = !!v; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.localName === "textarea") return this.textContent;
    return this.getAttribute("value") || "";
  }
  set value(v) { this._value = String(v); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get previousElementSibling() { let n = this.previousSibling; while (n && n.nodeType !== 1) n = n.previousSibling; return n; }
  get isContentEditable() { for (let a = this; a && a.nodeType === 1; a = a.parentNode) { const v = a.getAttribute("contenteditable"); if (v != null) return v !== "false"; } return false; }
  querySelector(s) { return queryAll(this, s)[0] || null; }
  querySelectorAll(s) { return queryAll(this, s); }
  getElementsByTagName(t) { return queryAll(this, t); }
  matches(s) { return matchList(this, compile(s)); }
  closest(s) { const l = compile(s); for (let a = this; a && a.nodeType === 1; a = a.parentNode) if (matchList(a, l)) return a; return null; }
  // The rendered-text algorithm, minus CSS: block elements break lines
  // (<p> by two), <br> is a newline, whitespace collapses except inside
  // <pre>/<textarea> or a pre-wrap class/style, hidden subtrees vanish.
  get innerText() { return innerText(this); }
  set innerText(v) { this.textContent = v; }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  set innerHTML(html) { this.textContent = ""; parseInto(this.ownerDocument, this, String(html)); }
  get outerHTML() { return serialize(this); }
  cloneNode(deep) {
    const e = new Element(this.ownerDocument, this.localName, this._foreign);
    for (const [k, v] of this._attrs) e._attrs.set(k, v);
    if (deep) for (const c of this.childNodes) e.appendChild(c.cloneNode(true));
    return e;
  }
  getBoundingClientRect() {
    let b = null;
    for (let a = this; a && a.nodeType === 1; a = a.parentNode) {
      const raw = a.getAttribute("data-box");
      if (raw) {
        const [l, t, w, h] = raw.split(",").map(Number);
        b = a === this ? { left: l, top: t, width: w, height: h } : { left: l, top: t, width: w, height: 40 };
        break;
      }
    }
    b ||= { left: 0, top: 0, width: 800, height: 40 };
    if (!this.isConnected || this._displayNone()) b = { left: 0, top: 0, width: 0, height: 0 };
    return { ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON() {} };
  }
  _displayNone() {
    for (let a = this; a && a.nodeType === 1; a = a.parentNode) {
      if (a.hasAttribute("hidden")) return true;
      if (/display\s*:\s*none/i.test(a.getAttribute("style") || "") || a.style.display === "none") return true;
    }
    return false;
  }
  checkVisibility(opts = {}) {
    if (this._displayNone()) return false;
    for (let a = this; a && a.nodeType === 1; a = a.parentNode) {
      const st = a.getAttribute("style") || "";
      if (opts.checkVisibilityCSS && /visibility\s*:\s*hidden/i.test(st)) return false;
      if (opts.checkOpacity && /opacity\s*:\s*0(\.0*)?\s*(;|$)/i.test(st)) return false;
    }
    return true;
  }
  get offsetWidth() { return this.getBoundingClientRect().width; }
  get offsetHeight() { return this.getBoundingClientRect().height; }
  get clientHeight() { return this.getBoundingClientRect().height; }
  get scrollHeight() { return this.getBoundingClientRect().height; }
  scrollIntoView() {}
  scrollTo() {}
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() {
    if (this.disabled) return;
    const W = this.ownerDocument.defaultView;
    const box = this.localName === "input" && /^(checkbox|radio)$/i.test(this.getAttribute("type") || "");
    if (box) this.checked = this.getAttribute("type").toLowerCase() === "radio" ? true : !this.checked;
    this.dispatchEvent(new W.MouseEvent("click", { bubbles: true, cancelable: true }));
    if (box) {
      this.dispatchEvent(new W.Event("input", { bubbles: true }));
      this.dispatchEvent(new W.Event("change", { bubbles: true }));
    }
  }
}

const BLOCK = new Set("address article aside blockquote dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table tr ul".split(" "));
const PRESERVE = /(^|\s)(whitespace-pre(-wrap|-line)?|pre-wrap)(\s|$)/;

function innerText(root) {
  const parts = []; // strings, or numbers = required line-break count
  const rec = (n, keep) => {
    if (n.nodeType === 3) { parts.push(keep ? n.nodeValue : n.nodeValue.replace(/[ \t\n\r\f]+/g, " ")); return; }
    if (n.nodeType !== 1) return;
    if (n.hasAttribute("hidden") || /display\s*:\s*none/i.test(n.getAttribute("style") || "")) return;
    const t = n.localName;
    if (t === "script" || t === "style" || t === "template" || t === "head") return;
    if (t === "br") { parts.push("\n"); return; }
    const k = keep || t === "pre" || t === "textarea" || PRESERVE.test(n.getAttribute("class") || "") || /white-space\s*:\s*pre/i.test(n.getAttribute("style") || "");
    const req = t === "p" ? 2 : BLOCK.has(t) ? 1 : 0;
    if (req) parts.push(req);
    for (const c of n.childNodes) rec(c, k);
    if (t === "td" || t === "th") parts.push("\t");
    if (req) parts.push(req);
  };
  // white-space inherits: an ancestor's pre-wrap applies here too.
  let keep0 = false;
  for (let a = root; a && a.nodeType === 1; a = a.parentNode) {
    if (a.localName === "pre" || a.localName === "textarea" || PRESERVE.test(a.getAttribute("class") || "") || /white-space\s*:\s*pre/i.test(a.getAttribute("style") || "")) { keep0 = true; break; }
  }
  for (const c of root.childNodes) rec(c, keep0);
  let out = "", pending = 0;
  for (const p of parts) {
    if (typeof p === "number") { pending = Math.max(pending, p); continue; }
    if (!p) continue;
    let s = p;
    if (pending) {
      if (out) { out = out.replace(/ +$/, ""); s = s.replace(/^ +/, ""); if (!s) continue; out += "\n".repeat(pending); }
      else s = s.replace(/^ +/, "");
      pending = 0;
    } else if (!out) s = s.replace(/^ +/, "");
    else if (out.endsWith(" ") && s.startsWith(" ")) s = s.slice(1);
    out += s;
  }
  return out.replace(/ +$/, "");
}

function serialize(n) {
  if (n.nodeType === 3) return n.parentNode && RAW.has(n.parentNode.localName) ? n.nodeValue : escText(n.nodeValue);
  if (n.nodeType === 8) return `<!--${n.nodeValue}-->`;
  if (n.nodeType !== 1) return n.childNodes.map(serialize).join("");
  const attrs = [...n._attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
  if (VOID.has(n.localName) && !n._foreign) return `<${n.localName}${attrs}>`;
  return `<${n.localName}${attrs}>${n.childNodes.map(serialize).join("")}</${n.localName}>`;
}

/* ---------------- parser ---------------- */

function parseInto(doc, root, html) {
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const foreignCtx = () => stack.some((e) => e._foreign) ;
  const closeTo = (name) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].localName === name) { stack.length = k; return true; }
      if (stack[k] === root) break;
    }
    return false;
  };
  const inScope = (name, stopAt) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].localName === name) return true;
      if (stopAt.includes(stack[k].localName)) return false;
    }
    return false;
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0 || lt > i) {
      const end = lt < 0 ? n : lt;
      top().appendChild(doc.createTextNode(decode(html.slice(i, end))));
      i = end;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const e = html.indexOf("-->", i + 4);
      const stop = e < 0 ? n : e;
      top().appendChild(new Comment(doc, html.slice(i + 4, stop)));
      i = stop + 3;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") { const e = html.indexOf(">", i); i = e < 0 ? n : e + 1; continue; }
    if (html[i + 1] === "/") {
      const e = html.indexOf(">", i);
      const name = html.slice(i + 2, e < 0 ? n : e).trim().toLowerCase();
      i = e < 0 ? n : e + 1;
      if (name === "p" && !inScope("p", ["div", "section", "article", "li", "td", "th", "blockquote", "main"])) {
        top().appendChild(doc.createElement("p"));
        continue;
      }
      closeTo(name);
      continue;
    }
    const m = /^<([a-zA-Z][\w:.-]*)/.exec(html.slice(i, i + 200));
    if (!m) { top().appendChild(doc.createTextNode("<")); i++; continue; }
    const name = m[1].toLowerCase();
    i += m[0].length;
    const attrs = [];
    let selfClose = false;
    for (;;) {
      while (i < n && /\s/.test(html[i])) i++;
      if (html[i] === ">") { i++; break; }
      if (html.startsWith("/>", i)) { selfClose = true; i += 2; break; }
      if (i >= n) break;
      const am = /^([^\s"'>/=]+)/.exec(html.slice(i));
      if (!am) { i++; continue; }
      i += am[1].length;
      while (i < n && /\s/.test(html[i])) i++;
      let val = "";
      if (html[i] === "=") {
        i++;
        while (i < n && /\s/.test(html[i])) i++;
        const q = html[i];
        if (q === '"' || q === "'") {
          const e = html.indexOf(q, i + 1);
          val = html.slice(i + 1, e < 0 ? n : e);
          i = e < 0 ? n : e + 1;
        } else {
          const vm = /^[^\s>]*/.exec(html.slice(i));
          val = vm[0]; i += val.length;
        }
      }
      attrs.push([am[1].toLowerCase(), decode(val)]);
    }
    // implied end tags
    if (CLOSES_P.has(name) && inScope("p", ["div", "section", "article", "li", "td", "th", "blockquote", "main", "button"])) closeTo("p");
    if (name === "li" && inScope("li", ["ul", "ol"])) closeTo("li");
    if ((name === "dt" || name === "dd") && (inScope("dt", ["dl"]) || inScope("dd", ["dl"]))) { closeTo("dt") || closeTo("dd"); }
    if ((name === "td" || name === "th") && (inScope("td", ["tr", "table"]) || inScope("th", ["tr", "table"]))) { closeTo("td") || closeTo("th"); }
    if (name === "tr" && inScope("tr", ["table"])) closeTo("tr");
    if (name === "option" && top().localName === "option") closeTo("option");

    const foreign = name === "svg" || name === "math" || (foreignCtx() && name !== "foreignobject");
    const el = new Element(doc, name, foreign);
    for (const [k, v] of attrs) el._attrs.set(k, v);
    top().appendChild(el);
    if (RAW.has(name) && !selfClose) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      const end = close < 0 ? n : close;
      let raw = html.slice(i, end);
      if (name === "textarea" || name === "title") raw = decode(raw);
      if (name === "textarea") raw = raw.replace(/^\n/, "");
      if (raw) el.appendChild(doc.createTextNode(raw));
      const gt = html.indexOf(">", end);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (name === "pre" && html[i] === "\n") i++; // HTML drops a leading newline in <pre>
    if (!selfClose && !(VOID.has(name) && !foreign)) stack.push(el);
  }
}

/* ---------------- document / window ---------------- */

class Range {
  constructor(doc) { this._doc = doc; this.startContainer = doc; this.collapsed = true; }
  selectNodeContents(n) { this.startContainer = n; this.endContainer = n; this.collapsed = false; }
  selectNode(n) { this.selectNodeContents(n); }
  collapse() { this.collapsed = true; }
  toString() { return this.startContainer.textContent || ""; }
  deleteContents() { if (this.startContainer.nodeType === 1) this.startContainer.textContent = ""; }
  insertNode(n) { this.startContainer.appendChild(n); }
  // Union of the innermost boxed descendants — "where is the text
  // actually painted", which is what textBox() in adapters.js reads.
  getBoundingClientRect() {
    const node = this.startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.querySelectorAll) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    const list = (el.getAttribute("data-box") ? [el] : []).concat(el.querySelectorAll("[data-box]"));
    if (!list.length) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    const inner = list.filter((x) => !list.some((y) => y !== x && x.contains(y)));
    const rs = inner.map((x) => x.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left)), right = Math.max(...rs.map((r) => r.right));
    const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
}

class Document extends Node {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.nodeName = "#document";
    this.activeElement = null;
    this._ranges = [];
  }
  get documentElement() { return this.children.find((c) => c.localName === "html") || null; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get head() { return this.documentElement?.children.find((c) => c.localName === "head") || null; }
  get body() { return this.documentElement?.children.find((c) => c.localName === "body") || null; }
  get title() { return (this.querySelector("title")?.textContent || "").trim(); }
  set title(v) { let t = this.querySelector("title"); if (!t) { t = this.createElement("title"); this.head.appendChild(t); } t.textContent = v; }
  createElement(t) { return new Element(this, t, false); }
  createElementNS(_, t) { return new Element(this, t, true); }
  createTextNode(v) { return new Text(this, String(v)); }
  createComment(v) { return new Comment(this, String(v)); }
  createDocumentFragment() { const f = new Node(this); f.nodeType = 11; f.nodeName = "#document-fragment"; return f; }
  createRange() { return new Range(this); }
  getElementById(id) { return queryAll(this, `[id="${String(id).replace(/"/g, '\\"')}"]`)[0] || null; }
  querySelector(s) { return queryAll(this, s)[0] || null; }
  querySelectorAll(s) { return queryAll(this, s); }
  getSelection() {
    const d = this;
    return {
      get rangeCount() { return d._ranges.length; },
      removeAllRanges() { d._ranges = []; },
      addRange(r) { d._ranges.push(r); },
      getRangeAt(i) { return d._ranges[i]; },
      toString() { return d._ranges.map(String).join(""); },
    };
  }
  // execCommand("insertText") replaces the current selection inside an
  // editable host and fires beforeinput/input, like Chrome does. An
  // editor may cancel beforeinput (ProseMirror does) — then nothing is
  // inserted and the command reports false.
  execCommand(cmd, _ui, value) {
    if (cmd !== "insertText") return false;
    const r = this._ranges[this._ranges.length - 1];
    const host = r?.startContainer;
    if (!host || host.nodeType !== 1 || !host.isContentEditable) return false;
    const W = this.defaultView;
    const before = new W.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: value });
    if (!host.dispatchEvent(before)) return false;
    host.textContent = "";
    for (const line of String(value).split("\n")) {
      const p = this.createElement("p");
      if (line) p.textContent = line; else p.appendChild(this.createElement("br"));
      host.appendChild(p);
    }
    host.dispatchEvent(new W.InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    return true;
  }
  get readyState() { return "complete"; }
}

function makeEvents() {
  class Event {
    constructor(type, o = {}) { this.type = type; this.bubbles = !!o.bubbles; this.cancelable = !!o.cancelable; this.defaultPrevented = false; this.target = null; Object.assign(this, o, { type }); }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this._stop = true; }
    stopImmediatePropagation() { this._stop = true; }
  }
  class UIEvent extends Event {}
  class MouseEvent extends UIEvent {}
  class PointerEvent extends MouseEvent {}
  class KeyboardEvent extends UIEvent {}
  class InputEvent extends UIEvent {}
  class FocusEvent extends UIEvent {}
  class ClipboardEvent extends Event {}
  class CustomEvent extends Event {}
  class DataTransfer {
    constructor() { this._d = {}; }
    setData(t, v) { this._d[t] = String(v); }
    getData(t) { return this._d[t] || ""; }
  }
  return { Event, UIEvent, MouseEvent, PointerEvent, KeyboardEvent, InputEvent, FocusEvent, ClipboardEvent, CustomEvent, DataTransfer };
}

/**
 * Build a window around an HTML string.
 * @param {string} html  full document or a body fragment
 * @param {{url?: string, title?: string}} [opts]
 */
function createWindow(html = "", { url = "https://example.test/", title = "" } = {}) {
  const doc = new Document();
  const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><title>${escText(title)}</title></head><body>${html}</body></html>`;
  parseInto(doc, doc, full);
  if (!doc.documentElement) doc.appendChild(doc.createElement("html"));
  const htmlEl = doc.documentElement;
  if (!doc.head) htmlEl.insertBefore(doc.createElement("head"), htmlEl.firstChild);
  if (!doc.body) htmlEl.appendChild(doc.createElement("body"));
  // Stray top-level content after </body> belongs in body.
  for (const c of htmlEl.childNodes.slice()) if (c !== doc.head && c !== doc.body && c.nodeType === 1) doc.body.appendChild(c);
  doc.activeElement = doc.body;

  const loc = new URL(url);
  const window = {
    document: doc,
    location: loc,
    Node, Element, HTMLElement: Element, Text, Document, Range,
    URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, console,
    TextEncoder, TextDecoder, structuredClone, Promise,
    innerHeight: 900, innerWidth: 1280, scrollY: 0,
    navigator: { userAgent: "node-dom", language: "en", clipboard: { writeText: async () => {} } },
    getComputedStyle: (el) => ({
      overflowY: (/overflow(-y)?\s*:\s*(auto|scroll|overlay)/i.exec(el.getAttribute?.("style") || "") || [])[2] || "visible",
      display: el._displayNone?.() ? "none" : "block",
      visibility: "visible",
      opacity: "1",
      getPropertyValue() { return ""; },
    }),
    scrollTo() {},
    getSelection: () => doc.getSelection(),
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    _ls: {},
    addEventListener(t, fn) { (this._ls[t] ||= []).push(fn); },
    removeEventListener() {},
    dispatchEvent(ev) { for (const fn of this._ls[ev.type] || []) fn(ev); return true; },
    ...makeEvents(),
  };
  window.window = window.self = window.globalThis = window;
  doc.defaultView = window;
  /**
   * Run browser-style script source with this window as its globals —
   * top-level `const X =` declarations are pinned to the window so
   * separate files can see each other, as they do in a content script.
   */
  window.eval = (src) => {
    const keys = Object.keys(window).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "eval");
    const body = src.replace(/^const (Chat\w+) =/gm, "window.$1 =");
    // eslint-disable-next-line no-new-func
    return new Function(...keys, `"use strict";\n${body}`).apply(window, keys.map((k) => window[k]));
  };
  return window;
}

module.exports = { createWindow, parseSelectorList };
