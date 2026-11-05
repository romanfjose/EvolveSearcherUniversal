/* Headless harness: load the extension's own files into a jsdom page and
   assert on what adapter.turns() / the markdown builder produce.
   jsdom has no layout engine, so we synthesise geometry from a data-box
   attribute on each element — enough to exercise the alignment logic. */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

function boot(bodyHtml, { url = "https://playground.outlier.ai/conversation/abc", title = "Outlier Playground" } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${bodyHtml}</body></html>`, {
    url, pretendToBeVisual: true, runScripts: "outside-only",
  });
  const { window } = dom;

  // --- synthetic layout -------------------------------------------------
  // data-box="left,top,width,height" on an element; anything without one
  // inherits its nearest boxed ancestor's width and a nominal height, so
  // wrappers are "visible" and Range measurement falls back sensibly.
  const boxOf = (el) => {
    let a = el;
    while (a && a.getAttribute) {
      const b = a.getAttribute("data-box");
      if (b) {
        const [left, top, width, height] = b.split(",").map(Number);
        return { left, top, width, height };
      }
      a = a.parentElement;
    }
    return { left: 0, top: 0, width: 800, height: 40 };
  };
  window.Element.prototype.getBoundingClientRect = function () {
    const own = this.getAttribute && this.getAttribute("data-box");
    const b = own
      ? (([l, t, w, h]) => ({ left: l, top: t, width: w, height: h }))(own.split(",").map(Number))
      : boxOf(this);
    return { ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top, toJSON() {} };
  };
  // Range.getBoundingClientRect = union of the boxed descendants, which is
  // exactly the "where is the text actually painted" signal the adapter wants.
  window.Range.prototype.getBoundingClientRect = function () {
    const node = this.startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const boxed = el && el.querySelectorAll ? Array.from(el.querySelectorAll("[data-box]")) : [];
    const list = (el && el.getAttribute && el.getAttribute("data-box") ? [el] : []).concat(boxed);
    if (!list.length) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    // innermost boxes only — that's what a text range actually covers
    const inner = list.filter((n) => !list.some((m) => m !== n && n.contains(m)));
    const rects = inner.map((n) => n.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  window.Element.prototype.checkVisibility = function () { return true; };
  // jsdom returns "" for innerText; the adapters lean on it heavily.
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() { return this.textContent; },
    set(v) { this.textContent = v; },
    configurable: true,
  });
  window.document.execCommand = () => true;

  for (const f of ["md.js", "adapters.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // In a content script all three files share one isolated-world scope,
    // so `const ChatReplayAdapters` is visible to content.js. Separate
    // eval() calls don't share a lexical env, so pin them to window here.
    window.eval(src.replace(/^const (ChatReplayMd|ChatReplayAdapters) =/m, "window.$1 ="));
  }
  return window;
}

module.exports = { boot };
