import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ENGINES,
  discoverLanes,
  canonicalURL,
  groupLeads,
  field,
  safeFile,
  readLeads,
  readLeadsWithDiagnostics,
  buildPrompt,
  buildNeighborPrompt,
  buildNeighborApplyPrompt,
  buildNeighborOnePassPrompt,
  iterationCount,
} from './data.mjs';
import { buildDashboardPayload, createDashboardServer } from './serve.mjs';

test('one shared row retains all independent assessments within the same lane, never across different lanes', () => {
  const leads = [
    { lane: 'LaneA', project: 'claude', id: 'a.md', title: 'Event one', url: 'https://www.example.com/events/one/?utm_source=a', fit: 60, status: 'Verify' },
    { lane: 'LaneA', project: 'gemini', id: 'b.md', title: 'Different wording', url: 'http://example.com/events/one', fit: 90, status: 'Ready' },
    { lane: 'LaneA', project: 'gpt', id: 'c.md', title: 'Third assessment', url: 'https://example.com/events/one#rules', fit: 20, rejected: true },
    { lane: 'LaneB', project: 'claude', id: 'd.md', title: 'Same URL in another lane', url: 'https://example.com/events/one', fit: 80, status: 'Ready' },
  ];
  const grouped = groupLeads(leads);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0].entries, leads.slice(0, 3));
  assert.deepEqual(grouped[1].entries, [leads[3]]);
  assert.equal(canonicalURL('https://example.com/event?id=1'), 'example.com/event?id=1');
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-hub-ui-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const laneDir = path.join(root, 'SelfEvolveTestLane');
  for (const p of ENGINES) {
    for (const dir of ['prompts', 'leads', 'leads/rejected', 'pipeline/0-profile']) {
      fs.mkdirSync(path.join(laneDir, p.directory, dir), { recursive: true });
    }
    for (const file of ['NorthStar.md', 'RecallCharter.md', 'CommanderKnowledge.md', 'pipeline/0-profile/PROFILE.md']) {
      fs.writeFileSync(path.join(laneDir, p.directory, file), '# User-approved policy\n');
    }
    fs.writeFileSync(
      path.join(laneDir, p.directory, 'SearchLocationsList.md'),
      '| source | Publisher | Active (Exploring) | Unstarted |\n'
    );
    fs.writeFileSync(
      path.join(laneDir, p.directory, 'prompts/15_autoloop.md'),
      '# Role: Self-Evolving AutoLoop Coordinator\nRun for **N iterations** (default **3**).\n- Working directory is `./` (profile).\n## Loop Workflow (Repeat for Iteration `i = 1..N`)\n## Final Commander Delivery (After Iteration `N`)\n'
    );
    fs.writeFileSync(
      path.join(laneDir, p.directory, 'leads/one.md'),
      '# Opportunity One\n- **Status:** Verify\n- **Fit %:** 80%\n- **Canonical URL:** https://example.org/opportunities/one\n'
    );
    fs.writeFileSync(path.join(laneDir, p.directory, 'leads/screened.md'), '# Screening ledger\n');
    fs.writeFileSync(path.join(laneDir, p.directory, 'leads/seen_urls.txt'), 'https://example.org/seen\n');
    fs.writeFileSync(path.join(laneDir, p.directory, 'leads/ats_scanned.txt'), '2026-10-29 ashby linear\n');
  }
  return { root, laneDir };
}

test('dynamic lane discovery, read-only lead parsing, and format diagnostics work cleanly', t => {
  const { root, laneDir } = fixture(t);
  const lanes = discoverLanes(root);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].id, 'SelfEvolveTestLane');
  assert.equal(lanes[0].isTemplate, false);

  // Add an ungraded Verify scout dossier (valid), a Try-worthy dossier missing Fit % (flagged),
  // a malformed lead, and an unexpected non-md file in claude leads/
  const claudeLeads = path.join(laneDir, ENGINES[0].directory, 'leads');
  fs.writeFileSync(
    path.join(claudeLeads, 'ungraded-verify.md'),
    '# Scout Verify Dossier\n- **Status:** Verify\n- **Opportunity ID:** scout-verify-1\n- **Official event:** https://example.org/jobs/1\n'
  );
  fs.writeFileSync(
    path.join(claudeLeads, 'missing-fit-ready.md'),
    '# Ready Dossier Missing Fit\n- **Status:** Ready\n- **Official event:** https://example.org/jobs/2\n'
  );
  fs.writeFileSync(path.join(claudeLeads, 'weird.md'), 'No heading, no status, no fit, no url\n');
  fs.writeFileSync(path.join(claudeLeads, 'unexpected.json'), '{"hello":"world"}');

  const diag = readLeadsWithDiagnostics(laneDir, ENGINES[0], 'SelfEvolveTestLane');
  assert.equal(diag.leads.length, 4); // one.md, ungraded-verify.md, missing-fit-ready.md, and weird.md surfaced
  const ungradedVerify = diag.leads.find(l => l.id === 'leads/ungraded-verify.md');
  assert.equal(ungradedVerify.fit, null);
  assert.deepEqual(ungradedVerify.formatIssues, []);
  assert.equal(diag.formatErrors.length, 3); // unexpected.json + missing-fit-ready.md + weird.md flagged

  const payload = buildDashboardPayload(root);
  assert.equal(payload.formatErrors.length, 3);
  assert.throws(() => safeFile(laneDir, ENGINES[0], '../SelfEvolvingArchitectureGpt/leads/one.md'), /outside project/);
});

