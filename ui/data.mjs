import fs from 'node:fs';
import path from 'node:path';

export const ENGINES = [
  { id: 'claude', name: 'Claude', directory: 'SelfEvolvingArchitectureClaude' },
  { id: 'gemini', name: 'Gemini', directory: 'SelfEvolvingArchitectureGemini' },
  { id: 'gpt', name: 'ChatGPT', directory: 'SelfEvolvingArchitectureGpt' },
];

// Backward-compatible alias for single-lane helpers
export const PROJECTS = ENGINES;

export const CUSTOMIZATION_FILES = [
  'NorthStar.md',
  'RecallCharter.md',
  'CommanderKnowledge.md',
  'pipeline/0-profile/PROFILE.md',
  'SearchLocationsList.md',
];

export function checkPersonalization(engineRoot) {
  const errors = [];
  for (const file of CUSTOMIZATION_FILES) {
    const full = path.join(engineRoot, file);
    if (!fs.existsSync(full)) {
      errors.push(`${file}: missing customization document`);
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    if (!text.trim()) errors.push(`${file}: empty customization document`);
    const fields = [...new Set(text.match(/\{\{[^{}]+\}\}/g) || [])];
    if (fields.length) errors.push(`${file}: unresolved placeholder(s) ${fields.join(', ')}`);
  }
  const sectors = path.join(engineRoot, 'SearchLocationsList.md');
  if (
    fs.existsSync(sectors) &&
    !/^\|[^\n]+\|\s*Active(?:\s*\([^\n|]*\))?\s*\|/m.test(fs.readFileSync(sectors, 'utf8'))
  ) {
    errors.push('SearchLocationsList.md: configure at least one Active sector');
  }
  return { ok: errors.length === 0, errors };
}

export function iterationCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new Error('Iterations must be a whole number from 1 to 1000');
  }
  return value;
}

export function buildPrompt(root, laneId, engine, iterations) {
  iterationCount(iterations);
  const laneDir = safeLaneDir(root, laneId);
  const cwd = path.join(laneDir, engine.directory);
  if (!fs.existsSync(cwd)) {
    throw new Error(`Engine directory missing: ${laneId}/${engine.directory}`);
  }
  const check = checkPersonalization(cwd);
  if (!check.ok) {
    throw new Error(`Personalize ${laneId} (${engine.name}) before SelfEvolve:\n` + check.errors.join('\n'));
  }
  const promptFile = path.join(cwd, 'prompts/15_autoloop.md');
  if (!fs.existsSync(promptFile)) {
    throw new Error(`Missing prompts/15_autoloop.md in ${laneId}/${engine.directory}`);
  }
  const raw = fs.readFileSync(promptFile, 'utf8');
  const label = `${iterations} ${iterations === 1 ? 'iteration' : 'iterations'}`;
  return raw
    .replace(/for \*\*N iterations\*\*(?:\s*\([^)]*\))?/gi, () => `for **${label}**`)
    .replace(/Working directory is `\.\/?`/g, () => `Working directory is \`${cwd}\``)
    .replace(/\bcounts toward N\b/g, () => `counts toward ${iterations}`)
    .replace(/Iteration `i = 1\.\.N`/g, () => `Iteration \`i = 1..${iterations}\``)
    .replace(/After Iteration `N`/g, () => `After Iteration \`${iterations}\``);
}

/**
 * "Learn from thy neighbors" prompt. Pasted into ONE engine's chat, it grants that engine a
 * one-time, read-only look at its sibling engines in the same lane, strictly to learn and compare.
 * Siblings are never modified, and the prompt forbids leaving any trace of them in the reader's project.
 */
