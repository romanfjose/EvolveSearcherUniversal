/* Every supported chat platform, end to end: the site's DOM → adapter
   turns → Markdown export, and the replay path back into its composer.
   The fixtures (and the expectations they share) live in
   fixtures/fixtures.js; the same file drives docs/index.html. */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");
const { chats, EXPECT } = require("./fixtures/fixtures");

const UI_LINE = /^(copy|copy code|copied|edit|retry|regenerate|share|download|you said:?|chatgpt said:?|thinking complete[d]?|content_copy|thumb_up|refresh|expand_more|edit text)$/i;

for (const f of chats) {
  describe(f.label, () => {
    const host = new URL(f.url).hostname;
    const load = () => {
      const w = boot(f.html, { url: f.url, title: f.title });
      const a = w.ChatReplayAdapters.forHost(host);
      return { w, a, turns: a.turns(), md: (t) => w.ChatReplayMd.turnToMd(t) };
    };
    const { w, a, turns, md } = load();
    const mds = turns.map(md);

    test("resolves its own adapter", () => assert.equal(a.id, f.id));

    test("extracts every turn with the right speaker", () => {
      assert.equal(turns.map((t) => t.role).join(","), EXPECT.roles);
    });

    test("captures the prompts verbatim for replay", () => {
      assert.deepEqual(a.userMessages(), EXPECT.prompts);
    });

    test("user turns keep their line breaks in Markdown", () => {
      assert.equal(mds[0], EXPECT.prompts[0]);
    });

    test("code block keeps its language tag and exact text", () => {
      for (const c of EXPECT.code) {
        assert.ok(mds[c.turn].includes("```" + c.lang + "\n") || mds[c.turn].includes("````" + c.lang + "\n"), `no ${c.lang} fence:\n${mds[c.turn]}`);
        assert.ok(mds[c.turn].includes(c.text), `code text altered:\n${mds[c.turn]}`);
      }
      assert.ok(mds[1].includes(EXPECT.inlineCode));
    });

    test("a code sample containing fences gets a longer outer fence", () => {
      assert.ok(mds[5].includes(EXPECT.nestedFence), mds[5]);
    });

    test("the language label is not echoed as prose", () => {
      for (const m of [mds[1], mds[5]]) {
        assert.ok(!/^(python|markdown)$/im.test(m), m);
      }
    });

    test("KaTeX/TeX round-trips to $…$ and $$…$$", () => {
      assert.ok(mds[3].includes(EXPECT.mathInline), mds[3]);
      assert.ok(mds[3].includes(EXPECT.mathBlock), mds[3]);
      assert.ok(!/x=2|mathnormal/.test(mds[3]), "MathML or KaTeX HTML leaked");
    });

    test("tables become aligned GFM tables", () => {
      assert.ok(mds[3].includes(EXPECT.table), mds[3]);
    });

    test("lists keep their bullets", () => assert.ok(mds[5].includes(EXPECT.list), mds[5]));

    test(f.thinking ? "reasoning is folded into <details>" : "no phantom reasoning foldout", () => {
      if (f.thinking) {
        assert.match(mds[3], /^<details>\n<summary>[^<\n]+<\/summary>\n\n(> )?The user wants the formula first/m);
        assert.ok(mds[3].indexOf("</details>") < mds[3].indexOf(EXPECT.mathInline), "answer ended up inside the foldout");
        const dropped = w.ChatReplayMd.turnToMd(turns[3], { thinking: "drop" });
        assert.ok(!dropped.includes(EXPECT.think) && dropped.includes(EXPECT.mathBlock));
      } else {
        assert.ok(mds.every((m) => !m.includes("<details>")));
      }
    });

    test("no site chrome leaks into the export", () => {
      for (const m of mds) {
        for (const line of m.split("\n")) assert.ok(!UI_LINE.test(line.trim()), `leaked "${line}"`);
      }
    });

    test("full document: one ## per turn, nothing else at level 2", () => {
      const doc = w.ChatReplayMd.buildMarkdown(
        turns.map((t, i) => ({ role: t.role, md: mds[i], text: mds[i], pair: Math.floor(i / 2) + 1 })),
        { site: host, label: f.label, title: f.title, url: f.url, exportedAt: "2026-11-05T12:00:00.000Z" });
      const h2 = doc.split("\n").filter((l) => l.startsWith("## "));
      assert.equal(h2.length, 6);
      assert.ok(h2.every((l) => /^## ▸ (USER|ASSISTANT) — turn [1-3]$/.test(l)), h2.join("\n"));
    });

    test("replay: a prompt lands in the composer", () => {
      const { w: w2, a: a2 } = load();
      const input = a2.getInput();
      assert.ok(input, "composer not found");
      const prompt = EXPECT.prompts[0];
      const inject = w2.ChatReplayAdapters.inject;
      let inputEvents = 0;
      input.addEventListener("input", () => inputEvents++);
      inject.insertTextFast(input, prompt);
      assert.equal(inject.readInputText(input).replace(/\n+/g, "\n").trim(), prompt);
      assert.ok(inputEvents >= 1, "framework never saw an input event");
    });

    test("replay: send hits the real send button, and the site reads idle", () => {
      const { w: w2, a: a2 } = load();
      const btn = a2.getSendButton();
      assert.equal(btn, w2.document.querySelector(f.send), btn && btn.outerHTML.slice(0, 160));
      let clicks = 0;
      btn.addEventListener("click", () => clicks++);
      w2.ChatReplayAdapters.humanClick(btn);
      assert.equal(clicks, 1);
      assert.equal(a2.isBusy(), false);
    });
  });
}

describe("replay injection edge cases", () => {
  const f = chats.find((c) => c.id === "chatgpt");

  test("ProseMirror cancelling beforeinput still ends with the prompt", () => {
    const w = boot(f.html, { url: f.url });
    const input = w.ChatReplayAdapters.forHost("chatgpt.com").getInput();
    input.addEventListener("beforeinput", (e) => e.preventDefault());
    w.ChatReplayAdapters.inject.insertText(input, "hello there");
    assert.equal(w.ChatReplayAdapters.inject.readInputText(input), "hello there");
  });

  test("a textarea is filled through the prototype setter React listens to", () => {
    const g = chats.find((c) => c.id === "glm");
    const w = boot(g.html, { url: g.url });
    const ta = w.ChatReplayAdapters.forHost("chat.z.ai").getInput();
    assert.equal(ta.tagName, "TEXTAREA");
    let seen = "";
    ta.addEventListener("input", () => { seen = ta.value; });
    w.ChatReplayAdapters.inject.insertText(ta, "line 1\nline 2");
    assert.equal(seen, "line 1\nline 2");
  });

  test("a visible stop button makes the site busy", () => {
    const w = boot(f.html.replace('data-testid="stop-button" aria-label="Stop streaming" style="display:none"', 'data-testid="stop-button" aria-label="Stop streaming"'), { url: f.url });
    assert.equal(w.ChatReplayAdapters.forHost("chatgpt.com").isBusy(), true);
  });

  test("replay range clamps to the captured list", () => {
    const { replayRange } = boot("").ChatReplayAdapters.inject;
    assert.deepEqual(replayRange(8, 6, 0), { from: 6, to: 8, count: 3 });
    assert.deepEqual(replayRange(8, 0, 99), { from: 1, to: 8, count: 8 });
    assert.deepEqual(replayRange(8, 5, 2), { from: 5, to: 5, count: 1 });
    assert.equal(replayRange(0, 1, 0).count, 0);
  });
});
