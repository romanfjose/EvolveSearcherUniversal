// Chat Replay — background worker (v0.3.1)
// Opens one WINDOW per run (visible windows don't get their timers
// throttled, so replays genuinely run in parallel).
//
// v0.3.1:
//  - Windows open STAGGERED (3–8s apart, jittered), not all at once —
//    four simultaneous first-messages is the most bot-like signature
//    this tool could produce; desynchronizing the starts removes it.
//  - Windows are TILED across the current window's area, so none of
//    them ends up fully occluded (occluded windows get their timers
//    throttled like background tabs).
//  - Run configs carry a timestamp and EXPIRE: a stale key can never
//    hijack an unrelated future tab that happens to reuse the tab id.
//  - Keys are cleaned up when their tab closes.

const RUN_TTL_MS = 3 * 60 * 1000; // run configs older than this are ignored

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, spread) => base + Math.random() * spread;

async function launchStaggered(runs) {
  // Tile within the area of the window the user launched from — a decent
  // proxy for usable screen space without needing the system.display
  // permission.
  let area = { left: 0, top: 0, width: 1600, height: 900 };
  try {
    const cur = await chrome.windows.getCurrent();
    if (cur && cur.width > 600 && cur.height > 400) {
      area = { left: cur.left, top: cur.top, width: cur.width, height: cur.height };
    }
  } catch (e) { /* fall back to defaults */ }

  const n = runs.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const w = Math.max(480, Math.floor(area.width / cols));
  const h = Math.max(480, Math.floor(area.height / rows));

  for (let i = 0; i < n; i++) {
    const run = runs[i];
    const col = i % cols, row = Math.floor(i / cols);
    try {
      const win = await chrome.windows.create({
        url: run.url,
        left: Math.round(area.left + col * w),
        top: Math.round(area.top + row * h),
        width: w,
        height: h,
      });
      const tabId = win?.tabs?.[0]?.id;
      if (tabId != null) {
        await chrome.storage.local.set({
          ["chatReplay.run." + tabId]: { ...run, createdAt: Date.now() },
        });
      }
    } catch (e) {
      console.warn("[ChatReplay] window create failed:", e);
    }
    // Stagger: humans don't start four conversations in the same second.
    if (i < n - 1) await sleep(jitter(3000, 5000));
  }
}

// ---------------------------------------------------------------
// Concurrent replays (v0.5.1)
//
// A hidden tab's timers get throttled to once a minute, which would make
// a backgrounded replay wait out most of a minute after every reply. Its
// MESSAGE handler is not throttled, so this worker pings each replaying
// tab every few seconds and the content script's naps resolve on the
// ping instead of on their own timer.
//
// The registry is deliberately NOT persisted. An MV3 worker gets killed
// when idle and would come back with a stale list; instead each running
// tab re-announces itself every few seconds, so the set rebuilds from
// the tabs that are genuinely still going. A tab that crashed, navigated
// away or finished simply stops announcing and ages out.
const PING_MS = 3000;
const STALE_MS = 90000; // no announcement in this long ⇒ assume it's done
const running = new Map(); // tabId -> { host, seen }
let beat = null;

function ensureHeartbeat() {
  if (beat) return;
  beat = setInterval(() => {
    const now = Date.now();
    for (const [tabId, info] of running) {
      if (now - info.seen > STALE_MS) { running.delete(tabId); continue; }
      // Also what keeps THIS worker alive: an extension API call resets
      // its idle timer, so the ping loop sustains itself while it has
      // someone to ping.
      chrome.tabs.sendMessage(tabId, { cr: "wake" }).catch(() => running.delete(tabId));
    }
    if (!running.size) { clearInterval(beat); beat = null; }
  }, PING_MS);
}