export function buildNeighborPrompt(root, laneId, engine) {
  const laneDir = safeLaneDir(root, laneId);
  const own = path.join(laneDir, engine.directory);
  if (!fs.existsSync(own)) {
    throw new Error(`Engine directory missing: ${laneId}/${engine.directory}`);
  }
  const neighbors = ENGINES.filter(e => e.id !== engine.id && fs.existsSync(path.join(laneDir, e.directory)));
  if (!neighbors.length) {
    throw new Error(`No neighbor architectures to learn from in ${laneId}`);
  }
  const list = neighbors.map(n => `- ${n.name}: \`${path.join(laneDir, n.directory)}\``).join('\n');
  const who = neighbors.map(n => n.name).join(' and ');
  return `# Neighborhood Peek: one-time, read-only, learn and compare

You are the **${engine.name}** architecture. Your working directory is \`${own}\`.

For **this session only**, the Commander authorizes you to **read** your neighbor architectures in the same lane (${who}):
${list}

## Purpose

Learn and compare. Look at how the neighbors approach the same job (prompts, pipeline stages, roles, gates, memory and telemetry layout, failure handling, anything structural) and judge honestly against your own approach. The goal is perspective, not imitation: "this is useful", "I hadn't thought of that", or "mine is better, I'm not taking that" are all valid outcomes.

## Hard rules

1. **Read-only on the neighbors.** Do not edit, create, delete, rename, or move anything there. Do not run their scripts, tools, or loops.
2. **No stealing leads.** Do not copy, import, re-file, or reuse their leads, dossiers, URLs, seen lists, rejections, fit scores, or conclusions, and do not re-open or re-file your own leads because of what you saw. Your leads stay independently yours. You may look at outcome-level evidence (counts, tier mix, rejection patterns, and how comparable cases were judged) only to understand how each of you reads and applies the same rules, never to take content.
3. **Leave no trace in your own project.** Write nothing anywhere in \`${own}\` that reveals the neighbors exist: no file, note, memory entry, telemetry line, changelog, comment, or commit message may name them, link their paths, or hint where an idea came from. Report in this chat only.
4. **One-time.** This authorization ends when you deliver your report. Do not peek again in later turns, loops, or SelfEvolve iterations unless the Commander pastes this prompt again. Do not turn this into a standing routine or instruction.
5. **Analysis only.** Change nothing this turn, not even in your own project.

## What to do

1. **Before you peek, explain yourself.** In chat, write down how you would explain your own current results: what is working, what falls short, and why. Include every hypothesis about the cause, internal or external. Commit to this before looking at the neighbors.
2. Re-read your own architecture, so you compare from your own baseline.
3. Skim each neighbor's architecture: entry docs, prompts, pipeline, rules, telemetry layout. Look at outcome-level evidence too.
4. Compare structure, rigor, failure handling, efficiency, and anything else that stands out. Pay special attention to **how each of you handles ambiguity and conflict**: what happens when a fact is missing, unread, or blocked (pending or failed?), where the burden of proof sits, how thresholds, gates, exclusions, quotas, and tie-breaks are set, and which way each of you resolves two rules that pull against each other.
5. **Stress-test your own explanations** from step 1. For each, say whether what you saw supports, weakens, or contradicts it. Be most suspicious of explanations that put the cause outside yourself ("the supply is thin", "the sources are hard", "the task is difficult"). If the neighbors work in the same environment and show a different outcome, that explanation is in doubt, and the cause may be in how you read or apply your own rules. The reverse also holds: a neighbor producing more is not proof it is right, because it may be too loose. Decide on evidence, not on who is ahead.

## Report (in chat only)

Give each finding one verdict, with evidence (neighbor + file path) and a short reason:

- **Useful to adopt:** what it is, why it helps, how it would fit your design in your own terms.
- **Hadn't thought of:** worth investigating, and what you would test first.
- **Divergent reading:** the same rule or situation is read or applied differently. Describe both readings, which is stricter or looser, what that does to outcomes, the risk in each direction, and whether the rule that governs it is yours to change or protected. If it is protected, you do not change it; flag it, and the Commander can have it filed as a request in phase 2.
- **Mine is better:** what you do better and why. This is a legitimate and common answer, but only with evidence.
- **Not taking it:** different but not better, or does not fit your design.

Open the report with your step 1 explanations and their verdicts after the stress test.

Be candid, with no flattery and no adopting by default. End by telling the Commander which items you would adopt, if any. **Do not implement anything yet.** Implementation only happens if the Commander later sends a separate "Phase 2: apply what you learned" prompt in this chat.
`;
}

