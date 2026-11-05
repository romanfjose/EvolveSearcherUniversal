const { boot } = require("./harness");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "\n      " + extra : "")); }
};

/* ---------- fixtures ---------- */

// Geometry: transcript column is 800 wide at x=0.
// Your bubble hugs the right (x=400,w=380); the model runs full width.
const userTurn = (i, html) => `
  <div class="flex flex-col" data-testid="prompt-message" data-has-images="false">
    <div class="rounded-xl ml-auto py-2 px-4 max-w-[75%] bg-neutral-3" data-box="410,${i * 100},380,60">
      <div class="overflow-x-auto prose prose-sm dark:prose-invert max-w-full" data-testid="prompt-message-markdown">
        ${html}
      </div>
    </div>
  </div>`;

const asstTurn = (i, html, tid) => `
  <div class="flex flex-col w-full"${tid ? ` data-testid="${tid}"` : ""}>
    <div class="prose prose-sm dark:prose-invert max-w-full" data-box="0,${i * 100 + 50},790,60">
      ${html}
    </div>
    <div class="flex gap-1 ml-auto"><button aria-label="Copy">Copy</button><button>Retry</button></div>
  </div>`;

const wrap = (inner) => `<main><div class="flex flex-col gap-6 px-4" data-box="0,0,800,1300">${inner}</div></main>`;

const RICH = `
  <h2>Three options</h2>
  <p>Here is a <strong>plan</strong> with a <a href="https://x.dev/a">link</a>.</p>
  <ul><li>first item</li><li>second item</li></ul>
  <pre><code class="language-java">record Foo(String bar) {}</code></pre>
  <table><tr><th>Col</th><th>Use</th></tr><tr><td>a</td><td>b</td></tr></table>`;

/* ---------- 1. the reported bug ---------- */