test('SelfEvolve prompt builder validates iterations, refuses unpersonalized templates, and never modifies project files', t => {
  const { root, laneDir } = fixture(t);
  for (const invalid of [0, -1, 1.5, '2', NaN, 1001]) assert.throws(() => iterationCount(invalid));
  const promptPath = path.join(laneDir, ENGINES[0].directory, 'prompts/15_autoloop.md');
  const original = fs.readFileSync(promptPath, 'utf8');
  const prompt = buildPrompt(root, 'SelfEvolveTestLane', ENGINES[0], 4);
  assert.doesNotMatch(prompt, /Commander runtime instruction/);
  assert.match(prompt, /for \*\*4 iterations\*\*/);
  assert.match(prompt, /Iteration `i = 1\.\.4`/);
  assert.match(prompt, /After Iteration `4`/);
  assert.ok(prompt.includes(`Working directory is \`${path.join(laneDir, ENGINES[0].directory)}\``));
  assert.equal(fs.readFileSync(promptPath, 'utf8'), original);

  // Unpersonalized template check
  fs.writeFileSync(path.join(laneDir, ENGINES[0].directory, 'NorthStar.md'), '# {{LANE_NAME}}');
  assert.throws(() => buildPrompt(root, 'SelfEvolveTestLane', ENGINES[0], 1), /Personalize/);
});

