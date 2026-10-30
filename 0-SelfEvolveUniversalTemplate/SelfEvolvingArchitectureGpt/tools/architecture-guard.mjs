#!/usr/bin/env node
/**
 * Silicon Architecture Guard & Full-Tree Checkpoint Manager (`tools/architecture-guard.mjs`)
 * - Full-tree atomic snapshot & collision-safe rollback (`discarded/<timestamp>/`).
 * - Verifies Ring-0 immutability against both snapshot AND `git diff HEAD` (once committed).
 * - Enforces Die-Shrink line caps & rolling frontier limits without brittle byte-count ratchets or JSON sidecar bureaucracy.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.join(ROOT, 'scratch/.checkpoint');
const IMMUTABLE = ['NorthStar.md', 'RecallCharter.md', 'prompts/05_assayer.md', 'tools/architecture-guard.mjs'];
const CHARTER_READERS = ['01_mission_drafter', '02_harvester_scout', '05_assayer', '09_route_adjuster', '13_brainstorm'].map((n) => `prompts/${n}.md`);
const CAPS = {
  'CommanderKnowledge.md': 75,
  'ARCHITECT_BLUEPRINT.md': 95,
  'SearchLocationsList.md': 85,
  'ExperimentalSearchLocations.md': 65,
  'ExperimentalApproaches.md': 65,
  'next_map_recon.md': 65,
  'next_approach_recon.md': 65,
};
const MAX_SINGLE_PROMPT = 95;
const MAX_TOTAL_PROMPTS = 750;

const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const normHash = (abs) => hash(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
const read = (rel) => fs.readFileSync(inside(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function inside(base, rel) {
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('Path outside scope: ' + rel);
  return abs;
}

function inventory(dir = ROOT, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = prefix + e.name;
    if (e.name === '.git' || e.name === 'node_modules' || /^scratch\/\.checkpoint(?:\.|\/|$)/.test(rel)) return [];
    if (e.isSymbolicLink()) return [];
    return e.isDirectory() ? inventory(path.join(dir, e.name), rel + '/') : [rel];
  }).sort();
}

function metrics() {
  const files = inventory();
  const promptAndMapFiles = [...Object.keys(CAPS).filter(r => fs.existsSync(inside(ROOT, r))), ...files.filter(r => /^prompts\/.*\.md$/.test(r))];
  const dossier = (r) => /^leads\/(?:rejected\/)?[^/]+\.md$/.test(r) && r !== 'leads/screened.md';
  const leads = files.filter((r) => dossier(r) && !r.startsWith('leads/rejected/')).map(read);
  const ledger = fs.existsSync(inside(ROOT, 'leads/screened.md')) ? read('leads/screened.md') : '';
  return {
    context_bytes: promptAndMapFiles.reduce((n, r) => n + Buffer.byteLength(read(r)), 0),
    screened_titles: (ledger.match(/^\d{4}-\d{2}-\d{2} \|/gm) || []).length,
    filed: files.filter(dossier).length,
    try_worthy: leads.filter((t) => /^- \*\*Status:\*\*\s*Try-worthy\b/im.test(t)).length,
    ready_80_plus: leads.filter((t) => /^- \*\*Status:\*\*\s*Ready\b/im.test(t) && (parseInt((t.match(/^- \*\*Fit %:\*\*\s*(\d+)/im) || [])[1], 10) >= 80)).length,
    ready_total: leads.filter((t) => /^- \*\*Status:\*\*\s*Ready\b/im.test(t)).length,
    verify_pending: leads.filter((t) => /^- \*\*Status:\*\*\s*(Verify|Waiting on Commander)\b/im.test(t)).length,
    total_active_leads: leads.length,
  };
}

function snapshot() {
  const files = inventory(), staging = CHECKPOINT + '.next', old = CHECKPOINT + '.old';
  fs.rmSync(staging, { recursive: true, force: true });
  const manifest = { version: 3, timestamp: new Date().toISOString(), ring0: {}, files: {}, metrics: metrics() };

  for (const rel of IMMUTABLE) {
    if (fs.existsSync(inside(ROOT, rel))) manifest.ring0[rel] = normHash(inside(ROOT, rel));
  }

  for (const rel of files) {
    const data = fs.readFileSync(inside(ROOT, rel)), dest = inside(staging, 'files/' + rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    manifest.files[rel] = hash(data);
  }

  fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(CHECKPOINT)) fs.renameSync(CHECKPOINT, old);
  fs.renameSync(staging, CHECKPOINT);
  fs.rmSync(old, { recursive: true, force: true });
  return { ok: true, action: 'snapshot', files_backed_up: files.length, metrics: manifest.metrics };
}

function loadCheckpoint() {
  const p = path.join(CHECKPOINT, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function verify() {
  const m = loadCheckpoint(), errors = [], files = inventory();

  // 1. Check Ring-0 Immutability against snapshot AND against git HEAD
  for (const rel of IMMUTABLE) {
    const abs = inside(ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`RING_0_DELETED: ${rel}`);
      continue;
    }
    if (m?.ring0?.[rel] && normHash(abs) !== m.ring0[rel]) {
      errors.push(`RING_0_MODIFIED_SINCE_SNAPSHOT: ${rel}`);
    }
    const gitDiff = cp.spawnSync('git', ['diff', '--quiet', 'HEAD', '--', rel], { cwd: ROOT, timeout: 5000 });
    if (gitDiff.status === 1) {
      errors.push(`RING_0_MODIFIED_AGAINST_GIT_HEAD: ${rel}`);
    }
  }

  // 2. Prompts that must defer to RecallCharter.md (when present; allows merging/removing roles like 09_route_adjuster)
  for (const rel of CHARTER_READERS) {
    if (fs.existsSync(inside(ROOT, rel)) && !read(rel).includes('RecallCharter.md')) errors.push(`CHARTER_REFERENCE_MISSING: ${rel}`);
  }

  // 3. Check Config & Prompt Line Caps (Die-Shrink Guardrail)
  let promptLines = 0;
  for (const rel of [...Object.keys(CAPS), ...files.filter((r) => /^prompts\/.*\.md$/.test(r))]) {
    if (!fs.existsSync(inside(ROOT, rel))) continue;
    const lines = read(rel).split('\n').length;
    const cap = CAPS[rel] || MAX_SINGLE_PROMPT;
    if (lines > cap) errors.push(`LINE_CAP_EXCEEDED: ${rel} (${lines}/${cap} lines)`);
    if (rel.startsWith('prompts/')) promptLines += lines;
  }
  if (promptLines > MAX_TOTAL_PROMPTS) {
    errors.push(`TOTAL_PROMPT_CAP_EXCEEDED: ${promptLines}/${MAX_TOTAL_PROMPTS} lines`);
  }

  // 4. Check Rolling Frontier Caps (Max 12 Pending Items)
  for (const [rel, heading] of [['ExperimentalSearchLocations.md', 'Candidate Queue'], ['ExperimentalApproaches.md', 'Tactic Queue']]) {
    if (!fs.existsSync(inside(ROOT, rel))) continue;
    const queue = read(rel).split(new RegExp(`^## ${heading}.*$`, 'm'))[1]?.split(/^## /m)[0] || '';
    if ((queue.match(/^- /gm) || []).length > 12) errors.push(`PENDING_QUEUE_EXCEEDS_12: ${rel}`);
  }

  // 5. Verify all .mjs scripts compile cleanly
  for (const rel of files.filter((r) => r.endsWith('.mjs'))) {
    const res = cp.spawnSync(process.execPath, ['--check', inside(ROOT, rel)], { encoding: 'utf8', timeout: 10000 });
    if (res.status !== 0) errors.push(`SYNTAX_ERROR in ${rel}: ${(res.stderr || '').trim()}`);
  }

  const current = metrics();
  if (errors.length) throw new Error(errors.join('\n'));
  return { ok: true, action: 'verify', before: m?.metrics || null, after: current, prompt_lines: `${promptLines}/${MAX_TOTAL_PROMPTS}` };
}

function rollback() {
  const m = loadCheckpoint();
  if (!m?.files) throw new Error('No valid checkpoint found in scratch/.checkpoint/manifest.json');
  const stamp = String(Date.now());
  for (const rel of inventory().filter((r) => !Object.hasOwn(m.files, r))) {
    const dest = inside(CHECKPOINT, `discarded/${stamp}/${rel}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(inside(ROOT, rel), dest);
  }
  for (const rel of Object.keys(m.files)) {
    const dest = inside(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(inside(CHECKPOINT, 'files/' + rel), dest);
  }
  return { ok: true, action: 'rollback', restored_files: Object.keys(m.files).length, discarded_dir: `scratch/.checkpoint/discarded/${stamp}` };
}

try {
  const commands = { snapshot, verify, rollback, metrics };
  if (!commands[process.argv[2]]) throw new Error('Usage: node tools/architecture-guard.mjs <snapshot|verify|rollback|metrics>');
  console.log(JSON.stringify(commands[process.argv[2]](), null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
