/* ============================================================
   Chat Replay — popup (v0.5.0)

   This file draws things and nothing else. Every operation that touches
   a chat page — capturing, scanning, exporting, replaying, teaching —
   is a message to the content script, which owns the engine and keeps
   running after this document is destroyed.

   That last part is the constraint everything here is shaped around: a
   popup dies the instant it loses focus, so it can NEVER be the thing
   holding a replay's state. It asks for a snapshot, paints it, and
   forgets. If it's closed for twenty minutes of a run, nothing notices.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const KEY_SESSION = "chatReplay.session";
const KEY_LIBRARY = "chatReplay.library";
const KEY_PRODUCT = "chatReplay.product";
const KEY_BASKET  = "chatReplay.basket";

let tabId = null;
let last = null;        // most recent snapshot
let poll = null;
let editorDirty = false; // don't overwrite the prompt box while it's being typed in

/* ---------------- transport ---------------- */

// The content script may not be there: the extension was reloaded while
// the tab stayed open, or the site is one of the matched hosts but the
// tab pre-dates install. Injecting on demand is cheaper than telling
// someone to go and reload their tab.
async function ensureContentScript() {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { cr: "ping" });
    if (r?.ok) return r;
  } catch { /* not injected yet */ }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["md.js", "adapters.js", "content.js"],
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["panel.css"] });
  } catch (e) {
    return null; // chrome:// page, web store, PDF viewer, no host access…
  }

  // Give the IIFE a moment to register its listener.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const r = await chrome.tabs.sendMessage(tabId, { cr: "ping" });
      if (r?.ok) return r;
    } catch { /* still booting */ }
  }
  return null;
}

async function send(cr, extra = {}) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { cr, ...extra });
    if (r?.ok) { last = r; render(r); }
    return r || null;
  } catch {
    // The tab navigated, closed, or the script went away mid-flight.
    stopPolling();
    setStatus("Lost the page — reopen this on the chat tab.", true);
    return null;
  }
}

function startPolling() {
  stopPolling();
  let tick = 0;
  poll = setInterval(() => {
    send("state");
    // The registry changes far more slowly than the status line, and
    // each check wakes the service worker — no reason to do it at 700ms.
    if (tick++ % 4 === 0) renderOthers();
  }, 700);
  renderOthers();
}
function stopPolling() { if (poll) clearInterval(poll); poll = null; }

/* ---------------- rendering ---------------- */

function setStatus(text, warn) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("warn", !!warn);
}

function render(s) {
  $("#site").textContent = [s.adapterLabel || s.host, s.model].filter(Boolean).join(" · ");
  setStatus(s.status);

  // Progress bar only earns its space while there's a run to show.
  const showBar = s.running || s.countdown || (s.progress?.n > 0 && s.progress.i > 0);
  $("#progress").hidden = !showBar;
  if (showBar) {
    const { i, n } = s.progress || { i: 0, n: 0 };
    $("#bar").style.width = n ? `${(i / n) * 100}%` : "0%";
  }

  $("#count").textContent = s.promptCount;
  $("#src").textContent = s.source ? `(${s.source})` : "";

  // --- replay range -----------------------------------------------
  const n = s.promptCount;
  const r = s.range || { from: 1, to: n, count: n };
  syncField("#from", r.from);
  syncField("#to", r.to);
  $("#from").max = Math.max(1, n);
  $("#to").max = Math.max(1, n);
  $("#rangesum").textContent = !n
    ? ""
    : r.count === n ? `— all ${n}` : `— ${r.count} of ${n}`;

  $$("#quick .chip").forEach((c) => {
    const k = Number(c.dataset.last);
    // "Last 5" is meaningless with 3 prompts loaded — dim it rather than
    // letting it silently clamp to something else.
    c.classList.toggle("dim", !n || (k > 0 && k > n));
    const matches = k === 0 ? (r.from === 1 && r.to === n) : (r.to === n && r.count === k);
    c.classList.toggle("on", !!n && matches);
  });

  // Resume is offered per tab and never rewrites the shared range —
  // three tabs replaying the same prompts must not move each other's
  // starting point.
  const resume = $("#resume");
  const canResume = s.resumeAt > 0 && !s.running && !s.countdown;
  resume.hidden = !canResume;
  if (canResume) resume.textContent = `Resume from ${s.resumeAt}`;

  const active = s.running || s.countdown;
  // ▶ stays live during an auto-run countdown, where it means "don't wait,
  // go now" — disabling it there would strip the countdown of half its
  // controls, which is the v0.3.1 bug in mirror image.
  $("#run").disabled = s.running || !s.promptCount;
  $("#pause").disabled = !s.running;
  $("#pause").textContent = s.paused ? "Resume" : "Pause";
  $("#stop").disabled = !active;
  $("#capture").disabled = s.busy || active;
  $("#loadlast").disabled = s.busy || active;

  for (const id of ["copymd", "savemd", "savejson", "savetxt", "scan"]) {
    $("#" + id).disabled = s.busy;
  }

  $("#turncount").textContent = s.turnCount
    ? `— ${s.turnCount.total} turns (${s.turnCount.users} yours)`
    : "";

  // Number fields: only sync when they're not being edited, otherwise a
  // 700ms poll fights the keyboard.
  syncField("#settle", s.settings?.settle);
  syncField("#minreply", s.settings?.minReply);
  if (document.activeElement !== $("#deepscan")) $("#deepscan").checked = s.settings?.deep !== false;
  if (document.activeElement !== $("#showfab")) $("#showfab").checked = !!s.settings?.showFab;

  $("#learned").textContent = s.learned
    ? `Learned: ${s.learned}`
    : "Using the built-in rules for this site.";
  $("#forget").hidden = !s.learned;

  if ($("#recstart")) {
    $("#recstart").textContent = s.recording
      ? `⏹ Stop & Save Recording (${s.recordedSteps || 0} steps)`
      : "⏺ Record steps & screenshots";
  }
  if ($("#reccopy")) {
    $("#reccopy").hidden = !s.hasLastRecording;
  }

  // Markdown built by an earlier (possibly closed) popup is still held
  // by the content script — surface it rather than making them re-scan.
  // Rebuild only on a real change — this runs on a 700ms poll, and
  // re-creating the node every tick makes it flicker and steals focus.
  const wantHint = s.pendingCopy && $("#copybox").hidden && !$("#copytext").value;
  const hint = $("#copyhint");
  if (wantHint && !hint) {
    const p = document.createElement("p");
    p.id = "copyhint";
    p.className = "hint";
    p.textContent = `Markdown from an earlier scan is still held (${s.pendingCopy.toLocaleString()} chars) — Copy as Markdown will use it instead of rescanning.`;
    $("#scan").after(p);
  } else if (!wantHint && hint) {
    hint.remove();
  }
}

