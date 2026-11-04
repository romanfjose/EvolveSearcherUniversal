// Batch Packer console. One UI, two backends:
//   local  (ui/serve.mjs)  previews and commits through the server, which re-parses every request and owns the disk;
//   static (docs/)         runs the same pure modules in the browser against an in-memory file tree.
import { pack } from '../src/packer.mjs';
import { stripNoise } from '../src/strip-noise.mjs';
import { unpack, plan } from '../src/unpacker.mjs';

const MODE = document.body.dataset.mode === 'static' ? 'static' : 'local';
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EXAMPLE = '../examples/grant-check/';

// ---------- backends ----------
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
const localBackend = {
  state: () => api('/api/state'),
  preview: (text, strict) => api('/api/preview', { text, strict }),
  commit: (text, strict, ids) => api('/api/commit', { text, strict, ids }),
  pack: (spec, save) => api('/api/pack', { spec, save }),
};
function staticBackend() {
  const vfs = new Map([['notes/log.md', '# Log\n']]);
  let manifest = null;
  const run = (text, strict) => { const result = unpack(text, { manifest, strict }); return { result, planned: plan(result, p => vfs.get(p) ?? null) }; };
  return {
    vfs,
    async state() {
      return { mode: 'static', root: 'in-memory demo tree', manifest: manifest && { batch: manifest.batch, outputs: manifest.outputs, packets: Object.keys(manifest.packets) } };
    },
    async preview(text, strict) { const { result, planned } = run(text, strict); return { ...result, items: planned }; },
    async commit(text, strict, ids) {
      const { result, planned } = run(text, strict);
      const written = [];
      for (const p of planned) if (['create', 'update', 'append'].includes(p.action) && (!ids || ids.includes(p.id))) {
        const ok = (vfs.get(p.path) ?? null) === (p.before ?? null);
        if (ok) vfs.set(p.path, p.after);
        written.push({ id: p.id, path: p.path, action: p.action, ok, ...(ok ? {} : { error: 'STALE_PLAN' }) });
      }
      return { summary: result.summary, written };
    },
    async pack(spec, save) { const out = pack(spec); if (save) manifest = out.manifest; return { ...out, saved: !!save }; },
  };
}
const backend = MODE === 'local' ? localBackend : staticBackend();

// ---------- state ----------
const S = { tab: 'unpack', server: null, preview: null, previewKey: '', sel: 0, packed: null, copied: 0, committed: new Set() };
const key = () => `${$('#strict').checked}\u0000${$('#reply').value}`;

