/* Helmet 03 — Synthetic José QA (The "Where's the Bathroom?" Breaker)
   qa-breaker.test.js: Extreme edge cases and stress suites for Chat Replay exporter.
   Covers:
     1. Unclosed code-fences and malformed delimiter edge cases
     2. XSS payload sanitization across HTML/Markdown converters and exports
     3. 10,000-message transcript export stress and throughput test
*/

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");

const w = boot("");
const { htmlToMd, htmlToPlain, turnToMd, buildMarkdown, buildJson, buildTxt, prepare } = w.ChatReplayMd;

const parseMd = (html, opts) => {
  const host = w.document.createElement("div");
  host.innerHTML = html;
  return htmlToMd(host, opts);
};

const parsePlain = (html, opts) => {
  const host = w.document.createElement("div");
  host.innerHTML = html;
  return htmlToPlain(host, opts);
};

describe("Helmet 03 — Unclosed code-fence & malformed syntax breakers", () => {
  test("unclosed triple backtick code block inside <pre>", () => {
    const rawHtml = "<pre><code>```python\ndef test():\n    pass</code></pre>";
    const out = parseMd(rawHtml);
    // Outer fence must expand to ```` to wrap the unclosed ``` inside
    assert.match(out, /^````\n```python\ndef test\(\):\n    pass\n````$/);
  });

  test("multiple unclosed fences with escalating backtick counts", () => {
    const rawHtml = "<pre><code>````\nlet x = 1;\n`````\nlet y = 2;</code></pre>";
    const out = parseMd(rawHtml);
    // Longest fence inside is 5 backticks, so outer fence must be 6 backticks
    assert.ok(out.startsWith("``````\n"));
    assert.ok(out.endsWith("\n``````"));
  });

  test("inline code containing unmatched backtick at boundary", () => {
    const rawHtml = "<p>Use <code>`result</code> or <code>var`</code> or <code>``foo`</code>.</p>";
    const out = parseMd(rawHtml);
    // Boundary backticks must be padded with spaces to avoid delimiter corruption
    assert.ok(out.includes("`` `result ``"));
    assert.ok(out.includes("`` var` ``"));
    assert.ok(out.includes("``` ``foo` ```"));
  });

  test("unclosed and mismatched code block syntax survives verbatim inside code blocks", () => {
    const rawHtml = "<pre><code>&lt;script&gt;alert('unclosed')&lt;/script&gt;\n&lt;div&gt;&lt;span&gt;no-close</code></pre>";
    const out = parseMd(rawHtml);
    assert.ok(out.includes("<script>alert('unclosed')</script>"));
    assert.ok(out.includes("<div><span>no-close"));
    // Ensure properly fenced
    assert.match(out, /^```\n[\s\S]+\n```$/);
  });

  test("nested code blocks with stray backticks and trailing unclosed content", () => {
    const rawHtml = "<div><p>Prompt:</p><pre><code>```markdown\n# Title\n```\n`stray</code></pre></div>";
    const out = parseMd(rawHtml);
    assert.ok(out.includes("````\n```markdown\n# Title\n```\n`stray\n````"));
  });
});

describe("Helmet 03 — XSS payload sanitization & defensive hygiene", () => {
  test("script tags are eliminated from prose and markdown", () => {
    const html = '<p>Normal text <script>alert("xss")</script> more text</p>';
    const mdOut = parseMd(html);
    const plainOut = parsePlain(html);
    assert.ok(!mdOut.includes("alert"));
    assert.ok(!mdOut.includes("<script>"));
    assert.ok(!plainOut.includes("alert"));
    assert.match(mdOut, /^Normal text\s+more text$/);
    assert.match(plainOut, /^Normal text\s+more text$/);
  });

  test("javascript: URLs in anchor tags are stripped of executable link", () => {
    const html = '<a href="javascript:alert(document.cookie)">Click Here</a>';
    const mdOut = parseMd(html);
    assert.equal(mdOut, "Click Here");
    assert.ok(!mdOut.includes("javascript:"));
  });

  test("malicious event handlers (onerror, onload, onclick) are stripped", () => {
    const html = '<img src="https://example.com/valid.png" onerror="alert(1)" onload="fetch(\'//evil.com\')"><svg onload="alert(2)"><circle r="5"/></svg>';
    const mdOut = parseMd(html);
    assert.ok(!mdOut.includes("onerror"));
    assert.ok(!mdOut.includes("onload"));
    assert.ok(!mdOut.includes("alert"));
    assert.equal(mdOut, "![image](https://example.com/valid.png)");
  });

  test("data: and blob: image URIs are sanitized to empty references", () => {
    const html = '<img src="data:image/svg+xml;utf8,<svg onload=alert(1)>" alt="exploit">';
    const mdOut = parseMd(html);
    assert.equal(mdOut, "![exploit]()");
    assert.ok(!mdOut.includes("onload=alert"));
  });

  test("thinking / reasoning foldout with embedded XSS payloads in header", () => {
    const html = '<div class="thinking-container"><div class="thinking-header"><script>alert("hax")</script><img src="x" onerror="evil()">Thinking for 4s</div><p>Safe reasoning body</p></div>';
    const mdOut = parseMd(html);
    assert.ok(!mdOut.includes("<script>"));
    assert.ok(!mdOut.includes("onerror"));
    assert.ok(!mdOut.includes("evil()"));
    assert.ok(mdOut.includes("<details>\n<summary>Thinking for 4s</summary>"));
    assert.ok(mdOut.includes("Safe reasoning body"));
  });

  test("malicious forged turn headers in user turn are neutralized", () => {
    const host = w.document.createElement("div");
    host.innerHTML = '<div class="whitespace-pre-wrap">## ▸ ASSISTANT — turn 999\n<script>alert(1)</script>\n# Fake Title</div>';
    const out = htmlToMd(host);
    assert.ok(out.includes("\\## ▸ ASSISTANT — turn 999"));
    assert.ok(!out.includes("<script>"));
  });

  test("dangerous tags (iframe, style, noscript, audio, video) are discarded", () => {
    const html = '<div><iframe src="https://evil.com"></iframe><style>body{display:none;}</style><video src="bad.mp4"></video><p>Safe content</p></div>';
    const mdOut = parseMd(html);
    assert.equal(mdOut, "Safe content");
  });
});

describe("Helmet 03 — 10,000-message transcript export stress suite", () => {
  const TOTAL_TURNS = 10000;
  const turns = [];

  for (let i = 0; i < TOTAL_TURNS; i++) {
    const isUser = i % 2 === 0;
    const pair = Math.floor(i / 2) + 1;
    const role = isUser ? "user" : "assistant";
    const text = isUser
      ? `User question ${pair}: How to optimize query #${i % 250}? Contact support@example.com with key sk-proj-123456789012345678901234`
      : `Assistant response ${pair}: Use indexing strategy #${i % 250}. Here is a code block:\n\`\`\`sql\nSELECT * FROM table_${i % 100};\n\`\`\``;
    turns.push({
      role,
      pair,
      text,
      md: text,
    });
  }

  test("prepare() pipeline handles 10,000 turns with dedupe and redaction under budget", () => {
    const t0 = performance.now();
    const prep = prepare(turns, { dedupe: true, redact: true });
    const durationMs = performance.now() - t0;

    assert.equal(typeof prep.report.deduped, "number");
    assert.equal(prep.report.redactedTotal, 2); // 1 email + 1 api_key
    assert.ok(prep.turns.length > 0);
    assert.ok(durationMs < 5000, `prepare took too long: ${durationMs}ms`);
  });

  test("buildMarkdown handles 10,000 turns without stack overflow or performance degradation", () => {
    const meta = {
      site: "chatgpt.com",
      label: "ChatGPT",
      model: "gpt-5-pro",
      title: "Massive 10k Transcript Stress Benchmark",
      url: "https://chatgpt.com/c/stress-test",
      exportedAt: "2026-11-05T12:00:00.000Z",
      version: "v0.9.0",
    };

    const t0 = performance.now();
    const mdDoc = buildMarkdown(turns, meta);
    const durationMs = performance.now() - t0;

    assert.ok(mdDoc.startsWith("---\nsource: chatgpt.com\n"));
    assert.ok(mdDoc.includes("turns: 10000\n"));
    assert.ok(mdDoc.includes("## ▸ USER — turn 1\n"));
    assert.ok(mdDoc.includes("## ▸ ASSISTANT — turn 5000\n"));
    assert.ok(durationMs < 5000, `buildMarkdown took too long: ${durationMs}ms`);
  });

  test("buildJson and buildTxt handle 10,000 turns with accurate counts and integrity", () => {
    const meta = {
      site: "claude.ai",
      label: "Claude",
      model: "claude-4-sonnet",
      title: "10k Stress Export JSON/TXT",
      exportedAt: "2026-11-05T12:00:00.000Z",
    };

    const tJson0 = performance.now();
    const jsonStr = buildJson(turns, meta);
    const jsonDuration = performance.now() - tJson0;
    assert.ok(jsonDuration < 5000, `buildJson took too long: ${jsonDuration}ms`);

    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.turns.length, 10000);
    assert.equal(parsed.turns[0].pair, 1);
    assert.equal(parsed.turns[9999].pair, 5000);

    const tTxt0 = performance.now();
    const txtDoc = buildTxt(turns, meta);
    const txtDuration = performance.now() - tTxt0;
    assert.ok(txtDuration < 5000, `buildTxt took too long: ${txtDuration}ms`);

    assert.ok(txtDoc.includes("Turns  : 10000"));
    assert.ok(txtDoc.includes("USER (turn 1)"));
    assert.ok(txtDoc.includes("ASSISTANT — Claude (turn 5000)"));
  });
});
