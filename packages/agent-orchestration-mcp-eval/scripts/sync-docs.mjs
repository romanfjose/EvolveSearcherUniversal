#!/usr/bin/env node
// Copies the pure policy modules from src/ into docs/lib/ so the Web Inspector runs the exact code the MCP server runs,
// also when docs/ is hosted as static files. `--check` exits 1 if any copy is missing or differs (used by the tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Browser-safe modules only: no node: imports. tools.mjs imports the other five.
export const LIB_MODULES = Object.freeze(['policy.mjs', 'evaluate.mjs', 'dossier.mjs', 'schema.mjs', 'tools.mjs', 'simulate.mjs']);
const SRC = path.join(ROOT, 'src');
const LIB = path.join(ROOT, 'docs', 'lib');

export function staleModules() {
  return LIB_MODULES.filter(name => {
    const dest = path.join(LIB, name);
    return !fs.existsSync(dest) || !fs.readFileSync(dest).equals(fs.readFileSync(path.join(SRC, name)));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) {
    const stale = staleModules();
    if (stale.length) {
      console.error(`docs/lib is out of date: ${stale.join(', ')}. Run npm run sync-docs.`);
      process.exit(1);
    }
    console.log(`docs/lib in sync (${LIB_MODULES.length} modules)`);
  } else {
    fs.mkdirSync(LIB, { recursive: true });
    for (const name of LIB_MODULES) fs.copyFileSync(path.join(SRC, name), path.join(LIB, name));
    console.log(`copied ${LIB_MODULES.length} modules to docs/lib`);
  }
}
