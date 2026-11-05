import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mirror, sampleTemplate } from '../scripts/sync-docs.mjs';

const require = createRequire(import.meta.url);
const core = require('../squad-core.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('docs/index.html is the canonical app, re-pointed one level up (run `npm run docs` if this fails)', () => {
  assert.equal(read('docs/index.html'), mirror(read('index.html')));
});

test('every local asset referenced by both pages exists', () => {
  for (const page of ['index.html', 'docs/index.html']) {
    for (const [, ref] of read(page).matchAll(/\b(?:src|href)="(?!https?:|#|data:)([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, path.dirname(page), ref)), `${page} → ${ref}`);
    }
  }
});

test('the app is zero-dependency: no third-party scripts or styles', () => {
  assert.doesNotMatch(read('index.html'), /<(script|link)[^>]+(src|href)="https?:/i);
});

test('docs/war-room.squad.json is a valid, current, replayable template (run `npm run docs` if this fails)', () => {
  const file = JSON.parse(read('docs/war-room.squad.json'));
  assert.deepEqual(file, sampleTemplate());
  const parsed = core.parseSquadTemplate(file);
  assert.equal(parsed.ok, true, parsed.errors?.join());
  assert.equal(parsed.template.transcript.at(-1).kind, 'memo');
});

test('every relative link in the README resolves', () => {
  for (const [, href] of read('README.md').matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, href.split('#')[0])), href);
  }
});