function syncField(sel, val) {
  const el = $(sel);
  if (val == null || document.activeElement === el) return;
  if (String(el.value) !== String(val)) el.value = val;
}

/* ---------------- other tabs mid-replay ---------------- */

// The point of concurrent replays is that you're looking at something
// else while they run, so this is the only surface that can tell you
// they're still alive. The worker holds the registry; tabs re-announce
// themselves every few seconds, so a crashed or finished one ages out.
async function renderOthers() {
  let runs = [];
  try {
    const r = await chrome.runtime.sendMessage({ type: "activeRuns" });
    runs = (r?.runs || []).filter((x) => x.tabId !== tabId);
  } catch { /* worker restarting */ }

  const box = $("#others");
  if (!runs.length) { box.hidden = true; box.textContent = ""; return; }

  box.hidden = false;
  box.textContent = "";
  const lead = document.createElement("span");
  lead.innerHTML = `Also replaying in <b>${runs.length}</b> other tab${runs.length > 1 ? "s" : ""}: `;
  box.appendChild(lead);

  for (const run of runs) {
    const a = document.createElement("span");
    a.className = "otherlink";
    a.textContent = run.host || "tab";
    a.title = "Switch to this tab";
    a.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "focusTab", tabId: run.tabId });
      window.close();
    });
    box.appendChild(a);
  }
}

/* ---------------- clipboard ---------------- */

// Far less fraught than doing this in the page. The write happens in an
// extension document that holds the clipboardWrite permission, and the
// long scroll-scan that used to eat the user activation now happens in
// a different process entirely.
async function copyText(text) {
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try execCommand */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch { return false; }
}

function showCopyBox(text) {
  $("#copytext").value = text;
  $("#copybox").hidden = false;
  try { $("#copytext").focus(); $("#copytext").select(); } catch { /* ignore */ }
}

/* ---------------- tabs ---------------- */

function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === name));
  $("#body").scrollTop = 0;
  if (name === "prompts" && !editorDirty) loadEditor();
  if (name === "library") renderLibrary();
  chrome.storage.local.set({ "chatReplay.tab": name });
}

/* ---------------- prompts ---------------- */

async function loadEditor() {
  const r = await send("getPrompts");
  if (r?.prompts) {
    $("#editor").value = r.prompts.join("\n---\n");
    editorDirty = false;
  }
}

/* ---------------- library ---------------- */

const getLibrary = async () =>
  (await chrome.storage.local.get(KEY_LIBRARY))[KEY_LIBRARY] || [];
const setLibrary = (lib) => chrome.storage.local.set({ [KEY_LIBRARY]: lib });

function describeCfg(target, cfg) {
  const bits = Object.entries(cfg)
    .filter(([, v]) => v && !/leave/i.test(v))
    .map(([k, v]) => (k === "deepthink" ? `DeepThink ${v}` : v));
  return [target.label, ...bits].join(" · ");
}

// Model / effort / thinking stay EDITABLE combos rather than fixed
// dropdowns: these sites rename models constantly and a hardcoded list
// goes stale the week after it ships.
const FREE_TEXT = /^(model|effort|thinking)$/i;

