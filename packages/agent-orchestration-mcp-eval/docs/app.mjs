// MCP Policy & Eval Playground. Pure ES modules, no dependencies.
// Every decision on this page comes from callTool() in ./lib, which is a byte-for-byte copy of src/ (checked by
// test/docs.test.mjs). When the page is served by src/http.mjs at /inspector/, each result is also requested from the
// live POST /mcp endpoint and compared, so the page shows whether the server and the page agree.
import { callTool } from './lib/tools.mjs';
import { simulateMission, SEAT_ROLES, DEFAULT_MIX } from './lib/simulate.mjs';
import { ROLE_TIERS, TIERS, DEFAULT_FAILURE_THRESHOLD } from './lib/policy.mjs';

// ---------- DOM helpers (no HTML string parsing: every user string is set as text) ----------
const $ = id => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v); // CSSOM, so the strict CSP (no inline style attributes) allows it
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : String(n));
const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
const badge = (kind, text) => h('span', { class: `badge ${kind}`, text });

// ---------- Live /mcp cross-check ----------
const LIVE = location.protocol.startsWith('http') && location.pathname.startsWith('/inspector');
let rpcId = 0;
let liveHealthy = LIVE;

async function callRemote(name, args) {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return { isError: body.result.isError, payload: JSON.parse(body.result.content[0].text) };
}

function setEngine(state, text) {
  const el = $('engine');
  el.classList.toggle('live', state === 'live');
  el.classList.toggle('down', state === 'down');
  $('engine-label').textContent = text;
}

// Runs callTool locally and, when live, on the server. Updates `badgeEl` with agree / mismatch.
// A generation counter drops stale replies when the user keeps typing.
const generations = new Map();
function crossCheck(badgeEl, calls) {
  if (!LIVE) return;
  const gen = (generations.get(badgeEl) ?? 0) + 1;
  generations.set(badgeEl, gen);
  badgeEl.hidden = false;
  badgeEl.className = 'badge neutral';
  badgeEl.textContent = 'checking /mcp';
  Promise.all(calls.map(([name, args, local]) => callRemote(name, args).then(remote =>
    JSON.stringify(remote.payload) === JSON.stringify(local.payload) && remote.isError === local.isError)))
    .then(results => {
      if (generations.get(badgeEl) !== gen) return;
      const agree = results.every(Boolean);
      badgeEl.className = `badge ${agree ? 'ok' : 'bad'}`;
      badgeEl.textContent = agree ? `/mcp agrees (${results.length})` : '/mcp MISMATCH';
      if (!liveHealthy) { liveHealthy = true; setEngine('live', 'Engine: in-page modules, cross-checked with live /mcp'); }
    })
    .catch(() => {
      if (generations.get(badgeEl) !== gen) return;
      badgeEl.className = 'badge warn';
      badgeEl.textContent = '/mcp unreachable';
      liveHealthy = false;
      setEngine('down', 'Engine: in-page modules (/mcp unreachable)');
    });
}

// ---------- Tabs ----------
function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = tab => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    try { localStorage.setItem('playground.tab', tab.id); } catch { /* storage unavailable */ }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
  let saved = null;
  try { saved = localStorage.getItem('playground.tab'); } catch { /* storage unavailable */ }
  const fromHash = { '#seats': 'tab-seats', '#contract': 'tab-contract', '#dossier': 'tab-dossier' }[location.hash];
  const initial = tabs.find(t => t.id === (fromHash ?? saved)) ?? tabs[0];
  select(initial);
}

// ---------- Tab 1: seat router and budget reserve ----------
const SLIDERS = [
  { key: 'capacityCU', label: 'capacityCU', note: 'window capacity', min: 1, max: 500, step: 1, value: 200 },
  { key: 'usedCU', label: 'usedCU', note: 'already spent', min: 0, max: 500, step: 0.01, value: 0 },
  { key: 'reservePct', label: 'reservePct', note: '% held back for the operator', min: 0, max: 100, step: 1, value: 20 },
  { key: 'judgmentAllowanceCU', label: 'judgmentAllowanceCU', note: 'grant for judgment-tier seats', min: 0, max: 60, step: 0.1, value: 18 },
  { key: 'consecutiveFailures', label: 'consecutiveFailures', note: `breaker opens at ${DEFAULT_FAILURE_THRESHOLD}`, min: 0, max: 6, step: 1, value: 0 },
];
const budgetState = Object.fromEntries(SLIDERS.map(x => [x.key, x.value]));

