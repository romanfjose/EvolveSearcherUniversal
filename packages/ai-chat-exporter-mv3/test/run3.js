/* v0.5.1 — the replay range, per-tab resume, and two tabs replaying at
   the same time without touching each other.

   The replay loop is driven for real here: a fake composer that the
   adapter can find, and a fake "model" that answers after a beat, so the
   loop genuinely sends → waits → sends. Timings are shrunk hard (settle
   1s, min reply 0) to keep the suite quick. */

const fs = require("fs");
const path = require("path");
const { boot } = require("./harness");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "\n      " + extra : "")); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- a chat page the replay engine can actually drive ---------- */

// One user turn already present so the adapter has a transcript to read,
// plus a textarea + send button. Sending appends a user turn and, after a
// delay, an assistant turn — the shape isBusy()/quiescence expect.
const PAGE = `<main>
  <div class="flex flex-col" data-box="0,0,800,400" id="log">
    <div class="flex flex-col" data-testid="prompt-message">
      <div class="rounded-xl ml-auto" data-box="410,0,380,60">
        <div class="prose" data-testid="prompt-message-markdown"><p>seed</p></div>
      </div>
    </div>
    <div class="flex flex-col w-full">
      <div class="prose" data-box="0,60,790,60"><p>seed reply</p></div>
    </div>
  </div>
  <textarea id="composer"></textarea>
  <button id="sendbtn">Send</button>
</main>`;

function makeTab(name) {
  const w = boot(PAGE);
  const store = {};
  const sent = [];
  const listeners = [];
  const announces = [];

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
        if (m && (m.type === "runStarted" || m.type === "runEnded")) announces.push(m.type);
        cb && cb({ run: null });
      },
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
  };
  w.document.execCommand = () => false;
  w.scrollTo = () => {};

  // The "model": a send appends the user's text, then a reply shortly
  // after. Everything the engine keys off — transcript growth, the input
  // clearing — happens here rather than being stubbed away.
  const doc = w.document;
  const composer = doc.querySelector("#composer");
  doc.querySelector("#sendbtn").addEventListener("click", () => {
    const text = composer.value.trim();
    if (!text) return;
    sent.push(text);
    composer.value = "";
    const log = doc.querySelector("#log");
    const u = doc.createElement("div");
    u.className = "flex flex-col";
    u.setAttribute("data-testid", "prompt-message");
    u.innerHTML = `<div class="rounded-xl ml-auto" data-box="410,0,380,60">
      <div class="prose" data-testid="prompt-message-markdown"><p></p></div></div>`;
    u.querySelector("p").textContent = text;
    log.appendChild(u);
    setTimeout(() => {
      const a = doc.createElement("div");
      a.className = "flex flex-col w-full";
      a.innerHTML = `<div class="prose" data-box="0,60,790,60"><p>reply to ${sent.length}</p></div>`;
      log.appendChild(a);
    }, 150);
  });

  w.eval(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"));

  const call = (cr, extra = {}) =>
    new Promise((resolve) => {
      let answered = false;
      for (const fn of listeners) {
        const kept = fn({ cr, ...extra }, {}, (r) => { answered = true; resolve(r); });
        if (kept === true) return;
      }
      if (!answered) resolve(null);
    });

  return { w, call, sent, store, announces, name };
}

const PROMPTS = ["p1", "p2", "p3", "p4", "p5"];

// Fast enough to finish in a test, still exercising the real wait logic.
async function arm(tab) {
  await tab.call("settings", { patch: { settle: 1, minReply: 0, deep: false } });
  await tab.call("setPrompts", { text: PROMPTS.join("\n---\n") });
}

// The engine deliberately paces itself like a human — jittered gaps
// before sending, after sending, and a 2.5s floor inside every reply
// wait. Two prompts is comfortably 15-20s of wall clock, so this ceiling
// is generous on purpose: a timeout here should mean "stuck", not "slow".
async function waitIdle(tab, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await tab.call("state");
    if (!s.running) return s;
    await sleep(60);
  }
  return tab.call("state");
}