async function renderLibrary() {
  const lib = await getLibrary();
  const list = $("#liblist");
  list.textContent = "";

  if (!lib.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Nothing pinned yet. Capture a chat, then pin it from the Prompts tab.";
    list.appendChild(p);
    return;
  }

  for (const entry of lib) {
    const row = document.createElement("div");
    row.className = "librow";
    row.queuedRuns = [];
    // Names are user-supplied; build with textContent, never innerHTML.
    row.innerHTML = `
      <div class="libname"></div>
      <div class="row">
        <button class="btn ghost small" data-act="load">Load</button>
        <button class="btn ghost small" data-act="launch">Launch…</button>
        <button class="btn ghost small" data-act="del">✕</button>
      </div>
      <div class="builder" hidden>
        <div class="row">
          <select data-role="site"></select>
          <button class="btn ghost small" data-act="add" style="width:auto">Add</button>
        </div>
        <div class="optrow" data-role="opts"></div>
        <div class="chips" data-role="chips"></div>
        <button class="btn primary small" data-act="go">Go — launch all in parallel</button>
      </div>`;

    const nameEl = row.querySelector(".libname");
    nameEl.title = entry.source || "";
    nameEl.textContent = entry.name + " ";
    const c = document.createElement("span");
    c.className = "hint";
    c.textContent = `(${entry.prompts.length})`;
    nameEl.appendChild(c);

    const siteSel = row.querySelector("[data-role='site']");
    for (const t of ChatReplayAdapters.launchTargets) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.label;
      siteSel.appendChild(o);
    }

    const optsBox = row.querySelector("[data-role='opts']");
    const chipsBox = row.querySelector("[data-role='chips']");

    const renderOpts = () => {
      const t = ChatReplayAdapters.launchTargets.find((x) => x.id === siteSel.value);
      optsBox.textContent = "";
      let n = 0;
      for (const [key, values] of Object.entries(t.options || {})) {
        const lab = document.createElement("label");
        lab.className = "mini";
        lab.appendChild(document.createTextNode(key));
        if (FREE_TEXT.test(key)) {
          const listId = `dl-${entry.id}-${siteSel.value}-${key}`;
          const inp = document.createElement("input");
          inp.type = "text";
          inp.dataset.opt = key;
          inp.setAttribute("list", listId);
          inp.value = values[0] || "";
          inp.placeholder = "exact label";
          const dl = document.createElement("datalist");
          dl.id = listId;
          for (const v of values) {
            const o = document.createElement("option");
            o.value = v;
            dl.appendChild(o);
          }
          lab.append(inp, dl);
        } else {
          const sel = document.createElement("select");
          sel.dataset.opt = key;
          for (const v of values) {
            const o = document.createElement("option");
            o.textContent = v;
            sel.appendChild(o);
          }
          lab.appendChild(sel);
        }
        optsBox.appendChild(lab);
        n++;
      }
      if (!n) {
        const s = document.createElement("span");
        s.className = "hint";
        s.textContent = "no options for this site";
        optsBox.appendChild(s);
      }
    };
    renderOpts();
    siteSel.addEventListener("change", renderOpts);

    const renderChips = () => {
      chipsBox.textContent = "";
      row.queuedRuns.forEach((r, idx) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = describeCfg(r.target, r.cfg) + " ✕";
        chip.addEventListener("click", () => { row.queuedRuns.splice(idx, 1); renderChips(); });
        chipsBox.appendChild(chip);
      });
    };

    row.querySelector("[data-act='add']").addEventListener("click", () => {
      const target = ChatReplayAdapters.launchTargets.find((x) => x.id === siteSel.value);
      const cfg = {};
      optsBox.querySelectorAll("[data-opt]").forEach((s) => (cfg[s.dataset.opt] = (s.value || "").trim()));
      row.queuedRuns.push({ target, cfg });
      renderChips();
    });

    row.querySelector("[data-act='go']").addEventListener("click", () => {
      if (!row.queuedRuns.length) { setStatus("Add at least one run first.", true); return; }
      chrome.runtime.sendMessage({
        type: "launchRuns",
        runs: row.queuedRuns.map((r) => ({
          url: r.target.url,
          prompts: entry.prompts,
          name: entry.name,
          cfg: r.cfg,
          desc: describeCfg(r.target, r.cfg),
        })),
      });
      setStatus(`Launching ${row.queuedRuns.length} run(s) in parallel windows…`);
      // The windows open staggered over several seconds; closing the
      // popup doesn't interrupt that, it's the worker's job.
      setTimeout(() => window.close(), 900);
    });

    row.querySelector("[data-act='load']").addEventListener("click", async () => {
      await send("usePrompts", { prompts: entry.prompts, source: `library: ${entry.name}` });
      showTab("replay");
    });

    row.querySelector("[data-act='launch']").addEventListener("click", () => {
      const b = row.querySelector(".builder");
      b.hidden = !b.hidden;
    });

    row.querySelector("[data-act='del']").addEventListener("click", async () => {
      await setLibrary((await getLibrary()).filter((e) => e.id !== entry.id));
      renderLibrary();
    });

    list.appendChild(row);
  }
}