test('HTTP server is strictly read-only and rejects non-GET requests', async t => {
  const { root } = fixture(t);
  const server = createDashboardServer(root, 0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;

  const getRes = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.equal(data.lanes.length, 1);

  const postRes = await fetch(`http://127.0.0.1:${port}/api/dashboard`, { method: 'POST' });
  assert.equal(postRes.status, 405);
});

test('neighbor peek prompt authorizes read-only learning of siblings only, and never touches projects', async t => {
  const { root, laneDir } = fixture(t);
  const snapshot = () => ENGINES.map(p => fs.readdirSync(path.join(laneDir, p.directory), { recursive: true }).join('|')).join('\n');
  const before = snapshot();
  const gemini = ENGINES.find(p => p.id === 'gemini');
  const prompt = buildNeighborPrompt(root, 'SelfEvolveTestLane', gemini);
  assert.ok(prompt.includes(path.join(laneDir, 'SelfEvolvingArchitectureClaude')));
  assert.ok(prompt.includes(path.join(laneDir, 'SelfEvolvingArchitectureGpt')));
  assert.ok(prompt.includes(`Your working directory is \`${path.join(laneDir, gemini.directory)}\``));
  assert.ok(!prompt.includes(`\`${path.join(laneDir, gemini.directory)}\`\n- `), 'own folder is not listed as a neighbor');
  assert.match(prompt, /Read-only on the neighbors/);
  assert.match(prompt, /No stealing leads/);
  assert.match(prompt, /Before you peek, explain yourself/);
  assert.match(prompt, /Stress-test your own explanations/);
  assert.match(prompt, /ambiguity and conflict/);
  assert.match(prompt, /Divergent reading/);
  assert.ok(!/better|ahead|outperform/i.test(prompt.match(/## What to do[\s\S]*?## Report/)[0].replace(/a neighbor producing more is not proof[^.]*\./i,'').replace(/Decide on evidence, not on who is ahead\./,'')), 'prompt must not hint that any neighbor is better');
  assert.match(prompt, /Leave no trace in your own project/);
  assert.match(prompt, /One-time/);
  assert.equal(snapshot(), before);

  // Works for unpersonalized templates too, and rejects a lane with no siblings.
  fs.writeFileSync(path.join(laneDir, gemini.directory, 'NorthStar.md'), '# {{LANE_NAME}}');
  assert.doesNotThrow(() => buildNeighborPrompt(root, 'SelfEvolveTestLane', gemini));
  fs.rmSync(path.join(laneDir, 'SelfEvolvingArchitectureClaude'), { recursive: true });
  fs.rmSync(path.join(laneDir, 'SelfEvolvingArchitectureGpt'), { recursive: true });
  assert.throws(() => buildNeighborPrompt(root, 'SelfEvolveTestLane', gemini), /No neighbor/);

  // The HTTP route surfaces the "no neighbors" error cleanly.
  const server = createDashboardServer(root, 0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/neighbor-prompt?lane=SelfEvolveTestLane&project=gemini`);
  assert.equal(res.status, 400);
});

test('apply prompt (phase 2) stays inside the own project, respects protected files, and never names the neighbors', t => {
  const { root, laneDir } = fixture(t);
  const before = ENGINES.map(p => fs.readdirSync(path.join(laneDir, p.directory), { recursive: true }).join('|')).join('\n');
  const claude = ENGINES.find(p => p.id === 'claude');
  const prompt = buildNeighborApplyPrompt(root, 'SelfEvolveTestLane', claude);
  assert.ok(prompt.includes(`Your working directory is \`${path.join(laneDir, claude.directory)}\``));
  assert.match(prompt, /Untouchable files stay untouched/);
  assert.match(prompt, /Requests for the Commander/);
  assert.match(prompt, /DecisionBoard\.md/);
  assert.match(prompt, /exact proposed wording/);
  assert.match(prompt, /must not name or hint at the neighbors/);
  assert.match(prompt, /never edit or remove other entries/);
  assert.match(prompt, /Your rules beat the report/);
  assert.match(prompt, /Do not open the neighbors again/);
  assert.match(prompt, /Leave no trace/);
  assert.match(prompt, /Divergent reading/);
  for (const other of ENGINES.filter(p => p.id !== claude.id)) {
    assert.ok(!prompt.includes(other.directory), `must not reference ${other.directory}`);
    assert.ok(!prompt.includes(other.name), `must not name ${other.name}`);
  }
  assert.match(buildNeighborPrompt(root, 'SelfEvolveTestLane', claude), /Do not implement anything yet/);
  assert.equal(ENGINES.map(p => fs.readdirSync(path.join(laneDir, p.directory), { recursive: true }).join('|')).join('\n'), before);
  assert.throws(() => buildNeighborApplyPrompt(root, 'Nope', claude), /Unknown project lane|Invalid/);
});

test('one-pass prompt splits Peeker from Implementer, gates unreviewed changes, and keeps phase 2 safeguards', async t => {
  const { root, laneDir } = fixture(t);
  const snapshot = () => ENGINES.map(p => fs.readdirSync(path.join(laneDir, p.directory), { recursive: true }).join('|')).join('\n');
  const before = snapshot();
  const gpt = ENGINES.find(p => p.id === 'gpt');
  const prompt = buildNeighborOnePassPrompt(root, 'SelfEvolveTestLane', gpt);
  assert.ok(prompt.includes(path.join(laneDir, 'SelfEvolvingArchitectureClaude')));
  assert.ok(prompt.includes(path.join(laneDir, 'SelfEvolvingArchitectureGemini')));
  assert.match(prompt, /\*\*Peeker:\*\* the only role allowed to open the neighbors/);
  assert.match(prompt, /It writes \*\*nothing\*\* anywhere/);
  assert.match(prompt, /you cannot copy what you never saw/);
  assert.match(prompt, /native subagent capability/);
  assert.match(prompt, /If your host has no subagents, play both roles yourself in sequence/);
  assert.match(prompt, /Do not hand these hypotheses to the Peeker/);
  assert.match(prompt, /Never implement a \*\*Divergent reading\*\*/);
  assert.match(prompt, /Do \*\*not\*\* implement \*Hadn't thought of\*/);
  assert.match(prompt, /Untouchable files stay untouched/);
  assert.match(prompt, /DecisionBoard\.md/);
  assert.match(prompt, /never edit or remove other entries/);
  assert.match(prompt, /Leave no trace in your own project/);
  assert.match(prompt, /rolls? it back|roll it back/);
  // phase 2 still carries the shared sections after the refactor
  const apply = buildNeighborApplyPrompt(root, 'SelfEvolveTestLane', gpt);
  assert.match(apply, /Untouchable files stay untouched/);
  assert.match(apply, /exact proposed wording/);
  assert.equal(snapshot(), before);

  const server = createDashboardServer(root, 0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const get = phase => fetch(`http://127.0.0.1:${server.address().port}/api/neighbor-prompt?lane=SelfEvolveTestLane&project=gpt&phase=${phase}`).then(r => r.json());
  assert.match((await get('both')).text, /Learn and Apply: one pass/);
  assert.match((await get('apply')).text, /Phase 2/);
  assert.match((await get('peek')).text, /Neighborhood Peek: one-time/);
});
