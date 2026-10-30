const $ = s => document.querySelector(s);
const names = { claude: 'Claude', gemini: 'Gemini', gpt: 'ChatGPT' };

let dashboard = { lanes: [], engines: [], groups: [], formatErrors: [], errors: [] };
let selectedLane = ''; // '' means All Lanes
let initialLanePicked = false;
let selectedGroup = '';
let activeTab = 'leads';
let refreshing = false;
let detailVersion = 0;
let fileVersion = 0;
let loadedDocLane = '';

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function error(message = '') {
  const el = $('#error');
  el.textContent = message;
  el.hidden = !message;
}

function guarded(fn) {
  return (...args) => Promise.resolve().then(() => fn(...args)).catch(e => error(e.message));
}

function iterations() {
  const input = $('#iterations');
  if (!input.reportValidity()) throw new Error('Choose a whole iteration count from 1 to 1000');
  return Number(input.value);
}

function link(url, label) {
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return esc(label);
  } catch {
    return esc(label);
  }
  return `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
}

function inline(text) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'`\)\];,]+)/g;
  let result = '';
  let last = 0;
  const format = s =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  for (const match of text.matchAll(pattern)) {
    result += format(text.slice(last, match.index)) + link(match[2] || match[3], match[1] || match[3]);
    last = match.index + match[0].length;
  }
  return result + format(text.slice(last));
}

function markdown(text) {
  let result = '';
  let inList = false;
  let code = false;
  let codeLines = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('```')) {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      if (code) {
        result += `<pre><code>${esc(codeLines.join('\n'))}</code></pre>`;
        codeLines = [];
      }
      code = !code;
      continue;
    }
    if (code) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (inList && !item) {
      result += '</ul>';
      inList = false;
    }
    if (heading) result += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if (item) {
      if (!inList) {
        result += '<ul>';
        inList = true;
      }
      result += `<li>${inline(item[1])}</li>`;
    } else if (/^---+$/.test(line)) result += '<hr>';
    else if (line.trim()) result += `<p>${inline(line)}</p>`;
  }
  if (codeLines.length) result += `<pre>${esc(codeLines.join('\n'))}</pre>`;
  return result + (inList ? '</ul>' : '');
}

function laneLabel(laneId) {
  return dashboard.lanes.find(l => l.id === laneId)?.name || laneId;
}

function buildAiFixPrompt(items) {
  const list = Array.isArray(items) ? items : [items];
  const details = list
    .map(
      item =>
        `- File: \`${item.lane}/${
          names[item.project] ? `SelfEvolvingArchitecture${item.project === 'gpt' ? 'Gpt' : item.project[0].toUpperCase() + item.project.slice(1)}` : item.project
        }/${item.file}\`\n  Issues: ${item.issues.join('; ')}${
          item.snippet ? `\n  Snippet:\n  \`\`\`markdown\n  ${item.snippet.replace(/\r?\n/g, '\n  ')}\n  \`\`\`` : ''
        }`
    )
    .join('\n\n');
  return `Hey, go check our root frontend at \`ui/data.mjs\` (and \`ui/app.js\` if needed) so it can read this project output format cleanly.\nRemember the rule: we are NOT allowed to touch or modify any of the project folders; only update the read-only root UI parser to support this format.\n\nFlagged format issue(s):\n${details}\n`;
}

function activeFormatErrors() {
  return selectedLane ? dashboard.formatErrors.filter(e => e.lane === selectedLane) : dashboard.formatErrors;
}

