import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-guard-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // Engine tests use their own guard; the parent suite uses the Claude copy.
  const guard = fs.existsSync(path.join(engine, 'tools/architecture-guard.mjs'))
    ? path.join(engine, 'tools/architecture-guard.mjs')
    : path.join(engine, 'SelfEvolvingArchitectureClaude/tools/architecture-guard.mjs');
  fs.mkdirSync(path.join(root, 'tools'), {recursive:true});
  fs.mkdirSync(path.join(root, 'prompts'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'scratch/.checkpoint/\n');
  fs.copyFileSync(guard, path.join(root, 'tools/architecture-guard.mjs'));
  for (const file of ['NorthStar.md', 'RecallCharter.md', 'prompts/05_assayer.md']) {
    fs.writeFileSync(path.join(root, file), '# Baseline RecallCharter.md\n');
  }
  const git = args => cp.execFileSync('git', args, {cwd:root, stdio:'pipe'});
  git(['init']); git(['add', '-A']);
  git(['-c', 'user.name=Template Test', '-c', 'user.email=template-test@example.invalid', 'commit', '-m', 'Fixture baseline']);
  const run = action => cp.spawnSync(process.execPath, ['tools/architecture-guard.mjs', action], {cwd:root, encoding:'utf8'});
  assert.equal(run('snapshot').status, 0);
  return {root, git, run};
}

test('Ring 0 stays protected after an attempted snapshot reset', t => {
  const {root, run} = fixture(t);
  fs.appendFileSync(path.join(root, 'NorthStar.md'), 'Unauthorized change\n');
  let result = run('verify');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RING_0_MODIFIED_SINCE_SNAPSHOT/);
  assert.equal(run('snapshot').status, 0);
  result = run('verify');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RING_0_MODIFIED_AGAINST_GIT_HEAD/);
});

test('full-tree rollback restores files and preserves new files in discarded storage', t => {
  const {root, run} = fixture(t);
  fs.writeFileSync(path.join(root, 'map.txt'), 'before');
  assert.equal(run('snapshot').status, 0);
  fs.writeFileSync(path.join(root, 'map.txt'), 'after');
  fs.writeFileSync(path.join(root, 'new.txt'), 'preserve me');
  assert.equal(run('rollback').status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'map.txt'), 'utf8'), 'before');
  assert.equal(fs.existsSync(path.join(root, 'new.txt')), false);
  const discarded = path.join(root, 'scratch/.checkpoint/discarded');
  assert.equal(fs.readFileSync(path.join(discarded, fs.readdirSync(discarded)[0], 'new.txt'), 'utf8'), 'preserve me');
  assert.equal(run('verify').status, 0);
});

test('line caps and malformed scripts fail verification', t => {
  const {root, run} = fixture(t);
  fs.writeFileSync(path.join(root, 'prompts/extra.md'), 'line\n'.repeat(100));
  fs.writeFileSync(path.join(root, 'tools/broken.mjs'), 'export const = ;');
  const result = run('verify');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LINE_CAP_EXCEEDED/);
  assert.match(result.stderr, /SYNTAX_ERROR/);
});