// ---------- layout ----------
function shell() {
  $('#app').innerHTML = `
  <header>
    <h1>Batch Packer</h1>
    <span class="pill" id="mode-pill"></span>
    <span class="pill" id="manifest-pill"></span>
    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="unpack" title="Alt+1">Unpack <kbd>Alt 1</kbd></button>
      <button role="tab" data-tab="pack" title="Alt+2">Pack <kbd>Alt 2</kbd></button>
      <button role="tab" data-tab="strip" title="Alt+3">Strip <kbd>Alt 3</kbd></button>
      <button id="help-btn" title="Keyboard shortcuts (?)">?</button>
    </nav>
  </header>

  <section class="pane" id="tab-unpack">
    <div class="col">
      <div class="bar">
        <strong>Replies</strong><span class="hint">paste one or many chats; transcripts are fine</span><span class="grow"></span>
        <label title="Hold every item that needed a repair"><input type="checkbox" id="strict"> Strict</label>
        <button id="example-reply">Example</button>
      </div>
      <textarea class="editor" id="reply" spellcheck="false" placeholder="=== BEGIN_BUNDLE packet=pk-… ===&#10;=== FILE: leads/x.md ===&#10;…&#10;=== END FILE ===&#10;=== END_BUNDLE packet=pk-… ==="></textarea>
      <div class="bar"><button class="primary" id="go">Preview <kbd>Ctrl ↵</kbd></button><span class="hint" id="go-hint"></span></div>
    </div>
    <div class="col">
      <div class="summary" id="summary"><span class="hint">Preview shows every file the replies would write, the diff against disk, and why anything is held.</span></div>
      <div class="scroll" id="items" tabindex="0" aria-label="Items (j/k to move)"></div>
      <div class="detail"><div class="scroll" id="detail"></div></div>
    </div>
  </section>

  <section class="pane" id="tab-pack" hidden>
    <div class="col">
      <div class="bar"><strong>Task spec</strong><span class="hint">JSON: task, vars, schema, exclude, outputs, budget, sources[]</span><span class="grow"></span><button id="example-spec">Example</button></div>
      <textarea class="editor" id="spec" spellcheck="false"></textarea>
      <div class="bar"><button class="primary" id="pack-go">Pack <kbd>Ctrl ↵</kbd></button>
        <label title="${MODE === 'local' ? 'Writes .wbp/manifest.json under the root so replies can be routed' : 'Keeps the manifest in memory for the Unpack tab'}"><input type="checkbox" id="save" checked> Save manifest</label></div>
    </div>
    <div class="col"><div class="scroll" id="packets"><p class="empty">Packets appear here. <kbd>c</kbd> copies the next one.</p></div></div>
  </section>

  <section class="pane" id="tab-strip" hidden>
    <div class="col">
      <div class="bar"><strong>HTML or DOM dump</strong><span class="grow"></span><label><input type="checkbox" id="links"> Keep links</label><button id="example-html">Example</button></div>
      <textarea class="editor" id="html" spellcheck="false" placeholder="Paste page source or document.documentElement.outerHTML"></textarea>
    </div>
    <div class="col">
      <div class="bar"><span id="strip-stats" class="hint">Deterministic: the same page always yields the same L-numbers.</span><span class="grow"></span><button id="strip-copy">Copy</button></div>
      <pre class="scroll diff" id="stripped"></pre>
    </div>
  </section>

  <dialog id="help"><h3>Keyboard</h3><table>
    <tr><td><kbd>Ctrl/⌘ ↵</kbd></td><td>Preview; again (unchanged input) commits ready items</td></tr>
    <tr><td><kbd>Alt 1-3</kbd></td><td>Unpack · Pack · Strip</td></tr>
    <tr><td><kbd>j</kbd> <kbd>k</kbd> / <kbd>Alt ↓↑</kbd></td><td>Next / previous item</td></tr>
    <tr><td><kbd>e</kbd></td><td>Jump to the selected item's first problem in the paste</td></tr>
    <tr><td><kbd>c</kbd></td><td>Copy the next packet (Pack tab)</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>Back to the editor</td></tr></table>
    <p><button id="help-close">Close</button></p></dialog>`;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

function tab(name) {
  S.tab = name;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const id of ['unpack', 'pack', 'strip']) $('#tab-' + id).hidden = id !== name;
  $({ unpack: '#reply', pack: '#spec', strip: '#html' }[name]).focus();
}

async function refreshState() {
  S.server = await backend.state();
  $('#mode-pill').textContent = MODE === 'local' ? `local · ${S.server.root}${S.server.assay ? ' · canonical Assayer' : ''}` : 'static demo · nothing touches disk';
  $('#mode-pill').className = 'pill ' + (MODE === 'local' ? 'ok' : 'warn');
  const m = S.server.manifest;
  $('#manifest-pill').textContent = m ? `${m.batch} · ${m.packets.length} packet(s) · ${m.outputs.length ? m.outputs.join(' ') : 'any path'}` : 'no manifest: any safe path, no source checks';
  $('#manifest-pill').className = 'pill' + (m ? '' : ' warn');
}

// ---------- unpack ----------
const fresh = () => S.preview && S.previewKey === key();
function goHint() {
  const ready = S.preview?.items.filter(i => ['create', 'update', 'append'].includes(i.action)).length || 0;
  const commitMode = fresh() && ready > 0;
  $('#go').innerHTML = commitMode ? `Commit ${ready} file${ready === 1 ? '' : 's'} <kbd>Ctrl ↵</kbd>` : 'Preview <kbd>Ctrl ↵</kbd>';
  $('#go-hint').textContent = commitMode ? 'held items are never written' : S.preview && !fresh() ? 'input changed since preview' : '';
}