function renderLanes() {
  const totalActive = dashboard.lanes.reduce((sum, l) => sum + l.total, 0);
  const totalFormatErr = dashboard.formatErrors.length;

  const allPill = `<button class="lane-pill ${selectedLane === '' ? 'selected' : ''}" role="tab" aria-selected="${selectedLane === ''}" data-lane="">
    <span class="lane-pill-name">All Lanes</span>
    <span class="lane-pill-meta">${dashboard.lanes.length} lanes Â· ${totalActive} active</span>
    ${totalFormatErr ? `<span class="warn-badge" title="${totalFormatErr} format issue(s)">âš  ${totalFormatErr}</span>` : ''}
  </button>`;

  const lanePills = dashboard.lanes
    .map(
      l => `<button class="lane-pill ${selectedLane === l.id ? 'selected' : ''} ${l.isTemplate ? 'template-lane' : ''}" role="tab" aria-selected="${selectedLane === l.id}" data-lane="${esc(l.id)}" title="${esc(l.subtitle || l.id)}">
      <span class="lane-pill-name">${esc(l.name)}${l.isTemplate ? ' <small class="tpl-tag">Template</small>' : ''}</span>
      <span class="lane-pill-meta">${l.total} active${l.rejectedTotal ? ` Â· ${l.rejectedTotal} rej` : ''}</span>
      ${l.formatErrorCount ? `<span class="warn-badge" title="${l.formatErrorCount} format issue(s)">âš  ${l.formatErrorCount}</span>` : ''}
    </button>`
    )
    .join('');

  $('#lanes').innerHTML = allPill + lanePills;

  // Keep document lane selector synced
  const docSelect = $('#doc-lane-select');
  if (docSelect) {
    const currentVal = selectedLane || docSelect.value || dashboard.lanes[0]?.id || '';
    docSelect.innerHTML = dashboard.lanes
      .map(l => `<option value="${esc(l.id)}" ${l.id === currentVal ? 'selected' : ''}>${esc(l.name)} (${esc(l.id)})</option>`)
      .join('');
  }
}

// "Learn from thy neighbors" prompts, each pasted into this engine's chat:
//   peek: one-time, read-only look at its siblings, ends with a report (no changes);
//   apply: implements the approved upgrades in its own project only, under its own rules;
//   both: the two in one pass (read-only Peeker subagent, then the engine implements on its own).
const NEIGHBOR_PHASES = {
  peek: { label: '1 · Learn from neighbors', copied: 'Copied Neighbor Peek!', needsSiblings: true },
  apply: { label: '2 · Apply learnings', copied: 'Copied Apply Prompt!', needsSiblings: false },
  both: { label: '1+2 · Learn & apply (one pass)', copied: 'Copied One-Pass Prompt!', needsSiblings: true },
};