(async () => {
  console.log("\nv0.5.1 — replay range");

  const A = makeTab("A");
  await sleep(60);
  await arm(A);

  let s = await A.call("state");
  ok("range defaults to the whole list",
    s.range.from === 1 && s.range.to === 5 && s.range.count === 5, JSON.stringify(s.range));

  // "Last 2" — the popup's chip sets from/to; assert the ENGINE honours it.
  await A.call("settings", { patch: { from: 4, to: 5 } });
  await A.call("run", {});
  s = await waitIdle(A);
  ok("only the selected range is sent", A.sent.join(",") === "p4,p5", A.sent.join(","));
  ok("progress counts within the range", s.progress.n === 2, JSON.stringify(s.progress));
  ok("completing the range reports success", /complete/i.test(s.status), s.status);
  ok("run start and end were announced",
    A.announces.includes("runStarted") && A.announces.includes("runEnded"),
    JSON.stringify(A.announces));

  // A fresh capture must clear the range, or the next set silently loses
  // its opening prompts.
  await A.call("setPrompts", { text: "x1\n---\nx2\n---\nx3" });
  s = await A.call("state");
  ok("changing the prompt list resets the range",
    s.range.from === 1 && s.range.to === 3, JSON.stringify(s.range));

  console.log("\nv0.5.1 — resume is per tab, not shared");

  const B = makeTab("B");
  await sleep(60);
  await arm(B);
  await B.call("settings", { patch: { from: 1, to: 5 } });
  await B.call("run", {});
  await sleep(250);            // let prompt 1 go out
  await B.call("stop");
  const stopped = await waitIdle(B);

  ok("stopping offers a resume point", stopped.resumeAt >= 1, JSON.stringify(stopped.resumeAt));
  ok("stopping does NOT move the shared range",
    stopped.range.from === 1 && stopped.range.to === 5, JSON.stringify(stopped.range));
  ok("the halt point is not written to shared settings",
    B.store["chatReplay.settings"]?.from === 1,
    JSON.stringify(B.store["chatReplay.settings"]));

  const before = B.sent.length;
  await B.call("run", { startAt: stopped.resumeAt });
  const resumed = await waitIdle(B);
  ok("resuming continues from the halt point rather than restarting",
    B.sent.length > before && B.sent[before] === PROMPTS[stopped.resumeAt - 1],
    `sent=${B.sent.join(",")} resumeAt=${stopped.resumeAt}`);
  ok("resume point clears once a run completes", resumed.resumeAt === 0, String(resumed.resumeAt));

  console.log("\nv0.5.1 — two tabs replaying at once");

  const C = makeTab("C");
  const D = makeTab("D");
  await sleep(60);
  await arm(C);
  await arm(D);
  await C.call("settings", { patch: { from: 4, to: 5 } });
  await D.call("settings", { patch: { from: 1, to: 2 } });

  // Started back to back, exactly as you would: click Replay here, switch
  // tab, click Replay here.
  await C.call("run", {});
  await D.call("run", {});

  const cRunning = await C.call("state");
  const dRunning = await D.call("state");
  ok("both tabs report running simultaneously", cRunning.running && dRunning.running,
    `C=${cRunning.running} D=${dRunning.running}`);

  const [cDone, dDone] = await Promise.all([waitIdle(C), waitIdle(D)]);
  ok("both tabs ran to completion independently",
    !cDone.running && !dDone.running && /complete/i.test(cDone.status) && /complete/i.test(dDone.status),
    `C="${cDone.status}" D="${dDone.status}"`);
  ok("each tab sent only its own range",
    C.sent.join(",") === "p4,p5" && D.sent.join(",") === "p1,p2",
    `C=[${C.sent.join(",")}] D=[${D.sent.join(",")}]`);
  ok("neither tab's prompts leaked into the other",
    !C.sent.includes("p1") && !D.sent.includes("p5"));

  console.log("\nv0.5.1 — wake pings");

  const E = makeTab("E");
  await sleep(60);
  const woke = await E.call("wake");
  ok("the wake ping is answered", !!woke && woke.ok === true);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
