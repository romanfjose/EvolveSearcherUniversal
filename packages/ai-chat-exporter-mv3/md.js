/* ============================================================
   Chat Replay — HTML→Markdown + export builders (v0.4.2)

   Why a real converter instead of innerText:
   innerText flattens a reply into a wall of prose. Code blocks lose
   their fences, lists lose their bullets, tables become tab soup, and
   the site's own "Copy code / Edit / Retry" button labels get baked in
   as if the model had said them. For a transcript you intend to feed
   back to another model as project context, that damage is the whole
   ballgame — so we walk the DOM and emit real Markdown.

   Heading offset: model replies routinely contain their own "## " and
   "# " headings. Since the export uses "## " to mark turn boundaries,
   every heading INSIDE a message is pushed down two levels (h1 -> h3).
   That keeps the turn markers unambiguous for whatever agent reads it.
   ============================================================ */

const ChatReplayMd = (() => {

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BUTTON", "SVG", "PATH",
    "CANVAS", "AUDIO", "VIDEO", "SELECT", "OPTION", "TEXTAREA", "INPUT",
  ]);

  // Screen-reader-only text ("You said:", "Copy code", "1 / 2") and the
  // site's own affordances. These are visually invisible but innerText
  // and a naive walker both pick them up.
  const SKIP_CLASS = /\b(sr-only|visually-hidden|screen-?reader|a11y-hidden)\b/i;

  // Two different things, and conflating them cost real content: the
  // first group is narration the site adds for screen readers and is
  // always safe to drop; the second is BUTTON LABELS, which are only
  // noise when they sit alone in their own box. A user whose entire
  // message is "Retry" deserves to keep it, so those are dropped only
  // outside prose containers.
  const SR_LINE = /^(you said|dijiste|dijo|tú dijiste|você disse|has dicho|chatgpt said|claude said)\s*:?\s*$/i;
  const UI_LABEL = /^(copy code|copiar código|copy|copiar|edit|editar|retry|reintentar|regenerate|regenerar|share|compartir|thumbs (up|down)|good response|bad response)\s*:?\s*$/i;
  const PROSE_PARENT = /^(P|LI|TD|TH|H[1-6]|BLOCKQUOTE|FIGCAPTION|DT|DD|A|STRONG|EM|B|I|CODE|SPAN)$/;

  function droppableText(node) {
    const t = (node.nodeValue || "").trim();
    if (!t) return false;
    if (SR_LINE.test(t)) return true;
    if (!UI_LABEL.test(t)) return false;
    const p = node.parentElement;
    if (!p) return true;
    if (PROSE_PARENT.test(p.tagName)) return false;
    return (p.textContent || "").trim() === t; // alone in its box: a control
  }

  const isEl = (n) => n && n.nodeType === 1;
  const isText = (n) => n && n.nodeType === 3;

  function skippable(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.id === "chat-replay-root" || el.closest?.("#chat-replay-root")) return true;
    if (el.hasAttribute("hidden")) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    if (SKIP_CLASS.test(el.getAttribute("class") || "")) return true;
    if (el.getAttribute("role") === "button") return true;
    return false;
  }

  const HEADINGS = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

  function children(el, ctx) {
    let out = "";
    for (const n of el.childNodes) out += walk(n, ctx);
    return out;
  }

  // Pick a fence long enough that it can't be closed early by backticks
  // living inside the code sample itself.
  function fenceFor(code) {
    let longest = 2;
    for (const m of code.matchAll(/^\s*(`{3,})/gm)) longest = Math.max(longest, m[1].length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  function langOf(el) {
    const hunt = [el, el.querySelector?.("code"), el.parentElement].filter(Boolean);
    for (const h of hunt) {
      const m = /(?:language|lang)-([\w+#.-]+)/i.exec(h.getAttribute?.("class") || "");
      if (m) return m[1].toLowerCase();
    }
    return "";
  }

  function renderList(el, ctx, ordered) {
    const items = Array.from(el.children).filter((c) => c.tagName === "LI");
    if (!items.length) return children(el, ctx);
    const depth = ctx.listDepth || 0;
    const indent = "  ".repeat(depth);
    let i = Number(el.getAttribute("start") || 1);
    const lines = [];
    for (const li of items) {
      const marker = ordered ? `${i++}. ` : "- ";
      let body = children(li, { ...ctx, listDepth: depth + 1 }).trim();
      body = body.replace(/\n{3,}/g, "\n\n");
      // Collapse the blank line a nested <ul> would otherwise inject.
      body = body.replace(/\n{2,}(?=\s*(?:[-*]|\d+\.)\s)/g, "\n");
      const cont = " ".repeat(marker.length);
      body = body.split("\n")
        .map((l, idx) => (idx === 0 ? l : (l.trim() ? indent + cont + l.replace(/^\s+/, (s) => s) : "")))
        .join("\n");
      lines.push(indent + marker + body);
    }
    return "\n\n" + lines.join("\n") + "\n\n";
  }

  function renderTable(el, ctx) {
    const rows = Array.from(el.querySelectorAll("tr"));
    if (!rows.length) return "";
    const cellText = (c) => children(c, { ...ctx, inline: true }).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
    const grid = rows.map((r) => Array.from(r.querySelectorAll("th,td")).map(cellText));
    const width = Math.max(...grid.map((r) => r.length));
    if (!width) return "";
    const pad = (r) => { const c = r.slice(); while (c.length < width) c.push(""); return c; };
    const head = pad(grid[0]);
    const rest = grid.slice(1).map(pad);
    const out = [
      "| " + head.join(" | ") + " |",
      "| " + head.map(() => "---").join(" | ") + " |",
      ...rest.map((r) => "| " + r.join(" | ") + " |"),
    ];
    return "\n\n" + out.join("\n") + "\n\n";
  }

  function walk(node, ctx) {
    if (isText(node)) {
      const v = node.nodeValue || "";
      if (ctx.pre) return v;
      if (droppableText(node)) return "";
      return v.replace(/\s+/g, " ");
    }
    if (!isEl(node)) return "";
    const el = node;
    if (skippable(el)) return "";
    const tag = el.tagName;

    if (tag === "BR") return ctx.pre ? "\n" : "  \n";
    if (tag === "HR") return "\n\n---\n\n";

    if (tag === "PRE") {
      const codeEl = el.querySelector("code") || el;
      const raw = (codeEl.innerText || codeEl.textContent || "").replace(/\n+$/, "");
      if (!raw.trim()) return "";
      const f = fenceFor(raw);
      return `\n\n${f}${langOf(el)}\n${raw}\n${f}\n\n`;
    }

    if (tag === "CODE" && !ctx.pre) {
      const raw = (el.innerText || el.textContent || "").trim();
      if (!raw) return "";
      const tick = raw.includes("`") ? "``" : "`";
      const padc = raw.startsWith("`") || raw.endsWith("`") ? " " : "";
      return `${tick}${padc}${raw}${padc}${tick}`;
    }

    if (HEADINGS[tag]) {
      const lvl = Math.min(6, HEADINGS[tag] + (ctx.headingOffset || 0));
      const inner = children(el, { ...ctx, inline: true }).replace(/\s+/g, " ").trim();
      return inner ? `\n\n${"#".repeat(lvl)} ${inner}\n\n` : "";
    }

    if (tag === "STRONG" || tag === "B") {
      const inner = children(el, ctx).trim();
      return inner ? `**${inner}**` : "";
    }
    if (tag === "EM" || tag === "I") {
      const inner = children(el, ctx).trim();
      return inner ? `*${inner}*` : "";
    }
    if (tag === "DEL" || tag === "S" || tag === "STRIKE") {
      const inner = children(el, ctx).trim();
      return inner ? `~~${inner}~~` : "";
    }

    if (tag === "A") {
      const inner = children(el, ctx).trim();
      const href = el.getAttribute("href") || "";
      if (!inner) return "";
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return inner;
      return `[${inner}](${href})`;
    }

    if (tag === "IMG") {
      const alt = el.getAttribute("alt") || "image";
      const src = el.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return `![${alt}]()`;
      return `![${alt}](${src})`;
    }

    if (tag === "UL") return renderList(el, ctx, false);
    if (tag === "OL") return renderList(el, ctx, true);
    if (tag === "LI") return children(el, ctx); // stray LI outside a list

    if (tag === "BLOCKQUOTE") {
      const inner = children(el, ctx).trim();
      if (!inner) return "";
      return "\n\n" + inner.split("\n").map((l) => (l.trim() ? "> " + l : ">")).join("\n") + "\n\n";
    }

    if (tag === "TABLE") return renderTable(el, ctx);

    if (tag === "P" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" ||
        tag === "MAIN" || tag === "HEADER" || tag === "FOOTER" || tag === "FIGURE" ||
        tag === "FIGCAPTION" || tag === "DL" || tag === "DD" || tag === "DT") {
      const inner = children(el, ctx);
      if (!inner.trim()) return "";
      return "\n\n" + inner.trim() + "\n\n";
    }

    return children(el, ctx);
  }

  function tidy(md) {
    return md
      .replace(/\u00a0/g, " ")
      .split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* ---------- public: one element -> markdown ---------- */

  function htmlToMd(el, opts = {}) {
    if (!el) return "";
    const ctx = { headingOffset: opts.headingOffset ?? 2, listDepth: 0, pre: false, inline: false };
    return tidy(walk(el, ctx));
  }

  // innerText picks up every "Copy code", "Retry" and "You said:" the
  // site paints inside the turn, and those end up in the .txt export and
  // in the dedupe key. Walk the DOM with the same skip rules the
  // markdown converter uses, and only fall back to innerText if the walk
  // comes up empty (exotic markup, shadow content).
  const PLAIN_BLOCK = /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|LI|UL|OL|TABLE|TR|PRE|BLOCKQUOTE|HR|FIGURE|FIGCAPTION|DL|DT|DD|H[1-6])$/;

  function plainWalk(node, out) {
    if (isText(node)) {
      const v = node.nodeValue || "";
      if (!droppableText(node)) out.push(v.replace(/\s+/g, " "));
      return;
    }
    if (!isEl(node) || skippable(node)) return;
    const tag = node.tagName;
    if (tag === "BR") { out.push("\n"); return; }
    if (tag === "PRE") {
      out.push("\n" + (node.innerText || node.textContent || "").replace(/\n+$/, "") + "\n");
      return;
    }
    const block = PLAIN_BLOCK.test(tag);
    if (block) out.push("\n");
    for (const c of node.childNodes) plainWalk(c, out);
    if (block) out.push("\n");
  }

  function htmlToPlain(el) {
    if (!el) return "";
    const out = [];
    try { plainWalk(el, out); } catch { /* fall back below */ }
    const walked = out.join("")
      .split("\n").map((l) => l.trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
    if (walked) return walked;
    return (el.innerText || "")
      .split("\n").filter((l) => !SR_LINE.test(l.trim()) && !UI_LABEL.test(l.trim())).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- public: turns -> documents ---------- */

  const pad2 = (n) => String(n).padStart(2, "0");

  function slugify(s, max = 60) {
    return (s || "chat")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "").trim()
      .replace(/\s+/g, "-").toLowerCase().slice(0, max).replace(/-+$/, "") || "chat";
  }

  function stamp(d = new Date()) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  }

  // meta: { site, label, model, url, title, exportedAt }
  function buildMarkdown(turns, meta) {
    const who = meta.label || meta.site;
    const modelBit = meta.model ? ` · ${meta.model}` : "";
    const front = [
      "---",
      `source: ${meta.site}`,
      `assistant: ${who}`,
      meta.model ? `model: ${meta.model}` : null,
      `title: ${JSON.stringify(meta.title || "(untitled chat)")}`,
      `url: ${meta.url || ""}`,
      `exported: ${meta.exportedAt}`,
      `turns: ${turns.length}`,
      `exporter: Chat Replay ${meta.version || ""}`.trim(),
      "---",
    ].filter(Boolean).join("\n");

    const legend = [
      `# Conversation — ${who}${modelBit}`,
      "",
      "> **How to read this file.** It is a verbatim transcript of one chat.",
      "> Every turn starts with a level-2 heading and a machine-readable comment:",
      ">",
      "> - `## ▸ USER — turn N` … written by the human (the project author).",
      `> - \`## ▸ ASSISTANT — turn N\` … written by the AI (${who}${modelBit}).`,
      ">",
      "> Headings *inside* a message were demoted to level 3+ so that the only",
      "> `## ` lines in this file are turn boundaries. Treat USER turns as intent",
      "> and direction; treat ASSISTANT turns as proposals, not settled canon.",
    ].join("\n");

    const body = turns.map((t, i) => {
      const n = t.pair ?? Math.floor(i / 2) + 1;
      const isUser = t.role === "user";
      const head = isUser
        ? `## ▸ USER — turn ${n}`
        : `## ▸ ASSISTANT — turn ${n}`;
      const tag = isUser
        ? `<!-- role="user" turn="${n}" source="${meta.site}" -->`
        : `<!-- role="assistant" turn="${n}" source="${meta.site}" model="${meta.model || ""}" -->`;
      return `${head}\n${tag}\n\n${t.md || t.text || "*(empty)*"}`;
    }).join("\n\n---\n\n");

    return `${front}\n\n${legend}\n\n---\n\n${body}\n`;
  }

  function buildJson(turns, meta) {
    return JSON.stringify({
      meta,
      turns: turns.map((t, i) => ({
        index: i + 1,
        pair: t.pair ?? Math.floor(i / 2) + 1,
        role: t.role,
        speaker: t.role === "user" ? "human" : (meta.label || meta.site),
        content_markdown: t.md || t.text || "",
      })),
    }, null, 2);
  }

  function buildTxt(turns, meta) {
    const bar = "=".repeat(72);
    const head = `${bar}\nCONVERSATION EXPORT\nSource : ${meta.site}\nModel  : ${meta.model || "(unknown)"}\nTitle  : ${meta.title || ""}\nDate   : ${meta.exportedAt}\nTurns  : ${turns.length}\n${bar}\n`;
    const body = turns.map((t, i) => {
      const n = t.pair ?? Math.floor(i / 2) + 1;
      const who = t.role === "user" ? `USER (turn ${n})` : `ASSISTANT — ${meta.label || meta.site} (turn ${n})`;
      return `\n${bar}\n${who}\n${bar}\n${t.text || t.md || ""}`;
    }).join("\n");
    return head + body + "\n";
  }

  function filename(meta, ext) {
    const t = slugify(meta.title || meta.site, 48);
    return `${slugify(meta.label || meta.site, 16)}-${t}-${stamp(new Date(meta.exportedAt))}.${ext}`;
  }

  return { htmlToMd, htmlToPlain, buildMarkdown, buildJson, buildTxt, filename, slugify, stamp };
})();