function neighborButton(lane, p, withName = false, phase = 'peek') {
  const siblings = lane.engines.filter(e => e.id !== p.id && e.exists);
  const meta = NEIGHBOR_PHASES[phase];
  const disabled = !p.exists || (meta.needsSiblings && !siblings.length);
  const label = withName ? `${meta.label} · ${esc(p.name)}` : meta.label;
  const titles = {
    peek: `Copy a one-time, read-only peek prompt for ${p.name}: it may look at ${siblings.map(s => s.name).join(' + ')} to learn and compare, with no leads taken and no trace left in its project`,
    apply: `Paste in ${p.name}'s chat AFTER its peek report: it implements the approved upgrades in its own project only, respecting its own rules and untouchable files`,
    both: `One pass, no review pause: a read-only Peeker subagent studies ${siblings.map(s => s.name).join(' + ')}, then ${p.name} applies only safe, rule-compliant upgrades to its own project and files Commander requests for protected files`,
  };
  const title = disabled ? 'No neighbor architectures to learn from' : titles[phase];
  return `<button class="neighbor-btn ${phase === 'peek' ? '' : 'apply'} ${p.id}" data-neighbor-lane="${esc(lane.id)}" data-neighbor-project="${esc(p.id)}" data-neighbor-phase="${phase}" ${disabled ? 'disabled ' : ''}title="${esc(title)}">${label}</button>`;
}
function renderProjects() {
  const targetLanes = selectedLane ? dashboard.lanes.filter(l => l.id === selectedLane) : dashboard.lanes;

  if (selectedLane && targetLanes.length === 1) {
    const lane = targetLanes[0];
    $('#projects').className = 'projects single-lane';
    $('#projects').innerHTML = lane.engines
      .map(
        p => `<article class="project ${p.id}">
        <div class="project-head">
          <div>
            <span class="project-lane-tag">${esc(lane.name)}</span>
            <span class="project-name">${esc(p.name)}</span>
          </div>
          <span class="state ${p.personalized ? 'ready-state' : 'tpl-state'}">${p.personalized ? 'Ready' : 'Template'}</span>
        </div>
        <div class="project-meta">
          ${p.total} active leads${p.rejectedTotal ? ` Â· ${p.rejectedTotal} rejected` : ''}
          ${p.formatErrorCount ? ` Â· <span class="inline-warn">âš  ${p.formatErrorCount} format issue(s)</span>` : ''}
        </div>
        <div class="actions">
          <button class="self-evolve-btn" data-copy-lane="${esc(lane.id)}" data-copy-project="${esc(p.id)}" ${!p.personalized ? 'disabled title="Personalize this template copy before running SelfEvolve"' : `title="Copy ${esc(p.name)} SelfEvolve prompt for ${esc(lane.id)}"`}>
            SelfEvolve (${esc(p.name)})
          </button>
          ${neighborButton(lane, p)}
          ${neighborButton(lane, p, false, 'apply')}
          ${neighborButton(lane, p, false, 'both')}
        </div>
      </article>`
      )
      .join('');
    return;
  }

  // All Lanes view: show every lane with its 3 SelfEvolve buttons
  $('#projects').className = 'projects multi-lane';
  $('#projects').innerHTML = targetLanes
    .map(
      lane => `<article class="lane-evolve-card ${lane.isTemplate ? 'is-template' : ''}">
      <div class="lane-evolve-info">
        <div class="lane-evolve-title">
          <strong>${esc(lane.name)}</strong>
          <span class="filename">${esc(lane.id)}</span>
          ${lane.isTemplate ? '<span class="tpl-tag">Unpersonalized Template</span>' : ''}
        </div>
        <div class="project-meta">${lane.total} active leads Â· ${lane.rejectedTotal} rejected${lane.formatErrorCount ? ` Â· <span class="inline-warn">âš  ${lane.formatErrorCount} format issue(s)</span>` : ''}</div>
      </div>
      <div class="lane-evolve-buttons">
        ${lane.engines
          .map(
            p => `<button class="self-evolve-btn ${p.id}" data-copy-lane="${esc(lane.id)}" data-copy-project="${esc(p.id)}" ${!p.personalized ? 'disabled title="Personalize this template copy before running SelfEvolve"' : `title="Copy ${esc(p.name)} SelfEvolve prompt for ${esc(lane.id)}"`}>
            SelfEvolve ${esc(p.name)} <small>(${p.total})</small>
          </button>`
          )
          .join('')}
      </div>
      <div class="lane-evolve-buttons">
        ${lane.engines.map(p => neighborButton(lane, p, true)).join('')}
      </div>
      <div class="lane-evolve-buttons">
        ${lane.engines.map(p => neighborButton(lane, p, true, 'apply')).join('')}
      </div>
      <div class="lane-evolve-buttons">
        ${lane.engines.map(p => neighborButton(lane, p, true, 'both')).join('')}
      </div>
    </article>`
    )
    .join('');
}

function renderFormatDiagnostics() {
  const fErrors = activeFormatErrors();
  $('#diag-count').textContent = fErrors.length;
  $('#diag-count').className = `count-pill ${fErrors.length ? 'has-warn' : ''}`;

  const banner = $('#format-banner');
  if (fErrors.length) {
    banner.hidden = false;
    banner.innerHTML = `<div class="format-banner-text">
      <strong>âš  ${fErrors.length} file format issue${fErrors.length === 1 ? '' : 's'} detected${selectedLane ? ` in ${esc(laneLabel(selectedLane))}` : ''}.</strong>
      <span>Since the UI is strictly read-only, copy the diagnostic prompt below and tell your AI to update the frontend parser.</span>
    </div>
    <div class="format-banner-actions">
      <button type="button" data-open-diag="1">Inspect Issues</button>
      <button type="button" class="copy-diag-btn" data-copy-all-diag="1">Copy AI Fix Prompt</button>
    </div>`;
  } else {
    banner.hidden = true;
    banner.innerHTML = '';
  }

  const copyAllBtn = $('#copy-all-diag');
  if (copyAllBtn) copyAllBtn.hidden = fErrors.length === 0;

  const listEl = $('#diag-list');
  if (!fErrors.length) {
    listEl.innerHTML = `<div class="diag-ok">
      <h3>âœ“ All lead files and project folders match expected formats</h3>
      <p class="muted">Checked ${selectedLane ? `lane <strong>${esc(laneLabel(selectedLane))}</strong>` : `all <strong>${dashboard.lanes.length}</strong> project lanes`}. If any project outputs a new or weird Markdown/file format in the future, it will appear here with a one-click prompt to update the frontend.</p>
    </div>`;
    return;
  }

  listEl.innerHTML = fErrors
    .map(
      (item, idx) => `<article class="diag-card ${esc(item.project)}">
      <div class="diag-card-head">
        <div>
          <span class="lane-tag">${esc(laneLabel(item.lane))}</span>
          <strong>${esc(names[item.project] || item.project)}</strong>
          <code>${esc(item.file)}</code>
        </div>
        <button type="button" class="copy-diag-btn" data-copy-diag-index="${idx}">Copy AI Fix Prompt</button>
      </div>
      <ul class="diag-issues">
        ${item.issues.map(iss => `<li>${inline(iss)}</li>`).join('')}
      </ul>
      ${item.snippet ? `<pre class="diag-snippet"><code>${esc(item.snippet)}</code></pre>` : ''}
    </article>`
    )
    .join('');
}