/* ---------------- product mode (Mercado Libre) ---------------- */

/* A listing is not a chat, so none of the machinery above applies: no
   engine, no polling, no snapshot loop. The popup injects one small
   script, asks it for the product, and paints the answer.

   v0.7 — the list. Copying one product at a time meant a round trip to
   the LLM tab per product, which for five products is five paste
   cycles and five broken trains of thought. Now you add products as you
   browse and copy once, at the end.

   The list lives in chrome.storage, NOT in this document — a popup is
   destroyed the moment it loses focus, so anything held here would be
   gone by the time you opened the next listing. Storage also means the
   list survives the browser restarting, and can be copied from a tab
   that has no listing in it at all, which is where you'll be standing
   when you paste. */

const isMeli = (host) => /(^|\.)(mercadolibre|mercadolivre)\./i.test(host || "");

const PRODUCT_DEFAULTS = {
  format: "md",
  specs: true,
  description: true,
  logistics: true,
  reviews: false,   // off by default: the comments are the noisiest part
  expand: true,
  table: true,      // search results as one row each, not fifty blocks
  max: 50,          // one ML page is ~50; the cap is what gets pasted
  autoclear: false, // empty the list on copy — opt in, it discards data
};
let pOpts = { ...PRODUCT_DEFAULTS };
let pData = null;        // whatever this popup is standing on, if anything
let pKind = "none";      // "product" · "search" · "none"
let pMode = "none";      // "full" on an ML page · "list" everywhere else

const getBasket = async () => (await chrome.storage.local.get(KEY_BASKET))[KEY_BASKET] || [];

// The toolbar badge is the only thing that can tell you the list isn't
// empty while the popup is shut. It's set WITHOUT a tabId so it shows
// everywhere; the per-tab "▶" a replay sets still wins on its own tab.
function badgeCount(n) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: "#46704b" });
    chrome.action.setBadgeText({ text: n ? String(n) : "" });
  } catch { /* action API unavailable */ }
}

async function saveBasket(items) {
  try {
    await chrome.storage.local.set({ [KEY_BASKET]: items });
    badgeCount(items.length);
    return true;
  } catch {
    // Storage quota. Copying and clearing is the fix, and saying so is
    // more use than a silent failure that loses the product.
    setStatus("The list is full — copy what's in it, then Clear list.", true);
    return false;
  }
}

async function ensureProductScript() {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { crp: "ping" });
    if (r?.ok) return true;
  } catch { /* not injected yet */ }

  try {
    // The formatter first: product.js renders its preview through it.
    await chrome.scripting.executeScript({
      target: { tabId },
      // Formatter first (product.js renders its preview through it),
      // then the search reader, which product.js asks about before it
      // treats the page as a listing.
      files: ["product-format.js", "search.js", "product.js"],
    });
  } catch {
    return false;
  }
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const r = await chrome.tabs.sendMessage(tabId, { crp: "ping" });
      if (r?.ok) return true;
    } catch { /* still booting */ }
  }
  return false;
}

function readProductOpts() {
  pOpts = {
    format: $$("#pformat .chip").find((c) => c.classList.contains("on"))?.dataset.fmt || "md",
    specs: $("#pspecs").checked,
    description: $("#pdesc").checked,
    logistics: $("#plog").checked,
    reviews: $("#prev").checked,
    expand: $("#pexpand").checked,
    table: $("#ptable").checked,
    max: Math.min(200, Math.max(1, Number($("#pmax").value) || 50)),
    autoclear: $("#pautoclear").checked,
  };
  chrome.storage.local.set({ [KEY_PRODUCT]: pOpts });
  return pOpts;
}

function paintProductOpts() {
  $$("#pformat .chip").forEach((c) => c.classList.toggle("on", c.dataset.fmt === pOpts.format));
  $("#pspecs").checked = pOpts.specs;
  $("#pdesc").checked = pOpts.description;
  $("#plog").checked = pOpts.logistics;
  $("#prev").checked = pOpts.reviews;
  $("#pexpand").checked = pOpts.expand;
  $("#ptable").checked = pOpts.table !== false;
  $("#pmax").value = pOpts.max || 50;
  $("#pautoclear").checked = !!pOpts.autoclear;
}

// The search options are formatting options, so they matter wherever a
// saved search can be re-rendered — on the results page itself, and on
// the chat tab where you copy the list. The expand toggle is the
// opposite: it's a page action that only means something on a listing.
async function reflectPageKind(items) {
  const basket = items || (await getBasket());
  const anySearch = basket.some((e) => e?.data?.kind === "search");
  $("#psearchrow").hidden = !(pKind === "search" || anySearch);
  $("#pexpandrow").hidden = pKind === "search";
}

/* ---------------- the list ---------------- */

