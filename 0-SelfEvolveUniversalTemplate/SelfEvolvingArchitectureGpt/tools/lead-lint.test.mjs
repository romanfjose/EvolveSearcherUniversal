import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintLeads } from './lead-lint.mjs';
test('counts tiers, excludes ledger, detects unknown/unsourced gates without moving files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-lint-'));
 try {
  fs.writeFileSync(path.join(dir,'screened.md'),'ledger');
  fs.writeFileSync(path.join(dir,'missing.md'),'- **Status:** Verify\n');
  fs.writeFileSync(path.join(dir,'all.md'),'- **Status:** Try-worthy\n- **Gates:** G1 pass; G2 pass; G3 pass; G4 pass\n');
  const before=fs.readdirSync(dir), r=lintLeads(dir);
  assert.equal(r.leads,2); assert.equal(r.tiers.try_worthy,1); assert.equal(r.tiers.ready,0);
  assert.equal(r.rows[0].gates,0); assert.equal(r.rows[1].gates,4);
  assert.ok(r.rows[0].flags.includes('STALE_GRADE')); assert.ok(r.regate_needed.includes('missing.md'));
  assert.deepEqual(fs.readdirSync(dir),before);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('quoted per-gate evidence removes stale flags and failing gates never become closable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-lint-'));
 try {
  const text='- **Status:** Verify\n- **Gates:** G1 pass; G2 pass; G3 unknown; G4 unknown\nG1 [verified: https://example.org/candidate "current source"]\nG2 [verified: https://example.org/candidate "documented benefit"]\n';
  fs.writeFileSync(path.join(dir,'a.md'),text);
  let r=lintLeads(dir); assert.deepEqual(r.rows[0].flags,['CLOSABLE']);
  fs.writeFileSync(path.join(dir,'a.md'),text.replace('G3 unknown','G3 fail'));
  r=lintLeads(dir); assert.ok(!r.rows[0].flags.includes('CLOSABLE'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('expired fully sourced shelf entries are queued for review without moving files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-deadlines-'));
 try {
  const evidence=[1,2,3,4].map(n=>'G'+n+' [verified: https://example.org/candidate "source evidence"]').join('\n');
  const dossier='- **Status:** Ready\n- **Gates:** G1 pass; G2 pass; G3 pass; G4 pass\n'+evidence+'\n- **Deadline:** ';
  fs.writeFileSync(path.join(dir,'past.md'),dossier+'2000-01-01');
  fs.writeFileSync(path.join(dir,'future.md'),dossier+'2999-01-01');
  const r=lintLeads(dir);
  assert.deepEqual(r.regate_needed,['past.md']);
  assert.deepEqual(r.rows.find(row=>row.file==='past.md').flags,['DEADLINE_PAST_REVIEW']);
  assert.deepEqual(fs.readdirSync(dir).sort(),['future.md','past.md']);
  assert.match(fs.readFileSync(path.join(dir,'past.md'),'utf8'),/Status:\*\* Ready/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
