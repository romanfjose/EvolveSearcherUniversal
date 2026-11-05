/* Exercises md.js text extraction and the actual content.js panel,
   including the clipboard-blocked path that v0.4.1 dropped on the floor. */

const fs = require("fs");
const path = require("path");
const { boot } = require("./harness");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "\n      " + extra : "")); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- md.js text extraction ---------- */

console.log("\nmd.js — plain-text extraction");
{
  const w = boot(`<div id="t" data-box="0,0,800,200">
      <span class="sr-only">You said:</span>
      <p>Real content here.</p>
      <div><button>Copy code</button></div>
      <div class="toolbar"><div>Retry</div></div>
      <pre><code>keep   spacing</code></pre>
    </div>`);
  const plain = w.ChatReplayMd.htmlToPlain(w.document.getElementById("t"));
  ok("keeps the message", /Real content here\./.test(plain), plain);
  ok("drops sr-only narration", !/You said/.test(plain), plain);
  ok("drops button labels", !/Copy code/.test(plain), plain);
  ok("drops a lone control label", !/Retry/.test(plain), plain);
  ok("preserves code spacing", /keep {3}spacing/.test(plain), plain);
}
{
  const w = boot(`<div id="t" data-box="0,0,800,60"><p>Retry</p></div>`);
  const plain = w.ChatReplayMd.htmlToPlain(w.document.getElementById("t"));
  ok("a message that IS the word 'Retry' survives", plain === "Retry", JSON.stringify(plain));
}

/* ---------- content.js panel + clipboard fallback ---------- */

console.log("\ncontent.js — headless engine over the message API (v0.5)");
(async () => {
  const w = boot(`<main><div class="flex flex-col" data-box="0,0,800,400">
      <div class="flex flex-col" data-testid="prompt-message">
        <div class="rounded-xl ml-auto bg-neutral-3" data-box="410,0,380,60">
          <div class="prose" data-testid="prompt-message-markdown"><p>what is a monad</p></div>
        </div>
      </div>
      <div class="flex flex-col w-full">
        <div class="prose" data-box="0,60,790,60"><p>A monoid in the category of endofunctors.</p></div>
      </div>
    </div></main>`);

  // --- extension environment stubs ---
  const store = {};
  const listeners = [];
  const badges = [];
  w.chrome = {
    storage: {
      local: {
        get: (k, cb) => cb(typeof k === "string" ? { [k]: store[k] } : {}),
        set: (o, cb) => { Object.assign(store, o); cb && cb(); },
        remove: () => {},
      },
      onChanged: { addListener: () => {} },
    },
    runtime: {
      sendMessage: (m, cb) => {
        if (m && m.type === "badge") badges.push(m.text);
        cb && cb({ run: null });
      },
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
  };
  w.document.execCommand = () => false;
  w.scrollTo = () => {};

  w.eval(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"));
  await sleep(80);

  // The popup talks to the content script exactly like this.
  const call = (cr, extra = {}) =>
    new Promise((resolve) => {
      let answered = false;
      for (const fn of listeners) {
        const kept = fn({ cr, ...extra }, {}, (resp) => { answered = true; resolve(resp); });
        if (kept === true) return; // async responder; wait for it
      }
      if (!answered) resolve(null);
    });

  const $ = (s) => w.document.querySelector(s);

  // --- the panel is gone -------------------------------------------------
  ok("no panel injected into the page", !$("#cr-panel") && !$("#cr-copymd"));
  ok("no ⏵⏵ button by default", !$("#cr-fab"));
  ok("root still lives outside <body>",
    !$("#chat-replay-root") || $("#chat-replay-root").parentElement === w.document.documentElement);

  // --- the message layer answers ----------------------------------------
  const ping = await call("ping");
  ok("ping answers with a snapshot", !!ping && ping.ok === true);
  ok("snapshot names the adapter", !!ping.adapterLabel, JSON.stringify(ping.adapterLabel));

  // --- copy: markdown is RETURNED, not written from the page ------------
  const exp = await call("export", { kind: "copy" });
  ok("export returns the markdown to the caller", !!exp && typeof exp.markdown === "string");
  ok("markdown has both turn markers",
    /## ▸ USER — turn 1/.test(exp.markdown) && /## ▸ ASSISTANT — turn 1/.test(exp.markdown),
    (exp.markdown || "").slice(0, 120));
  ok("both sides are in it",
    /what is a monad/.test(exp.markdown) && /endofunctors/.test(exp.markdown),
    (exp.markdown || "").slice(0, 200));
  ok("turn counts come back", exp.turns === 2 && exp.users === 1, `turns=${exp.turns} users=${exp.users}`);

  // The transcript is HELD, so a popup that was closed mid-scan can still
  // collect it — this is the v0.4.2 lesson carried forward.
  const held = await call("state");
  ok("markdown is retained for a reopened popup", held.pendingCopy > 0, String(held.pendingCopy));
  const taken = await call("takePending");
  ok("takePending hands back the same text", taken.markdown === exp.markdown);
  const cleared = await call("clearPending");
  ok("clearPending drops it", cleared.pendingCopy === 0);

  // --- scan reports a sane split rather than 'all assistant' ------------
  const scanned = await call("scan");
  ok("scan counts both roles",
    scanned.turnCount && scanned.turnCount.total === 2 && scanned.turnCount.users === 1,
    JSON.stringify(scanned.turnCount));

  // --- settings round-trip ----------------------------------------------
  const set = await call("settings", { patch: { settle: 9, minReply: 2, deep: false } });
  ok("settings echo back", set.settings.settle === 9 && set.settings.deep === false,
    JSON.stringify(set.settings));
  ok("settings persist to storage", store["chatReplay.settings"]?.settle === 9);

  // --- prompts round-trip ------------------------------------------------
  await call("setPrompts", { text: "one\n---\ntwo\n---\nthree" });
  const got = await call("getPrompts");
  ok("prompts split on --- fences", got.prompts.length === 3 && got.prompts[2] === "three",
    JSON.stringify(got.prompts));
  ok("prompt count is in the snapshot", got.promptCount === 3);

  // --- the optional in-page button ---------------------------------------
  await call("settings", { patch: { showFab: true } });
  await sleep(20);
  ok("⏵⏵ appears when asked for", !!$("#cr-fab"));
  await call("settings", { patch: { showFab: false } });
  await sleep(20);
  ok("⏵⏵ goes away again", !$("#cr-fab"));

  // --- badge is the status surface that outlives the popup ---------------
  ok("badge was updated", badges.length > 0, JSON.stringify(badges));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
