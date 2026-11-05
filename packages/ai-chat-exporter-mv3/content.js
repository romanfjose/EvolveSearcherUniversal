/* ============================================================
   Chat Replay — engine (headless since v0.5)

   There is no panel here any more. The interface is the toolbar popup;
   this file owns the engine and answers messages from it. The popup is
   destroyed whenever it loses focus, so nothing below may wait on it —
   state is written to `view` and collected on request.

   v0.5.1 added a replay RANGE (send only the last N prompts) and made
   backgrounded replays run at full speed: a hidden tab's timers are
   throttled to once a minute, so the polling waits also resolve on a
   wake ping from the service worker, which messages are not throttled.

   v0.4.2 fixed Copy as Markdown. It wasn't the clipboard API: the deep
   scan runs BEFORE the copy and takes tens of seconds on a long chat,
   so the click that started it had long since stopped counting as user
   activation and the browser refused the write — then the old code
   discarded the transcript and said "clipboard blocked". Now the built
   markdown is kept, harvests are cached (so a second click is instant
   and still inside the gesture), and a blocked write falls through to a
   "Copy now" button that is itself a fresh gesture.

   v0.4.0 added transcript export (Markdown / JSON / TXT) built for
   feeding conversations back into a project workspace as agent-readable
   context, plus scroll-harvesting so LONG chats export in full instead
   of just the handful of turns the site happens to have mounted.

   Inherited v0.3.2 fixes (the "GLM long reply" bug):
   - Stuck-busy bail-out raised 12s → 120s of silence; 12s fired during
     slow first tokens and sent the next prompt mid-generation.
   - Soft timeout (7 min) only fires when the site says idle; genuinely
     busy waits may run to a 30-min absolute cap.
   - The loop refuses to type while isBusy() — clicking "send" during
     generation actually clicks Stop on most sites.
   ============================================================ */

