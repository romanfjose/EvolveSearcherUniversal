import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from '../src/cu-engine.mjs';
import { render } from '../bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('docs/index.html');
const readme = read('README.md');

test('README benchmark tables are exactly what `npm run bench` prints', () => {
  const block = readme.match(/<!-- bench:start -->\n([\s\S]*?)\n<!-- bench:end -->/);
  assert.ok(block, 'README is missing the bench markers');
  assert.equal(block[1].trim(), render().trim());
});

test('simulator imports only names the engine exports', () => {
  const imported = html.match(/import \{([\s\S]*?)\} from '\.\.\/src\/cu-engine\.mjs'/)[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of imported) assert.ok(name in engine, `${name} is not exported`);
});

test('simulator is zero-dependency: no external scripts, styles or fetches', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)=["']https?:/i);
  assert.doesNotMatch(html, /fetch\(|import\(['"]https?:/);
});

test('simulator declares light and dark tokens and a body background', () => {
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /body \{[^}]*background: var\(--bg\)/);
});

test('every relative link in the README resolves to a file', () => {
  for (const [, href] of readme.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, href.split('#')[0])), href);
  }
});
