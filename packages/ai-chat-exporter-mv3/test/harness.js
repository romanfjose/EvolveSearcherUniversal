/* Headless harness: load the extension's own files into a page built by
   the zero-dependency DOM in ./dom.js and hand back its window.
   Geometry comes from data-box="left,top,width,height" (see dom.js). */

const fs = require("fs");
const path = require("path");
const { createWindow } = require("./dom");

const ROOT = path.join(__dirname, "..");
const SRC = {};
const read = (f) => (SRC[f] ||= fs.readFileSync(path.join(ROOT, f), "utf8"));

/**
 * @param {string} bodyHtml
 * @param {{url?: string, title?: string, files?: string[]}} [opts]
 */
function boot(bodyHtml, { url = "https://playground.outlier.ai/conversation/abc", title = "Outlier Playground", files = ["md.js", "adapters.js"] } = {}) {
  const window = createWindow(bodyHtml, { url, title });
  for (const f of files) window.eval(read(f));
  return window;
}

module.exports = { boot, read, ROOT };