(() => {
  const adapter = ChatReplayAdapters.forHost(location.hostname);
  const KEY_SESSION = "chatReplay.session";
  const KEY_LEARNED = "chatReplay.learned";
  const log = (...a) => console.debug("[ChatReplay]", ...a);

  const state = {
    prompts: [],
    running: false,
    paused: false,
    stopRequested: false,
    countdownActive: false, // auto-run countdown owns ▶ while true
    currentIndex: 0,
    settleSeconds: 4,
    minReplySeconds: 6,
    maxWaitSeconds: 420,   // soft timeout — only fires when the site says idle
    absoluteCapSeconds: 1800, // 30 min — nothing waits longer than this, ever
  };
  // v0.5 — everything the UI used to READ off the panel now lives here.
  //
  // The panel is gone: the interface is the toolbar popup, which is a
  // separate document that Chrome destroys the moment it loses focus.
  // So the engine can't own widgets, and it can't push updates to
  // anything either — a `setStatus` during a 20-minute replay usually
  // has no listener at all. Instead the engine writes here, and the
  // popup reads a snapshot of it whenever it happens to be open.
  //
  // Consequence worth remembering: nothing in the engine may `await` a
  // reply from the popup, because there may be no popup.
  const view = {
    status: "Ready. Capture this chat's prompts, or export the conversation.",
    progress: { i: 0, n: 0 },
    turnCount: null,       // {total, users} once a scan has run
    source: "",            // where the loaded prompts came from
    learned: null,         // learned-layout config for this host
    pendingCopy: "",       // markdown built but not yet on the clipboard
    deep: true,            // "scroll the whole chat first"
    resumeAt: 0,           // per-tab halt point; 0 = nothing to resume
    teaching: false,
    recording: false,
    recordedSteps: 0,
    lastRecordingMd: "",
    startNow: false,       // countdown escape hatches, set by the popup
    cancelCountdown: false,
    busy: false,           // a page-touching op is in flight
  };

  // "The busy signal must be stuck" threshold. v0.3.1 bailed after just 12s
  // of page silence — but slow first tokens / silent thinking on long
  // prompts easily exceed 12s, so the replay sent the NEXT prompt into a
  // chat that was still generating (and "send" was the Stop button then).
  const stuckBusyQuiet = () => Math.max(state.settleSeconds * 10, 120);

  const sget = (key) => new Promise((r) => chrome.storage.local.get(key, (d) => r(d[key])));
  const sset = (key, val) => new Promise((r) => chrome.storage.local.set({ [key]: val }, r));
  const saveSession = () =>
    sset(KEY_SESSION, { prompts: state.prompts, source: location.hostname, savedAt: Date.now() });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (base, spread) => base + Math.random() * spread;

  /* ---------------- wakeable timers ---------------- */

  // v0.5.1 — the thing that stops concurrent replays actually working.
  //
  // Chrome throttles timers in a HIDDEN tab: to once a second after ~10s,
  // and to once a MINUTE once the tab has been hidden five minutes with
  // no audio ("intensive throttling"). The reply-completion poll below
  // runs on a 500ms timer, so in a background tab it wakes roughly once
  // a minute — meaning every prompt sits idle for up to a minute after
  // the model actually finished. Two tabs replaying while you work in a
  // third is exactly the case that hits this hardest.
  //
  // Timers can't be un-throttled, but MESSAGES aren't throttled: a
  // chrome.tabs.sendMessage from the service worker is dispatched to a
  // hidden tab immediately. So a nap resolves on EITHER its timer or a
  // wake ping, whichever lands first, and the worker pings every few
  // seconds while any tab is replaying. A throttled tab then runs at
  // ping speed instead of timer speed.
  //
  // Only the polling waits use this. Anything that must burn real time —
  // the pause between send attempts, the human-pace gaps — uses realWait
  // below, which a ping can shorten but never skip.
  const sleepers = new Set();

  function nap(ms) {
    return new Promise((resolve) => {
      const entry = {};
      entry.fire = () => {
        clearTimeout(entry.timer);
        sleepers.delete(entry);
        resolve();
      };
      entry.timer = setTimeout(entry.fire, ms);
      sleepers.add(entry);
    });
  }

  function wakeAll() {
    for (const e of Array.from(sleepers)) e.fire();
  }

  // A floor on ELAPSED time that a ping can still make responsive. Used
  // where waking early would be wrong — sendVerified checks "did it
  // leave?" after this, and answering too soon makes it escalate to a
  // second send method, which is how you get a duplicate message.
  async function realWait(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) await nap(Math.min(250, until - Date.now()));
  }

  // Announce to the worker that this tab is mid-replay, so it knows to
  // keep pinging. Re-sent periodically rather than once: an MV3 worker
  // is killed when idle, and this both revives it and re-registers the
  // tab, so the arrangement heals itself without any stored state.
  let lastAnnounce = 0;
  function announceRunning(force) {
    const now = Date.now();
    if (!force && now - lastAnnounce < 5000) return;
    lastAnnounce = now;
    try {
      chrome.runtime.sendMessage({
        type: state.running ? "runStarted" : "runEnded",
        host: location.hostname,
      });
    } catch { /* worker asleep; the next announce will land */ }
  }

  /* ---------------- insertion + verified send ---------------- */

  // Shared with the test suite and the docs playground — see adapters.js.
  const { readInputText, insertTextFast, pressEnter } = ChatReplayAdapters.inject;

  // Fingerprint of the user side of the transcript: turn count + tail of
  // the last user message. If this changes after a send attempt, the
  // message left — even if the site keeps the input text until the
  // server acks (escalating in that case would risk a DUPLICATE send).
  function transcriptSignature() {
    try {
      const users = (adapter.transcript() || []).filter((t) => t.role === "user");
      return users.length + "|" + (users[users.length - 1]?.text?.slice(-60) || "");
    } catch { return null; }
  }

  async function sendVerified(input) {
    const before = transcriptSignature();
    const hadTextInInput = readInputText(input).trim().length > 0;
    const sentAlready = () =>
      (hadTextInInput && readInputText(input).trim() === "") ||
      (before != null && transcriptSignature() !== before) ||
      safeIsBusy();

    const attempts = [
      () => { const b = adapter.getSendButton(); if (b && !b.disabled) { b.click(); return true; } return false; },
      () => { pressEnter(input); return true; },
      () => { const f = input.closest("form"); if (f?.requestSubmit) { f.requestSubmit(); return true; } return false; },
    ];
    for (const attempt of attempts) {
      if (!attempt()) continue;
      // Large 30KB-50KB prompts on ChatGPT ProseMirror can take ~2s to serialize and clear.
      // Wait long enough before falling back to Enter/requestSubmit so we never double-send.
      await realWait(jitter(2400, 1200));
      if (sentAlready()) return true;
    }
    await sleep(1000);
    return sentAlready();
  }

  /* ---------------- completion detection ---------------- */

  // LOAD-BEARING INVARIANT — read before refactoring:
  // The panel (#chat-replay-root) is appended to document.documentElement,
  // deliberately OUTSIDE <body>, so that our own status line (updated every
  // 500ms during a wait) never counts as page activity. If the panel ever
  // moves inside <body>, or the observer root becomes documentElement,
  // "quietFor" can never exceed ~0.5s and every prompt waits out the full
  // hard timeout. Keep these two facts in sync.
  //
  // v0.3.1: the observer is scoped to the adapter's transcript container
  // when one exists, so site chrome elsewhere on the page (ticking
  // relative timestamps, ads, animations) can't hold "quiet" hostage
  // either — that failure mode meant waits only ended at maxWaitSeconds.
  let lastMutation = Date.now();
  let observedRoot = null;
  const mo = new MutationObserver(() => (lastMutation = Date.now()));

  function observeTranscript() {
    let root = null;
    try { root = adapter.getTranscriptRoot?.() || null; } catch { /* fall through */ }
    if (!root || !root.isConnected || root === document.documentElement) root = document.body;
    if (root !== observedRoot) {
      mo.disconnect();
      mo.observe(root, { childList: true, subtree: true, characterData: true });
      observedRoot = root;
      log("observing transcript root:", root.tagName, root.className || "(body)");
    }
    return root;
  }
  observeTranscript(); // starts on <body>; narrows once a transcript exists

  let lastTextLen = 0;
  function textStillGrowing() {
    const root = observedRoot || document.body;
    const len = root.textContent.length;
    const grew = len !== lastTextLen;
    lastTextLen = len;
    if (grew) lastMutation = Date.now();
    return grew;
  }

  const safeIsBusy = () => { try { return adapter.isBusy(); } catch { return false; } };

  async function waitForReplyDone(ui, opts = {}) {
    const start = Date.now();
    const settleTarget = opts.settleOverride || state.settleSeconds;
    const minReplyTarget = opts.minReplyOverride || state.minReplySeconds;
    const maxWaitTarget = opts.maxWaitOverride || state.maxWaitSeconds;
    // Re-resolve the transcript container each wait: in a fresh chat it
    // doesn't exist until the first exchange renders.
    lastTextLen = observeTranscript().textContent.length;
    await sleep(2500);
    while (true) {
      if (state.stopRequested) return false;
      while (state.paused && !state.stopRequested) await nap(400);
      observeTranscript();
      textStillGrowing();
      const busy = safeIsBusy() || (opts.extraBusyCheck ? !!opts.extraBusyCheck() : false);
      const quietFor = (Date.now() - lastMutation) / 1000;
      const waited = (Date.now() - start) / 1000;
      const pastFloor = waited >= minReplyTarget;

      // Normal completion: the site says idle AND the transcript is quiet.
      if (pastFloor && !busy && quietFor >= settleTarget) return true;

      // Stuck busy indicator — only believed after a LONG silence, because
      // a genuinely slow model looks exactly like this for a while.
      const stuckLimit = opts.stuckBusyOverride || stuckBusyQuiet();
      if (pastFloor && busy && quietFor >= stuckLimit) {
        ui.setStatus(`Busy signal looks stuck (silent ${Math.round(quietFor)}s) — moving on.`);
        return true;
      }

      // Soft timeout only applies when the site does NOT claim to be busy;
      // while it's genuinely generating we keep waiting (up to the cap).
      if (waited > maxWaitTarget && !busy) {
        ui.setStatus("Timed out waiting — continuing anyway.");
        return true;
      }
      if (waited > state.absoluteCapSeconds) {
        ui.setStatus("Hit the 30-min absolute cap — continuing anyway.");
        return true;
      }
      ui.setStatus(busy
        ? `Model is working… (${Math.round(waited)}s, quiet ${quietFor.toFixed(0)}s)`
        : `Waiting for quiet: ${quietFor.toFixed(0)}/${settleTarget}s (min ${minReplyTarget}s)`);
      // Keeps the worker's ping loop alive for as long as we're waiting,
      // which is what keeps this poll off the once-a-minute throttle.
      announceRunning();
      await nap(500);
    }
  }

  /* ---------------- replay loop ---------------- */

  /* ---------------- replay range ---------------- */

  // v0.5.1 — you often want to push only the LAST few prompts to the
  // other chats you're keeping in step, not the whole conversation
  // again. That's a range over the captured list rather than a separate
  // "copy N" list, which means one set of numbers to reason about: the
  // range doubles as "start at #" (its lower bound) and as the resume
  // point after a Stop.
  //
  // Numbers here are 1-based and INCLUSIVE, because they're the ones
  // shown in the popup and in "Sending prompt 6 of 8".
  function range() {
    return ChatReplayAdapters.inject.replayRange(state.prompts.length, settings.from, settings.to);
  }

  async function runReplay(ui, startAtOverride) {
    if (state.running) return;
    if (!state.prompts.length) { ui.setStatus("No prompts loaded."); return; }

    const { from, to, count } = range();
    // A resume point (set when a previous run halted) beats the range's
    // lower bound, but is still clamped inside it.
    const begin = Math.min(Math.max(Number(startAtOverride) || from, from), to);
    if (!count) { ui.setStatus("That range is empty."); return; }

    state.currentIndex = begin - 1;
    state.running = true;
    state.stopRequested = false;
    state.paused = false;
    view.resumeAt = 0;
    ui.setRunning(true);
    announceRunning(true);

    // True only if the loop runs to natural completion — a break on the
    // LAST prompt must not be reported as success (v0.3 did exactly that).
    let completedAll = false;
    let haltReason = "";

    for (let i = begin - 1; i <= to - 1; i++) {
      state.currentIndex = i;
      ui.setProgress(i - (from - 1), count);
      if (state.stopRequested) break;
      while (state.paused && !state.stopRequested) await nap(400);
      if (state.stopRequested) break;

      // Belt-and-suspenders: never type while the model is still generating —
      // in that state the send slot is usually the STOP button, and clicking
      // it would abort the reply in progress.
      if (safeIsBusy()) {
        ui.setStatus(`Model still busy — waiting before prompt ${i + 1}…`);
        for (let g = 0; g < 90 && safeIsBusy() && !state.stopRequested; g++) await nap(1000);
        if (state.stopRequested) break;
      }

      const input = adapter.getInput();
      if (!input) {
        haltReason = "Can't find the message box — send Claude the diagnostics.";
        break;
      }

      ui.setStatus(count === state.prompts.length
        ? `Sending prompt ${i + 1} of ${count}…`
        : `Sending prompt ${i + 1} (${i - from + 2} of ${count} in range)…`);
      insertTextFast(input, state.prompts[i]);
      await sleep(jitter(600, 700));
      if (!(await sendVerified(input))) {
        haltReason = `Prompt ${i + 1} wouldn't send — hit 'Copy diagnostics' and send it to Claude.`;
        break;
      }
      if (!(await waitForReplyDone(ui))) break; // stop requested mid-wait
      if (i === to - 1) completedAll = true;
      await sleep(jitter(1500, 2000));
    }

    ui.setProgress(completedAll ? count : state.currentIndex - (from - 1), count);
    if (completedAll) {
      ui.setStatus(count === state.prompts.length
        ? "Replay complete ✓"
        : `Replay complete ✓ (prompts ${from}-${to})`);
      state.currentIndex = from - 1;
    } else {
      // The resume point is held PER TAB and deliberately not written to
      // shared settings. Three tabs replaying the same range is the whole
      // point of this feature, and persisting one tab's halt would move
      // the range's lower bound for the other two — silently skipping
      // prompts in chats that were running perfectly well.
      view.resumeAt = state.currentIndex + 1;
      ui.setStatus((state.stopRequested ? "Stopped." : haltReason || "Replay halted.") +
        ` Resume from ${view.resumeAt} when you're ready.`);
    }
    state.running = false;
    ui.setRunning(false);
    announceRunning(true);
  }

  /* ---------------- transcript harvesting ---------------- */

  // Long chats are VIRTUALISED on most of these sites: only the turns
  // near the viewport exist in the DOM, so reading it once gives you the
  // tail of the conversation and nothing else. We scroll from the top
  // down in viewport-sized steps and accumulate turns as they mount.
  //
  // Dedupe key is role + head + tail of the text rather than element
  // identity, because a turn that scrolls out and back in is a BRAND NEW
  // element. Head+tail (not the whole body) keeps the key cheap and
  // survives a trailing caret/streaming artefact.
  function turnKey(role, text) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    return role + "|" + t.length + "|" + t.slice(0, 120) + "|" + t.slice(-60);
  }

  function readTurns() {
    let raw = [];
    try { raw = adapter.turns() || []; } catch (e) { log("turns err", e); return []; }
    const out = [];
    for (const t of raw) {
      const body = t.body || t.el;
      if (!body) continue;
      const text = t.editTa
        ? (t.editTa.value || "").trim()
        : ChatReplayMd.htmlToPlain(body, { preWrap: t.role === "user" });
      if (!text) continue;
      const md = t.editTa ? text : (ChatReplayMd.turnToMd(t) || text);
      out.push({ role: t.role, text, md });
    }
    return out;
  }

  // null means "scroll the window". Getting this wrong is quiet and
  // expensive: the scan appears to run, moves nothing, and exports only
  // the turns that happened to be mounted.
  const scrollerOf = () => {
    let sc = null;
    try { sc = adapter.getScrollRoot?.() || null; } catch { sc = null; }
    if (sc) return sc;
    if (document.documentElement.scrollHeight > window.innerHeight + 40) return null; // window really does scroll
    let root = null;
    try { root = adapter.getTranscriptRoot?.() || null; } catch { /* optional */ }
    const cands = Array.from(document.querySelectorAll("div,main,section,ul,ol")).filter((n) => {
      if (n.closest("#chat-replay-root")) return false;
      const st = getComputedStyle(n);
      return /(auto|scroll|overlay)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 40;
    });
    const near = root ? cands.filter((n) => n.contains(root) || root.contains(n)) : [];
    const pool = near.length ? near : cands;
    return pool.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
  };

  async function harvestTurns(ui, deep) {
    if (!deep) return readTurns();

    const sc = scrollerOf();
    const getTop = () => (sc ? sc.scrollTop : window.scrollY);
    const setTop = (v) => (sc ? (sc.scrollTop = v) : window.scrollTo(0, v));
    const viewH = () => (sc ? sc.clientHeight : window.innerHeight);
    const fullH = () => (sc ? sc.scrollHeight : document.documentElement.scrollHeight);

    const restore = getTop();
    const seen = new Map();
    const order = [];
    const absorb = () => {
      for (const t of readTurns()) {
        const k = turnKey(t.role, t.text);
        if (seen.has(k)) {
          // Prefer the longest version we've seen: a turn caught mid-mount
          // can be truncated.
          if (t.text.length > seen.get(k).text.length) seen.set(k, t);
          continue;
        }
        seen.set(k, t);
        order.push(k);
      }
    };

    setTop(0);
    await sleep(700);
    absorb();

    // Some chats don't virtualise so much as PAGINATE: hitting the top
    // fetches the previous batch. Sit at the top until the page stops
    // growing, otherwise the walk down starts halfway through the
    // conversation and the early turns are simply missing.
    for (let i = 0; i < 8; i++) {
      const before = fullH();
      setTop(0);
      await sleep(600);
      absorb();
      if (fullH() <= before + 8) break;
      ui?.setStatus(`Loading earlier turns… ${order.length} so far`);
    }

    let guard = 0;
    const step = Math.max(200, Math.floor(viewH() * 0.75));
    while (guard++ < 400) {
      const before = getTop();
      setTop(before + step);
      await sleep(320);
      absorb();
      ui?.setStatus(`Scanning chat… ${order.length} turns so far`);
      const now = getTop();
      if (now <= before + 2) break;              // couldn't move: at the end
      if (now + viewH() >= fullH() - 4) {        // reached the bottom
        await sleep(400);
        absorb();
        break;
      }
    }
    setTop(restore);
    await sleep(120);
    absorb();
    return order.map((k) => seen.get(k));
  }

  /* ---------------- export ---------------- */

  function exportMeta(turns) {
    let model = "";
    try { model = adapter.currentModel?.() || ""; } catch { /* optional */ }
    return {
      site: location.hostname,
      label: adapter.label || location.hostname,
      model,
      url: location.href,
      title: (() => {
        let t = (document.title || "")
          .replace(/\s*[-|–—]\s*(ChatGPT|Gemini|Claude|Kimi|DeepSeek|Qwen|Grok|Z\.ai|Outlier).*$/i, "").trim();
        // Single-page apps often never set a per-conversation title, so
        // every export would land as "outlier-playground-…" and collide.
        const GENERIC = /^(outlier(\s+playground)?|playground|new chat|chat|untitled)$/i;
        if (!t || GENERIC.test(t)) {
          const seg = location.pathname.split("/").filter(Boolean).pop() || "";
          t = [adapter.label || location.hostname, seg.length && seg.length <= 40 ? seg : ""]
            .filter(Boolean).join(" — ");
        }
        return t;
      })(),
      exportedAt: new Date().toISOString(),
      version: (() => { try { return "v" + chrome.runtime.getManifest().version; } catch { return "v?"; } })(),
    };
  }

  // Pair numbering: a USER turn opens a new pair, the ASSISTANT reply that
  // follows shares its number. Makes "turn 7" mean the same thing in every
  // file you hand to an agent, no matter which site it came from.
  function numberTurns(turns) {
    let pair = 0;
    let lastRole = null;
    return turns.map((t) => {
      if (t.role === "user" && lastRole !== "user") pair++;
      else if (t.role === "assistant" && lastRole === null) pair++;
      lastRole = t.role;
      return { ...t, pair: Math.max(1, pair) };
    });
  }

  function download(text, name, mime) {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = "noopener";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // v0.4.2 — why "Copy as Markdown" kept failing on real conversations:
  //
  // The hard part is not the clipboard API, it's USER ACTIVATION. Copy
  // runs the deep scan FIRST, which scrolls the entire chat from top to
  // bottom — tens of seconds on a long one. Transient activation expires
  // after ~5 seconds, and programmatic scrolling doesn't refresh it, so
  // by the time there was text to write the browser refused both
  // navigator.clipboard AND execCommand. The old code reported that as
  // "Clipboard blocked by the page" and threw the transcript away.
  //
  // Three layers now:
  //   1. the async API, with the window explicitly focused (it rejects
  //      outright on an unfocused document);
  //   2. a hidden textarea inside <body> — the old one was parented to
  //      <html>, where selection is unreliable, so that fallback was
  //      never really a fallback — with the data set from a copy
  //      listener so nothing depends on the selection surviving;
  //   3. if the browser still says no, the text is KEPT and the panel
  //      offers a button whose click is itself a fresh gesture. That one
  //      cannot fail for lack of activation.
  let pendingCopy = "";

  async function writeClipboard(text) {
    if (!text) return false;
    try { window.focus(); } catch { /* framed / cross-origin */ }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* no activation, not focused, or blocked by policy */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
      (document.body || document.documentElement).appendChild(ta);
      const sel = document.getSelection();
      const prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      ta.focus();
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch { /* older engines */ }
      const onCopy = (e) => {
        try { e.clipboardData.setData("text/plain", text); e.preventDefault(); } catch { /* leave the default */ }
      };
      document.addEventListener("copy", onCopy, true);
      const ok = document.execCommand("copy");
      document.removeEventListener("copy", onCopy, true);
      ta.remove();
      if (sel && prev) { try { sel.removeAllRanges(); sel.addRange(prev); } catch { /* gone */ } }
      return !!ok;
    } catch { return false; }
  }

  // A deep scan is expensive, and every export button pays for it again.
  // Caching it also has a second, sneakier benefit: the SECOND click of
  // "Copy as Markdown" returns instantly, so it still holds the user
  // activation the clipboard write needs.
  let lastHarvest = null;
  const HARVEST_TTL_MS = 120000;

  function liveSignature() {
    try {
      const t = adapter.turns() || [];
      const last = t[t.length - 1];
      return t.length + "|" + (((last?.body || last?.el)?.innerText) || "").slice(-80);
    } catch { return "sig-" + Date.now(); }
  }

  async function gatherForExport(ui) {
    const deep = !!view.deep;
    const sig = liveSignature();
    if (lastHarvest && lastHarvest.deep === deep && lastHarvest.sig === sig &&
        Date.now() - lastHarvest.at < HARVEST_TTL_MS) {
      return lastHarvest.turns;
    }
    ui.setStatus(deep ? "Scanning the whole chat…" : "Reading visible turns…");
    let turns = await harvestTurns(ui, deep);
    if (!turns.length && state.prompts.length) {
      // Replies couldn't be scraped here — at least save the prompts, and
      // say so in the file rather than shipping a silently half transcript.
      turns = state.prompts.map((p) => ({ role: "user", text: p, md: p }));
      ui.setStatus("Only your prompts could be read on this site — exporting those. Send diagnostics to fix it.");
    }
    const numbered = numberTurns(turns);
    lastHarvest = { turns: numbered, at: Date.now(), sig, deep };
    return numbered;
  }

  // Dedupe + optional redaction run on every export, AFTER the harvest
  // cache: flipping "redact" must not cost another scroll-scan.
  function prepared(raw) {
    const { turns, report } = ChatReplayMd.prepare(raw, { dedupe: settings.dedupe !== false, redact: !!settings.redact });
    const numbered = numberTurns(turns);
    const meta = { ...exportMeta(numbered), prep: report };
    const bits = [];
    if (report.deduped) bits.push(`${report.deduped} duplicate${report.deduped > 1 ? "s" : ""} dropped`);
    if (report.redactedTotal) bits.push(`${report.redactedTotal} secret${report.redactedTotal > 1 ? "s" : ""} redacted`);
    return { turns: numbered, meta, note: bits.length ? ` · ${bits.join(" · ")}` : "" };
  }

  async function doExport(ui, kind) {
    const raw = await gatherForExport(ui);
    if (!raw.length) { ui.setStatus("Nothing to export here yet."); return; }
    const { turns, meta, note } = prepared(raw);
    const users = turns.filter((t) => t.role === "user").length;

    if (kind === "copy") {
      const text = ChatReplayMd.buildMarkdown(turns, meta);
      pendingCopy = text;
      if (await writeClipboard(text)) {
        ui.hideCopyBox();
        ui.setStatus(`Copied ${turns.length} turns (${users} yours) as Markdown${note} — paste it into your workspace.`);
      } else {
        // The transcript is BUILT and kept. Nothing is lost — the browser
        // just wants a click it can see.
        ui.showCopyBox(text);
        ui.setStatus(`Ready: ${turns.length} turns (${users} yours). The scan outlived the click, so hit "Copy now" below (or ⌘/Ctrl+C — the text is already selected). ".md" also works.`);
      }
      return;
    }
    const map = {
      md: [ChatReplayMd.buildMarkdown(turns, meta), "md", "text/markdown"],
      json: [ChatReplayMd.buildJson(turns, meta), "json", "application/json"],
      txt: [ChatReplayMd.buildTxt(turns, meta), "txt", "text/plain"],
    };
    const [text, ext, mime] = map[kind] || map.md;
    download(text, ChatReplayMd.filename(meta, ext), mime);
    ui.setStatus(`Saved ${turns.length} turns (${users} yours) as .${ext}${note}.`);
  }

  async function scanOnly(ui) {
    const turns = await gatherForExport(ui);
    const users = turns.filter((t) => t.role === "user").length;
    view.turnCount = turns.length ? { total: turns.length, users } : { total: 0, users: 0 };
    ui.setStatus(turns.length
      ? `Found ${turns.length} turns: ${users} yours, ${turns.length - users} from ${adapter.label}.`
      : "No turns detected here — hit 'Copy diagnostics' and send it over.");
  }

  /* ---------------- teach this site ---------------- */

  // Some apps can't be anticipated from the outside: Tailwind utility
  // classes carry no meaning, and single-page apps ship an empty shell
  // that React fills in later, so there is nothing to write selectors
  // against until it's running in front of you. Instead of guessing,
  // let the user point at one message of each kind. We derive a
  // repeatable signature and match the rest of the conversation with it.
  async function getLearnedAll() { return (await sget(KEY_LEARNED)) || {}; }

  async function loadLearned() {
    const all = await getLearnedAll();
    const cfg = all[location.hostname];
    if (cfg) ChatReplayAdapters.learn.applyLearned(adapter, cfg);
    return cfg || null;
  }

  async function forgetLearned(ui) {
    const all = await getLearnedAll();
    delete all[location.hostname];
    await sset(KEY_LEARNED, all);
    ui.setStatus("Forgot this site's layout. Reload the page to go back to the built-in rules.");
    ui.refreshLearned(null);
  }

  let picking = false;

  function teachSite(ui) {
    if (picking) return;
    picking = true;

    // v0.5: there is no in-page panel to get out of the way any more —
    // the popup closed itself the moment teaching started. The root now
    // holds nothing but the picker overlay (and the optional FAB).
    const root = ensureRoot();
    view.teaching = true;

    const hl = document.createElement("div");
    hl.id = "cr-highlight";
    const tip = document.createElement("div");
    tip.id = "cr-picktip";
    root.appendChild(hl);
    root.appendChild(tip);

    let step = 0; // 0 = waiting for a USER message, 1 = waiting for an AI reply
    let userLadder = null;
    const prompts = [
      "Click one of YOUR messages   ·   Esc to cancel",
      "Now click one of the AI's replies   ·   Esc to cancel",
    ];
    tip.textContent = prompts[0];

    const paint = (el) => {
      if (!el) { hl.style.display = "none"; return; }
      const r = el.getBoundingClientRect();
      hl.style.display = "block";
      hl.style.left = r.left + "px";
      hl.style.top = r.top + "px";
      hl.style.width = r.width + "px";
      hl.style.height = r.height + "px";
    };

    // Show the block we would actually learn, not the tiny <p> under the
    // cursor — otherwise the highlight lies about what gets captured.
    const targetFor = (el) => {
      if (!el || root.contains(el)) return null;
      const rungs = ChatReplayAdapters.learn.ladder(el);
      return rungs.length ? rungs[rungs.length - 1].el : el;
    };

    const onMove = (e) => paint(targetFor(e.target));

    const onClick = (e) => {
      const el = e.target;
      if (root.contains(el)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const rungs = ChatReplayAdapters.learn.ladder(el);
      if (!rungs.length) {
        tip.textContent = "Couldn't find a repeating block there — try clicking the message text itself.";
        return;
      }
      if (step === 0) {
        userLadder = rungs;
        step = 1;
        tip.textContent = prompts[1];
        return;
      }

      const cfg = ChatReplayAdapters.learn.reconcile(userLadder, rungs);
      finish(cfg);
    };

    const onKey = (e) => { if (e.key === "Escape") finish(null, true); };

    async function finish(cfg, cancelled) {
      if (!picking) return;
      picking = false;
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      hl.remove();
      tip.remove();
      view.teaching = false;

      if (cancelled) { ui.setStatus("Teaching cancelled."); return; }
      if (!cfg) {
        ui.setStatus("Those two picks overlap — the site wraps both sides identically. Try clicking closer to the message text.");
        return;
      }

      const all = await getLearnedAll();
      all[location.hostname] = { ...cfg, savedAt: Date.now() };
      await sset(KEY_LEARNED, all);
      ChatReplayAdapters.learn.applyLearned(adapter, cfg);
      ui.refreshLearned(cfg);

      const turns = readTurns();
      const users = turns.filter((t) => t.role === "user").length;
      ui.setStatus(turns.length
        ? `Learned this site — ${turns.length} turns visible (${users} yours). Export away.`
        : "Saved, but still reading 0 turns. Try teaching again, clicking the message text directly.");
    }

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    ui.setStatus("Teaching mode: click one of your messages, then one of the AI's.");
  }

  /* ---------------- launch (parallel runs) ---------------- */

  // The library itself, and the run builder that reads from it, moved to
  // the popup in v0.5: both are pure chrome.storage work plus one message
  // to the background worker, so neither needs page access. What stays
  // here is the receiving half — the bit that only a content script can
  // do, because it has to drive the page it was launched into.

  // On page load, ask the background if this tab was opened as a run.
  async function checkAssignedRun(ui) {
    let run = null;
    try {
      run = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: "getRun" }, (resp) => resolve(resp?.run || null)));
    } catch { return; }
    if (!run) return;

    state.prompts = run.prompts || [];
    resetRange();
    ui.refreshCount(`run: ${run.name}`);
    ui.openPanel();
    ui.setStatus(`Auto-run "${run.desc}": waiting for the page to be ready…`);

    // Wait for the input box to exist (page may still be booting).
    for (let i = 0; i < 30 && !adapter.getInput(); i++) await sleep(1000);
    await sleep(1500);

    // Apply model / effort / DeepThink config.
    let applied = { ok: true, note: "" };
    if (run.cfg && Object.keys(run.cfg).length) {
      ui.setStatus(`Setting up: ${run.desc}…`);
      try { applied = await adapter.applyConfig(run.cfg); }
      catch (e) { applied = { ok: false, note: e.message }; }
      log("applyConfig", applied);
    }

    // Countdown: short if config applied, long if you need to fix it by
    // hand. Jittered so parallel windows never fire their first prompt in
    // the same second even when their page loads happened to align.
    let secs = Math.round(applied.ok ? jitter(6, 6) : jitter(20, 8));
    let cancelled = false;
    // While the countdown owns ▶, the normal Run handler stands down
    // (state.countdownActive) — in v0.3 both fired, and the countdown's
    // cleanup then disabled Stop while the replay was already running.
    // v0.5: ▶ and Stop live in the popup, which is very likely CLOSED
    // during the countdown (it closes on its own when the run window
    // opens). So the two escape hatches are flags that the message
    // handler sets, not listeners bound to buttons that may not exist.
    state.countdownActive = true;
    view.startNow = false;
    view.cancelCountdown = false;
    ui.setRunning(true);

    while (secs > 0 && !cancelled) {
      if (view.cancelCountdown) { cancelled = true; break; }
      if (view.startNow) { secs = 0; break; }
      ui.setStatus(applied.ok
        ? `"${run.desc}" ready — starting in ${secs}s (▶ now, Stop cancels).`
        : `Couldn't auto-set (${applied.note}). PICK IT MANUALLY — starting in ${secs}s (▶ now, Stop cancels).`);
      await sleep(1000);
      secs--;
    }
    state.countdownActive = false;
    view.startNow = false;
    view.cancelCountdown = false;
    if (cancelled) { ui.setRunning(false); ui.setStatus("Auto-run cancelled."); return; }
    // No setRunning(false) here — runReplay owns the buttons from now on.
    runReplay(ui);
  }

  /* ---------------- WebChatEvolver / CommanderDeck zero-copy autopilot ---------------- */

  const KEY_WCE = "chatReplay.wce." + location.hostname;
  const WCE_TTL_MS = 8 * 60 * 1000;

  async function wceDecompress(b64url) {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const text = await new Response(ds.readable).text();
    return JSON.parse(text);
  }

  async function wceCompress(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const out = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  const ranWcePackets = new Set();

  function extractWceHashToken() {
    const h = String(location.hash || "");
    const m = h.match(/(?:^#|&|\?)wce_gz=([A-Za-z0-9_-]+)/);
    return m ? m[1] : "";
  }

  function isElementSelectedOrPressed(el) {
    if (!el) return false;
    const pressed = el.getAttribute("aria-pressed");
    const selected = el.getAttribute("aria-selected");
    const checked = el.getAttribute("aria-checked");
    const stateAttr = el.getAttribute("data-state");
    if (pressed === "true" || selected === "true" || checked === "true" || stateAttr === "on" || stateAttr === "checked") return true;
    const cls = String(el.className || "");
    return /\b(selected|active|checked|mat-mdc-chip-selected|bg-token-main-surface)\b/i.test(cls);
  }

  async function enableDeepResearchUI(ui, mode = "deep_research") {
    const host = location.hostname.toLowerCase();
    const isDeepMode = /^deep_research/i.test(String(mode || ""));
    const hClick = (el) => (ChatReplayAdapters.humanClick ? ChatReplayAdapters.humanClick(el) : (el?.click?.(), true));
    const visibleEls = (sel, root = document) =>
      Array.from(root.querySelectorAll(sel)).filter((el) => ChatReplayAdapters.visible(el) && !el.closest("#chat-replay-root"));

    const hayOf = (el) => [
      el.innerText || el.textContent || "",
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("title") || "",
      el.getAttribute?.("data-testid") || "",
    ].join(" ").replace(/\s+/g, " ").trim();

    const findByTextOrAria = (rx, root = document, includeScrolled = false) => {
      const sel = "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], mat-chip-option, [data-radix-collection-item], [data-testid]";
      const pool = Array.from(root.querySelectorAll(sel)).filter((el) => {
        if (el.closest("#chat-replay-root")) return false;
        if (includeScrolled) return el.isConnected && el.getAttribute("aria-hidden") !== "true";
        return ChatReplayAdapters.visible(el);
      });
      return pool.find((el) => rx.test(hayOf(el))) || null;
    };

    try {
      // 1) Gemini (gemini.google.com)
      if (host.includes("gemini.google.com")) {
        if (!isDeepMode) return true;
        ui.setStatus("WCE Deep Research: checking Gemini Deep Research toggle…");
        let drBtn = findByTextOrAria(/\b(deep research|investigaci[oó]n profunda)\b/i);
        if (drBtn) {
          if (!isElementSelectedOrPressed(drBtn)) {
            hClick(drBtn);
            await realWait(jitter(1400, 900));
          }
          return true;
        }
        const toolsBtn = findByTextOrAria(/\b(tools|herramientas|extensions|extensiones)\b/i);
        if (toolsBtn) {
          hClick(toolsBtn);
          await realWait(jitter(1200, 700));
          drBtn = findByTextOrAria(/\b(deep research|investigaci[oó]n profunda)\b/i);
          if (drBtn) {
            hClick(drBtn);
            await realWait(jitter(1400, 900));
            return true;
          }
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await sleep(400);
        }
        const modeTrig = document.querySelector("button[data-test-id='bard-mode-menu-button'], bard-mode-switcher button");
        if (modeTrig && ChatReplayAdapters.visible(modeTrig)) {
          const curTxt = (modeTrig.innerText || "").replace(/\s+/g, " ").trim();
          if (!/deep research|investigaci[oó]n profunda/i.test(curTxt)) {
            hClick(modeTrig);
            await realWait(jitter(1200, 700));
            const menuRoot = document.querySelector(".cdk-overlay-container") || document;
            drBtn = findByTextOrAria(/\b(deep research|investigaci[oó]n profunda)\b/i, menuRoot, true);
            if (drBtn) {
              hClick(drBtn);
              await realWait(jitter(1400, 900));
              return true;
            }
            document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          }
        }
        return false;
      }

      // 2) ChatGPT (chatgpt.com)
      // All WebChatEvolver modes (deep_research_brief, scout, verify, brainstorm) need research on ChatGPT.
      // You must click the "+" button at the bottom-left of the composer to open the tools menu,
      // and then select "Deep research" / "Research" (or "Web search" fallback when not in deep_research mode).
      if (host.includes("chatgpt.com") || host.includes("openai.com")) {
        const input = adapter.getInput();
        const scope = (ChatReplayAdapters.composerScope && ChatReplayAdapters.composerScope(input)) || input?.closest("form") || document;

        // If the composer effort/mode pill on the right is set to "Instant", upgrade it so it doesn't skip reasoning/search
        try {
          const effBtn = adapter.effortTrigger?.();
          if (effBtn && /^instant$/i.test((effBtn.innerText || "").trim().split("\n")[0])) {
            ui.setStatus("WCE ChatGPT: switching composer pill from Instant to Thinking/Medium…");
            hClick(effBtn);
            await realWait(jitter(900, 500));
            const effMenu = document.querySelector("[role='menu'][data-state='open'], [data-radix-popper-content-wrapper], [role='menu']") || document;
            const betterEff = findByTextOrAria(/\b(medium|high|thinking|standard|auto)\b/i, effMenu, true);
            if (betterEff) {
              hClick(betterEff);
              await realWait(jitter(900, 500));
            } else {
              document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
              await sleep(300);
            }
          }
        } catch { /* ignore effort pill error */ }

        // Check if Research / Deep research (or Web search for non-deep modes) pill is already active inside composer
        const RESEARCH_RX = /\b(deep\s*research|research|investigaci[oó]n\s*profunda|investigar)\b/i;
        const WEB_SEARCH_RX = /\b(web\s*search|search\s*the\s*web|b[uú]squeda\s*web|buscar\s*en\s*la\s*web)\b/i;

        let directPill = findByTextOrAria(RESEARCH_RX, scope);
        if (directPill) {
          if (!isElementSelectedOrPressed(directPill)) {
            hClick(directPill);
            await realWait(jitter(1200, 700));
          }
          return true;
        }

        const getOpenMenuRoot = () =>
          document.querySelector("[role='menu'][data-state='open'], [data-radix-popper-content-wrapper], [data-radix-menu-content], [role='menu'], [role='listbox'], [role='dialog']") || null;

        // Try up to 3 times to click the "+" button and pick Research from the popover menu
        for (let attempt = 1; attempt <= 3; attempt++) {
          ui.setStatus(`WCE ChatGPT: clicking "+" button to enable Research (attempt ${attempt}/3)…`);
          const plusBtn =
            adapter.plusTrigger?.() ||
            scope.querySelector("button[data-testid='composer-plus-btn'], button[data-testid*='plus' i], button[data-testid='system-hint-button'], button[aria-label*='Add' i], button[aria-label*='Tools' i], button[aria-label*='Herramientas' i]") ||
            visibleEls("button, [role='button']", scope).find((b) => /^[+＋]$/.test((b.innerText || b.textContent || "").trim())) ||
            null;

          if (!plusBtn) {
            await realWait(1500);
            continue;
          }

          // Open the "+" Radix menu using full PointerEvent sequence
          let menuRoot = getOpenMenuRoot();
          if (!menuRoot) {
            hClick(plusBtn);
            await realWait(jitter(1200, 600));
            menuRoot = getOpenMenuRoot();
          }
          // Fallback: Radix DropdownMenuTrigger also opens on ArrowDown / Enter keydown
          if (!menuRoot) {
            plusBtn.focus?.();
            plusBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true, cancelable: true }));
            await realWait(900);
            menuRoot = getOpenMenuRoot();
          }
          if (!menuRoot) {
            await realWait(1200);
            continue;
          }

          // Search inside the open "+" menu, scrolling it down if it has a scrollbar (as in ChatGPT's 5-item visible list)
          const findTargetInMenu = (root) => {
            const rHit = findByTextOrAria(RESEARCH_RX, root, true);
            if (rHit) return rHit;
            if (!isDeepMode) {
              const wHit = findByTextOrAria(WEB_SEARCH_RX, root, true);
              if (wHit) return wHit;
            }
            return null;
          };

          let targetItem = findTargetInMenu(menuRoot);

          // Scroll the menu container down step-by-step if the item isn't mounted/visible yet
          if (!targetItem) {
            const scrollers = [menuRoot, ...Array.from(menuRoot.querySelectorAll("div, ul"))].filter(
              (el) => el.scrollHeight > el.clientHeight + 6
            );
            const scroller = scrollers[0] || menuRoot;
            for (let s = 0; s < 6 && !targetItem; s++) {
              try { scroller.scrollTop += 150; } catch { /* ignore */ }
              await sleep(350);
              targetItem = findTargetInMenu(menuRoot);
            }
          }

          // Check if there is a "More" / "Más" / "..." submenu inside the "+" menu
          if (!targetItem) {
            const moreBtn = findByTextOrAria(/\b(more|m[aá]s|explore|other tools)\b/i, menuRoot, true);
            if (moreBtn) {
              hClick(moreBtn);
              await realWait(800);
              targetItem = findTargetInMenu(document);
            }
          }

          // Last fallback for deep_research mode if Deep Research quota is exhausted: use Web search
          if (!targetItem && isDeepMode) {
            targetItem = findByTextOrAria(WEB_SEARCH_RX, menuRoot, true);
          }

          if (targetItem) {
            try { targetItem.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch { /* ignore */ }
            await sleep(300);
            ui.setStatus(`WCE ChatGPT: selecting "${(targetItem.innerText || "Research").split("\n")[0].trim()}"…`);
            hClick(targetItem);
            await realWait(jitter(1600, 900));
            return true;
          }

          // Close menu before retrying
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await realWait(900);
        }
        return false;
      }

      // 3) Claude (claude.ai)
      if (host.includes("claude.ai")) {
        ui.setStatus("WCE Deep Research: checking Claude Research toggle…");
        const drBtn = findByTextOrAria(/\b(research|investigar)\b/i);
        if (drBtn && !isElementSelectedOrPressed(drBtn)) {
          hClick(drBtn);
          await realWait(jitter(1400, 800));
          return true;
        }
        return !!drBtn;
      }
    } catch (e) {
      log("enableDeepResearchUI error:", e);
    }
    return false;
  }

  function findDeepResearchConfirmBtn() {
    try {
      const btns = Array.from(document.querySelectorAll("button, [role='button']")).filter((b) =>
        ChatReplayAdapters.visible(b) && !b.disabled && !b.closest("#chat-replay-root")
      );
      return btns.find((b) => {
        const hay = [
          b.innerText || b.textContent || "",
          b.getAttribute("aria-label") || "",
          b.getAttribute("title") || "",
        ].join(" ").replace(/\s+/g, " ").trim();
        if (/\b(stop|cancel|edit|modificar|editar|detener|parar)\b/i.test(hay)) return false;
        return /\b(start research|empezar a investigar|iniciar investigaci[oó]n|begin research)\b/i.test(hay);
      }) || null;
    } catch { return null; }
  }

  function isDeepResearchActive() {
    try {
      const root = adapter.getTranscriptRoot?.() || document.body;
      const bars = Array.from(root.querySelectorAll("[role='progressbar'], mat-progress-bar, mat-spinner, [class*='progress-bar'], [data-testid*='progress']"))
        .filter((el) => ChatReplayAdapters.visible(el));
      if (bars.length > 0) return true;
      // Check if a "Stop research" / "Cancel research" button is visible
      const stopBtns = Array.from(document.querySelectorAll("button, [role='button']"))
        .filter((b) => ChatReplayAdapters.visible(b))
        .some((b) => /\b(stop research|detener investigaci[oó]n|cancel research)\b/i.test((b.innerText || b.getAttribute("aria-label") || "")));
      return stopBtns;
    } catch { return false; }
  }

  function readLastAssistantMarkdown() {
    let raw = [];
    try { raw = adapter.turns() || []; } catch { raw = []; }
    const assistants = raw.filter((t) => t.role === "assistant");
    const last = assistants[assistants.length - 1] || raw[raw.length - 1];
    if (!last) return "";
    const body = last.body || last.el;
    if (!body) return "";
    const md = ChatReplayMd.htmlToMd(body, { headingOffset: 0 }) || "";
    const plain = ChatReplayMd.htmlToPlain(body) || "";
    if (plain.includes("BEGIN_WEBCHAT_BUNDLE") && !md.includes("BEGIN_WEBCHAT_BUNDLE")) {
      return plain.trim();
    }
    return (md.trim().length >= Math.min(40, plain.trim().length) ? md : plain).trim();
  }

  async function checkWebChatAutopilot(ui) {
    let mission = null;
    const token = extractWceHashToken();
    if (token) {
      try {
        if (location.hash.includes("wce_gz=")) {
          history.replaceState(null, "", location.pathname + location.search);
        }
        mission = await wceDecompress(token);
        if (mission && mission.packetId) {
          await sset(KEY_WCE, { ...mission, phase: "init", savedAt: Date.now() });
        }
      } catch (e) {
        log("wceDecompress failed:", e);
      }
    } else {
      const stored = await sget(KEY_WCE);
      if (stored && stored.packetId && stored.phase === "init" && Date.now() - (stored.savedAt || 0) < WCE_TTL_MS) {
        mission = stored;
      }
    }

    const promptList = Array.isArray(mission?.prompts) && mission.prompts.length
      ? mission.prompts
      : (mission?.text ? [mission.text] : []);

    if (!mission || !mission.packetId || !promptList.length) {
      return false;
    }

    if (ranWcePackets.has(mission.packetId)) {
      return false;
    }
    ranWcePackets.add(mission.packetId);

    // Mark as running immediately so any page reload won't duplicate-send
    await sset(KEY_WCE, { ...mission, phase: "running", savedAt: Date.now() });

    const isDeepMode = /^deep_research/i.test(String(mission.mode || ""));
    const isChatGptHost = location.hostname.includes("chatgpt.com") || location.hostname.includes("openai.com");
    const needsResearchTool = isDeepMode || isChatGptHost;
    const deepWaitOpts = { settleOverride: 28, minReplyOverride: 25, maxWaitOverride: 1500, stuckBusyOverride: 300, extraBusyCheck: isDeepResearchActive };

    state.running = true;
    state.stopRequested = false;
    state.paused = false;
    ui.openPanel();
    ui.setRunning(true);
    announceRunning(true);
    ui.setStatus(`WCE [${mission.packetId}] (${mission.lane}): waiting for full page & composer hydration…`);

    // 1) Wait for document.readyState === "complete" AND input box
    const waitStart = Date.now();
    for (let i = 0; i < 40; i++) {
      const hasInput = !!adapter.getInput();
      const docReady = document.readyState === "complete";
      const hasPlus = !isChatGptHost || !!adapter.plusTrigger?.();
      if (hasInput && docReady && hasPlus) break;
      await sleep(1000);
    }

    // 2) On slow pages like ChatGPT (which can take 10+ seconds to hydrate the "+" menu & entitlements),
    // guarantee at least 11–14s since navigation start before touching composer menus.
    const minHydrationMs = isChatGptHost ? Math.round(jitter(11000, 3500)) : Math.round(jitter(5500, 3500));
    const navAgeMs = typeof performance !== "undefined" && performance.now ? performance.now() : (Date.now() - waitStart);
    const remainingHydrationSecs = Math.max(4, Math.ceil((minHydrationMs - navAgeMs) / 1000));

    let arriveSecs = Math.max(remainingHydrationSecs, Math.round(jitter(isChatGptHost ? 8 : 5, 4)));
    state.countdownActive = true;
    view.startNow = false;
    view.cancelCountdown = false;
    while (arriveSecs > 0) {
      if (view.cancelCountdown || state.stopRequested) {
        state.countdownActive = false;
        state.running = false;
        ui.setRunning(false);
        announceRunning(true);
        ui.setStatus("WCE Autopilot cancelled.");
        return true;
      }
      if (view.startNow) break;
      ui.setStatus(`WCE [${mission.packetId}]: page hydration & settle pause (${arriveSecs}s)…`);
      await sleep(1000);
      arriveSecs--;
    }
    state.countdownActive = false;
    view.startNow = false;

    if (safeIsBusy()) {
      for (let g = 0; g < 60 && safeIsBusy() && !state.stopRequested; g++) await nap(1000);
    }

    if (needsResearchTool) {
      await enableDeepResearchUI(ui, mission.mode);
      await realWait(jitter(1800, 1200));
    }

    const input = adapter.getInput();
    if (!input) {
      ui.setStatus(`WCE Autopilot [${mission.packetId}]: input box not found.`);
      state.running = false;
      ui.setRunning(false);
      announceRunning(true);
      return true;
    }

    ui.setStatus(`WCE [${mission.packetId}]: entering prompt (${promptList[0].length} chars)…`);
    insertTextFast(input, promptList[0]);
    // Natural 2.5s–5.2s human glance pause after pasting before clicking Send
    await realWait(jitter(2500, 2700));
    if (state.stopRequested) {
      state.running = false;
      ui.setRunning(false);
      announceRunning(true);
      return true;
    }
    const sent1 = await sendVerified(input);
    if (!sent1) {
      ui.setStatus(`WCE Autopilot [${mission.packetId}]: failed to send prompt.`);
      state.running = false;
      ui.setRunning(false);
      announceRunning(true);
      return true;
    }

    ui.setStatus(`WCE [${mission.packetId}]: awaiting model response…`);
    if (!(await waitForReplyDone(ui, isDeepMode ? deepWaitOpts : {}))) {
      state.running = false;
      ui.setRunning(false);
      announceRunning(true);
      return true;
    }

    // 1) Gemini Deep Research Plan confirmation ("Start research" / "Empezar a investigar")
    // Poll up to 15 seconds in case the confirmation button mounts slightly after the plan text settles
    let confirmBtn = findDeepResearchConfirmBtn();
    if (!confirmBtn && isDeepMode && location.hostname.includes("gemini.google.com")) {
      for (let w = 0; w < 12 && !confirmBtn && !state.stopRequested; w++) {
        await sleep(1000);
        confirmBtn = findDeepResearchConfirmBtn();
      }
    }
    if (confirmBtn) {
      ui.setStatus(`WCE [${mission.packetId}]: Research plan ready — pausing before clicking Start research…`);
      await realWait(jitter(4500, 3500));
      confirmBtn = findDeepResearchConfirmBtn() || confirmBtn;
      if (ChatReplayAdapters.humanClick) ChatReplayAdapters.humanClick(confirmBtn);
      else confirmBtn.click();
      ui.setStatus(`WCE [${mission.packetId}]: Deep Research running — awaiting full report…`);
      await realWait(jitter(5000, 3000));
      await waitForReplyDone(ui, deepWaitOpts);
    }

    // 2) ChatGPT Deep Research pre-run clarifying questions
    // When Deep Research is active on ChatGPT, it often asks 1-3 clarifying questions before starting the research bar.
    if (isChatGptHost) {
      const firstReply = readLastAssistantMarkdown();
      if (
        firstReply &&
        firstReply.length < 3000 &&
        firstReply.includes("?") &&
        !firstReply.includes("BEGIN_WEBCHAT_BUNDLE") &&
        !/^===\s*FILE:/m.test(firstReply)
      ) {
        ui.setStatus(`WCE [${mission.packetId}]: Answering ChatGPT Deep Research clarifying question…`);
        await realWait(jitter(5500, 4000));
        const inputClarify = adapter.getInput();
        if (inputClarify) {
          insertTextFast(
            inputClarify,
            "Proceed immediately with the full Deep Research using all parameters, sectors, gates (G1-G5), and constraints already specified in the mission prompt above. Output the complete bundle when finished."
          );
          await realWait(jitter(2500, 2000));
          if (await sendVerified(inputClarify)) {
            ui.setStatus(`WCE [${mission.packetId}]: Deep Research running — awaiting full report…`);
            await realWait(jitter(5000, 3000));
            await waitForReplyDone(ui, deepWaitOpts);
          }
        }
      }
    }

    // 3) Step-2 Format Follow-Up (for 2-step deep_research_brief mode)
    if (mission.followUp && String(mission.followUp).trim()) {
      const currentMd = readLastAssistantMarkdown();
      if (!/^===\s*FILE:/m.test(currentMd)) {
        await realWait(jitter(5500, 4500));
        const input2 = adapter.getInput();
        if (input2) {
          ui.setStatus(`WCE [${mission.packetId}]: entering Step 2 format follow-up…`);
          insertTextFast(input2, String(mission.followUp));
          await realWait(jitter(2600, 2200));
          if (await sendVerified(input2)) {
            await waitForReplyDone(ui);
          }
        }
      }
    }

    // Natural 6s–12s post-reply reading pause before harvesting & leaving the page
    const readSecs = Math.round(jitter(6, 6));
    for (let s = readSecs; s > 0 && !state.stopRequested; s--) {
      ui.setStatus(`WCE [${mission.packetId}]: reply complete — reading pause (${s}s)…`);
      await sleep(1000);
    }

    const replyText = readLastAssistantMarkdown();
    const webModel = (() => { try { return adapter.currentModel?.() || ""; } catch { return ""; } })();
    const returnBase = String(mission.returnBase || "http://127.0.0.1:4500").replace(/\/+$/, "");

    await sset(KEY_WCE, { packetId: mission.packetId, phase: "done", savedAt: Date.now() });
    state.running = false;
    ui.setRunning(false);
    announceRunning(true);

    if (!replyText) {
      ui.setStatus(`WCE Autopilot [${mission.packetId}]: empty reply extracted.`);
      return true;
    }

    ui.setStatus(`WCE [${mission.packetId}]: reply captured (${replyText.length} chars) — returning to console…`);
    const donePayload = {
      packetId: mission.packetId,
      lane: mission.lane,
      engine: mission.engine,
      mode: mission.mode,
      webModel,
      replyText,
      chatUrl: location.href,
      chain: !!mission.chain,
      chainEngine: mission.chainEngine || "",
      chainCount: (Number(mission.chainCount) || 0) + 1,
      completedAt: new Date().toISOString(),
    };

    try {
      const wceDoneB64 = await wceCompress(donePayload);
      location.href = `${returnBase}/web-complete#wce_done=${wceDoneB64}`;
    } catch (e) {
      log("wceCompress navigation failed:", e);
    }
    return true;
  }

  /* ---------------- Step & Screenshot Diagnostic Recorder ---------------- */

  let recState = null;

  function describeElementForRecorder(el) {
    if (!el || !el.tagName) return null;
    const actionable = el.closest?.("button, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], [role='tab'], a, input, textarea, [contenteditable='true'], [data-testid], [data-radix-collection-item]") || el;
    const tag = actionable.tagName.toLowerCase();
    const id = actionable.id || "";
    const testid = actionable.getAttribute?.("data-testid") || actionable.getAttribute?.("data-test-id") || "";
    const ariaLabel = actionable.getAttribute?.("aria-label") || "";
    const title = actionable.getAttribute?.("title") || "";
    const role = actionable.getAttribute?.("role") || "";
    const ariaHaspopup = actionable.getAttribute?.("aria-haspopup") || "";
    const ariaExpanded = actionable.getAttribute?.("aria-expanded") || "";
    const dataState = actionable.getAttribute?.("data-state") || "";
    const rawText = (actionable.innerText || actionable.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140);
    const r = actionable.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };

    const selectors = [];
    if (id && !/\d{5,}|radix-/.test(id)) selectors.push(`#${CSS.escape ? CSS.escape(id) : id}`);
    if (testid) selectors.push(`${tag}[data-testid="${testid}"]`);
    if (ariaLabel) selectors.push(`${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`);
    if (role && rawText && rawText.length <= 50) selectors.push(`[role="${role}"] >> text="${rawText.split("\n")[0]}"`);
    if (rawText && rawText.length <= 40) selectors.push(`${tag} >> text="${rawText}"`);

    const ancestors = [];
    let p = actionable.parentElement;
    for (let d = 0; d < 4 && p && p !== document.body; d++, p = p.parentElement) {
      const pTag = p.tagName.toLowerCase();
      const pId = p.id ? `#${p.id}` : "";
      const pTid = p.getAttribute?.("data-testid") ? `[data-testid="${p.getAttribute("data-testid")}"]` : "";
      const pRole = p.getAttribute?.("role") ? `[role="${p.getAttribute("role")}"]` : "";
      if (pId || pTid || pRole || pTag === "form") {
        ancestors.push(`${pTag}${pId}${pTid}${pRole}`);
      }
    }

    return {
      tag,
      id,
      testid,
      ariaLabel,
      title,
      role,
      ariaHaspopup,
      ariaExpanded,
      dataState,
      text: rawText,
      classes: String(actionable.className || "").slice(0, 120),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      bestSelector: selectors[0] || tag,
      selectors,
      ancestors,
      outerHTMLSnippet: (actionable.outerHTML || "").slice(0, 320),
    };
  }

  function scanOpenMenusForRecorder() {
    const menus = Array.from(
      document.querySelectorAll("[role='menu'][data-state='open'], [data-radix-popper-content-wrapper], .cdk-overlay-container, [role='menu'], [role='listbox'], [role='dialog']")
    ).filter((m) => ChatReplayAdapters.visible(m) && !m.closest("#chat-replay-root"));

    return menus.slice(0, 3).map((m) => {
      const scroller = [m, ...Array.from(m.querySelectorAll("div, ul"))].find((x) => x.scrollHeight > x.clientHeight + 6);
      const items = Array.from(
        m.querySelectorAll("[role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], [data-radix-collection-item], button, [role='button']")
      )
        .filter((el) => !el.closest("#chat-replay-root"))
        .slice(0, 25)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          testid: el.getAttribute("data-testid") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
          visible: ChatReplayAdapters.visible(el),
        }))
        .filter((it) => it.text || it.ariaLabel || it.testid);
      return {
        menuRole: m.getAttribute("role") || m.tagName.toLowerCase(),
        scrollable: !!scroller,
        scrollHeight: scroller ? scroller.scrollHeight : m.clientHeight,
        clientHeight: scroller ? scroller.clientHeight : m.clientHeight,
        itemCount: items.length,
        items,
      };
    }).filter((m) => m.itemCount > 0);
  }

  function captureViewportPng() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "captureTab" }, (resp) => {
          resolve(resp?.ok && resp.dataUrl ? resp.dataUrl : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function formatRecordingMarkdown(rec) {
    const lines = [
      `# WebChat Automation Step Recording — ${rec.site}`,
      ``,
      `- **URL**: ${rec.url}`,
      `- **Adapter**: \`${rec.adapter}\` (${rec.model || "default"})`,
      `- **Recorded At**: ${rec.startedAtIso}`,
      `- **Page Hydration at Start**: ${(rec.pageLoadElapsedAtStartMs / 1000).toFixed(1)}s`,
      `- **Total Steps**: ${rec.steps.length}`,
      ``,
      `## Step-by-Step Trace`,
      ``,
    ];

    for (const s of rec.steps) {
      const t = s.target || {};
      const label = t.text || t.ariaLabel || t.testid || t.id || t.tag || s.action;
      lines.push(`### Step ${s.step}: \`${s.action.toUpperCase()}\` on "${label}" (+${(s.deltaMs / 1000).toFixed(1)}s · ${(s.msSincePageLoad / 1000).toFixed(1)}s since load)`);
      if (s.screenshotFile) lines.push(`- **Screenshot**: \`${s.screenshotFile}\``);
      if (t.bestSelector) lines.push(`- **Best Selector**: \`${t.bestSelector}\``);
      if (t.selectors?.length > 1) lines.push(`- **Alt Selectors**: ${t.selectors.map((x) => `\`${x}\``).join(", ")}`);
      lines.push(`- **Element**: \`<${t.tag || "?"}>\` id=\`${t.id || ""}\` testid=\`${t.testid || ""}\` role=\`${t.role || ""}\` aria-label=\`${t.ariaLabel || ""}\` aria-haspopup=\`${t.ariaHaspopup || ""}\` rect=\`(${t.rect?.x},${t.rect?.y} ${t.rect?.w}x${t.rect?.h})\``);
      if (t.ancestors?.length) lines.push(`- **Ancestors**: \`${t.ancestors.join(" <- ")}\``);
      if (s.valuePreview) lines.push(`- **Input Value (${s.valueLength} chars)**: \`${s.valuePreview}\``);
      if (s.key) lines.push(`- **Key**: \`${s.key}\``);
      if (s.openMenus?.length) {
        for (const m of s.openMenus) {
          lines.push(`- **Open Menu (${m.itemCount} items, scrollable=${m.scrollable}, ${m.clientHeight}/${m.scrollHeight}px)**:`);
          for (const it of m.items) {
            lines.push(`  - \`${it.text || it.ariaLabel}\` (role=\`${it.role}\`, testid=\`${it.testid}\`, inView=${it.visible})`);
          }
        }
      }
      if (t.outerHTMLSnippet) {
        lines.push(`- **HTML**: \`${t.outerHTMLSnippet.replace(/`/g, "'")}\``);
      }
      lines.push(``);
    }
    return lines.join("\n");
  }

  function startStepRecorder(ui) {
    if (view.recording) return;
    const root = ensureRoot();
    view.recording = true;
    view.recordedSteps = 0;

    const navNow = () => (typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0);
    recState = {
      site: location.hostname,
      url: location.href,
      adapter: adapter.id,
      model: (() => { try { return adapter.currentModel?.() || ""; } catch { return ""; } })(),
      startedAt: Date.now(),
      startedAtIso: new Date().toISOString(),
      pageLoadElapsedAtStartMs: navNow(),
      lastStepAt: Date.now(),
      steps: [],
    };

    const hud = document.createElement("div");
    hud.id = "cr-recorder-hud";
    hud.innerHTML = `
      <span class="cr-rec-dot"></span>
      <span class="cr-rec-label" id="cr-rec-status">REC · 0 steps (click elements as normal)</span>
      <button type="button" id="cr-rec-snap" title="Capture viewport screenshot + open menus now">📸 Snap</button>
      <button type="button" id="cr-rec-finish" class="cr-rec-finish" title="Stop recording, copy steps to clipboard, and save to CommanderDeck">⏹ Finish &amp; Save</button>
      <button type="button" id="cr-rec-cancel" title="Cancel recording">✕</button>
    `;
    root.appendChild(hud);
    const statusLabel = hud.querySelector("#cr-rec-status");

    const updateHud = (msg) => {
      view.recordedSteps = recState ? recState.steps.length : 0;
      if (statusLabel) statusLabel.textContent = msg || `REC · ${view.recordedSteps} step(s)`;
    };

    const recordEventStep = async (action, targetEl, extra = {}) => {
      if (!recState || !view.recording) return;
      const now = Date.now();
      const stepNum = recState.steps.length + 1;
      const target = targetEl ? describeElementForRecorder(targetEl) : null;
      const stepObj = {
        step: stepNum,
        action,
        atIso: new Date().toISOString(),
        msSincePageLoad: navNow(),
        deltaMs: now - recState.lastStepAt,
        target,
        ...extra,
        openMenus: [],
        screenshotDataUrl: null,
        screenshotFile: null,
      };
      recState.lastStepAt = now;
      recState.steps.push(stepObj);
      const shortDesc = target?.text?.slice(0, 28) || target?.ariaLabel?.slice(0, 28) || target?.testid || target?.tag || action;
      updateHud(`REC #${stepNum}: ${action} "${shortDesc}"`);

      // Wait briefly for any Radix/CDK popover menu to open, then scan menus & snap screenshot
      setTimeout(async () => {
        if (!recState) return;
        stepObj.openMenus = scanOpenMenusForRecorder();
        if (action === "click" || action === "manual-snap") {
          const png = await captureViewportPng();
          if (png) {
            stepObj.screenshotDataUrl = png;
            stepObj.screenshotFile = `step-${String(stepNum).padStart(2, "0")}.png`;
          }
        }
      }, 420);
    };

    const onPointerDown = (e) => {
      if (!e.target || root.contains(e.target)) return;
      if (e.button != null && e.button !== 0) return;
      recordEventStep("click", e.target);
    };

    let inputTimer = null;
    let lastInputTarget = null;
    const onInput = (e) => {
      if (!e.target || root.contains(e.target)) return;
      lastInputTarget = e.target;
      if (inputTimer) clearTimeout(inputTimer);
      inputTimer = setTimeout(() => {
        const val = readInputText(lastInputTarget);
        recordEventStep("input", lastInputTarget, {
          valueLength: val.length,
          valuePreview: val.replace(/\s+/g, " ").trim().slice(0, 100),
        });
      }, 650);
    };

    const onKeyDown = (e) => {
      if (!e.target || root.contains(e.target)) return;
      if (["Enter", "Escape", "ArrowDown", "ArrowUp", "Tab"].includes(e.key)) {
        recordEventStep("keydown", e.target, { key: e.key });
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKeyDown, true);
      if (inputTimer) clearTimeout(inputTimer);
    };

    const finishRecording = async (cancelled = false) => {
      if (!view.recording) return "";
      cleanup();
      view.recording = false;

      if (cancelled || !recState) {
        hud.remove();
        recState = null;
        ui.setStatus("Step recording cancelled.");
        return "";
      }

      updateHud("Saving steps & screenshots…");
      await sleep(500); // allow last step's screenshot/menu scan to land

      const finalRec = recState;
      recState = null;
      const md = formatRecordingMarkdown(finalRec);
      view.lastRecordingMd = md;
      view.pendingCopy = md;

      const copied = await writeClipboard(md);

      // Also auto-save to CommanderDeck (:4500) with all PNG screenshots
      let savedPath = "";
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "saveRecording",
              payload: {
                site: finalRec.site,
                url: finalRec.url,
                adapter: finalRec.adapter,
                model: finalRec.model,
                startedAtIso: finalRec.startedAtIso,
                pageLoadElapsedAtStartMs: finalRec.pageLoadElapsedAtStartMs,
                markdown: md,
                steps: finalRec.steps,
              },
            },
            (r) => resolve(r || null)
          );
        });
        if (resp?.ok && resp.data?.latestPath) {
          savedPath = resp.data.latestPath;
        }
      } catch { /* CommanderDeck offline; clipboard copy still works */ }

      const summary = `✓ Recorded ${finalRec.steps.length} step(s)${copied ? " (copied to clipboard)" : ""}${savedPath ? " & saved to CommanderDeck!" : ""}`;
      updateHud(summary);
      ui.setStatus(
        savedPath
          ? `${summary} Saved at ${savedPath}.`
          : `${summary} Paste into chat (or open popup → Copy Last Recording).`
      );
      setTimeout(() => hud.remove(), 4200);
      return md;
    };

    recState.finish = finishRecording;

    hud.querySelector("#cr-rec-snap")?.addEventListener("click", (e) => {
      e.stopPropagation();
      recordEventStep("manual-snap", document.activeElement || document.body);
    });
    hud.querySelector("#cr-rec-finish")?.addEventListener("click", (e) => {
      e.stopPropagation();
      finishRecording(false);
    });
    hud.querySelector("#cr-rec-cancel")?.addEventListener("click", (e) => {
      e.stopPropagation();
      finishRecording(true);
    });

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKeyDown, true);
    ui.setStatus("Recording steps & screenshots — perform the actions on the page, then click '⏹ Finish & Save'.");
  }

  async function stopStepRecorder() {
    if (recState?.finish) return await recState.finish(false);
    return view.lastRecordingMd || "";
  }

  /* ---------------- headless UI ---------------- */

  // Same interface the panel exposed, so every call site in the engine
  // above is untouched — but each method now records a fact instead of
  // painting a widget. The popup asks for those facts when it opens.
  const ui = {
    openPanel: () => setBadge("!", "#46704b"),
    setStatus: (t) => { view.status = t; },
    setProgress: (i, n) => { view.progress = { i, n }; },
    setRunning: (r) => {
      // The toolbar badge is the only status surface that survives the
      // popup closing, so a long replay still shows *something* while
      // you work in another tab.
      if (r) setBadge("▶", "#46704b");
      else setBadge(state.prompts.length ? String(state.prompts.length) : "", "#3a3f4a");
    },
    showCopyBox: (text) => { view.pendingCopy = text; },
    hideCopyBox: () => { view.pendingCopy = ""; },
    refreshLearned: (cfg) => { view.learned = describeLearned(cfg); },
    refreshCount: (src) => {
      view.source = src || "";
      if (!state.running) setBadge(state.prompts.length ? String(state.prompts.length) : "", "#3a3f4a");
    },
    renderLibrary: () => {}, // the popup owns the library outright now
  };

  function describeLearned(cfg) {
    if (!cfg) return null;
    const L = ChatReplayAdapters.learn.sigLabel;
    return cfg.alternating
      ? `alternating turns on ${L(cfg.user)}`
      : `you = ${L(cfg.user)} · AI = ${L(cfg.assistant)}`;
  }

  function setBadge(text, color) {
    try { chrome.runtime.sendMessage({ type: "badge", text, color }); } catch { /* worker asleep */ }
  }

  /* ---------------- settings ---------------- */

  const KEY_SETTINGS = "chatReplay.settings";
  const settings = { settle: 4, minReply: 6, from: 1, to: 0, deep: true, showFab: false, dedupe: true, redact: false };
  const saveSettings = () => sset(KEY_SETTINGS, settings);

  function applySettings(s) {
    if (!s) return;
    Object.assign(settings, s);
    state.settleSeconds = Math.max(1, Number(settings.settle) || 4);
    state.minReplySeconds = Math.max(0, Number(settings.minReply) || 0);
    view.deep = settings.deep !== false;
    reflectFab();
  }

  /* ---------------- optional in-page button ---------------- */

  // The ⏵⏵ button is off by default in v0.5 — it was the main thing that
  // got in the way of the page, and the toolbar icon replaces it. It
  // stays available because on a maximised window the toolbar is a long
  // way from the chat, and some people would rather have it close.
  function ensureRoot() {
    let root = document.querySelector("#chat-replay-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "chat-replay-root";
      // Still parented OUTSIDE <body>: the mutation observer that decides
      // "the page has gone quiet" watches the transcript, and anything of
      // ours inside body risks counting as page activity.
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function reflectFab() {
    const root = ensureRoot();
    let fab = root.querySelector("#cr-fab");
    if (!settings.showFab) { fab?.remove(); return; }
    if (fab) return;
    fab = document.createElement("button");
    fab.id = "cr-fab";
    fab.title = "Chat Replay — capture this chat's prompts";
    fab.textContent = "⏵⏵";
    // One job only: the thing you'd otherwise open the popup to do.
    fab.addEventListener("click", async () => {
      fab.disabled = true;
      const before = fab.textContent;
      fab.textContent = "…";
      try {
        const n = await doCapture();
        fab.textContent = n ? "✓" : "✕";
      } catch { fab.textContent = "✕"; }
      setTimeout(() => { fab.textContent = before; fab.disabled = false; }, 1600);
    });
    root.appendChild(fab);
  }

  /* ---------------- actions the popup can ask for ---------------- */

  // Any time the prompt LIST changes underneath it, the range has to go
  // back to "everything" — a stale lower bound left over from a "last 3"
  // would silently skip the opening prompts of the next set, including
  // in a launched parallel run.
  function resetRange() {
    settings.from = 1;
    settings.to = 0;
    view.resumeAt = 0;
    saveSettings();
  }

  async function doCapture() {
    view.busy = true;
    ui.setStatus(view.deep ? "Scanning the whole chat for your prompts…" : "Reading visible prompts…");
    try {
      const turns = await harvestTurns(ui, view.deep);
      const msgs = turns.filter((t) => t.role === "user").map((t) => t.text).filter(Boolean);
      if (!msgs.length) {
        ui.setStatus("Couldn't auto-detect your messages — paste them in Prompts, or send the diagnostics.");
        return 0;
      }
      state.prompts = msgs;
      resetRange();
      await saveSession();
      ui.refreshCount("this page");
      ui.setStatus(`Captured ${msgs.length} prompt(s). Pin them, or open a fresh chat and Replay.`);
      return msgs.length;
    } finally { view.busy = false; }
  }

  async function doLoadLast() {
    const s = await sget(KEY_SESSION);
    if (!s?.prompts?.length) { ui.setStatus("Nothing captured yet."); return 0; }
    state.prompts = s.prompts;
    resetRange();
    ui.refreshCount(s.source);
    ui.setStatus(`Loaded ${s.prompts.length} prompt(s) from ${s.source}.`);
    return s.prompts.length;
  }

  function snapshot() {
    return {
      ok: true,
      host: location.hostname,
      adapter: adapter.id,
      adapterLabel: adapter.label,
      model: (() => { try { return adapter.currentModel?.() || ""; } catch { return ""; } })(),
      promptCount: state.prompts.length,
      source: view.source,
      status: view.status,
      progress: view.progress,
      running: state.running,
      paused: state.paused,
      countdown: state.countdownActive,
      teaching: view.teaching,
      recording: view.recording,
      recordedSteps: view.recordedSteps,
      hasLastRecording: !!view.lastRecordingMd,
      busy: view.busy,
      turnCount: view.turnCount,
      learned: view.learned,
      pendingCopy: view.pendingCopy ? view.pendingCopy.length : 0,
      range: range(),
      resumeAt: view.resumeAt,
      settings: { ...settings },
    };
  }

  // Every handler returns a promise; the listener below answers with the
  // resolved value MERGED INTO a fresh snapshot, so the popup gets the
  // result and the new state in one round trip and never renders a view
  // that's one action out of date.
  const handlers = {
    ping: async () => ({}),
    state: async () => ({}),

    capture: async () => ({ captured: await doCapture() }),
    loadLast: async () => ({ loaded: await doLoadLast() }),

    getPrompts: async () => ({ prompts: state.prompts }),
    setPrompts: async ({ text }) => {
      state.prompts = String(text || "").split(/\n\s*---\s*\n/).map((s) => s.trim()).filter(Boolean);
      resetRange();
      await saveSession();
      ui.refreshCount("manual edit");
      ui.setStatus(`Prompt list updated: ${state.prompts.length} prompt(s).`);
      return {};
    },
    usePrompts: async ({ prompts, source }) => {
      state.prompts = Array.isArray(prompts) ? prompts : [];
      resetRange();
      ui.refreshCount(source || "library");
      ui.setStatus(`Loaded ${state.prompts.length} prompt(s).`);
      return {};
    },

    settings: async ({ patch }) => {
      applySettings({ ...settings, ...patch });
      await saveSettings();
      return {};
    },

    scan: async () => { view.busy = true; try { await scanOnly(ui); } finally { view.busy = false; } return {}; },

    // "copy" hands the markdown BACK rather than writing it here. The
    // popup's button click is a fresh user gesture with no 30-second
    // scroll-scan standing between it and the clipboard, which is the
    // exact activation problem v0.4.2 had to work around in the page.
    export: async ({ kind }) => {
      view.busy = true;
      try {
        if (kind !== "copy") { await doExport(ui, kind); return {}; }
        const raw = await gatherForExport(ui);
        if (!raw.length) { ui.setStatus("Nothing to export here yet."); return { markdown: "" }; }
        const { turns, meta, note } = prepared(raw);
        const users = turns.filter((t) => t.role === "user").length;
        const text = ChatReplayMd.buildMarkdown(turns, meta);
        view.pendingCopy = text;
        ui.setStatus(`Built ${turns.length} turns (${users} yours)${note}.`);
        return { markdown: text, turns: turns.length, users };
      } finally { view.busy = false; }
    },
    takePending: async () => {
      const text = view.pendingCopy;
      return { markdown: text };
    },
    clearPending: async () => { view.pendingCopy = ""; ui.setStatus("Copied to clipboard ✓"); return {}; },

    run: async ({ startAt }) => {
      if (state.countdownActive) { view.startNow = true; return {}; }
      if (state.running) return {};
      // startAt is an absolute prompt number, or absent to mean "the
      // start of the selected range".
      runReplay(ui, startAt); // NOT awaited — it outlives this message
      return {};
    },

    // Pings from the worker: the whole reason a backgrounded replay
    // doesn't crawl. Resolving the naps is the entire job.
    wake: async () => { wakeAll(); return {}; },
    pause: async () => {
      state.paused = !state.paused;
      ui.setStatus(state.paused ? "Paused." : "Resumed.");
      return {};
    },
    stop: async () => {
      if (state.countdownActive) { view.cancelCountdown = true; return {}; }
      state.stopRequested = true;
      state.paused = false;
      return {};
    },

    teach: async () => { teachSite(ui); return {}; },
    forget: async () => { await forgetLearned(ui); return {}; },
    diagnostics: async () => ({ report: ChatReplayAdapters.diagnose(adapter) }),
    recordStart: async () => { startStepRecorder(ui); return {}; },
    recordStop: async () => ({ markdown: await stopStepRecorder() }),
    takeLastRecording: async () => ({ markdown: view.lastRecordingMd || "" }),
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const fn = msg && msg.cr && handlers[msg.cr];
    if (!fn) return; // not ours — let the background's own handlers see it
    Promise.resolve(fn(msg))
      .then((extra) => sendResponse({ ...snapshot(), ...extra }))
      .catch((e) => sendResponse({ ...snapshot(), error: String(e?.message || e) }));
    return true; // async
  });

  /* ---------------- boot ---------------- */

  // The popup may have edited the prompt set while this tab sat idle.
  // Picking that up here means "edit in the popup, replay in the tab"
  // works without a reload — but never mid-run, where it would swap the
  // list out from under the loop.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEY_SETTINGS]) applySettings(changes[KEY_SETTINGS].newValue);
    if (changes[KEY_SESSION] && !state.running && !state.countdownActive) {
      const s = changes[KEY_SESSION].newValue;
      if (s?.prompts?.length && s.prompts.join("\u0000") !== state.prompts.join("\u0000")) {
        state.prompts = s.prompts;
        ui.refreshCount(s.source);
      }
    }
  });

  async function boot() {
    ensureRoot();
    applySettings(await sget(KEY_SETTINGS));

    const s = await sget(KEY_SESSION);
    if (s?.prompts?.length) { state.prompts = s.prompts; ui.refreshCount(s.source); }

    // Learned selectors must be applied before anything reads the page.
    const cfg = await loadLearned();
    ui.refreshLearned(cfg);
    if (cfg) log("using learned layout for", location.hostname, cfg);

    if (await checkWebChatAutopilot(ui)) return;
    checkAssignedRun(ui);
  }

  if (document.body) boot();
  else window.addEventListener("DOMContentLoaded", boot);
})();