/**
 * Phase 2 of "learn from thy neighbors". Pasted into the SAME engine's chat after it delivered its
 * peek report: it implements the approved upgrades in its OWN project only, under its own rules,
 * untouchable files and change process. It deliberately never names the neighbors.
 */
export function buildNeighborApplyPrompt(root, laneId, engine) {
  const laneDir = safeLaneDir(root, laneId);
  const own = path.join(laneDir, engine.directory);
  if (!fs.existsSync(own)) {
    throw new Error(`Engine directory missing: ${laneId}/${engine.directory}`);
  }
  return `# Neighborhood Peek, Phase 2: apply what you learned (your own project only)

You are the **${engine.name}** architecture. Your working directory is \`${own}\`.

Phase 1 (the peek) is over, and its authorization has ended. The Commander now authorizes you to **implement, inside your own project only**, the upgrades from the report you gave in this chat.

## Scope

- Default: every item you rated **Useful to adopt**.
- Items rated *Hadn't thought of*, *Mine is better*, or *Not taking it* are **not** implemented unless the Commander lists them below this prompt or says so in chat.
- Items rated **Divergent reading** are decisions, not upgrades. Implement one only if the Commander says which way to resolve it, and only inside what your rules allow you to change. If the governing rule is protected, file a request for the Commander instead of changing it.
- If the Commander narrows or widens the list, the Commander's words win.
- If there is no report in this chat, stop and say so. Do not look at the neighbors again to recreate it.

## Respect your own project first

${respectOwnProjectSection()}

## How to implement

1. Re-express each item in your own architecture's design, terminology, and style. Do not copy text or structure verbatim. Adapt it so it is yours.
2. **Do not open the neighbors again.** Work from your report. If an item cannot be done without re-reading them, mark it **needs another peek** and let the Commander decide.
3. Make small changes, one item at a time, each one verifiable. Run your own project's validation or checks afterward, in your project only.
4. Do not run a SelfEvolve loop, and do not touch your leads as part of this.
5. **Leave no trace of the neighbors.** No file, comment, changelog, memory entry, telemetry line, or commit message may mention the neighbors, other architectures, or "learned from" anything. If your rules require logging changes, log them as ordinary self-improvements with your own reasoning and no source.

## Requests for the Commander

${requestsSection()}

## Report back (in chat), then stop

For each item: **implemented** (files changed and what, in one line), **skipped** (why), **requested** (which protected file, and the DecisionBoard entry you filed), or **needs another peek**. Then give the validation results. Do not start additional work.
`;
}

function respectOwnProjectSection() {
  return `Before changing anything, re-read your own governing documents (for example \`AGENTS.md\`, \`ARCHITECT_BLUEPRINT.md\`, \`NorthStar.md\`, \`RecallCharter.md\`, and anything else your project declares as rules). Follow your project's own process for evolving itself: checkpoints, guards, rollback, validation, change gates.

- **Untouchable files stay untouched, but the change can still happen, just not by you.** That includes the constitution, Ring 0 or immutable documents, and anything your rules mark protected, frozen, or Commander-only. If an item would need such a file, do not edit it. File a request for the Commander instead (see "Requests for the Commander").
- **Your rules beat the report.** If an item conflicts with your mission, your rules, or your own process, skip it and say why.
- Use your project's official change path. Do not bypass a guard, checkpoint, or gate to make a change fit.
- Touch nothing outside your project folder.`;
}

function requestsSection() {
  return `Any conclusion that needs a protected file changed, and any **Divergent reading** the Commander has not yet decided, goes to the Commander as a written request. Use your project's own channel for asynchronous Commander requests, which is normally \`DecisionBoard.md\`. Follow its existing entry format and its append-only rule: add a new Open entry with its \`Status\` set to Open and the \`Commander\` field left empty, and never edit or remove other entries. If your project has no such channel, do not invent one. Put the request in your chat report instead.

Each request must be self-contained, so the Commander can decide from the entry alone:

- the exact file and section that would change, and the exact proposed wording (before and after);
- what the change fixes or improves, argued on its own merits from your own project's evidence (your outputs, ledgers, telemetry, rules);
- the risk of making the change, and the risk of leaving it as is;
- what you did instead in the meantime, if anything, inside what your rules allow.

The request must not name or hint at the neighbors or where the idea came from. The Commander has the context from this chat. Filing a request is the only write you make for a protected-file item.`;
}