async function renderBasket() {
  const items = await getBasket();
  const list = $("#plist");
  list.textContent = "";

  const products = items.filter((e) => e?.data?.kind !== "search").length;
  const results = items.reduce((n, e) => n + (e?.data?.results?.length || 0), 0);
  $("#pcount").textContent = items.length
    ? `— ${items.length}` + (results ? ` (${products ? `${products} + ` : ""}${results} resultados)` : "")
    : "— empty";
  $("#pcopylist").disabled = !items.length;
  $("#pcopylist").textContent = items.length > 1 ? `Copy list (${items.length})` : "Copy list";

  // Enabled rather than hidden, and back to its quiet self whenever the
  // list changes — the loud version only means "you just copied this".
  $("#pclear").disabled = !items.length;
  markCopied(false);
  await reflectPageKind(items);

  for (const [i, item] of items.entries()) {
    const { title, price } = ChatReplayProduct.label(item);
    const row = document.createElement("div");
    row.className = "prow";

    const n = document.createElement("span");
    n.className = "pnum";
    n.textContent = i + 1;

    const t = document.createElement("span");
    t.className = "ptitle";
    t.title = title;
    t.textContent = title;

    const p = document.createElement("span");
    p.className = "pprice";
    p.textContent = price;

    const x = document.createElement("button");
    x.className = "pdel";
    x.textContent = "✕";
    x.title = "Remove from the list";
    x.addEventListener("click", async () => {
      const cur = await getBasket();
      await saveBasket(cur.filter((e) => e.key !== item.key));
      await renderBasket();
      reflectKeepButton();
    });

    row.append(n, t, p, x);
    list.appendChild(row);
  }

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = pMode === "full"
      ? "Nothing added yet."
      : "Nothing in the list. Open a Mercado Libre listing — or a page of\n       search results — to add one.";
    list.appendChild(p);
  }
  return items;
}

// Adding the same page twice should update it, not duplicate it — you'll
// often reopen a listing to change the colour, or re-sort a search by
// price, before adding. For a search the URL carries the sort and the
// filters, so "the same search, sorted differently" is a new entry and
// "the same search, re-read" replaces the old one. Both are right.
async function addCurrent() {
  if (!pData) return;
  const items = await getBasket();
  const key = ChatReplayProduct.key(pData);
  const entry = { key, addedAt: Date.now(), data: pData };
  const at = items.findIndex((e) => e.key === key);
  const replacing = at >= 0;
  if (replacing) items[at] = entry; else items.push(entry);

  if (!(await saveBasket(items))) return;
  await renderBasket();
  reflectKeepButton();

  const what = pKind === "search"
    ? `${Math.min(pOpts.max || 50, pData.results?.length || 0)} results`
    : "this listing";
  setStatus(replacing
    ? `Updated ${what} in the list — ${items.length} entr${items.length > 1 ? "ies" : "y"} saved.`
    : `Added ${what} — ${items.length} in the list. Keep browsing, then Copy list.`);
}

// Nothing in a browser can tell us you pasted: the clipboard is
// write-only from here and the paste lands in a page we're not in. So
// the handover gets marked at the last moment we CAN see — the copy —
// and the Clear button turns into the obvious next step instead of
// staying a quiet ghost button you have to remember exists.
function markCopied(on) {
  const btn = $("#pclear");
  btn.classList.toggle("primary", !!on);
  btn.classList.toggle("ghost", !on);
  btn.textContent = on ? "Clear list — you've copied it ✓" : "Clear list";
}

// Enabling is synchronous — it depends only on whether there's a
// product under the popup. Only the LABEL needs to know what's already
// in the list, so that part lands a tick later rather than holding the
// button disabled while storage answers.
function reflectKeepButton() {
  const btn = $("#pkeep");
  btn.disabled = !pData;
  const n = pKind === "search" ? Math.min(pOpts.max || 50, pData?.results?.length || 0) : 0;
  const add = pKind === "search" ? `Add all ${n} results to the list` : "Add to list";
  if (!pData) {
    btn.textContent = add;
    btn.classList.add("primary");
    btn.classList.remove("ghost");
    return;
  }
  const key = ChatReplayProduct.key(pData);
  getBasket().then((items) => {
    if (!pData || ChatReplayProduct.key(pData) !== key) return; // page changed under us
    const there = items.some((e) => e.key === key);
    btn.textContent = there
      ? (pKind === "search" ? "Already in the list — re-read it" : "Already in the list — update it")
      : add;
    btn.classList.toggle("ghost", there);
    btn.classList.toggle("primary", !there);
  });
}

/* ---------------- copying ---------------- */

// The product pane can be showing on a tab where the export pane's
// fallback box is hidden, so it carries its own landing pad.
function productFallback(text) {
  $("#pfalltext").value = text;
  $("#pfallback").hidden = false;
  try { $("#pfalltext").focus(); $("#pfalltext").select(); } catch { /* ignore */ }
}

// Returns whether the clipboard actually took it — "copy, then clear"
// must not clear on the strength of a write that was refused.
async function copyOut(text, ok) {
  if (!text) { setStatus("Nothing to copy yet.", true); return false; }
  if (await copyText(text)) {
    setStatus(ok);
    return true;
  }
  productFallback(text);
  setStatus("Clipboard refused the write — the text below is selected, press ⌘/Ctrl+C.", true);
  return false;
}