async function preview() {
  try {
    S.preview = await backend.preview($('#reply').value, $('#strict').checked);
    S.previewKey = key();
    S.committed = new Set();
    S.sel = Math.max(0, S.preview.items.findIndex(i => i.action === 'hold'));
    renderPreview();
  } catch (e) { $('#items').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  goHint();
}

async function commitReady() {
  const r = await backend.commit($('#reply').value, $('#strict').checked);
  const ok = r.written.filter(w => w.ok), bad = r.written.filter(w => !w.ok);
  toast(`Wrote ${ok.length} file(s)${bad.length ? `, ${bad.length} failed: ${bad.map(b => `${b.path} (${b.error})`).join(', ')}` : ''}`);
  const done = new Set(ok.map(w => w.id));
  await preview();
  S.committed = done;
  renderPreview();
}

function renderPreview() {
  const p = S.preview;
  if (!p) return;
  const s = p.summary, pill = (cls, t) => `<span class="pill ${cls}">${t}</span>`;
  $('#summary').innerHTML = [pill(s.ready ? 'ok' : '', `${s.ready} ready`), pill(s.held ? 'bad' : '', `${s.held} held`), pill('', `${s.bundles} repl${s.bundles === 1 ? 'y' : 'ies'}`),
    s.repairs ? pill('warn', `${s.repairs} repair${s.repairs === 1 ? '' : 's'}`) : '', p.requestsSkipped ? pill('', `${p.requestsSkipped} request packet(s) ignored`) : '',
    p.missing.length ? pill('warn', `awaiting ${p.missing.length}: ${p.missing.map(esc).join(' ')}`) : ''].join('');
  if (!p.bundles.length) { $('#items').innerHTML = '<p class="empty">No reply bundles found. Each reply starts with <code>=== BEGIN_BUNDLE packet=pk-… ===</code>.</p>'; $('#detail').innerHTML = ''; return; }
  $('#items').innerHTML = p.bundles.map(b => {
    const its = p.items.filter(i => i.bundle === b.index);
    const bd = b.diagnostics.filter(d => d.severity !== 'info');
    return `<section class="bundle"><h3>Reply ${b.index + 1} <code>${esc(b.packet ?? 'no packet id')}</code> <span>lines ${b.startLine}–${b.endLine}</span>
      ${b.terminated ? '' : '<span class="pill warn">no END_BUNDLE</span>'}${bd.map(d => `<span class="pill ${d.severity === 'error' ? 'bad' : 'warn'}" title="${esc(d.message)}">${esc(d.code)}</span>`).join('')}</h3>
      ${its.map(i => {
        const n = p.items.indexOf(i), action = S.committed.has(i.id) ? 'done' : i.action;
        const errs = i.diagnostics.filter(d => d.severity === 'error').length;
        return `<div class="item${n === S.sel ? ' sel' : ''}" data-i="${n}"><span class="tag ${action}">${action === 'done' ? 'written' : action}</span>
          <span class="path">${esc(i.path || i.rawPath)}</span><span class="counts">${errs ? `${errs} error${errs > 1 ? 's' : ''} · ` : ''}${i.citations} cite · ${i.repairs.length} fix</span></div>`;
      }).join('')}</section>`;
  }).join('');
  renderDetail();
}

function renderDetail() {
  const it = S.preview?.items[S.sel];
  if (!it) { $('#detail').innerHTML = ''; return; }
  const rows = [...it.diagnostics.map(d => ({ cls: d.severity, sev: d.severity, code: d.code, line: d.line, msg: d.message, ex: d.excerpt })),
    ...it.repairs.map(r => ({ cls: 'fixed', sev: 'fixed', code: r.code, line: r.line, msg: r.message }))];
  const list = rows.length ? `<ul class="diags">${rows.map(r => `<li class="${r.cls}" data-line="${r.line}"><span class="sev">${r.sev}</span><code>${esc(r.code)}</code>
    <span>L${r.line} · ${esc(r.msg)}${r.ex ? ` <code>${esc(r.ex.slice(0, 140))}</code>` : ''}</span></li>`).join('')}</ul>` : '';
  const text = it.diff || (it.action === 'unchanged' ? '(identical to the file on disk)' : it.body);
  const lines = text.split('\n').map(l => {
    const c = !it.diff ? 'm' : l.startsWith('@@') ? 'h' : l.startsWith('+++') || l.startsWith('---') ? 'm' : l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : '';
    return `<span class="${c}">${esc(l) || ' '}</span>`;
  }).join('');
  $('#detail').innerHTML = `${list}<pre class="diff" aria-label="${it.diff ? 'Diff' : 'Body'}">${lines}</pre>`;
}

function select(n) {
  const items = S.preview?.items || [];
  if (!items.length) return;
  S.sel = Math.max(0, Math.min(items.length - 1, n));
  renderPreview();
  $(`.item[data-i="${S.sel}"]`)?.scrollIntoView({ block: 'nearest' });
}

function jumpToLine(line) {
  const ta = $('#reply'), lines = ta.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  ta.focus();
  ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  ta.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(ta).lineHeight));
}

