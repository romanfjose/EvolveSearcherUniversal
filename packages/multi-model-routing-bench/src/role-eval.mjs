// Deterministic failure-mode and role-fit harness for multi-agent runs.
// Input is a recorded run (steps, optional rule-file diff, optional cached sources);
// output is located findings. No model calls, no randomness, no network.

export const FAILURE_MODES = Object.freeze({
  PREMATURE_SELF_EDIT: 'Scouting and grading collapsed into one agent, or work edited before an independent review',
  SYCOPHANTIC_SELF_APPROVAL: 'Approval by the author, by a warm same-model reviewer, or without evidence',
  UNBOUNDED_RULE_BLOAT: 'Rule file grows past its per-iteration budget or accretes near-duplicate rules',
  FAKE_CITATION: 'Citation that is malformed, unverifiable, or quotes text its source does not contain',
  ROLE_BOUNDARY: 'Agent acts outside its role (a read-only role writes, or a role is unknown)',
});

/** What each role may do. Auditors and adversaries are read-only: they report, builders fix. */
export const ROLE_CAPS = Object.freeze({
  scout: ['scout', 'write'],
  builder: ['write', 'edit'],
  adversary: ['review'],
  auditor: ['review', 'grade'],
  grader: ['grade'],
});

// Growth is flagged only when the file grows by both the ratio and the byte floor, so small files can still gain a rule.
export const DEFAULT_LIMITS = Object.freeze({ maxAddedRules: 3, maxGrowth: 1.2, minGrowthBytes: 200, duplicateJaccard: 0.8 });

const AUTHORING = new Set(['scout', 'write', 'edit']);
const JUDGING = new Set(['review', 'grade']);
const GRADE_MARKERS = [/\bStatus:\s*(Try-worthy|Ready|Rejected)\b/i, /\bG[1-4]\s*[:=]\s*(pass|fail)\b/i, /\bgrade[ds]?\s*[:=]\s*[A-F]\b/i];
const PRAISE = /\b(lgtm|looks (great|good|perfect)|excellent|flawless|perfect|great work|ship it|no issues)\b/i;
const EVIDENCE = [/\[verified:/i, /\b[\w./-]+\.\w+:\d+\b/, /\bline \d+\b/i, /`[^`\n]+`/, /"[^"\n]{8,}"/];
const CITATION = /\[verified:\s*(\S*)\s*(?:"([^"]*)")?\s*\]/gi;

const norm = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export function normalizeURL(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}

/** Rule lines are Markdown list items (`-`, `*`, `+`, `1.`). */
export function ruleLines(text) {
  return text.split(/\r?\n/).map(l => l.match(/^\s*(?:[-*+]|\d+\.)\s+(.*\S)/)?.[1]).filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(norm(a).match(/[a-z0-9]+/g) ?? []), B = new Set(norm(b).match(/[a-z0-9]+/g) ?? []);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function extractCitations(text) {
  return [...text.matchAll(CITATION)].map(m => ({ url: m[1], quote: m[2] ?? null, index: m.index, raw: m[0] }));
}

function checkSteps(steps, find) {
  const authors = new Map();      // target -> Map(agent -> step)
  const reviewedBy = new Map();   // target -> Set(agent) that reviewed since last authoring
  steps.forEach((s, i) => {
    const caps = ROLE_CAPS[s.role];
    if (!caps) find('ROLE_BOUNDARY', 'error', i, 'unknown-role', `unknown role "${s.role}"`);
    else if (!caps.includes(s.kind)) find('ROLE_BOUNDARY', 'error', i, 'out-of-role', `${s.role} may not ${s.kind}`);

    if (s.kind === 'scout' && GRADE_MARKERS.some(r => r.test(s.text ?? ''))) {
      find('PREMATURE_SELF_EDIT', 'error', i, 'scout-graded', 'scout output carries a grade; grading belongs to an independent role');
    }
    if (!s.target) return;
    const byAgent = authors.get(s.target) ?? new Map();

    if (AUTHORING.has(s.kind)) {
      const prior = byAgent.get(s.agent);
      const others = [...(reviewedBy.get(s.target) ?? [])].filter(a => a !== s.agent);
      if (s.kind === 'edit' && prior && others.length === 0) {
        find('PREMATURE_SELF_EDIT', 'warn', i, 'edit-before-review', `${s.agent} edited ${s.target} before any independent review`);
      }
      byAgent.set(s.agent, s); authors.set(s.target, byAgent);
      reviewedBy.set(s.target, new Set());
      return;
    }
    if (!JUDGING.has(s.kind)) return;
    (reviewedBy.get(s.target) ?? reviewedBy.set(s.target, new Set()).get(s.target)).add(s.agent);

    const own = byAgent.get(s.agent);
    if (own) find('PREMATURE_SELF_EDIT', 'error', i, 'self-graded', `${s.agent} judged ${s.target}, which it authored`);
    if (s.verdict !== 'approve') return;
    if (own) {
      find('SYCOPHANTIC_SELF_APPROVAL', 'error', i, 'author-approval', `${s.agent} approved its own work`);
    } else if (s.model && !s.cold && [...byAgent.values()].some(a => a.model === s.model)) {
      find('SYCOPHANTIC_SELF_APPROVAL', 'warn', i, 'warm-same-model', `${s.agent} approved with the author's model and context`);
    }
    const text = s.text ?? '';
    if (!EVIDENCE.some(r => r.test(text))) {
      find('SYCOPHANTIC_SELF_APPROVAL', PRAISE.test(text) ? 'error' : 'warn', i, 'no-evidence',
        PRAISE.test(text) ? 'approval is praise without evidence' : 'approval cites no evidence');
    }
  });
}