/* ---------------- page reads ---------------- */

function renderProduct(r) {
  if (!r?.ok) {
    pData = null;
    pKind = "none";
    $("#pcopy").disabled = true;
    reflectKeepButton();
    reflectPageKind();
    setStatus("Couldn't read this page — reload it and reopen this popup.", true);
    return;
  }
  if (!r.product) {
    pData = null;
    pKind = "none";
    $("#pcopy").disabled = true;
    $("#ppreview").value = "";
    $("#pstats").textContent = "";
    $("#pwhat").textContent = "This page";
    reflectKeepButton();
    reflectPageKind();
    setStatus("No listing and no search results here. Open a product page, or search for something.", true);
    return;
  }
  pData = r.data;
  pKind = r.kind === "search" ? "search" : "product";
  $("#pcopy").disabled = false;
  $("#pcopy").textContent = pKind === "search" ? "Copy just this page" : "Copy just this one";
  $("#pwhat").textContent = pKind === "search" ? "This search" : "This listing";
  $("#ppreview").value = r.text;
  reflectKeepButton();
  reflectPageKind();

  const s = r.stats || {};
  const bits = pKind === "search"
    ? [
        `${s.results} result${s.results === 1 ? "" : "s"} on this page`,
        s.total && s.total > s.results ? `of ${s.total.toLocaleString()}` : "",
        s.sponsored ? `${s.sponsored} sponsored` : "",
      ]
    : [
        s.specs ? `${s.specs} specs` : "",
        s.highlights ? `${s.highlights} highlights` : "",
        s.variations ? `${s.variations} variant${s.variations > 1 ? "s" : ""}` : "",
        pOpts.reviews && s.reviews ? `${s.reviews} reviews` : "",
      ];
  const shown = bits.filter(Boolean);
  $("#pstats").textContent = shown.length ? `— ${shown.join(", ")}` : "";

  if (pKind === "search" && !s.results) {
    setStatus("Found the results page but read nothing off it — try Re-read after the page finishes loading.", true);
    return;
  }
  setStatus(`${r.text.length.toLocaleString()} characters read from this page.`);
}

// `format` re-renders what was already read; only `scrape` touches the
// page again. Flipping a checkbox shouldn't reopen a modal.
async function askProduct(cr) {
  try {
    return await chrome.tabs.sendMessage(tabId, { crp: cr, opts: readProductOpts() });
  } catch {
    setStatus("Lost the page — reload the listing and reopen this popup.", true);
    return null;
  }
}

/* ---------------- wiring, shared by both modes ---------------- */

function wireProductCommon() {
  const rerender = async () => {
    if (pMode === "full") renderProduct(await askProduct("format"));
    else readProductOpts();
    await renderBasket();
  };

  $$("#pformat .chip").forEach((c) => c.addEventListener("click", async () => {
    $$("#pformat .chip").forEach((x) => x.classList.toggle("on", x === c));
    await rerender();
  }));

  ["#pspecs", "#pdesc", "#plog", "#prev", "#ptable"].forEach((sel) =>
    $(sel).addEventListener("change", rerender));
  // `max` re-renders from the cached read; it never re-touches the page.
  $("#pmax").addEventListener("change", rerender);
  $("#pautoclear").addEventListener("change", () => readProductOpts());

  $("#pcopylist").addEventListener("click", async () => {
    const items = await getBasket();
    const opts = readProductOpts();
    const text = ChatReplayProduct.list(items, opts);
    const results = items.reduce((n, e) => n + Math.min(opts.max, e?.data?.results?.length || 0), 0);
    const what = results
      ? `${items.length} entr${items.length > 1 ? "ies" : "y"} (${results} search results)`
      : `${items.length} product${items.length > 1 ? "s" : ""}`;

    if (!(await copyOut(text, `Copied ${what} — one paste drops them all in.`))) return;

    // The list is data you can't get back by clicking again — an
    // accidental clear costs a shopping trip. So it's opt-in, and the
    // copy that preceded it is the receipt.
    if (opts.autoclear) {
      await saveBasket([]);
      await renderBasket();
      reflectKeepButton();
      setStatus(`Copied ${what} and emptied the list — paste it now, the clipboard still has it.`);
    } else {
      markCopied(true);
    }
  });

  $("#pclear").addEventListener("click", async () => {
    await saveBasket([]);
    await renderBasket();
    reflectKeepButton();
    setStatus("List cleared.");
  });

  $("#pfallhide").addEventListener("click", () => {
    $("#pfallback").hidden = true;
    $("#pfalltext").value = "";
  });
}

async function loadProductOpts() {
  const stored = (await chrome.storage.local.get(KEY_PRODUCT))[KEY_PRODUCT];
  pOpts = { ...PRODUCT_DEFAULTS, ...(stored || {}) };
  paintProductOpts();
}

/* ---------------- mode: on a listing ---------------- */

