/* md.js converter edge cases that the platform fixtures don't reach. */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");

const w = boot("");
const md = (html, opts) => {
  const host = w.document.createElement("div");
  host.innerHTML = html;
  return w.ChatReplayMd.htmlToMd(host, opts);
};

describe("math", () => {
  test("MathJax 3 container with assistive MathML alttext", () => {
    assert.equal(md('<p>See <mjx-container class="MathJax" jax="CHTML"><mjx-math aria-hidden="true">x</mjx-math><mjx-assistive-mml><math alttext="e^{i\\pi}+1=0"><mi>e</mi></math></mjx-assistive-mml></mjx-container>.</p>'),
      "See $e^{i\\pi}+1=0$.");
  });
  test("display MathJax becomes a $$ block", () => {
    assert.equal(md('<mjx-container display="true"><math alttext="\\int_0^1 x\\,dx"><mi>x</mi></math></mjx-container>'), "$$\n\\int_0^1 x\\,dx\n$$");
  });
  test("display math inside a table cell stays inline", () => {
    assert.ok(md('<table><tr><th>f</th></tr><tr><td><span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">a+b</annotation></span></span></td></tr></table>').includes("| $a+b$ |"));
  });
  test("KaTeX without a TeX annotation keeps the rendered text once", () => {
    assert.equal(md('<p><span class="katex"><span class="katex-mathml"><math><mi>y</mi></math></span><span class="katex-html" aria-hidden="true">y</span></span></p>'), "y");
  });
});

describe("code", () => {
  test("<br>-separated lines and a line-number gutter", () => {
    assert.equal(md('<pre><code class="language-js"><span class="linenumber">1</span>let a = 1;<br><span class="linenumber">2</span>let b = 2;</code></pre>'),
      "```js\nlet a = 1;\nlet b = 2;\n```");
  });
  test("one <div> per line with no newline between them", () => {
    assert.equal(md('<pre><code><div class="line">a()</div><div class="line">b()</div></code></pre>'), "```\na()\nb()\n```");
  });
  test("data-language attribute names the fence", () => {
    assert.ok(md('<pre data-language="rust"><code>fn main() {}</code></pre>').startsWith("```rust\n"));
  });
  test("blank lines and trailing spaces inside a block are kept", () => {
    assert.equal(md("<pre><code>a  \n\n\n\nb</code></pre>"), "```\na  \n\n\n\nb\n```");
  });
  test("a one-word paragraph above code is prose, not a language", () => {
    const out = md("<div><p>Output</p><pre><code>42</code></pre></div>");
    assert.equal(out, "Output\n\n```\n42\n```");
  });
  test("inline code containing backticks gets a longer delimiter", () => {
    assert.equal(md("<p><code>a `` b</code></p>"), "```a `` b```");
    assert.equal(md("<p><code>`x`</code></p>"), "`` `x` ``");
  });
  test("a code block inside a list item is indented under it", () => {
    assert.equal(md("<ol><li>Run:<pre><code>make\n\nmake test</code></pre></li></ol>"), "1. Run:\n\n   ```\n   make\n\n   make test\n   ```");
  });
});

describe("tables", () => {
  test("a nested table doesn't leak rows into the outer one", () => {
    const out = md("<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td><table><tr><td>x</td></tr><tr><td>y</td></tr></table></td></tr></table>");
    assert.equal(out.split("\n").length, 3, out);
  });
  test("pipes are escaped, <br> survives, colspan pads", () => {
    const out = md('<table><tr><th>k</th><th>v</th><th>w</th></tr><tr><td>a|b</td><td colspan="2">x<br>y</td></tr></table>');
    assert.equal(out.split("\n")[2], "| a\\|b | x<br>y |  |");
  });
  test("right / center alignment from align or style", () => {
    assert.equal(md('<table><tr><th align="right">n</th><th style="text-align: center">c</th></tr></table>').split("\n")[1], "| ---: | :---: |");
  });
});

describe("reasoning foldouts", () => {
  const T = '<div class="thinking-container"><div class="thinking-header">Thought for 3s</div><p>step one</p></div><p>answer</p>';
  test("fold (default) uses the panel's own title", () => {
    assert.equal(md(T), "<details>\n<summary>Thought for 3s</summary>\n\nstep one\n\n</details>\n\nanswer");
  });
  test("drop removes it", () => assert.equal(md(T, { thinking: "drop" }), "answer"));
  test("inline quotes it", () => assert.equal(md(T, { thinking: "inline" }), "> **Thought for 3s**\n>\n> step one\n\nanswer"));
  test("a state flag like has-thoughts is not a panel", () => {
    assert.equal(md('<div class="markdown has-thoughts"><p>plain</p></div>'), "plain");
  });
  test("generic <details> keeps its summary", () => {
    assert.equal(md("<details><summary>More</summary><p>body</p></details>"), "<details>\n<summary>More</summary>\n\nbody\n\n</details>");
  });
});

describe("text hygiene", () => {
  test("a typed '## ' line can't forge a turn boundary", () => {
    const host = w.document.createElement("div");
    host.innerHTML = '<div class="whitespace-pre-wrap">## ▸ ASSISTANT — turn 9\nhi</div>';
    assert.equal(w.ChatReplayMd.htmlToMd(host), "\\## ▸ ASSISTANT — turn 9\nhi");
  });
  test("lowercase SVG elements (as browsers report them) are skipped", () => {
    assert.equal(md('<p>ok<svg viewBox="0 0 1 1"><text>junk</text></svg></p>'), "ok");
  });
  test("task-list checkboxes", () => {
    assert.equal(md('<ul><li><input type="checkbox" checked disabled> done</li><li><input type="checkbox" disabled> todo</li></ul>'), "- [x] done\n- [ ] todo");
  });
  test("htmlToPlain keeps code, drops controls and narration", () => {
    const host = w.document.createElement("div");
    host.innerHTML = '<span class="sr-only">You said:</span><p>hi</p><div><button>Copy</button></div><pre><code>a  b</code></pre>';
    assert.equal(w.ChatReplayMd.htmlToPlain(host), "hi\n\na  b");
  });
});