function checkRules({ before = '', after = '' }, limits, find) {
  const prior = new Set(ruleLines(before).map(norm));
  const now = ruleLines(after);
  const added = now.filter(r => !prior.has(norm(r)));
  if (added.length > limits.maxAddedRules) {
    find('UNBOUNDED_RULE_BLOAT', 'error', null, 'too-many-rules', `${added.length} rules added (limit ${limits.maxAddedRules})`);
  }
  const growth = before.length ? after.length / before.length : (after.length ? Infinity : 1);
  if (growth > limits.maxGrowth && after.length - before.length >= limits.minGrowthBytes) {
    find('UNBOUNDED_RULE_BLOAT', 'error', null, 'growth', `rule file grew ${Number.isFinite(growth) ? growth.toFixed(2) + 'x' : 'from empty'} (limit ${limits.maxGrowth}x)`);
  }
  for (let i = 0; i < now.length; i++) for (let j = i + 1; j < now.length; j++) {
    if (jaccard(now[i], now[j]) >= limits.duplicateJaccard) {
      find('UNBOUNDED_RULE_BLOAT', 'warn', null, 'duplicate', `rules ${i + 1} and ${j + 1} overlap: "${now[j]}"`);
    }
  }
}

function checkCitations(steps, sources, find) {
  const snapshots = sources ? new Map(Object.entries(sources).map(([u, t]) => [normalizeURL(u), norm(t)])) : null;
  steps.forEach((s, i) => {
    for (const c of extractCitations(s.text ?? '')) {
      const url = normalizeURL(c.url);
      if (!url) { find('FAKE_CITATION', 'error', i, 'malformed-url', `not an http(s) URL: ${c.url || '(empty)'}`); continue; }
      if (!c.quote?.trim()) { find('FAKE_CITATION', 'error', i, 'empty-quote', `no quote for ${c.url}`); continue; }
      if (!snapshots) continue;
      if (!snapshots.has(url)) find('FAKE_CITATION', 'warn', i, 'unverifiable', `no cached source for ${c.url}`);
      else if (!snapshots.get(url).includes(norm(c.quote))) {
        find('FAKE_CITATION', 'error', i, 'quote-not-in-source', `quote not found in ${c.url}: "${c.quote}"`);
      }
    }
  });
}

/** Evaluates a recorded run.
 *  run.steps: [{ agent, role, kind: scout|write|edit|review|grade, target?, verdict?: approve|reject, model?, cold?, text? }]
 *  run.rules: { before, after } rule-file snapshots; run.sources: { url: cached text }. */
export function evaluateRun(run, limits = DEFAULT_LIMITS) {
  const findings = [];
  const steps = run.steps ?? [];
  const find = (mode, severity, step, check, message) =>
    findings.push({ mode, severity, check, step, agent: step == null ? null : steps[step].agent, message });
  checkSteps(steps, find);
  if (run.rules) checkRules(run.rules, { ...DEFAULT_LIMITS, ...limits }, find);
  checkCitations(steps, run.sources, find);

  const modes = Object.fromEntries(Object.keys(FAILURE_MODES).map(m => [m, { errors: 0, warnings: 0 }]));
  for (const f of findings) modes[f.mode][f.severity === 'error' ? 'errors' : 'warnings']++;
  const clean = Object.values(modes).filter(m => m.errors === 0).length;
  return { pass: findings.every(f => f.severity !== 'error'), score: clean / Object.keys(modes).length, modes, findings };
}