/**
 * Both phases in one pass. A read-only "Peeker" role is the only one that opens the neighbors and
 * returns an abstract digest; the engine itself (the "Implementer") never sees neighbor files and
 * only edits its own project. Uses the host's own subagent capability when it has one (same as the
 * autoloop), otherwise the same engine plays both roles in sequence.
 */
export function buildNeighborOnePassPrompt(root, laneId, engine) {
  const laneDir = safeLaneDir(root, laneId);
  const own = path.join(laneDir, engine.directory);
  if (!fs.existsSync(own)) {
    throw new Error(`Engine directory missing: ${laneId}/${engine.directory}`);
  }
  const neighbors = ENGINES.filter(e => e.id !== engine.id && fs.existsSync(path.join(laneDir, e.directory)));
  if (!neighbors.length) {
    throw new Error(`No neighbor architectures to learn from in ${laneId}`);
  }
  const list = neighbors.map(n => `- ${n.name}: \`${path.join(laneDir, n.directory)}\``).join('\n');
  const who = neighbors.map(n => n.name).join(' and ');
  return `# Neighborhood Learn and Apply: one pass, read-only peek then own-project upgrades

You are the **${engine.name}** architecture. Your working directory is \`${own}\`.

For **this session only**, the Commander authorizes two things, in this order:

1. A read-only look at your neighbor architectures in the same lane (${who}), to learn and compare:
${list}
2. Implementing the resulting upgrades **inside your own project only**.

There is no pause for the Commander's review between the two, so the safeguards below are stricter than if they were separate. If the Commander writes extra instructions under this prompt (for example "peek only", or "only adopt X"), those win.

## Roles: a clean-room split

- **Peeker:** the only role allowed to open the neighbors. It may also read your own project, read-only. It writes **nothing** anywhere. It returns a findings digest.
- **Implementer:** you. You never open the neighbors, and you work only from the Peeker's digest. This is deliberate: you cannot copy what you never saw, and you cannot leak a trace of it.

How to run it: use your host's own native subagent capability with your inherited model and tools, the same way your autoloop does (invoke a subagent, wait for it to finish, use a bounded wait of at most 15 minutes). One Peeker per neighbor is fine if your host can run them in parallel, and so is one for all of them. Use only what your own platform and access provide. If your host has no subagents, play both roles yourself in sequence: finish all the neighbor reading and write the digest in chat first, then stop reading the neighbors for good before you implement anything.

## Hard rules (every role, subagents included; copy them into every subagent brief)

1. **Read-only on the neighbors.** Do not edit, create, delete, rename, or move anything there. Do not run their scripts, tools, or loops.
2. **No stealing leads.** Do not copy, import, re-file, or reuse their leads, dossiers, URLs, seen lists, rejections, fit scores, or conclusions, and do not re-open or re-file your own leads because of what you saw. You may look at outcome-level evidence (counts, tier mix, rejection patterns, and how comparable cases were judged) only to understand how each of you reads and applies the same rules, never to take content.
3. **Leave no trace in your own project.** No file, note, memory entry, telemetry line, changelog, comment, or commit message may name the neighbors, link their paths, or hint where an idea came from. The Peeker must not write anything either. Evidence with neighbor names and paths goes in the chat report only.
4. **One-time.** This authorization, and every subagent, ends with your final report. Do not peek again in later turns, loops, or SelfEvolve iterations unless the Commander pastes this prompt again. Do not turn this into a standing routine or instruction.
5. **Your own project, your own rules.** Edit only inside \`${own}\`, only through its official change path, and never a protected file (see "Respect your own project first").

## Flow

1. **Explain yourself first.** Before any Peeker starts, write down in chat how you explain your own current results: what is working, what falls short, and why, including every hypothesis about the cause, internal or external. Commit to it. Do not hand these hypotheses to the Peeker.
2. **Brief the Peeker** with the hard rules and this task: skim each neighbor's architecture (entry docs, prompts, pipeline, rules, telemetry layout) and its outcome-level evidence, and compare against the architecture in \`${own}\` on structure, rigor, failure handling, efficiency, and anything else that stands out. Pay special attention to **how each handles ambiguity and conflict**: what happens when a fact is missing, unread, or blocked (pending or failed?), where the burden of proof sits, how thresholds, gates, exclusions, quotas, and tie-breaks are set, and which way each resolves two rules that pull against each other. The Peeker returns a digest. For each finding: where it was seen (neighbor and file path, for the Commander's report only), the idea described **in abstract terms in its own words, never quoted or copied**, what it does to outcomes, and for divergences both readings, which is stricter or looser, and the risk of each direction.
3. **Stress-test your own explanations** against the digest. For each, say whether the evidence supports, weakens, or contradicts it. Be most suspicious of explanations that put the cause outside yourself ("the supply is thin", "the sources are hard", "the task is difficult"): if the neighbors work in the same environment and show a different outcome, that explanation is in doubt, and the cause may be in how you read or apply your own rules. The reverse also holds: a neighbor producing more is not proof it is right, because it may be too loose. Decide on evidence, not on who is ahead.
4. **Give each finding one verdict:** **Useful to adopt**, **Hadn't thought of**, **Divergent reading**, **Mine is better** (legitimate and common, but only with evidence), or **Not taking it**.
5. **Apply only what is safe to apply unreviewed.** Implement a finding only if it is rated **Useful to adopt**, is consistent with your rules, and is small, reversible, and verifiable. Do **not** implement *Hadn't thought of*, *Mine is better*, or *Not taking it*. Never implement a **Divergent reading**, because it is a decision for the Commander. File it as a request instead, along with anything that would need a protected file.
6. **Implement** one item at a time, re-expressed in your own architecture's design, terminology, and style. Never copy text or structure verbatim. Run your project's own guards and validation after each item. If an item fails validation, roll it back with your project's own rollback and report it as failed. Do not run a SelfEvolve loop, and do not touch your leads as part of this. If your rules require logging changes, log them as ordinary self-improvements with your own reasoning and no source.
7. **File the requests** for the Commander as described below, then deliver the final report and stop.

## Respect your own project first

${respectOwnProjectSection()}

## Requests for the Commander

${requestsSection()}

## Final report (in chat only), then stop

1. Your step 1 explanations, with their verdicts after the stress test.
2. Every finding with its verdict, evidence (neighbor and file path), and a short reason.
3. For each item you acted on: **implemented** (files changed and what, in one line), **failed and rolled back**, **skipped** (why), or **requested** (which protected file or divergence, and the DecisionBoard entry you filed).
4. The validation results.

Be candid, with no flattery and no adopting by default. Do not start additional work.
`;
}