// ---------- pack ----------
async function doPack() {
  try {
    const spec = JSON.parse($('#spec').value);
    S.packed = await backend.pack(spec, $('#save').checked);
    S.copied = 0;
    if (S.packed.saved) await refreshState();
    $('#packets').innerHTML = `<div class="packets"><p class="hint">Batch <code>${esc(S.packed.batch)}</code>: paste each packet into its own chat, then paste all replies into Unpack.</p>
      ${S.packed.packets.map((p, k) => `<article class="packet"><header><strong>Part ${p.part}/${p.of}</strong><code>${esc(p.id)}</code>
      <span class="pill ${p.overBudget ? 'bad' : ''}">~${p.tokens} tokens</span><span class="grow"></span><button data-copy="${k}">Copy</button></header><pre>${esc(p.text)}</pre></article>`).join('')}</div>`;
  } catch (e) { $('#packets').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
async function copyPacket(k) {
  const p = S.packed?.packets[k];
  if (!p) return;
  try { await navigator.clipboard.writeText(p.text); toast(`Copied part ${p.part}/${p.of} (${p.id})`); } catch { toast('Clipboard blocked: select the text manually'); }
  S.copied = k + 1;
}

// ---------- strip ----------
function doStrip() {
  const r = stripNoise($('#html').value, { links: $('#links').checked });
  $('#stripped').textContent = r.numbered;
  $('#strip-stats').textContent = r.stats.inBytes ? `${r.stats.inBytes.toLocaleString()} → ${r.stats.outBytes.toLocaleString()} bytes · −${(r.stats.reduction * 100).toFixed(1)}% · ${r.stats.outLines} lines` : '';
}

// ---------- examples ----------
const fetchText = async f => { const r = await fetch(EXAMPLE + f); if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.text(); };
async function exampleSpec() {
  const spec = JSON.parse(await fetchText('task.json'));
  for (const s of spec.sources) if (s.file) { s.text = await fetchText(s.file); delete s.file; }
  return spec;
}

// ---------- wiring ----------
function wire() {
  document.addEventListener('click', async e => {
    const t = e.target.closest('button, .item, .diags li');
    if (!t) return;
    if (t.dataset.tab) tab(t.dataset.tab);
    else if (t.id === 'go') (fresh() ? commitReady : preview)();
    else if (t.id === 'pack-go') doPack();
    else if (t.dataset.copy) copyPacket(+t.dataset.copy);
    else if (t.id === 'strip-copy') navigator.clipboard?.writeText($('#stripped').textContent).then(() => toast('Copied'), () => toast('Clipboard blocked'));
    else if (t.id === 'help-btn') $('#help').showModal();
    else if (t.id === 'help-close') $('#help').close();
    else if (t.id === 'example-reply') { $('#reply').value = await fetchText('reply.txt'); goHint(); }
    else if (t.id === 'example-spec') $('#spec').value = JSON.stringify(await exampleSpec(), null, 2);
    else if (t.id === 'example-html') { $('#html').value = await fetchText('program-page.html'); doStrip(); }
    else if (t.classList.contains('item')) select(+t.dataset.i);
    else if (t.dataset.line) jumpToLine(+t.dataset.line);
  });
  $('#reply').addEventListener('input', goHint);
  $('#strict').addEventListener('change', goHint);
  let timer;
  $('#html').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(doStrip, 150); });
  $('#links').addEventListener('change', doStrip);
  document.addEventListener('keydown', e => {
    const typing = /^(TEXTAREA|INPUT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (S.tab === 'unpack') (fresh() ? commitReady : preview)();
      else if (S.tab === 'pack') doPack();
      else doStrip();
      return;
    }
    if (e.altKey && /^[123]$/.test(e.key)) { e.preventDefault(); tab(['unpack', 'pack', 'strip'][+e.key - 1]); return; }
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); select(S.sel + (e.key === 'ArrowDown' ? 1 : -1)); return; }
    if (e.key === 'Escape' && !$('#help').open) { tab(S.tab); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'j') select(S.sel + 1);
    else if (e.key === 'k') select(S.sel - 1);
    else if (e.key === 'e') { const d = S.preview?.items[S.sel]?.diagnostics[0]; if (d) jumpToLine(d.line); }
    else if (e.key === 'c' && S.tab === 'pack') copyPacket(S.copied % (S.packed?.packets.length || 1));
    else if (e.key === '?') $('#help').showModal();
  });
}

async function boot() {
  shell();
  wire();
  tab('unpack');
  try {
    if (MODE === 'static') {
      // Demo: pack the example task in-browser so the example reply routes against a real manifest.
      const spec = await exampleSpec();
      await backend.pack(spec, true);
      $('#spec').value = JSON.stringify(spec, null, 2);
      $('#reply').value = await fetchText('reply.txt');
    }
    await refreshState();
    if (MODE === 'static') await preview();
  } catch (e) { $('#summary').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  goHint();
}
boot();
