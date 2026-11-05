/* The scenario scripts that predate the node:test suite (run.js … run5.js):
   the Outlier role bug, the headless engine + clipboard fallback, replay
   range / resume / two tabs at once, the search extractor, the popup.
   Each is a standalone script that exits non-zero on any ✗. */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const f of ["run.js", "run2.js", "run3.js", "run4.js", "run5.js"]) {
  test(f, () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8", timeout: 120000 });
    assert.equal(r.status, 0, (r.stdout || "").split("\n").filter((l) => /✗|Error/.test(l)).join("\n") + (r.stderr || ""));
  });
}