function buildSliders() {
  const root = $('sliders');
  for (const def of SLIDERS) {
    const id = `sl-${def.key}`;
    const range = h('input', { type: 'range', id, min: def.min, max: def.max, step: def.step, value: def.value, 'aria-describedby': `${id}-note` });
    // The number box accepts any text so out-of-range values can be typed and seen to fail closed.
    const box = h('input', { type: 'number', value: def.value, step: def.step, 'aria-label': `${def.label} value` });
    range.addEventListener('input', () => { box.value = range.value; budgetState[def.key] = Number(range.value); updateSeats(); });
    box.addEventListener('input', () => {
      const v = box.value.trim() === '' ? NaN : Number(box.value);
      budgetState[def.key] = v;
      if (Number.isFinite(v)) range.value = String(v);
      updateSeats();
    });
    root.append(h('div', { class: 'slider' },
      h('label', { for: id }, def.label, h('span', { id: `${id}-note`, text: def.note })),
      range, box));
  }
  $('mode').addEventListener('change', updateSeats);
  $('seed').addEventListener('input', updateMission);
  $('steps').addEventListener('input', updateMission);
}

function currentBudget() {
  return {
    usedCU: budgetState.usedCU,
    capacityCU: budgetState.capacityCU,
    reservePct: budgetState.reservePct,
    judgmentUsedCU: 0,
    judgmentAllowanceCU: budgetState.judgmentAllowanceCU,
    consecutiveFailures: budgetState.consecutiveFailures,
  };
}

function renderBudgetBar(b) {
  const bar = $('budget-bar');
  const legend = $('budget-legend');
  bar.replaceChildren();
  legend.replaceChildren();
  const valid = [b.capacityCU, b.usedCU, b.reservePct].every(Number.isFinite) && b.capacityCU > 0;
  if (!valid) {
    legend.append(h('span', { text: 'budget values invalid: every seat fails closed' }));
    return;
  }
  const share = b.capacityCU * (100 - b.reservePct) / 100;
  const used = Math.min(Math.max(b.usedCU, 0), share);
  const pct = v => `${Math.max(0, (100 * v) / b.capacityCU)}%`;
  bar.append(
    h('div', { class: 'used', style: { width: pct(used) } }),
    h('div', { class: 'free', style: { width: pct(share - used) } }),
    h('div', { class: 'reserve', style: { width: pct(b.capacityCU - share) } }));
  legend.append(
    h('span', {}, h('i', { class: 'sw used' }), `used ${fmt(b.usedCU)} CU`),
    h('span', {}, h('i', { class: 'sw free' }), `agent share left ${fmt(Math.max(share - b.usedCU, 0))} of ${fmt(share)} CU`),
    h('span', {}, h('i', { class: 'sw reserve' }), `reserve floor ${fmt(b.capacityCU - share)} CU`),
  );
}

function updateSeats() {
  const budget = currentBudget();
  const mode = $('mode').value;
  renderBudgetBar(budget);
  const root = $('seats');
  root.replaceChildren();
  const calls = [];
  for (const role of SEAT_ROLES) {
    const args = { role, mode, budget };
    const result = callTool('route_agent_seat', args);
    calls.push(['route_agent_seat', args, result]);
    const p = result.payload;
    const tier = ROLE_TIERS[role];
    const admitted = !result.isError && p.ok === true;
    let reason;
    if (result.isError) reason = `invalid arguments: ${(p.errors ?? [p.error]).join('; ')}`;
    else if (admitted) reason = `remaining ${fmt(p.remainingCU, 4)} of ${fmt(p.shareCU, 4)} CU after this seat`;
    else reason = `${p.stage}: ${p.reason}`;
    root.append(h('div', { class: `seat ${admitted ? 'admitted' : 'refused'}` },
      h('span', { class: `chip r-${role}`, 'aria-hidden': 'true' }),
      h('div', {}, h('span', { class: 'name', text: role }), ' ', h('span', { class: 'meta', text: `${tier} tier · ${TIERS[tier].cu} CU` })),
      badge(admitted ? 'ok' : 'bad', admitted ? 'Admitted' : 'Refused'),
      h('div', { class: 'reason', text: reason })));
  }
  const open = Number.isFinite(budget.consecutiveFailures) && budget.consecutiveFailures >= DEFAULT_FAILURE_THRESHOLD;
  $('breaker').replaceChildren(
    badge(open ? 'bad' : 'ok', open ? 'Breaker open' : 'Breaker closed'),
    ` ${budget.consecutiveFailures} consecutive failure(s), threshold ${DEFAULT_FAILURE_THRESHOLD}.`);
  crossCheck($('seats-check'), calls);
  updateMission();
}