const projectCount = group => new Set(group.entries.map(e => e.project)).size;

function safeHttpUrl(url) {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol) ? url : '';
  } catch {
    return '';
  }
}

function groupUrl(group) {
  const active = group.entries.filter(e => !e.rejected && safeHttpUrl(e.url));
  const pool = active.length ? active : group.entries.filter(e => safeHttpUrl(e.url));
  const best = [...pool].sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1))[0];
  return best ? safeHttpUrl(best.url) : '';
}

function matchesStatusFilter(statusText, filterValue) {
  if (!filterValue) return true;
  const s = String(statusText || '').toLowerCase();
  if (filterValue === 'ready') return s.startsWith('ready');
  if (filterValue === 'try-worthy') return s.startsWith('try-worthy');
  if (filterValue === 'verify') return s.startsWith('verify');
  if (filterValue === 'waiting') return s.startsWith('waiting');
  return true;
}

function visibleGroups() {
  const query = $('#search').value.toLowerCase().trim();
  const project = $('#project-filter').value;
  const statusFilter = $('#status-filter').value;
  const includeRejected = $('#rejected').checked;
  const sharedOnly = $('#shared').checked;
  const malformedOnly = $('#malformed').checked;

  const groups = dashboard.groups.filter(g => {
    if (selectedLane && g.lane !== selectedLane) return false;
    const entries = g.entries.filter(
      e =>
        (includeRejected || !e.rejected) &&
        (!project || e.project === project) &&
        matchesStatusFilter(e.status, statusFilter) &&
        (!malformedOnly || (e.formatIssues && e.formatIssues.length > 0))
    );
    return (
      entries.length &&
      (!sharedOnly || projectCount(g) > 1) &&
      (!query ||
        g.entries.some(e =>
          `${e.title} ${e.status} ${e.opportunityId} ${names[e.project]} ${e.lane} ${laneLabel(e.lane)}`
            .toLowerCase()
            .includes(query)
        ))
    );
  });

  const fit = g => Math.max(-1, ...g.entries.filter(e => includeRejected || !e.rejected).map(e => e.fit ?? -1));
  const updated = g => Math.max(...g.entries.map(e => e.mtime));

  return groups.sort((a, b) => {
    const order = $('#sort').value;
    if (order === 'title') return a.title.localeCompare(b.title);
    if (order === 'updated') return updated(b) - updated(a);
    if (order === 'shared') return projectCount(b) - projectCount(a) || fit(b) - fit(a);
    return fit(b) - fit(a) || a.title.localeCompare(b.title);
  });
}

