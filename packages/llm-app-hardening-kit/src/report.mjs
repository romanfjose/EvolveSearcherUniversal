// Self-contained, dark-mode HTML audit report (no external assets, no network).
import { CATEGORIES, RULES, SEVERITY_ORDER } from './repo-scanner.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tone = (n) => (n >= 80 ? 'good' : n >= 50 ? 'warn' : 'bad');

/**
 * @param {object} o
 * @param {string} [o.title]
 * @param {string} [o.subtitle]
 * @param {object} o.before  result of scanDir()
 * @param {object} [o.after] result of scanDir() for the hardened tree
 * @param {string} [o.generatedAt] fixed label for reproducible output
 */
export function renderReport({ title = 'LLM Production Hardening Audit', subtitle = '', before, after, generatedAt = '' }) {
  const strip = (r) => r && { root: r.root, filesScanned: r.filesScanned, score: r.score, summary: r.summary, findings: r.findings.map(({ fix, title, ...f }) => f) };
  const data = {
    before: strip(before), after: strip(after),
    rules: Object.fromEntries(RULES.map((r) => [r.id, { title: r.title, severity: r.severity, category: r.category, fix: r.fix }])),
    categories: CATEGORIES, severities: SEVERITY_ORDER,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const b = before.score, a = after?.score;

  const scoreRows = Object.entries(CATEGORIES).map(([k, label]) => {
    const bv = b.categories[k], av = a?.categories[k];
    const n = before.findings.filter((f) => f.category === k).length;
    return `<div class="row">
      <div class="label">${esc(label)}<span class="sub">${n} finding${n === 1 ? '' : 's'} before</span></div>
      <div class="bars">
        <div class="bar"><span class="tag">Before</span><div class="track"><div class="fill ${tone(bv)}" style="width:${bv}%"></div></div><b class="${tone(bv)}">${bv}</b></div>
        ${a ? `<div class="bar"><span class="tag">After</span><div class="track"><div class="fill ${tone(av)}" style="width:${av}%"></div></div><b class="${tone(av)}">${av}</b></div>` : ''}
      </div></div>`;
  }).join('');

  const sevCounts = (r) => SEVERITY_ORDER.map((s) => `<span class="pill sev-${s}">${r.summary.bySeverity[s]} ${s}</span>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#0b0d12;--panel:#12151c;--panel2:#181c25;--line:#252a36;--text:#e6e8ee;--muted:#9aa3b5;--good:#3ecf8e;--warn:#f0b429;--bad:#f2555a;--accent:#7aa2ff;
--critical:#f2555a;--high:#f2884b;--medium:#f0b429;--low:#8fa3c7;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end;justify-content:space-between;margin-bottom:28px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:17px;margin:0 0 14px}.muted,.sub{color:var(--muted)}
.hero{display:flex;gap:12px;align-items:center}.big{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
.arrow{color:var(--muted);font-size:22px}.delta{font-size:13px;padding:2px 8px;border-radius:99px;background:#163a2b;color:var(--good)}
.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}
section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:20px}
.row{display:grid;grid-template-columns:minmax(180px,1fr) 2fr;gap:16px;padding:12px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.label{font-weight:600}.sub{display:block;font-weight:400;font-size:13px}
.bar{display:grid;grid-template-columns:52px 1fr 36px;align-items:center;gap:10px;margin:3px 0}.tag{font-size:12px;color:var(--muted)}
.track{height:10px;background:var(--panel2);border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:99px;transition:width .6s}
.fill.good{background:var(--good)}.fill.warn{background:var(--warn)}.fill.bad{background:var(--bad)}.bar b{text-align:right;font-variant-numeric:tabular-nums}
.pills{display:flex;flex-wrap:wrap;gap:6px}.pill{font-size:12px;padding:2px 9px;border-radius:99px;border:1px solid var(--line);background:var(--panel2)}
.sev-critical{color:var(--critical)}.sev-high{color:var(--high)}.sev-medium{color:var(--medium)}.sev-low{color:var(--low)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.stat{background:var(--panel2);border-radius:10px;padding:14px}.stat .n{font-size:28px;font-weight:700}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
button,select,input{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
button[aria-pressed=true]{border-color:var(--accent);background:#1b2540}input{flex:1;min-width:160px}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
details{border-top:1px solid var(--line);padding:10px 0}summary{cursor:pointer;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;list-style:none}
summary::-webkit-details-marker{display:none}code,pre{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.loc{color:var(--muted);font-size:13px}pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.fix{border-left:3px solid var(--good);padding-left:10px;margin:8px 0 0}.empty{color:var(--good);padding:16px 0}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:8px 6px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500}
footer{color:var(--muted);font-size:13px;text-align:center}
@media (max-width:640px){.row,.grid2{grid-template-columns:1fr}.big{font-size:36px}}
</style>
</head>
<body>
<main>
<header>
  <div><h1>${esc(title)}</h1><div class="muted">${esc(subtitle)}</div></div>
  <div class="hero" aria-label="Overall score">
    <span class="big ${tone(b.overall)}">${b.overall}</span>
    ${a ? `<span class="arrow">→</span><span class="big ${tone(a.overall)}">${a.overall}</span><span class="delta">+${a.overall - b.overall} pts</span>` : ''}
  </div>
</header>

<section>
  <h2>Production readiness scorecard</h2>
  ${scoreRows}
  <p class="muted" style="margin:12px 0 0;font-size:13px">Score per category = 100 − Σ severity weight of its findings (critical 50, high 30, medium 15, low 5), floored at 0. Overall = mean of categories.</p>
</section>

<section class="grid2">
  <div class="stat"><div class="muted">Before · ${before.filesScanned} files</div><div class="n bad">${before.summary.total}</div><div class="pills">${sevCounts(before)}</div></div>
  ${a ? `<div class="stat"><div class="muted">After · ${after.filesScanned} files</div><div class="n ${after.summary.total ? 'warn' : 'good'}">${after.summary.total}</div><div class="pills">${sevCounts(after)}</div></div>` : ''}
</section>

<section>
  <h2>Findings</h2>
  <div class="controls" role="toolbar" aria-label="Filters">
    <button data-side="before" aria-pressed="true">Before</button>
    ${a ? '<button data-side="after" aria-pressed="false">After</button>' : ''}
    <select id="sev" aria-label="Severity"><option value="">All severities</option>${SEVERITY_ORDER.map((s) => `<option>${s}</option>`).join('')}</select>
    <select id="cat" aria-label="Category"><option value="">All categories</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
    <input id="q" type="search" placeholder="Filter by file, rule or text" aria-label="Search findings">
  </div>
  <div id="list" aria-live="polite"></div>
</section>

<section>
  <h2>Rule catalog</h2>
  <table><thead><tr><th>Rule</th><th>Detects</th><th>Severity</th><th>Category</th></tr></thead><tbody>
  ${RULES.map((r) => `<tr><td><code>${r.id}</code></td><td>${esc(r.title)}</td><td class="sev-${r.severity}">${r.severity}</td><td>${esc(CATEGORIES[r.category])}</td></tr>`).join('')}
  </tbody></table>
</section>
<footer>llm-app-hardening-kit · deterministic static analysis${generatedAt ? ` · ${esc(generatedAt)}` : ''}</footer>
</main>
<script type="application/json" id="data">${json}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = (s) => document.querySelector(s), list = $('#list');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let side = 'before';
  function render() {
    const sev = $('#sev').value, cat = $('#cat').value, q = $('#q').value.toLowerCase();
    const rows = D[side].findings.filter((f) => (!sev || f.severity === sev) && (!cat || f.category === cat) &&
      (!q || (f.path + f.rule + f.message + f.snippet + D.rules[f.rule].title).toLowerCase().includes(q)));
    if (!rows.length) { list.innerHTML = '<div class="empty">' + (D[side].findings.length ? 'No findings match the filters.' : '✓ No findings. Every rule passes.') + '</div>'; return; }
    list.innerHTML = rows.map((f) => {
      const r = D.rules[f.rule];
      return '<details><summary><span class="pill sev-' + f.severity + '">' + f.severity + '</span><code>' + f.rule + '</code><strong>' + esc(r.title) +
        '</strong><span class="loc">' + esc(f.path) + ':' + f.line + ':' + f.col + '</span></summary>' +
        '<p>' + esc(f.message) + ' · <span class="muted">' + esc(D.categories[f.category]) + '</span></p><pre>' + esc(f.snippet) + '</pre><p class="fix">' + esc(r.fix) + '</p></details>';
    }).join('');
  }
  document.querySelectorAll('[data-side]').forEach((btn) => btn.addEventListener('click', () => {
    side = btn.dataset.side;
    document.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render();
  }));
  ['#sev', '#cat', '#q'].forEach((s) => $(s).addEventListener('input', render));
  render();
})();
</script>
</body>
</html>
`;
}