console.log("\nOutlier Playground — prompt-message anchor");
{
  let html = "";
  for (let i = 0; i < 6; i++) {
    html += userTurn(i, `<p>my question number ${i + 1}</p>`);
    html += asstTurn(i, i === 0 ? RICH : `<p>the model answers ${i + 1}</p>`);
  }
  const w = boot(wrap(html));
  const a = w.ChatReplayAdapters.forHost("playground.outlier.ai");
  const turns = a.turns();
  const roles = turns.map((t) => t.role).join(",");

  ok("adapter resolves to outlier", a.id === "outlier", "got " + a.id);
  ok("finds 12 turns", turns.length === 12, "got " + turns.length);
  ok("roles alternate user/assistant",
    roles === "user,assistant".repeat(6).replace(/assistantuser/g, "assistant,user"),
    "got " + roles);
  ok("captures 6 user prompts", a.userMessages().length === 6, "got " + a.userMessages().length);
  ok("user text is the prompt, not the reply",
    /my question number 1/.test(a.userMessages()[0]), a.userMessages()[0]);
  ok("transcript root is the turn list",
    a.getTranscriptRoot()?.className?.includes("flex flex-col gap-6"),
    String(a.getTranscriptRoot()?.className));

  // markdown quality on the rich assistant turn
  const md = w.ChatReplayMd.htmlToMd(turns[1].body);
  ok("heading demoted h2 -> h4", /^#### Three options$/m.test(md), md.split("\n")[0]);
  ok("code fence keeps language", /```java\nrecord Foo/.test(md), md);
  ok("list survives", /^- first item$/m.test(md), md);
  ok("table survives", /\| Col \| Use \|/.test(md), md);
  ok("link keeps href", /\[link\]\(https:\/\/x\.dev\/a\)/.test(md), md);
  ok("button labels stripped", !/Retry/.test(md), md);

  // full document
  const turnsForDoc = turns.map((t) => ({
    role: t.role,
    md: w.ChatReplayMd.htmlToMd(t.body),
    text: w.ChatReplayMd.htmlToPlain(t.body),
  }));
  const doc = w.ChatReplayMd.buildMarkdown(turnsForDoc, {
    site: "playground.outlier.ai", label: "Outlier Playground", model: "Astral",
    title: "t", url: "u", exportedAt: "now", version: "v0.4.2",
  });
  ok("export contains USER turns", /## ▸ USER — turn 1/.test(doc));
  ok("export contains ASSISTANT turns", /## ▸ ASSISTANT — turn 1/.test(doc));
  const h2s = doc.split("\n").filter((l) => /^## /.test(l)).length;
  ok("every '## ' line is a turn marker", h2s === 12, "got " + h2s);
}

/* ---------- 2. assistant side also tagged ---------- */

console.log("\nOutlier — both sides tagged (testid path)");
{
  let html = "";
  for (let i = 0; i < 4; i++) {
    html += userTurn(i, `<p>q${i}</p>`);
    html += asstTurn(i, `<p>a${i}</p>`, "response-message");
  }
  const w = boot(wrap(html));
  const a = w.ChatReplayAdapters.forHost("playground.outlier.ai");
  const roles = a.turns().map((t) => t.role).join(",");
  ok("still alternates", roles === "user,assistant,user,assistant,user,assistant,user,assistant", roles);
}

/* ---------- 3. nothing tagged: layout only ---------- */

console.log("\nUnknown site — no semantic markup at all");
{
  let html = "";
  for (let i = 0; i < 4; i++) {
    html += `<div class="flex"><div class="rounded ml-auto" data-box="410,${i * 100},380,60"><div class="prose"><p>mine ${i}</p></div></div></div>`;
    html += `<div class="flex"><div class="rounded" data-box="0,${i * 100 + 50},790,60"><div class="prose"><p>theirs ${i}</p></div></div></div>`;
  }
  const w = boot(wrap(html), { url: "https://some-new-chat.example/c/1" });
  const a = w.ChatReplayAdapters.forHost("some-new-chat.example");
  const turns = a.turns();
  const roles = turns.map((t) => t.role).join(",");
  ok("generic adapter used", a.id === "generic", a.id);
  ok("layout inference splits the roles", /user/.test(roles) && /assistant/.test(roles), roles);
  ok("not everything is one role", new Set(turns.map((t) => t.role)).size === 2, roles);
}

/* ---------- 4. no regressions on the sites that worked ---------- */

console.log("\nRegression — ChatGPT / Claude markup");
{
  const html = `
    <div data-box="0,0,800,600">
      <article data-turn="user" data-box="0,0,800,60"><div class="whitespace-pre-wrap">hello there</div></article>
      <article data-turn="assistant" data-box="0,60,800,60"><div class="markdown"><p>hi back</p></div></article>
      <article data-turn="user" data-box="0,120,800,60"><div class="whitespace-pre-wrap">second</div></article>
      <article data-turn="assistant" data-box="0,180,800,60"><div class="markdown"><p>reply two</p></div></article>
    </div>`;
  const w = boot(html, { url: "https://chatgpt.com/c/1", title: "x" });
  const a = w.ChatReplayAdapters.forHost("chatgpt.com");
  const roles = a.turns().map((t) => t.role).join(",");
  ok("chatgpt roles intact", roles === "user,assistant,user,assistant", roles);
  ok("chatgpt prompts captured", a.userMessages().join("|") === "hello there|second", a.userMessages().join("|"));
}
{
  const html = `
    <div data-box="0,0,800,600">
      <div data-testid="user-message" data-box="0,0,800,60"><p>ask</p></div>
      <div class="font-claude-response" data-box="0,60,800,60"><div class="prose"><p>answer</p></div></div>
    </div>`;
  const w = boot(html, { url: "https://claude.ai/chat/1", title: "x" });
  const a = w.ChatReplayAdapters.forHost("claude.ai");
  const roles = a.turns().map((t) => t.role).join(",");
  ok("claude roles intact", roles === "user,assistant", roles);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
