import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('canonical URL dedup retains distinct opportunities with identical titles', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-dedup-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const engine = fs.existsSync(path.join(base, 'dedup_leads.mjs')) ? base : path.join(base, 'SelfEvolvingArchitectureClaude');
  fs.copyFileSync(path.join(engine, 'dedup_leads.mjs'), path.join(root, 'dedup_leads.mjs'));
  fs.mkdirSync(path.join(root, 'leads/rejected'), {recursive:true});
  const lead = (url, date) => '# Candidate\n- **Canonical URL:** ' + url + '\n- **Fit assessed:** ' + date + '\n';
  fs.writeFileSync(path.join(root, 'leads/first.md'), lead('https://example.org/candidates/one', '2026-10-27'));
  fs.writeFileSync(path.join(root, 'leads/old.md'), lead('https://example.org/candidates/one?utm_source=feed', '2026-10-20'));
  fs.writeFileSync(path.join(root, 'leads/other.md'), lead('https://example.org/candidates/two', '2026-10-27'));
  fs.writeFileSync(path.join(root, 'leads/screened.md'), '');
  cp.execFileSync(process.execPath, ['dedup_leads.mjs'], {cwd:root});
  assert.equal(fs.existsSync(path.join(root, 'leads/first.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'leads/other.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'leads/old.md')), false);
  assert.match(fs.readFileSync(path.join(root, 'leads/rejected/old.md'), 'utf8'), /Rejection Reason/);
  assert.equal(fs.readFileSync(path.join(root, 'leads/seen_urls.txt'), 'utf8').trim().split('\n').length, 2);
});
