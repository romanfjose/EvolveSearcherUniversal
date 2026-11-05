import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildStandalone, stripModuleSyntax, OUTPUT } from "../scripts/build-standalone.mjs";

const html = await buildStandalone();
const script = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

test("docs/index.html is in sync with src/ (run `npm run build:standalone` if this fails)", async () => {
  assert.equal(await readFile(OUTPUT, "utf8"), html);
});

test("standalone page is self-contained: no external scripts, styles, fonts or fetches", () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|@import|url\(http/i);
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|WebSocket|import\(/);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
});

test("inlined bundle is valid classic-script JavaScript with no module syntax left", () => {
  assert.doesNotThrow(() => new vm.Script(script, { filename: "docs/index.html" }));
  assert.doesNotMatch(script, /^\s*(import|export)\b/m);
});

test("stripModuleSyntax unwraps exports and refuses unsupported forms", () => {
  assert.equal(stripModuleSyntax('import { a } from "./a.mjs";\nexport const b = 1;\nexport function c() {}\n'), "const b = 1;\nfunction c() {}\n");
  assert.throws(() => stripModuleSyntax("export { a };"), /unsupported/);
  assert.throws(() => stripModuleSyntax("export default 1;"), /unsupported/);
});

test("bundle boots against a minimal DOM and renders the start screen with all five domains", () => {
  const listeners = {};
  const root = { innerHTML: "", addEventListener: (type, fn) => { listeners[type] = fn; }, querySelector: () => null };
  const store = new Map();
  const context = {
    document: { getElementById: () => root },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    window: { scrollTo() {} },
    Date, JSON, Math, Number, String, Object, Array, Map, Set, RegExp, Error, TypeError, RangeError, Boolean, FormData: class {},
  };
  vm.runInNewContext(script, context);
  assert.match(root.innerHTML, /What do you want to get better at/);
  assert.equal(root.innerHTML.match(/data-act="example"/g).length, 5);
  assert.deepEqual(Object.keys(listeners).sort(), ["change", "click", "input", "submit"]);
});