async function initProduct() {
  pMode = "full";
  $("#site").textContent = "Mercado Libre";

  // The chat tabs are dead weight here — hide them rather than letting
  // someone click Replay on a shopping page and get an error.
  $$(".tab").forEach((t) => (t.hidden = t.dataset.tab !== "product"));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === "product"));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === "product"));
  $("#version").textContent = "";

  await loadProductOpts();
  wireProductCommon();
  await renderBasket();

  $("#pkeep").addEventListener("click", addCurrent);
  $("#pcopy").addEventListener("click", () =>
    copyOut($("#ppreview").value, pKind === "search"
      ? "Copied this page of results ✓ — paste it into any chat."
      : "Copied this one ✓ — paste it into any chat."));

  // Expanding is a page action, so this one has to re-read.
  $("#pexpand").addEventListener("change", async () => {
    setStatus("Re-reading…");
    renderProduct(await askProduct("scrape"));
  });
  $("#prescan").addEventListener("click", async () => {
    setStatus("Re-reading…");
    renderProduct(await askProduct("scrape"));
  });

  setStatus("Reading the page…");
  if (!(await ensureProductScript())) {
    setStatus("Can't reach this page. Reload it, then reopen this popup.", true);
    $("#pcopy").disabled = true;
    $("#pkeep").disabled = true;
    return;
  }
  renderProduct(await askProduct("scrape"));
}

/* ---------------- mode: anywhere else, list not empty ---------------- */

// Without this, walking to claude.ai with five products saved and no
// copy taken is a dead end: the popup there would show the chat tabs
// and no way to reach the list.
async function initBasketTab() {
  pMode = "list";
  $("[data-tab='product']").hidden = false;
  $(".pane[data-pane='product']").classList.add("listonly");
  await loadProductOpts();
  wireProductCommon();
  await renderBasket();
  $("#phint").textContent =
    "Saved from Mercado Libre. Copy list, then paste into the chat — and " +
    "clear it afterwards so the next batch starts empty.";
}

/* ---------------- wiring ---------------- */

function wire() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  $("#capture").addEventListener("click", () => send("capture"));
  $("#loadlast").addEventListener("click", () => send("loadLast"));

  const pushSettings = () => send("settings", {
    patch: {
      settle: Number($("#settle").value) || 4,
      minReply: Number($("#minreply").value) || 0,
      from: Number($("#from").value) || 1,
      to: Number($("#to").value) || 0,
      deep: $("#deepscan").checked,
      showFab: $("#showfab").checked,
    },
  });
  ["#settle", "#minreply", "#from", "#to", "#deepscan", "#showfab"]
    .forEach((sel) => $(sel).addEventListener("change", pushSettings));

  // The range lives in shared storage on purpose: set "last 3" once, then
  // walk to your other two chats and just hit Replay in each.
  $$("#quick .chip").forEach((c) => c.addEventListener("click", () => {
    const k = Number(c.dataset.last);
    const n = last?.promptCount || 0;
    if (!n) return;
    $("#from").value = k === 0 ? 1 : Math.max(1, n - k + 1);
    $("#to").value = n;
    pushSettings();
  }));

  $("#run").addEventListener("click", async () => {
    await pushSettings();
    send("run", {}); // no startAt ⇒ begin at the range's lower bound
  });
  $("#resume").addEventListener("click", () => send("run", { startAt: last?.resumeAt }));
  $("#pause").addEventListener("click", () => send("pause"));
  $("#stop").addEventListener("click", () => send("stop"));

  $("#copymd").addEventListener("click", async () => {
    setStatus("Building Markdown…");
    const r = await send("export", { kind: "copy" });
    const text = r?.markdown || (await send("takePending"))?.markdown;
    if (!text) { setStatus("Nothing to export here yet.", true); return; }
    if (await copyText(text)) {
      await send("clearPending");
      setStatus(`Copied ${r?.turns ?? "?"} turns as Markdown — paste it into your workspace.`);
    } else {
      showCopyBox(text);
      setStatus("Clipboard refused the write — hit Copy now below, or ⌘/Ctrl+C (the text is selected).", true);
    }
  });
  $("#copynow").addEventListener("click", async () => {
    if (await copyText($("#copytext").value)) {
      $("#copybox").hidden = true;
      $("#copytext").value = "";
      await send("clearPending");
      setStatus("Copied to clipboard ✓");
    } else {
      $("#copytext").select();
      setStatus("Still blocked — press ⌘/Ctrl+C, the text is selected above.", true);
    }
  });
  $("#copyhide").addEventListener("click", () => {
    $("#copybox").hidden = true;
    $("#copytext").value = "";
  });

  $("#savemd").addEventListener("click", () => send("export", { kind: "md" }));
  $("#savejson").addEventListener("click", () => send("export", { kind: "json" }));
  $("#savetxt").addEventListener("click", () => send("export", { kind: "txt" }));
  $("#scan").addEventListener("click", () => send("scan"));

  $("#editor").addEventListener("input", () => (editorDirty = true));
  $("#apply").addEventListener("click", async () => {
    await send("setPrompts", { text: $("#editor").value });
    editorDirty = false;
    showTab("replay");
  });
  $("#reload").addEventListener("click", () => { editorDirty = false; loadEditor(); });

  $("#savelib").addEventListener("click", async () => {
    const r = await send("getPrompts");
    const prompts = r?.prompts || [];
    if (!prompts.length) { setStatus("Nothing loaded to pin.", true); return; }
    const lib = await getLibrary();
    lib.push({
      id: Date.now().toString(36),
      name: $("#savename").value.trim() || `${last?.host || "chat"} — ${new Date().toLocaleDateString()}`,
      source: last?.host || "",
      prompts,
      savedAt: Date.now(),
    });
    await setLibrary(lib);
    $("#savename").value = "";
    setStatus("Pinned to library.");
    showTab("library");
  });

  // Step & Screenshot Recorder: closes popup when starting so user can interact with the page
  if ($("#recstart")) {
    $("#recstart").addEventListener("click", async () => {
      if (last?.recording) {
        const r = await send("recordStop");
        if (r?.markdown && await copyText(r.markdown)) {
          setStatus("Recording saved & copied to clipboard ✓");
        }
      } else {
        await send("recordStart");
        window.close();
      }
    });
  }
  if ($("#reccopy")) {
    $("#reccopy").addEventListener("click", async () => {
      const r = await send("takeLastRecording");
      if (!r?.markdown) { setStatus("No recording found yet.", true); return; }
      setStatus(await copyText(r.markdown)
        ? "Step recording copied to clipboard ✓ — paste it into the chat."
        : "Clipboard blocked — open Export tab to copy manually.", false);
    });
  }

  // Teaching needs the popup GONE — the whole interaction is clicking on
  // the page underneath it.
  $("#teach").addEventListener("click", async () => {
    await send("teach");
    window.close();
  });
  $("#forget").addEventListener("click", () => send("forget"));
  $("#diag").addEventListener("click", async () => {
    const r = await send("diagnostics");
    if (!r?.report) { setStatus("Couldn't build diagnostics.", true); return; }
    setStatus(await copyText(r.report)
      ? "Diagnostics copied — paste the text straight into the chat with Claude."
      : "Couldn't reach the clipboard — open the tab's console (F12) instead.");
  });
}