export function safeLaneDir(root, laneId) {
  if (typeof laneId !== 'string' || !laneId.trim() || /[\\/]|\.\./.test(laneId) || laneId.startsWith('.')) {
    throw new Error('Invalid project lane');
  }
  const base = fs.realpathSync(root);
  const target = path.join(base, laneId);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Unknown project lane: ${laneId}`);
  }
  const full = fs.realpathSync(target);
  if (path.dirname(full) !== base) throw new Error('Lane outside workspace');
  return full;
}

export function discoverLanes(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const lanes = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'ui' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const laneDir = path.join(root, entry.name);
    const presentEngines = ENGINES.filter(e => fs.existsSync(path.join(laneDir, e.directory)));
    if (!presentEngines.length) continue;

    // Derive human label and check personalization
    const firstEngDir = path.join(laneDir, presentEngines[0].directory);
    const personalization = checkPersonalization(firstEngDir);
    let subtitle = '';
    const readmePath = path.join(laneDir, 'README.md');
    const northStarPath = path.join(firstEngDir, 'NorthStar.md');
    if (fs.existsSync(readmePath)) {
      const m = fs.readFileSync(readmePath, 'utf8').replace(/^\uFEFF/, '').match(/^#\s+(.+)/m);
      if (m) subtitle = m[1].trim();
    }
    if (!subtitle && fs.existsSync(northStarPath)) {
      const m = fs.readFileSync(northStarPath, 'utf8').replace(/^\uFEFF/, '').match(/^#\s+(.+)/m);
      if (m && !m[1].includes('{{')) subtitle = m[1].trim();
    }

    lanes.push({
      id: entry.name,
      name: formatLaneName(entry.name),
      subtitle,
      isTemplate: !personalization.ok,
      personalizationErrors: personalization.errors,
      engines: ENGINES.map(e => {
        const engPath = path.join(laneDir, e.directory);
        const exists = fs.existsSync(engPath);
        const pCheck = exists ? checkPersonalization(engPath) : { ok: false, errors: ['Missing engine directory'] };
        return {
          ...e,
          exists,
          personalized: pCheck.ok,
          personalizationErrors: pCheck.errors,
        };
      }),
    });
  }

  // Sort personalized active lanes first (alphabetically), templates last
  return lanes.sort((a, b) => {
    if (a.isTemplate !== b.isTemplate) return a.isTemplate ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

function formatLaneName(folderName) {
  return folderName
    .replace(/^0-/, '')
    .replace(/^SelfEvolving|^SelfEvolve/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || folderName;
}

export function field(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    text.match(new RegExp(`\\*\\*${escaped}:\\*\\*[^\\S\\r\\n]*([^\\r\\n]+)`, 'i'))?.[1]?.trim() ||
    text.match(new RegExp(`\\*\\*${escaped}\\*\\*:[^\\S\\r\\n]*([^\\r\\n]+)`, 'i'))?.[1]?.trim() ||
    ''
  );
}

export function canonicalURL(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.host + u.pathname.replace(/\/+$/, '') + u.search;
  } catch {
    return '';
  }
}

const normalized = value =>
  String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const CRYPTO_SUBJECTS = [
  ['Axie: Den of Mysteries', ['axie den of mysteries', 'axie infinity den of mysteries']],
  ["Axie: Atia's Legacy", ['axie infinity atia s legacy']],
  ['Axie Origins', ['axie origins', 'axie infinity origins']],
  ['Decentraland Pumpkin Ball', ['decentraland pumpkin ball', 'pumpkin ball community']],
  ['Decentraland SpaceRunner', ['decentraland spacerunner', 'decentraland space runner']],
  ['Decentraland Battlezone', ['decentraland battlezone']],
  ['Decentraland ChessLand', ['chessland monthly', 'decentraland monthly cash chess']],
  ...[
    'Alien Worlds', 'Anichess', 'Aurory', 'Big Time', 'Catizen', 'Chicken Saga', 'Fableborne',
    'Gods Unchained', 'Guild of Guardians', 'Illuvium', 'Immutable Play', 'Lumiterra', 'Moku Grand Arena',
    'Nine Chronicles', 'Off The Grid', 'Olderfall', 'Parallel TCG', 'Pixels', 'Star Atlas', 'STEPN',
    'Sunflower Land', 'Wild Forest',
  ].map(name => [name, [normalized(name)]]),
];

export function subjectFor(lead) {
  if (lead?.lane !== 'SelfEvolveCryptoGames') return '';
  const title = ' ' + normalized((lead.title || lead.id.split('/').pop().replace(/\.md$/, '')).replace(/^Lead:\s*/i, '')) + ' ';
  const filename = ' ' + normalized(lead.id.split('/').pop().replace(/\.md$/, '')) + ' ';
  return (
    CRYPTO_SUBJECTS.find(([, aliases]) =>
      aliases.some(alias => title.startsWith(' ' + alias + ' ') || filename.startsWith(' ' + alias + ' '))
    )?.[0] || ''
  );
}

export function groupLeads(leads) {
  const groups = [];
  const keys = new Map();
  for (const lead of leads) {
    const lanePrefix = `lane:${lead.lane || 'default'}:`;
    const subject = subjectFor(lead);
    const url = canonicalURL(lead.url);
    const identities = [
      subject && `${lanePrefix}subject:${subject}`,
      lead.opportunityId && `${lanePrefix}id:${normalized(lead.opportunityId)}`,
      (subject || url.includes('/')) && url && `${lanePrefix}url:${url}:subject:${subject}`,
      subject && lead.title && `${lanePrefix}title:${normalized(lead.title)}`,
    ].filter(Boolean);

    const matches = [...new Set(identities.map(k => keys.get(k)).filter(Boolean))];
    const group = matches[0] || {
      id: `${lead.lane || 'default'}:${lead.project}:${lead.id}`,
      lane: lead.lane || 'default',
      title: subject || lead.title,
      subject,
      entries: [],
      keys: new Set(),
    };
    if (!matches.length) groups.push(group);
    for (const other of matches.slice(1)) {
      group.entries.push(...other.entries);
      for (const key of other.keys) {
        group.keys.add(key);
        keys.set(key, group);
      }
      groups.splice(groups.indexOf(other), 1);
    }
    group.entries.push(lead);
    for (const key of identities) {
      keys.set(key, group);
      group.keys.add(key);
    }
  }
  return groups.map(({ keys: unused, ...g }) => g);
}

const VALID_ACTIVE_STATUSES = /^(Verify|Try-worthy|Ready|Waiting on Commander)\b/i;
const UNGRADED_OK_STATUSES = /^(Verify|Waiting on Commander)\b/i;
const UNGRADED_FIT_VALUES = /^(unknown|unassessed|ungraded|tbd|pending|n\/a|none|-|—)\b/i;
const FIT_FIELDS = ['Fit %', 'Fit', 'Fit Score'];
const URL_FIELDS = [
  'Canonical URL',
  'Official event',
  'Official URL',
  'Official Website',
  'URL',
  'Source URL',
  'Link',
  'Application endpoint',
];
const TITLE_FIELDS = ['Title', 'Game', 'Role', 'Opportunity', 'Position'];

export function readLeadsWithDiagnostics(laneDir, engine, laneId = path.basename(laneDir)) {
  const leads = [];
  const formatErrors = [];
  const engRoot = path.join(laneDir, engine.directory);

  if (!fs.existsSync(engRoot)) {
    formatErrors.push({
      lane: laneId,
      project: engine.id,
      file: engine.directory,
      issues: [`Engine folder '${engine.directory}' is missing in lane '${laneId}'`],
      snippet: '',
    });
    return { leads, formatErrors };
  }

  for (const rejected of [false, true]) {
    const relFolder = rejected ? 'leads/rejected' : 'leads';
    const dir = path.join(engRoot, 'leads', ...(rejected ? ['rejected'] : []));
    if (!fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (!rejected && name === 'rejected') continue;
        formatErrors.push({
          lane: laneId,
          project: engine.id,
          file: `${relFolder}/${name}`,
          issues: [`Unexpected subdirectory '${name}' inside ${relFolder}/`],
          snippet: '',
        });
        continue;
      }
      if (
        name === 'screened.md' ||
        name === '.gitkeep' ||
        name === 'seen_urls.txt' ||
        name === 'ats_scanned.txt'
      ) continue;
      if (!name.endsWith('.md')) {
        const full = path.join(dir, name);
        let snippet = '';
        try {
          snippet = fs.readFileSync(full, 'utf8').slice(0, 300);
        } catch {}
        formatErrors.push({
          lane: laneId,
          project: engine.id,
          file: `${relFolder}/${name}`,
          issues: [`Unexpected file extension '${path.extname(name) || '(none)'}' in ${relFolder}/ (expected .md dossier)`],
          snippet,
        });
        continue;
      }

      const full = path.join(dir, name);
      const raw = fs.readFileSync(full, 'utf8');
      const text = raw.replace(/^\uFEFF/, '');
      const relId = `leads/${rejected ? 'rejected/' : ''}${name}`;
      const issues = [];

      if (!text.trim()) {
        issues.push('Empty Markdown dossier file');
      }

      // Extract title
      const h1Title = text.match(/^#\s+(.+)/m)?.[1]?.trim() || '';
      const fallbackFieldTitle = TITLE_FIELDS.map(f => field(text, f))
        .find(Boolean)
        ?.replace(/\s*\[.*$/, '')
        ?.trim() || '';
      const title = h1Title || fallbackFieldTitle || name;
      if (!h1Title && !fallbackFieldTitle) {
        issues.push('Missing title heading (`# Title`) or title field (`**Title:**` / `**Game:**` / `**Role:**`)');
      }

      // Extract status & rejection info
      const status = field(text, 'Status');
      const rejectionReason =
        field(text, 'Rejection Reason') || field(text, 'Reason') || field(text, 'Why Rejected');

      if (!rejected) {
        if (!status) {
          issues.push('Missing `**Status:**` field (expected Verify, Try-worthy, Ready, or Waiting on Commander)');
        } else if (!VALID_ACTIVE_STATUSES.test(status)) {
          issues.push(`Unrecognized active \`**Status:** ${status}\` (expected Verify, Try-worthy, Ready, or Waiting on Commander)`);
        }
      } else if (!status && !rejectionReason) {
        issues.push('Rejected dossier missing both `**Rejection Reason:**` (`**Reason:**`) and `**Status:**`');
      }

      // Extract Fit % (Verify and Waiting on Commander dossiers may be ungraded prior to Assayer pass)
      const fitRaw = FIT_FIELDS.map(f => field(text, f)).find(Boolean) || '';
      const fitNum = parseInt(fitRaw, 10);
      const isUngradedPlaceholder = !fitRaw || UNGRADED_FIT_VALUES.test(fitRaw);
      const fit = !Number.isNaN(fitNum) && fitNum >= 0 && fitNum <= 100 ? fitNum : null;
      if (!rejected) {
        if (!fitRaw) {
          if (!UNGRADED_OK_STATUSES.test(status)) {
            issues.push('Missing `**Fit %:**` field');
          }
        } else if (fit === null && !(UNGRADED_OK_STATUSES.test(status) && isUngradedPlaceholder)) {
          issues.push(`Unparseable \`**Fit %:** ${fitRaw}\` (expected 0–100%)`);
        }
      }

      // Extract URL
      const urlCandidate = URL_FIELDS.map(f => field(text, f)).find(v => /https?:\/\/[^\s)\];>]+/.test(v)) || '';
      const url = urlCandidate.match(/https?:\/\/[^\s)\];>]+/)?.[0] || '';
      if (!rejected && !url) {
        issues.push(`Missing opportunity URL (looked for ${URL_FIELDS.map(f => `\`**${f}:**\``).join(', ')})`);
      }

      if (issues.length) {
        formatErrors.push({
          lane: laneId,
          project: engine.id,
          file: relId,
          issues,
          snippet: text.slice(0, 400),
        });
      }

      leads.push({
        lane: laneId,
        project: engine.id,
        id: relId,
        title,
        opportunityId: field(text, 'Opportunity ID'),
        fit,
        status: status || (rejected ? 'Rejected' : ''),
        confidence: field(text, 'Fit confidence'),
        rejected,
        url,
        mtime: fs.statSync(full).mtimeMs,
        formatIssues: issues,
      });
    }
  }

  return { leads, formatErrors };
}

export function readLeads(laneDir, engine, laneId = path.basename(laneDir)) {
  return readLeadsWithDiagnostics(laneDir, engine, laneId).leads;
}

export function safeFile(laneDir, project, relative) {
  if (typeof relative !== 'string' || !relative.endsWith('.md')) throw new Error('Select a Markdown file');
  const base = fs.realpathSync(path.join(laneDir, project.directory));
  const full = fs.realpathSync(path.resolve(base, relative));
  if (!full.startsWith(base + path.sep)) throw new Error('File outside project');
  const parts = path.relative(base, full).split(path.sep);
  if (parts.some(p => p.startsWith('.')) || parts[0] === 'scratch') throw new Error('File unavailable');
  return full;
}

export function listFiles(laneDir, project) {
  const base = path.join(laneDir, project.directory);
  const result = [];
  for (const folder of ['', 'prompts', 'telemetry', 'pipeline/0-profile']) {
    const dir = path.join(base, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.md')) {
        result.push({
          path: (folder ? folder + '/' : '') + name,
          group: folder || 'Boards & configuration',
        });
      }
    }
  }
  return result;
}