function renderChart(sim, budget) {
  const svg = $('chart');
  [...svg.querySelectorAll(':scope > :not(title)')].forEach(n => n.remove());
  // Drawn at the element's real pixel width so 11px labels stay 11px at any screen size.
  const W = Math.max(280, Math.round(svg.getBoundingClientRect().width) || 640), H = 240, L = 58, R = 14, T = 12, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const n = sim.steps;
  const naiveCum = [];
  const biCum = [];
  let a = 0, b = 0;
  for (const t of sim.naive.trace) { a += TIERS.judgment.cu; naiveCum.push(a); }
  for (const t of sim.bicameral.trace) { b += TIERS[ROLE_TIERS[t.role]].cu; biCum.push(b); }
  const share = Number.isFinite(budget.capacityCU) && Number.isFinite(budget.reservePct) ? budget.capacityCU * (100 - budget.reservePct) / 100 : NaN;
  const yMax = Math.max(naiveCum[n - 1], Number.isFinite(share) ? share : 0) * 1.05 || 1;
  const x = i => L + ((W - L - R) * i) / Math.max(n, 1);
  const y = v => T + (H - T - B) * (1 - v / yMax);
  const grid = s('g', { class: 'grid' });
  const ticks = 5;
  for (let k = 0; k <= ticks; k++) {
    const v = (yMax * k) / ticks;
    grid.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    svg.append(s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${fmt(v, 0)}${k === ticks ? ' CU' : ''}`));
  }
  svg.prepend(grid);
  for (const step of [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n]) {
    svg.append(s('text', { x: x(step), y: H - 8, 'text-anchor': step === 0 ? 'start' : step === n ? 'end' : 'middle' }, step === n ? `step ${step}` : String(step)));
  }
  svg.append(s('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }));
  const path = arr => arr.map((v, i) => `${i === 0 ? `M${x(0)},${y(0)} L` : 'L'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  if (Number.isFinite(share) && share >= 0) svg.append(s('line', { class: 'share', x1: L, x2: W - R, y1: y(share), y2: y(share) }));
  svg.append(s('path', { class: 'naive', d: path(naiveCum) }));
  svg.append(s('path', { class: 'bicameral', d: path(biCum) }));
}

function tile(k, v, d, hero = false) {
  return h('div', { class: `tile${hero ? ' hero' : ''}` }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v }), h('div', { class: 'd', text: d }));
}

function updateMission() {
  const budget = currentBudget();
  const seed = Number($('seed').value);
  const steps = Number($('steps').value);
  const tiles = $('tiles');
  let sim;
  try {
    if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a non-negative integer');
    if (!Number.isInteger(steps) || steps < 1 || steps > 1000) throw new Error('steps must be an integer in [1, 1000]');
    sim = simulateMission({ steps, seed, mix: DEFAULT_MIX, budget });
  } catch (e) {
    tiles.replaceChildren(h('p', { class: 'error', text: e.message }));
    return;
  }
  tiles.replaceChildren(
    tile('Cost reduction', `${fmt(sim.costReductionPct, 1)}%`, 'bicameral vs. naive, full mission', true),
    tile('Naive mission cost', `${fmt(sim.naive.plannedCU, 1)} CU`, `${steps} × ${TIERS.judgment.cu} CU flagship`),
    tile('Bicameral mission cost', `${fmt(sim.bicameral.plannedCU, 1)} CU`, Object.entries(sim.roleCounts).map(([r, c]) => `${c} ${r}`).join(', ')),
    tile('Naive admitted', `${sim.naive.admitted}/${steps}`, `${fmt(sim.naive.spentCU, 1)} CU spent under this budget`),
    tile('Bicameral admitted', `${sim.bicameral.admitted}/${steps}`, `${fmt(sim.bicameral.spentCU, 1)} CU spent under this budget`),
  );
  renderChart(sim, budget);
  const strip = $('strip');
  strip.replaceChildren(...sim.bicameral.trace.map(t => h('span', {
    class: `cell r-${t.role}${t.ok ? '' : ' refused'}`,
    tabindex: '0',
    role: 'img',
    title: `step ${t.step}: ${t.role} ${t.ok ? 'admitted' : `refused (${t.reason})`}`,
    'aria-label': `step ${t.step}: ${t.role} ${t.ok ? 'admitted' : 'refused'}`,
  })));
  $('strip-legend').replaceChildren(...SEAT_ROLES.map(r => h('span', {}, h('i', { class: `sw r-${r}` }), `${r} (${TIERS[ROLE_TIERS[r]].cu} CU)`)));
  const refusals = Object.entries(sim.bicameral.refusals);
  $('refusals').replaceChildren(...(refusals.length
    ? refusals.map(([reason, count]) => h('li', { text: `${count} step(s) refused: ${reason.replaceAll('#', 'n')}` }))
    : [h('li', { text: 'No bicameral step was refused under this budget.' })]));
}

// ---------- Tab 2: contract and citation verifier ----------
const SOURCE = [
  'The cache keeps entries for 300 seconds.',
  'Evictions follow least-recently-used order.',
  'Writes are acknowledged after the journal fsync.',
  'Reads never block on writes.',
];
const SCHEMA = {
  type: 'object',
  required: ['verdict', 'confidence'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'risk'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
};
const baseContract = { anchor: 'cache-review', schema: SCHEMA, forbiddenClaims: ['guaranteed', '100% safe'], source: SOURCE };
const fence = '```';
const CONTRACT_PRESETS = [
  {
    name: 'Grounded answer (passes)',
    note: 'Anchor, payload, claims and both citations all check out.',
    response: `ANCHOR: cache-review\nEntries live five minutes and are evicted LRU-first.\nslice: L1-L2 "${SOURCE[0]}\\n${SOURCE[1]}"\nslice: L4-L4 "${SOURCE[3]}"\n${fence}json\n{"verdict": "ok", "confidence": 0.82}\n${fence}`,
  },
  {
    name: 'Fabricated quote',
    note: 'The citation points at real lines but misquotes them (FIFO for LRU).',
    response: `ANCHOR: cache-review\nEvictions are first-in, first-out.\nslice: L2-L2 "Evictions follow first-in-first-out order."\n${fence}json\n{"verdict": "ok", "confidence": 0.9}\n${fence}`,
  },
  {
    name: 'Out-of-range slice',
    note: 'The source has 4 lines; L4-L5 runs past the end, and L0 is not a line.',
    response: `ANCHOR: cache-review\nslice: L4-L5 "${SOURCE[3]}"\nslice: L0-L1 "${SOURCE[0]}"\n${fence}json\n{"verdict": "risk", "confidence": 0.4}\n${fence}`,
  },
  {
    name: 'Prototype pollution payload',
    note: 'The payload smuggles __proto__ and an out-of-enum verdict. Both are rejected; nothing is polluted.',
    response: `ANCHOR: cache-review\n${fence}json\n{"verdict": "maybe", "confidence": 1.5, "__proto__": {"admin": true}}\n${fence}`,
  },
  {
    name: 'Obfuscated forbidden claim',
    note: 'Fullwidth letters and a zero-width space hide the forbidden phrases. They are folded (NFKC, format characters removed) before matching.',
    response: `ANCHOR: cache-review\nThe migration is ｇｕａｒａｎｔｅｅｄ and 100%​ safe.\n${fence}json\n{"verdict": "ok", "confidence": 0.99}\n${fence}`,
  },
  {
    name: 'Malformed citation',
    note: 'Arabic-Indic digits and a missing quote: near-miss citations are flagged, not skipped.',
    response: `ANCHOR: cache-review\nslice: L١-L٢ "${SOURCE[0]}"\nslice: L1-L1 ${SOURCE[0]}\n${fence}json\n{"verdict": "ok", "confidence": 0.5}\n${fence}`,
  },
  {
    name: 'Wrong anchor',
    note: 'The first non-empty line must be exactly the contract anchor.',
    response: `ANCHOR: cache-reveiw\n${fence}json\n{"verdict": "ok", "confidence": 0.5}\n${fence}`,
  },
];

function buildContractTab() {
  const sel = $('contract-preset');
  CONTRACT_PRESETS.forEach((p, i) => sel.append(h('option', { value: i, text: p.name })));
  const load = i => {
    const p = CONTRACT_PRESETS[i];
    $('response').value = p.response;
    $('contract').value = JSON.stringify(baseContract, null, 2);
    $('contract-preset-note').textContent = p.note;
    updateContract();
  };
  sel.addEventListener('change', () => load(Number(sel.value)));
  const run = debounce(updateContract, 120);
  $('response').addEventListener('input', run);
  $('contract').addEventListener('input', run);
  $('cite-insert').addEventListener('click', () => {
    let contract;
    try { contract = JSON.parse($('contract').value); } catch { return; }
    const src = Array.isArray(contract.source) ? contract.source : [];
    const a = Number($('cite-a').value);
    const b = Number($('cite-b').value);
    const text = src.slice(a - 1, b).join('\n');
    const ta = $('response');
    ta.value = `${ta.value.replace(/\s*$/, '')}\nslice: L${a}-L${b} ${JSON.stringify(text)}`;
    updateContract();
  });
  load(0);
}

function updateContract() {
  const err = $('contract-error');
  let contract;
  try {
    contract = JSON.parse($('contract').value);
    err.textContent = '';
  } catch (e) {
    err.textContent = `contract JSON does not parse: ${e.message}`;
    return;
  }
  const args = { response: $('response').value, contract };
  const result = callTool('evaluate_agent_response', args);
  const p = result.payload;
  $('contract-raw').textContent = JSON.stringify(result, null, 2);
  const src = Array.isArray(contract?.source) ? contract.source : [];
  $('source-lines').replaceChildren(...src.map(line => h('li', { text: String(line) })));
  const verdict = $('verdict');
  const checks = $('checks');
  if (result.isError || p.reason === 'invalid contract') {
    verdict.replaceChildren(h('div', { class: 'verdict' }, badge('bad', result.isError ? 'Tool error' : 'Invalid contract'), (p.errors ?? [p.error]).join('; ')));
    checks.replaceChildren();
  } else {
    verdict.replaceChildren(h('div', { class: 'verdict' }, badge(p.ok ? 'ok' : 'bad', p.ok ? 'Accepted' : 'Rejected'), `${p.violations.length} violation(s)`));
    checks.replaceChildren(...Object.entries(p.checks).map(([name, c]) => h('div', { class: 'check' },
      h('div', { class: 'check-head' }, h('b', { text: name }),
        h('span', {}, c.citations !== undefined ? h('span', { class: 'muted small', text: `${c.citations} citation(s) ` }) : null,
          badge(c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'bad' : 'neutral', c.status))),
      c.violations.length ? h('ul', { class: 'violations' }, c.violations.map(v => h('li', { text: v }))) : null)));
  }
  crossCheck($('contract-check'), [['evaluate_agent_response', args, result]]);
}

// ---------- Tab 3: dossier canonicalizer and linter ----------
const GOOD_DOSSIER = `# Cache layer review

## Summary
The cache is safe to ship behind the existing flag.

## Findings
- Eviction order matches the design note ([design](https://docs.example.org/cache/design)).

## Sources
- [Design note](https://docs.example.org/cache/design)
- [Benchmark run](https://ci.example.org/runs?id=812&suite=cache)
`;
const BAD_DOSSIER = `# Cache layer review

## Findings
- TODO: confirm eviction order. See https://docs.example.org/cache/design

## Summary
Looks fine.

## Sources
- [Design note](https://Docs.Example.org:443/cache/design/?utm_source=chat#top)
- [Design note again](https://docs.example.org/cache/design)
- [Local file](file:///etc/hosts)
`;
const DOSSIER_PRESETS = [
  {
    name: 'Tracking params and duplicates',
    urls: ['https://Example.org/a/?utm_source=x&b=2&a=1#frag', 'https://example.org/a?a=1&b=2', 'https://example.org:443/a?b=2&a=1&fbclid=abc', 'http://example.org/a?a=1&b=2', 'https://user:pw@localhost/', 'javascript:alert(1)'],
    markdown: GOOD_DOSSIER,
  },
  {
    name: 'Unicode hosts and paths',
    urls: ['https://bücher.example/katalog', 'https://xn--bcher-kva.example/katalog/', 'https://ｅｘａｍｐｌｅ.org/', 'https://example.org/', 'https://example.org/café', 'https://example.org/caf%C3%A9', 'https://example.org/a/./b/../c'],
    markdown: GOOD_DOSSIER,
  },
  {
    name: 'Broken dossier',
    urls: [],
    markdown: BAD_DOSSIER,
  },
];

function buildDossierTab() {
  const sel = $('dossier-preset');
  DOSSIER_PRESETS.forEach((p, i) => sel.append(h('option', { value: i, text: p.name })));
  const load = i => {
    $('urls').value = DOSSIER_PRESETS[i].urls.join('\n');
    $('markdown').value = DOSSIER_PRESETS[i].markdown;
    updateDossier();
  };
  sel.addEventListener('change', () => load(Number(sel.value)));
  const run = debounce(updateDossier, 120);
  $('urls').addEventListener('input', run);
  $('markdown').addEventListener('input', run);
  load(0);
}

function updateDossier() {
  const urls = $('urls').value.split(/\r?\n/).filter(l => l.trim() !== '');
  const markdown = $('markdown').value;
  const args = {};
  if (urls.length) args.urls = urls;
  if (markdown.trim() !== '') args.markdown = markdown;
  const rows = $('url-rows');
  const lint = $('lint');
  const verdict = $('dossier-verdict');
  if (!args.urls && args.markdown === undefined) {
    verdict.replaceChildren(h('div', { class: 'verdict' }, badge('neutral', 'Empty'), 'Enter URLs, markdown, or both.'));
    rows.replaceChildren();
    lint.replaceChildren();
    $('dossier-raw').textContent = '';
    return;
  }
  const result = callTool('dedup_and_lint_dossier', args);
  const p = result.payload;
  $('dossier-raw').textContent = JSON.stringify(result, null, 2);
  verdict.replaceChildren(h('div', { class: 'verdict' }, badge(p.ok ? 'ok' : 'bad', p.ok ? 'Clean' : 'Issues found'),
    p.dedup ? `${p.dedup.unique.length} unique, ${p.dedup.duplicates.length} duplicate, ${p.dedup.invalid.length} invalid URL(s)` : '',
    p.lint ? `${p.dedup ? ' · ' : ''}${p.lint.violations.length} lint violation(s)` : ''));
  rows.replaceChildren();
  if (p.dedup) {
    const dup = new Map(p.dedup.duplicates.map(d => [d.index, d]));
    const bad = new Map(p.dedup.invalid.map(d => [d.index, d]));
    let u = 0;
    urls.forEach((raw, i) => {
      let canonical, status;
      if (bad.has(i)) { canonical = '—'; status = badge('bad', bad.get(i).reason); }
      else if (dup.has(i)) { canonical = dup.get(i).canonical; status = badge('warn', `duplicate of #${dup.get(i).duplicateOf + 1}`); }
      else { canonical = p.dedup.unique[u++]; status = badge('ok', 'unique'); }
      rows.append(h('tr', {}, h('td', { text: String(i + 1) }), h('td', { class: 'mono', text: raw }), h('td', { class: 'mono', text: canonical }), h('td', {}, status)));
    });
  }
  if (p.lint) {
    lint.replaceChildren(...(p.lint.violations.length
      ? p.lint.violations.map(v => h('li', { text: `${v.line ? `L${v.line} ` : ''}[${v.rule}] ${v.message}` }))
      : [h('li', { text: `No violations. ${p.lint.stats.sourceLinks} source link(s), ${p.lint.stats.uniqueSources} unique.` })]));
  } else {
    lint.replaceChildren(h('li', { class: 'muted', text: 'No markdown supplied.' }));
  }
  crossCheck($('dossier-check'), [['dedup_and_lint_dossier', args, result]]);
}

// ---------- Boot ----------
window.addEventListener('resize', debounce(updateMission, 150));
initTabs();
if (LIVE) setEngine('live', 'Engine: in-page modules, cross-checked with live /mcp');
buildSliders();
updateSeats();
buildContractTab();
buildDossierTab();