function renderList() {
  const groups = visibleGroups();
  const totalInScope = dashboard.groups.filter(
    g => (!selectedLane || g.lane === selectedLane) && g.entries.some(e => !e.rejected)
  ).length;
  $('#lead-count').textContent = totalInScope;
  $('#list-count').textContent = `${groups.length} opportunities Â· ${groups.filter(g => projectCount(g) > 1).length} shared across engines`;

  $('#rows').innerHTML =
    groups
      .map(g => {
        const hasFormatIssue = g.entries.some(e => e.formatIssues?.length);
        const url = groupUrl(g);
        return `<button class="lead-row ${selectedGroup === g.id ? 'selected' : ''}" aria-pressed="${selectedGroup === g.id}" data-group="${esc(g.id)}"${url ? ` data-url="${esc(url)}" title="Click to compare Â· Middle-click to open ${esc(url)}"` : ''}>
          <div class="row-top-meta">
            ${!selectedLane ? `<span class="lane-tag">${esc(laneLabel(g.lane))}</span>` : ''}
            ${projectCount(g) > 1 ? `<span class="shared-label">${projectCount(g)} engines</span>` : ''}
            ${hasFormatIssue ? `<span class="warn-badge" title="One or more assessments have a format warning">âš  Format</span>` : ''}
          </div>
          <span class="row-title">${esc(g.title)}</span>
          <span class="badges">${Object.keys(names)
            .filter(p => g.entries.some(e => e.project === p))
            .map(p => {
              const entries = g.entries.filter(e => e.project === p);
              const active = entries.filter(e => !e.rejected);
              const fits = (active.length ? active : entries).map(e => e.fit).filter(f => f != null);
              const range = !fits.length
                ? 'â€”'
                : Math.min(...fits) === Math.max(...fits)
                ? fits[0] + '%'
                : Math.min(...fits) + 'â€“' + Math.max(...fits) + '%';
              return `<span class="badge ${p} ${active.length ? '' : 'rejected'}" title="${entries.length} separate assessment(s)">${names[p]} ${range}${entries.length > 1 ? ' Â· ' + entries.length : ''}</span>`;
            })
            .join('')}</span>
        </button>`;
      })
      .join('') || '<div class="empty">No opportunities match these filters.</div>';
}

async function showGroup(id) {
  selectedGroup = id;
  renderList();
  const version = ++detailVersion;
  const group = dashboard.groups.find(g => g.id === id);
  if (!group) {
    $('#detail').innerHTML = '<div class="empty"><h2>Select an opportunity</h2><p>Choose an opportunity from the list to compare engine assessments.</p></div>';
    return;
  }
  $('#detail').innerHTML = '<div class="empty">Loading project assessmentsâ€¦</div>';
  const entries = [...group.entries].sort(
    (a, b) => Object.keys(names).indexOf(a.project) - Object.keys(names).indexOf(b.project)
  );
  const files = await Promise.allSettled(
    entries.map(e => api(`/api/file?lane=${encodeURIComponent(e.lane)}&project=${encodeURIComponent(e.project)}&path=${encodeURIComponent(e.id)}`))
  );
  if (version !== detailVersion) return;

  const card = (e, i) => {
    const warnHtml =
      e.formatIssues && e.formatIssues.length
        ? `<div class="card-format-warn" role="alert">
            <strong>âš  Format Issue:</strong> ${e.formatIssues.map(inline).join(' Â· ')}
            <button type="button" class="copy-diag-btn small" data-copy-entry-diag="${esc(e.lane)}|${esc(e.project)}|${esc(e.id)}">Copy AI Fix Prompt</button>
          </div>`
        : '';
    return `<article class="assessment ${e.project}">
      <div class="assessment-head">
        <h3>${names[e.project]}</h3>
        <p><strong>${e.fit == null ? 'Fit ungraded' : e.fit + '% fit'}</strong>${e.confidence ? ` Â· ${esc(e.confidence)} confidence` : ''}</p>
        <span class="status">${esc(e.status || 'No status')}${e.rejected ? ' Â· Rejected' : ''}</span>
        <div class="filename">${esc(e.lane)} / ${esc(e.id)}</div>
        ${e.url ? `<div class="source">${link(e.url, 'Official source â†—')}</div>` : ''}
        ${warnHtml}
      </div>
      <div class="md">${
        files[i].status === 'fulfilled'
          ? markdown(files[i].value.text)
          : `<p role="alert">${esc(files[i].reason.message)}</p>`
      }</div>
    </article>`;
  };

  $('#detail').innerHTML = `<div class="detail-header">
    <span class="eyebrow">${esc(laneLabel(group.lane)).toUpperCase()} Â· ${projectCount(group) > 1 ? 'SHARED SUBJECT' : 'OPPORTUNITY'}</span>
    <h2>${esc(group.title)}</h2>
    <p>${entries.length} separate assessment${entries.length === 1 ? '' : 's'}${group.subject ? ' of this subject' : ''} in <code>${esc(group.lane)}</code>. Fit, status, evidence and conclusions stay with their source architecture.</p>
  </div>
  <div class="comparison">${Object.keys(names)
    .filter(p => entries.some(e => e.project === p))
    .map(p => `<div class="project-column">${entries.map((e, i) => (e.project === p ? card(e, i) : '')).join('')}</div>`)
    .join('')}</div>`;
}