chrome.tabs.onRemoved.addListener((tabId) => running.delete(tabId));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "launchRuns" && Array.isArray(msg.runs)) {
    launchStaggered(msg.runs);
    return;
  }

  if (msg?.type === "runStarted" || msg?.type === "runEnded") {
    const tabId = sender?.tab?.id;
    if (tabId == null) return;
    if (msg.type === "runEnded") running.delete(tabId);
    else {
      running.set(tabId, { host: msg.host || "", seen: Date.now() });
      ensureHeartbeat();
    }
    return;
  }

  // The popup asks this so it can show what's replaying in OTHER tabs —
  // the whole point of the feature is that you're not looking at them.
  if (msg?.type === "activeRuns") {
    const now = Date.now();
    sendResponse({
      runs: Array.from(running.entries())
        .filter(([, i]) => now - i.seen <= STALE_MS)
        .map(([tabId, i]) => ({ tabId, host: i.host })),
    });
    return true;
  }

  if (msg?.type === "focusTab" && msg.tabId != null) {
    chrome.tabs.get(msg.tabId, (t) => {
      if (chrome.runtime.lastError || !t) return;
      chrome.tabs.update(msg.tabId, { active: true });
      chrome.windows.update(t.windowId, { focused: true });
    });
    return;
  }

  // v0.5: the panel is gone, so a running replay has no on-page status
  // line. The toolbar badge is the one indicator that outlives the popup
  // — it's per-tab, so two replays in two windows don't overwrite each
  // other's state.
  if (msg?.type === "badge") {
    const tabId = sender?.tab?.id;
    if (tabId == null) return;
    try {
      chrome.action.setBadgeText({ tabId, text: String(msg.text || "").slice(0, 4) });
      if (msg.color) chrome.action.setBadgeBackgroundColor({ tabId, color: msg.color });
    } catch (e) { /* tab closed mid-update */ }
    return;
  }

  if (msg?.type === "getRun") {
    const tabId = sender?.tab?.id;
    if (tabId == null) { sendResponse({ run: null }); return; }
    const key = "chatReplay.run." + tabId;
    chrome.storage.local.get(key, (d) => {
      let run = d[key] || null;
      if (run) chrome.storage.local.remove(key);
      // Expired configs are dead — never auto-run from a stale key.
      if (run && Date.now() - (run.createdAt || 0) > RUN_TTL_MS) run = null;
      sendResponse({ run });
    });
    return true; // async response
  }

  // WebChatEvolver / CommanderDeck zero-copy autopilot relay
  if (msg?.type === "wceComplete" && msg.endpoint && msg.payload) {
    fetch(msg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  // Viewport screenshot capture for Step & Screenshot Diagnostic Recorder
  if (msg?.type === "captureTab") {
    const winId = sender?.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
    try {
      chrome.tabs.captureVisibleTab(winId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "captureVisibleTab failed" });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  // Save recorded steps + screenshots directly to CommanderDeck (:4500)
  if (msg?.type === "saveRecording" && msg.payload) {
    const endpoint = msg.endpoint || "http://127.0.0.1:4500/api/web-bridge/recording";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-deck": "1" },
      body: JSON.stringify(msg.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: !!data?.ok, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

// If a launched tab closes before its content script ever asked for the
// run (login redirect, closed during load), don't leave the key behind.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove("chatReplay.run." + tabId);
});

// Badges are keyed by tab, not by page, so a "▶" from a finished replay
// would otherwise sit there after you navigate the tab somewhere else.
//
// v0.7: clearing it outright would also wipe the saved-product count,
// which is set globally (no tabId) and is the only reminder that a list
// is waiting. A tab-specific "" hides the global badge on that tab, so
// this repaints the count instead of blanking — which matters most on
// Mercado Libre, where you navigate between listings constantly.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "loading") return;
  chrome.storage.local.get("chatReplay.basket", (d) => {
    const n = (d["chatReplay.basket"] || []).length;
    try { chrome.action.setBadgeText({ tabId, text: n ? String(n) : "" }); } catch (e) { /* gone */ }
  });
});