/* ---------------- boot ---------------- */

// showDead() strips the tab bar, so the list needs putting back by hand.
async function offerBasketOnDeadPage() {
  $("#body").classList.remove("dead");
  $("#dead")?.remove();
  $("#tabs").hidden = false;
  $$(".tab").forEach((t) => (t.hidden = t.dataset.tab !== "product"));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === "product"));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === "product"));
  await initBasketTab();
  const n = (await getBasket()).length;
  setStatus(`Nothing to replay here, but ${n} product${n > 1 ? "s are" : " is"} saved — Copy list, then paste.`);
}

function showDead(host) {
  stopPolling();
  $("#body").classList.add("dead");
  $("#tabs").hidden = true;
  $("#progress").hidden = true;
  setStatus(host ? `Nothing to do on ${host}.` : "Nothing to do on this page.");
  const box = document.createElement("div");
  box.id = "dead";
  box.innerHTML = `<p class="hint">Open one of these and try again:</p><ul></ul>`;
  const ul = box.querySelector("ul");
  for (const t of ChatReplayAdapters.launchTargets) {
    const li = document.createElement("li");
    li.textContent = t.label;
    ul.appendChild(li);
  }
  $("#body").appendChild(box);
}

async function init() {
  $("#version").textContent = `Chat Replay v${chrome.runtime.getManifest().version}`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { showDead(""); return; }
  tabId = tab.id;

  let host = "";
  try { host = new URL(tab.url || "").hostname; } catch { /* restricted page */ }

  // The badge is repainted on every open: it's the only signal that the
  // list is waiting while the popup is shut.
  const basket = await getBasket();
  badgeCount(basket.length);

  // Mercado Libre gets its own mode: a different script, no engine, no
  // polling. Returning here keeps the chat path untouched.
  if (isMeli(host)) { await initProduct(); return; }

  const snap = await ensureContentScript();
  if (!snap) {
    // A saved list is still reachable on a page the chat engine can't
    // touch — otherwise the products are stranded until you find your
    // way back to Mercado Libre.
    if (basket.length) { showDead(host); await offerBasketOnDeadPage(); return; }
    showDead(host);
    return;
  }

  wire();
  render(snap);

  // Reopen on whichever tab was last used — over a session you tend to
  // live in one of them, and re-navigating every time is a wasted click.
  const stored = (await chrome.storage.local.get("chatReplay.tab"))["chatReplay.tab"];
  showTab(["replay", "export", "prompts", "library", "fix"].includes(stored) ? stored : "replay");

  // Products saved and not yet copied: surface the list here too, so
  // arriving at the chat without having copied isn't a dead end.
  // Switching to it would be an ambush mid-replay, so the tab appears
  // (and the badge counts) but only takes focus when nothing's running.
  if (basket.length) {
    await initBasketTab();
    if (!snap.running && !snap.countdown) showTab("product");
  }

  startPolling();
}

document.addEventListener("DOMContentLoaded", init);