async function loadFiles() {
  const laneId = selectedLane || $('#doc-lane-select').value || dashboard.lanes[0]?.id;
  if (!laneId) return;
  loadedDocLane = laneId;
  $('#doc-lane-select').value = laneId;
  const results = await Promise.allSettled(
    Object.keys(names).map(project => api(`/api/files?lane=${encodeURIComponent(laneId)}&project=${encodeURIComponent(project)}`))
  );
  const paths = [...new Set(results.flatMap(r => (r.status === 'fulfilled' ? r.value.files.map(f => f.path) : [])))].sort();
  const prev = $('#file-select').value;
  $('#file-select').innerHTML =
    '<option value="">Select a documentâ€¦</option>' +
    paths.map(p => `<option value="${esc(p)}" ${p === prev ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

async function showFile() {
  const laneId = $('#doc-lane-select').value || selectedLane || dashboard.lanes[0]?.id;
  const path = $('#file-select').value;
  const version = ++fileVersion;
  if (!laneId || !path) {
    $('#file-detail').innerHTML = '';
    return;
  }
  $('#file-detail').innerHTML = '<div class="empty">Loading documentsâ€¦</div>';
  const projects = Object.keys(names);
  const files = await Promise.allSettled(
    projects.map(project => api(`/api/file?lane=${encodeURIComponent(laneId)}&project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`))
  );
  if (version !== fileVersion) return;
  $('#file-detail').innerHTML = projects
    .map(
      (project, i) => `<article class="assessment ${project}">
      <div class="assessment-head">
        <h3>${names[project]}</h3>
        <div class="filename">${esc(laneId)} / ${esc(path)}</div>
      </div>
      <div class="md">${
        files[i].status === 'fulfilled'
          ? markdown(files[i].value.text)
          : '<p class="muted">This document is unavailable in this project.</p>'
      }</div>
    </article>`
    )
    .join('');
}

async function selectLane(laneId) {
  selectedLane = laneId;
  renderLanes();
  renderProjects();
  renderFormatDiagnostics();
  renderList();
  if (selectedGroup) {
    const group = dashboard.groups.find(g => g.id === selectedGroup);
    if (!group || (selectedLane && group.lane !== selectedLane)) {
      selectedGroup = '';
      $('#detail').innerHTML =
        '<div class="empty"><h2>Select an opportunity</h2><p>Choose an opportunity from the list to compare engine assessments.</p></div>';
    }
  }
  if (activeTab === 'files' && selectedLane) {
    await loadFiles();
    await showFile();
  }
}

async function tab(id) {
  activeTab = id;
  for (const name of ['leads', 'files', 'diagnostics']) $('#' + name).hidden = name !== id;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
  if (id === 'files') {
    await loadFiles();
    await showFile();
  }
}

async function flashButton(btn, text = 'Copied!') {
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 1800);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    dashboard = await api('/api/dashboard');
    if (!initialLanePicked && dashboard.lanes.length) {
      initialLanePicked = true;
      const firstWithLeads = dashboard.lanes.find(l => !l.isTemplate && l.total > 0);
      selectedLane = firstWithLeads ? firstWithLeads.id : '';
    }
    renderLanes();
    renderProjects();
    renderFormatDiagnostics();
    renderList();
    $('#sync').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (dashboard.errors.length) {
      error(dashboard.errors.map(e => `${e.lane} (${names[e.project] || e.project}): ${e.error}`).join(' Â· '));
    }
  } catch (e) {
    $('#sync').textContent = 'Disconnected';
    error(e.message);
  } finally {
    refreshing = false;
  }
}

$('#lanes').onclick = guarded(e => {
  const pill = e.target.closest('[data-lane]');
  if (pill) return selectLane(pill.dataset.lane);
});

$('#rows').onclick = guarded(e => {
  const row = e.target.closest('[data-group]');
  if (row) return showGroup(row.dataset.group);
});

$('#rows').addEventListener('mousedown', e => {
  if (e.button === 1 && e.target.closest('[data-group]')) {
    e.preventDefault();
  }
});

$('#rows').addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const row = e.target.closest('[data-group]');
  if (!row) return;
  const url = safeHttpUrl(row.dataset.url);
  if (url) {
    e.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  }
});

$('#projects').onclick = guarded(async e => {
  const neighbor = e.target.closest('button[data-neighbor-project]');
  if (neighbor) {
    if (neighbor.disabled) return;
    error();
    const phase = NEIGHBOR_PHASES[neighbor.dataset.neighborPhase] ? neighbor.dataset.neighborPhase : 'peek';
    const result = await api(
      `/api/neighbor-prompt?lane=${encodeURIComponent(neighbor.dataset.neighborLane)}&project=${encodeURIComponent(neighbor.dataset.neighborProject)}&phase=${phase}`
    );
    await navigator.clipboard.writeText(result.text);
    return flashButton(neighbor, NEIGHBOR_PHASES[phase].copied);
  }
  const button = e.target.closest('button[data-copy-project]');
  if (!button || button.disabled) return;
  error();
  const lane = button.dataset.copyLane;
  const project = button.dataset.copyProject;
  const result = await api(
    `/api/prompt?lane=${encodeURIComponent(lane)}&project=${encodeURIComponent(project)}&iterations=${iterations()}`
  );
  await navigator.clipboard.writeText(result.text);
  await flashButton(button, `Copied ${names[project]} Prompt!`);
});

$('#format-banner').onclick = guarded(async e => {
  if (e.target.closest('[data-open-diag]')) return tab('diagnostics');
  const copyBtn = e.target.closest('[data-copy-all-diag]');
  if (copyBtn) {
    await navigator.clipboard.writeText(buildAiFixPrompt(activeFormatErrors()));
    await flashButton(copyBtn, 'Copied AI Fix Prompt!');
  }
});

$('#diagnostics').onclick = guarded(async e => {
  const singleBtn = e.target.closest('[data-copy-diag-index]');
  if (singleBtn) {
    const item = activeFormatErrors()[Number(singleBtn.dataset.copyDiagIndex)];
    if (item) {
      await navigator.clipboard.writeText(buildAiFixPrompt(item));
      await flashButton(singleBtn, 'Copied AI Fix Prompt!');
    }
  }
});

$('#copy-all-diag').onclick = guarded(async e => {
  const btn = e.currentTarget;
  await navigator.clipboard.writeText(buildAiFixPrompt(activeFormatErrors()));
  await flashButton(btn, 'Copied All Issues Prompt!');
});

$('#detail').onclick = guarded(async e => {
  const btn = e.target.closest('[data-copy-entry-diag]');
  if (!btn) return;
  const [lane, project, file] = btn.dataset.copyEntryDiag.split('|');
  const item = dashboard.formatErrors.find(err => err.lane === lane && err.project === project && err.file === file);
  if (item) {
    await navigator.clipboard.writeText(buildAiFixPrompt(item));
    await flashButton(btn, 'Copied AI Fix Prompt!');
  }
});

document.querySelector('nav').onclick = guarded(e => {
  const button = e.target.closest('[data-tab]');
  if (button) return tab(button.dataset.tab);
});

for (const id of ['search', 'project-filter', 'status-filter', 'sort', 'rejected', 'shared', 'malformed']) {
  $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', renderList);
}

$('#doc-lane-select').onchange = guarded(async () => {
  await loadFiles();
  await showFile();
});

$('#file-select').onchange = guarded(showFile);

$('#refresh').onclick = guarded(async () => {
  error();
  await refresh();
  if (selectedGroup && activeTab === 'leads') await showGroup(selectedGroup);
  if (activeTab === 'files') {
    await loadFiles();
    await showFile();
  }
});

await refresh();
setInterval(refresh, 5000);
