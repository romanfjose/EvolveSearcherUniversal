import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CUSTOMIZATION_FILES, checkPersonalization, assertPersonalized } from './template-check.mjs';

test('missing or unresolved setup prevents discovery, and configured sources permit it', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-setup-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  assert.throws(() => assertPersonalized(root), /missing customization document/);
  for (const file of CUSTOMIZATION_FILES) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), {recursive:true});
    fs.writeFileSync(full, '# Configured user-approved policy\n');
  }
  fs.writeFileSync(path.join(root, 'NorthStar.md'), '# Lane {{LANE_NAME}}');
  let result = checkPersonalization(root);
  assert.ok(result.errors.some(e => e.includes('{{LANE_NAME}}')));
  assert.ok(result.errors.some(e => e.includes('Active sector')));
  fs.writeFileSync(path.join(root, 'NorthStar.md'), '# User-approved lane');
  fs.writeFileSync(path.join(root, 'SearchLocationsList.md'), '| source | Publisher | Active (Exploring) | Unstarted |');
  assert.deepEqual(assertPersonalized(root), {ok:true, errors:[]});
  fs.writeFileSync(path.join(root, 'pipeline/0-profile/PROFILE.md'), '');
  assert.throws(() => assertPersonalized(root), /empty customization document/);
});
