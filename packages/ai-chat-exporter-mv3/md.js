/* ============================================================
   Chat Replay — HTML→Markdown + export builders (v0.9)

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

   v0.9 — what the walker used to get wrong, by site:
   - Math. KaTeX (ChatGPT, Claude, DeepSeek, Kimi, Qwen, Grok, GLM)
     paints every formula twice: a MathML copy for screen readers and an
     aria-hidden HTML copy. The walker read the MathML text, so
     "x^2" exported as "x2x^2". The TeX source rides along in an
     <annotation>; Gemini puts it in data-math. Both now round-trip to
     $…$ / $$…$$.
   - Code. The language label lives OUTSIDE <code> on most sites
     (Gemini's header bar, DeepSeek's banner, ChatGPT's sticky header),
     highlighters render one <div> per line with no newline between
     them, and line-number gutters were exported as code.
   - Prompts. A multi-line prompt sits in a white-space:pre-wrap block;
     collapsing its whitespace turned a structured prompt into one line.
   - Tables. Nested tables leaked their rows into the outer table, and
     a <br> inside a cell broke the row.
   - Reasoning. Thinking/"Thought for 12s" panels are now a <details>
     foldout (or dropped / quoted — `thinking` option) instead of
     reading as part of the answer.
   - Browsers report lowercase tagName for SVG and MathML elements, so
     the old "SVG" skip never fired in Chrome; tags are normalised now.
   ============================================================ */

const ChatReplayMd = (() => {

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "BUTTON", "SVG", "PATH",
    "CANVAS", "AUDIO", "VIDEO", "SELECT", "OPTION", "TEXTAREA",
  ]);

  // Screen-reader-only text ("You said:", "Copy code", "1 / 2") and the
  // site's own affordances. These are visually invisible but innerText
  // and a naive walker both pick them up.
  const SKIP_CLASS = /\b(sr-only|visually-hidden|screen-?reader|a11y-hidden|cdk-visually-hidden)\b/i;

  // Two different things, and conflating them cost real content: the
  // first group is narration the site adds for screen readers and is
  // always safe to drop; the second is BUTTON LABELS, which are only
  // noise when they sit alone in their own box. A user whose entire
  // message is "Retry" deserves to keep it, so those are dropped only
  // outside prose containers.
  const SR_LINE = /^(you said|dijiste|dijo|tú dijiste|você disse|has dicho|chatgpt said|claude said|gemini said)\s*:?\s*$/i;
  const UI_LABEL = /^(copy code|copiar código|copy|copiar|copied!?|edit|editar|retry|reintentar|regenerate|regenerar|share|compartir|download|run|thumbs (up|down)|good response|bad response|show more|show less)\s*:?\s*$/i;
  const PROSE_PARENT = /^(P|LI|TD|TH|H[1-6]|BLOCKQUOTE|FIGCAPTION|DT|DD|A|STRONG|EM|B|I|CODE|SPAN)$/;

  const tagOf = (el) => String(el.tagName || "").toUpperCase();

  function droppableText(node) {
    const t = (node.nodeValue || "").trim();
    if (!t) return false;
    if (SR_LINE.test(t)) return true;
    if (!UI_LABEL.test(t)) return false;
    const p = node.parentElement;
    if (!p) return true;
    if (PROSE_PARENT.test(tagOf(p))) return false;
    return (p.textContent || "").trim() === t; // alone in its box: a control
  }

  const isEl = (n) => n && n.nodeType === 1;
  const isText = (n) => n && n.nodeType === 3;

  function skippable(el) {
    if (SKIP_TAGS.has(tagOf(el))) return true;
    if (el.id === "chat-replay-root" || el.closest?.("#chat-replay-root")) return true;
    if (el.hasAttribute("hidden")) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    if (SKIP_CLASS.test(el.getAttribute("class") || "")) return true;
    if (LINE_NO.test(el.getAttribute("class") || "")) return true;
    if (el.getAttribute("role") === "button") return true;
    if (/display\s*:\s*none/i.test(el.getAttribute("style") || "")) return true;
    return false;
  }

  const HEADINGS = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

  function children(el, ctx) {
    let out = "";
    for (const n of el.childNodes) {
      if (ctx.exclude && ctx.exclude.has(n)) continue;
      // Indentation between block tags is markup, not something typed.
      if (ctx.preWrap && isText(n) && /^\s*\n\s*$/.test(n.nodeValue || "") && (isEl(n.previousSibling) || isEl(n.nextSibling))) continue;
      out += walk(n, ctx);
    }
    return out;
  }

  /* ---------- math ---------- */

  const TEX_ANN = 'annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"],annotation[encoding="TeX"]';

  // null = not math. "inline" / "block" otherwise.
  function mathKind(el) {
    const tag = tagOf(el);
    const cls = " " + (el.getAttribute("class") || "") + " ";
    if (/\s(katex-display|math-display|math-block|katex-block)\s/.test(cls)) return "block";
    if (tag === "MJX-CONTAINER") return el.getAttribute("display") === "true" ? "block" : "inline";
    if (tag === "MATH") return el.getAttribute("display") === "block" ? "block" : "inline";
    if (/\s(katex|math-inline|katex-inline)\s/.test(cls)) return "inline";
    if (el.hasAttribute("data-math")) return tag === "DIV" ? "block" : "inline";
    return null;
  }

  function texOf(el) {
    for (const a of ["data-math", "data-tex", "data-latex"]) {
      const v = el.getAttribute(a);
      if (v && v.trim()) return v.trim();
    }
    const ann = el.querySelector?.(TEX_ANN);
    if (ann && ann.textContent.trim()) return ann.textContent.trim();
    const math = tagOf(el) === "MATH" ? el : el.querySelector?.("math");
    const alt = math?.getAttribute("alttext");
    if (alt && alt.trim()) return alt.trim();
    return null;
  }

  function renderMath(el, kind, ctx) {
    const tex = texOf(el);
    if (tex == null) {
      // No source to recover: keep what a reader would see, once.
      const seen = el.querySelector?.(".katex-html") || el;
      const t = (seen.textContent || "").replace(/\s+/g, " ").trim();
      return t;
    }
    if (kind === "block" && !ctx.inline) return `\n\n$$\n${tex}\n$$\n\n`;
    return `$${tex}$`;
  }

  /* ---------- code ---------- */

  // Pick a fence long enough that it can't be closed early by backticks
  // living inside the code sample itself (a reply that SHOWS a Markdown
  // file with its own ```python block is the common case).
  function fenceFor(code) {
    let longest = 2;
    for (const m of code.matchAll(/^ {0,3}(`{3,})/gm)) longest = Math.max(longest, m[1].length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  const LANG_TOKEN = /^[A-Za-z][A-Za-z0-9+#._-]{0,23}$/;
  const NOT_LANG = /^(code|copy|copied|edit|run|download|preview|wrap|expand|collapse|text|plaintext|plain)$/i;

  // Text of a header bar minus its buttons and screen-reader extras.
  function labelText(el) {
    let out = "";
    for (const n of el.childNodes) {
      if (isText(n)) out += " " + n.nodeValue + " ";
      else if (isEl(n) && !skippable(n) && !n.querySelector?.("pre,code")) out += labelText(n);
    }
    return out;
  }
  // A header bar names the language when, buttons aside, it says exactly
  // one language-shaped word. Prose elements never qualify: a "<p>Output</p>"
  // above a block is a sentence, not a label.
  function labelOf(node) {
    if (!isEl(node) || /^(P|LI|H[1-6]|BLOCKQUOTE|TABLE|UL|OL)$/.test(tagOf(node))) return "";
    const words = labelText(node).split(/\s+/).filter((w) => w && !UI_LABEL.test(w) && !NOT_LANG.test(w));
    return words.length === 1 && LANG_TOKEN.test(words[0]) ? words[0].toLowerCase() : "";
  }

  const CODE_LIKE = (el) => /(^|\s)(cm-content|view-lines)(\s|$)/.test(el.getAttribute("class") || "");

  // { lang, label } — label is the header node the language was read
  // from, if any; the walker leaves it out so "python" doesn't print as
  // a stray paragraph above the block.
  function headerLabel(pre, codeEl) {
    // A header inside the <pre> but outside <code> (ChatGPT): look at
    // what precedes <code> at each level between it and the <pre>.
    for (let n = codeEl; n && n !== pre; n = n.parentElement) {
      for (let k = n.previousElementSibling; k; k = k.previousElementSibling) {
        const t = labelOf(k);
        if (t) return { lang: t, label: k };
      }
    }
    // …or a banner just before the block in its wrapper (Gemini,
    // DeepSeek, Claude, Grok, Kimi, Qwen, GLM). Only climb while the
    // wrapper holds little besides this block.
    const codeLen = (pre.textContent || "").length;
    let node = pre;
    for (let depth = 0; depth < 4 && node.parentElement; depth++) {
      const parent = node.parentElement;
      if (parent.querySelectorAll("pre,.cm-content").length > 1) break;
      if ((parent.textContent || "").length - codeLen > 80) break;
      for (let k = node.previousElementSibling; k; k = k.previousElementSibling) {
        const t = labelOf(k);
        if (t) return { lang: t, label: k };
      }
      node = parent;
    }
    return { lang: "", label: null };
  }

  // { lang, label } — label is the header node naming the language, if
  // any; the walker leaves it out so "python" doesn't print as a stray
  // paragraph above the block. A class (language-x) beats a header, but
  // a header that agrees with the class is still the label to drop.
  function langInfo(pre) {
    const codeEl = tagOf(pre) === "PRE" ? pre.querySelector?.("code") : null;
    const head = headerLabel(pre, codeEl);
    for (const h of [codeEl, pre, pre.parentElement].filter(Boolean)) {
      const m = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/i.exec(h.getAttribute?.("class") || "");
      const d = (h.getAttribute?.("data-language") || h.getAttribute?.("data-lang") || "").trim();
      const lang = (m && !NOT_LANG.test(m[1]) ? m[1] : LANG_TOKEN.test(d) && !NOT_LANG.test(d) ? d : "").toLowerCase();
      if (lang) return { lang, label: head.lang === lang ? head.label : null };
    }
    return head;
  }

  const LINE_NO = /(^|\s)(line-?numbers?|linenumber|react-syntax-highlighter-line-number|hljs-ln-n|code-line-number|line-number-gutter|cm-gutters?|margin-view-overlays)(\s|$)/i;

  // Code text, verbatim: <br> is a newline, a highlighter's per-line
  // <div>s are newlines, gutters and toolbars are not code.
  function codeText(root) {
    const out = [];
    const ends = () => { const s = out.join(""); return !s || s.endsWith("\n"); };
    (function rec(el) {
      for (const n of el.childNodes) {
        if (isText(n)) { out.push(n.nodeValue); continue; }
        if (!isEl(n)) continue;
        const tag = tagOf(n);
        if (tag === "BR") { out.push("\n"); continue; }
        if (SKIP_TAGS.has(tag) || n.getAttribute("aria-hidden") === "true" || SKIP_CLASS.test(n.getAttribute("class") || "")) continue;
        if (LINE_NO.test(n.getAttribute("class") || "") || n.hasAttribute("data-line-number")) continue;
        const block = tag === "DIV" || tag === "P";
        if (block && !ends()) out.push("\n");
        rec(n);
        if (block && !ends()) out.push("\n");
      }
    })(root);
    return out.join("").replace(/ /g, " ").replace(/\n+$/, "");
  }

  function renderPre(el) {
    const codeEl = (tagOf(el) === "PRE" && el.querySelector("code")) || el;
    const raw = codeText(codeEl);
    if (!raw.trim()) return "";
    const f = fenceFor(raw);
    return `\n\n${f}${langInfo(el).lang}\n${raw}\n${f}\n\n`;
  }

  /* ---------- lists / tables ---------- */

  function renderList(el, ctx, ordered) {
    const items = Array.from(el.children).filter((c) => tagOf(c) === "LI");
    if (!items.length) return children(el, ctx);
    const depth = ctx.listDepth || 0;
    const indent = "  ".repeat(depth);
    let i = Number(el.getAttribute("start") || 1);
    const lines = [];
    for (const li of items) {
      const marker = ordered ? `${i++}. ` : "- ";
      let body = children(li, { ...ctx, listDepth: depth + 1 }).trim().replace(/^\[([ x])\] {2,}/, "[$1] ");
      body = body.replace(/\n{3,}/g, "\n\n");
      // Collapse the blank line a nested <ul> would otherwise inject.
      body = body.replace(/\n{2,}(?=\s*(?:[-*]|\d+\.)\s)/g, "\n");
      const cont = " ".repeat(marker.length);
      // Continuation lines (fenced code included) align under the item
      // text; blank lines stay empty.
      body = body.split("\n").map((l, idx) => (idx === 0 ? l : l.trim() ? indent + cont + l : "")).join("\n");
      lines.push(indent + marker + body);
    }
    return "\n\n" + lines.join("\n") + "\n\n";
  }

  // Rows of THIS table only — a table nested in a cell keeps its rows.
  function ownRows(table) {
    const rows = [];
    for (const c of table.children) {
      const t = tagOf(c);
      if (t === "TR") rows.push(c);
      else if (t === "THEAD" || t === "TBODY" || t === "TFOOT") for (const r of c.children) if (tagOf(r) === "TR") rows.push(r);
    }
    return rows;
  }

  function alignOf(cell) {
    const a = (cell.getAttribute("align") || (/text-align\s*:\s*(\w+)/i.exec(cell.getAttribute("style") || "") || [])[1] || "").toLowerCase();
    return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";
  }

  function renderTable(el, ctx) {
    const rows = ownRows(el);
    if (!rows.length) return "";
    const cellText = (c) => children(c, { ...ctx, inline: true, cell: true })
      .replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
    let heads = null;
    const grid = rows.map((r) => {
      const cells = Array.from(r.children).filter((c) => /^(TD|TH)$/.test(tagOf(c)));
      if (!heads) heads = cells;
      const out = [];
      for (const c of cells) {
        out.push(cellText(c));
        for (let k = 1; k < Math.min(20, Number(c.getAttribute("colspan")) || 1); k++) out.push("");
      }
      return out;
    });
    const width = Math.max(...grid.map((r) => r.length));
    if (!width) return "";
    const pad = (r) => { const c = r.slice(); while (c.length < width) c.push(""); return c; };
    const head = pad(grid[0]);
    const aligns = head.map((_, k) => (heads[k] ? alignOf(heads[k]) : "---"));
    const out = [
      "| " + head.join(" | ") + " |",
      "| " + aligns.join(" | ") + " |",
      ...grid.slice(1).map(pad).map((r) => "| " + r.join(" | ") + " |"),
    ];
    return "\n\n" + out.join("\n") + "\n\n";
  }

  /* ---------- reasoning / thinking ---------- */

  // Per class token. State flags that merely mention thoughts
  // ("has-thoughts" on Gemini's answer) are not the panel itself.
  const THINK_TOKEN = /(^|[_-])(thinking|thoughts?|reasoning)([_-]|$)|^(ds-think|think-(block|content|container|panel))/i;
  const THINK_FLAG = /^(has|with|no|is|show|hide|enable|disable|can)-/i;
  const thinkClass = (cls) => cls.split(/\s+/).some((t) => t && THINK_TOKEN.test(t) && !THINK_FLAG.test(t));
  const THINK_SUMMARY = /(thought|thinking|reason|思考|推理|pens(é|ando)|razonamiento)/i;

  function isThinking(el) {
    const tag = tagOf(el);
    if (tag === "MODEL-THOUGHTS") return true;
    if (tag === "DETAILS") {
      const s = Array.from(el.children).find((c) => tagOf(c) === "SUMMARY");
      return !!s && THINK_SUMMARY.test(s.textContent || "");
    }
    if (el.hasAttribute("data-thinking")) return true;
    if (/think|reasoning/i.test(el.getAttribute("data-testid") || "")) return true;
    return thinkClass(el.getAttribute("class") || "");
  }

  // The panel's own title — "Thought for 12 seconds", "Show thinking" —
  // is usually a button or a header row. Use it as the foldout summary
  // and keep it out of the body.
  function thinkingHeader(el) {
    const cands = [
      ...Array.from(el.children).filter((c) => tagOf(c) === "SUMMARY"),
      ...Array.from(el.querySelectorAll("[class*='header'],[class*='title'],[class*='summary'],[class*='label'],button,[role='button']")),
    ];
    const total = (el.textContent || "").trim().length;
    for (const c of cands) {
      const t = labelText(c).replace(/\s+/g, " ").trim();
      if (t && t.length <= 80 && t.length < total && !c.querySelector("p,pre,ul,ol")) return { node: c, text: t };
    }
    return { node: null, text: "" };
  }

  function renderThinking(el, ctx) {
    const mode = ctx.thinking || "fold";
    if (mode === "drop") return "";
    const { node, text } = thinkingHeader(el);
    const exclude = new Set(ctx.exclude || []);
    if (node) exclude.add(node);
    const body = tidy(children(el, { ...ctx, inThinking: true, exclude }));
    if (!body) return "";
    const label = (text && THINK_SUMMARY.test(text) ? text : "") || "Thinking";
    if (mode === "inline") {
      return "\n\n" + [`**${label}**`, "", ...body.split("\n")].map((l) => (l ? "> " + l : ">")).join("\n") + "\n\n";
    }
    return `\n\n<details>\n<summary>${label.replace(/</g, "&lt;")}</summary>\n\n${body}\n\n</details>\n\n`;
  }

  function renderDetails(el, ctx) {
    const sum = Array.from(el.children).find((c) => tagOf(c) === "SUMMARY");
    const label = sum ? children(sum, { ...ctx, inline: true }).replace(/\s+/g, " ").trim() : "Details";
    const exclude = new Set(ctx.exclude || []);
    if (sum) exclude.add(sum);
    const body = tidy(children(el, { ...ctx, exclude }));
    return `\n\n<details>\n<summary>${label}</summary>\n\n${body}\n\n</details>\n\n`;
  }

  /* ---------- the walk ---------- */

  const PRE_WRAP = /(^|\s)(whitespace-pre-wrap|whitespace-pre-line|whitespace-pre|pre-wrap|query-text)(\s|$)/;
  const preWrapOf = (el) => PRE_WRAP.test(el.getAttribute("class") || "") ||
    /white-space\s*:\s*pre/i.test(el.getAttribute("style") || "");

  // Pre-wrapped prompt text keeps its line breaks. A line that would
  // read as a heading is escaped, so the export's "## " turn markers
  // stay the only level-2 lines in the file.
  function preWrapText(v) {
    return v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ")
      .split("\n").map((l) => l.replace(/^(\s*)(#{1,6}\s)/, "$1\\$2")).join("\n");
  }

  function walk(node, ctx) {
    if (isText(node)) {
      const v = node.nodeValue || "";
      if (ctx.pre) return v;
      if (droppableText(node)) return "";
      if (ctx.preWrap && !ctx.inline) return preWrapText(v);
      return v.replace(/\s+/g, " ");
    }
    if (!isEl(node)) return "";
    const el = node;

    const mk = mathKind(el);
    if (mk) return renderMath(el, mk, ctx);
    if (skippable(el)) return "";
    const tag = tagOf(el);

    if (!ctx.inThinking && el !== ctx.root && isThinking(el) && (el.textContent || "").trim()) return renderThinking(el, ctx);
    if (!ctx.preWrap && preWrapOf(el)) ctx = { ...ctx, preWrap: true };

    if (tag === "BR") return ctx.cell ? "<br>" : ctx.pre ? "\n" : ctx.preWrap ? "\n" : "  \n";
    if (tag === "HR") return "\n\n---\n\n";
    if (tag === "PRE" || CODE_LIKE(el)) return renderPre(el);
    if (tag === "DETAILS") return renderDetails(el, ctx);

    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "checkbox") return el.checked || el.hasAttribute("checked") ? "[x] " : "[ ] ";
      return "";
    }

    if (tag === "CODE" && !ctx.pre) {
      const raw = (el.textContent || "").replace(/\s*\n\s*/g, " ").trim();
      if (!raw) return "";
      let longest = 0;
      for (const m of raw.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
      const tick = "`".repeat(longest + 1);
      const padc = raw.startsWith("`") || raw.endsWith("`") ? " " : "";
      return `${tick}${padc}${raw}${padc}${tick}`;
    }

    if (HEADINGS[tag]) {
      const lvl = Math.min(6, HEADINGS[tag] + (ctx.headingOffset || 0));
      const inner = children(el, { ...ctx, inline: true }).replace(/\s+/g, " ").trim();
      if (!inner) return "";
      return ctx.cell ? `**${inner}**` : `\n\n${"#".repeat(lvl)} ${inner}\n\n`;
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
    if (tag === "SUP" || tag === "SUB") {
      const inner = children(el, ctx).trim();
      return inner ? `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>` : "";
    }

    if (tag === "A") {
      const inner = children(el, ctx).trim();
      const href = el.getAttribute("href") || "";
      if (!inner) return "";
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return inner;
      return `[${inner}](${href.replace(/\s/g, "%20").replace(/\)/g, "%29")})`;
    }

    if (tag === "IMG") {
      const alt = el.getAttribute("alt") || "image";
      const src = el.getAttribute("src") || "";
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return `![${alt}]()`;
      return `![${alt}](${src})`;
    }

    if (tag === "UL") return ctx.cell ? children(el, ctx) : renderList(el, ctx, false);
    if (tag === "OL") return ctx.cell ? children(el, ctx) : renderList(el, ctx, true);
    if (tag === "LI") return ctx.cell ? children(el, ctx) + " " : children(el, ctx); // stray LI outside a list

    if (tag === "BLOCKQUOTE") {
      const inner = tidy(children(el, ctx));
      if (!inner) return "";
      return "\n\n" + inner.split("\n").map((l) => (l.trim() ? "> " + l : ">")).join("\n") + "\n\n";
    }

    if (tag === "TABLE") return ctx.cell ? children(el, ctx) : renderTable(el, ctx);

    if (/^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|FIGURE|FIGCAPTION|DL|DD|DT|ASIDE|NAV)$/.test(tag)) {
      const inner = children(el, ctx);
      if (!inner.trim()) return "";
      if (ctx.cell) return " " + inner.trim() + " ";
      // In a typed prompt each block is a line (Gemini renders one <p>
      // per line); blank lines the user typed survive as text newlines.
      if (ctx.preWrap === "user") return "\n" + inner.replace(/^ +| +$/g, "");
      return "\n\n" + inner.trim() + "\n\n";
    }

    return children(el, ctx);
  }

  function tidy(md) {
    // Fenced code is left byte-exact: trailing spaces and blank-line runs
    // inside a code sample are part of the sample.
    const lines = md.replace(/ /g, " ").split("\n");
    const out = [];
    let fence = null, blank = 0;
    for (const l of lines) {
      const m = /^\s*(`{3,})/.exec(l);
      if (fence) {
        out.push(l);
        if (m && m[1].length >= fence.length && !l.trim().slice(m[1].length)) fence = null;
        continue;
      }
      if (m) { fence = m[1]; blank = 0; out.push(l.replace(/[ \t]+$/, "")); continue; }
      const t = l.replace(/[ \t]+$/g, "");
      if (!t) { if (++blank > 1) continue; } else blank = 0;
      out.push(t);
    }
    return out.join("\n").trim();
  }

  /* ---------- public: one element -> markdown ---------- */

  function labelsToSkip(root) {
    const out = new Set();
    const blocks = [...(tagOf(root) === "PRE" || CODE_LIKE(root) ? [root] : []), ...root.querySelectorAll("pre,.cm-content,.view-lines")];
    for (const b of blocks) { const { label } = langInfo(b); if (label && !label.contains(b)) out.add(label); }
    return out;
  }

  // opts: headingOffset (default 2), thinking: "fold" | "drop" | "inline",
  //       preWrap: keep the element's line breaks (what the user typed)
  function htmlToMd(el, opts = {}) {
    if (!el) return "";
    const ctx = {
      headingOffset: opts.headingOffset ?? 2, listDepth: 0, pre: false, inline: false,
      thinking: opts.thinking || "fold", root: el, exclude: labelsToSkip(el),
      preWrap: opts.preWrap || preWrapOf(el),
    };
    return tidy(walk(el, ctx));
  }

  // One adapter turn -> markdown. Some sites render the reasoning panel
  // OUTSIDE the answer body (Gemini's <model-thoughts>, GLM, DeepSeek);
  // adapters hand that over as `think`, and it's folded in front here.
  // A user turn is always rendered as typed (white-space: pre-wrap on
  // every site, often via a hashed class we can't see), so its line
  // breaks are kept.
  function turnToMd(turn, opts = {}) {
    const body = turn.body || turn.el;
    let md = htmlToMd(body, { ...opts, preWrap: opts.preWrap ?? (turn.role === "user" ? "user" : false) });
    if (turn.think && !(body && body.contains(turn.think))) {
      const ctx = { headingOffset: opts.headingOffset ?? 2, listDepth: 0, thinking: opts.thinking || "fold", exclude: labelsToSkip(turn.think) };
      const fold = tidy(renderThinking(turn.think, ctx));
      if (fold) md = fold + "\n\n" + md;
    }
    return md;
  }

  // innerText picks up every "Copy code", "Retry" and "You said:" the
  // site paints inside the turn, and those end up in the .txt export and
  // in the dedupe key. Walk the DOM with the same skip rules the
  // markdown converter uses, and only fall back to innerText if the walk
  // comes up empty (exotic markup, shadow content).
  const PLAIN_BLOCK = /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|LI|UL|OL|TABLE|TR|PRE|BLOCKQUOTE|HR|FIGURE|FIGCAPTION|DL|DT|DD|H[1-6]|DETAILS|SUMMARY)$/;

  function plainWalk(node, out, preWrap) {
    if (isText(node)) {
      const v = node.nodeValue || "";
      if (!droppableText(node)) out.push(preWrap ? v.replace(/[ \t]+/g, " ") : v.replace(/\s+/g, " "));
      return;
    }
    if (!isEl(node)) return;
    const mk = mathKind(node);
    if (mk) { const tex = texOf(node); out.push(tex != null ? (mk === "block" ? `\n$$ ${tex} $$\n` : `$${tex}$`) : renderMath(node, mk, {})); return; }
    if (skippable(node)) return;
    const tag = tagOf(node);
    if (tag === "BR") { out.push("\n"); return; }
    if (tag === "PRE" || CODE_LIKE(node)) { out.push("\n" + codeText((tag === "PRE" && node.querySelector("code")) || node) + "\n"); return; }
    const pw = preWrap || preWrapOf(node);
    const block = PLAIN_BLOCK.test(tag);
    if (block) out.push("\n");
    for (const c of node.childNodes) plainWalk(c, out, pw);
    if (block) out.push("\n");
  }

  function htmlToPlain(el, opts = {}) {
    if (!el) return "";
    const out = [];
    try { plainWalk(el, out, !!opts.preWrap); } catch { /* fall back below */ }
    const walked = out.join("")
      .split("\n").map((l) => l.trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
    if (walked) return walked;
    return (el.innerText || "")
      .split("\n").filter((l) => !SR_LINE.test(l.trim()) && !UI_LABEL.test(l.trim())).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- public: dedupe + redaction (run before any builder) ---------- */

  const normKey = (t) => String((t && (t.text || t.md)) || "")
    .normalize("NFKC").replace(/[​-‍⁠﻿]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();

  // Deterministic: same input, same output, no clocks or randomness.
  // Three kinds of duplicate actually reach an export:
  //   repeat   the same turn read twice in a row (a re-mount mid-scan)
  //   partial  a streaming snapshot followed by the finished turn — one
  //            is a prefix of the other; the longer one is kept
  //   exchange a whole user→assistant pair identical to an earlier one
  //            (a virtualised list re-rendering an old window)
  // A prompt asked twice with DIFFERENT answers is not a duplicate.
  function dedupe(turns) {
    const removed = [];
    const pass1 = [];
    (turns || []).forEach((t, index) => {
      const k = normKey(t);
      if (!k) { removed.push({ index, role: t.role, reason: "empty" }); return; }
      const prev = pass1[pass1.length - 1];
      if (prev && prev.t.role === t.role) {
        if (prev.k === k) { removed.push({ index, role: t.role, reason: "repeat" }); return; }
        if (Math.min(prev.k.length, k.length) >= 16 && (k.startsWith(prev.k) || prev.k.startsWith(k))) {
          const keepNew = k.length > prev.k.length;
          removed.push({ index: keepNew ? prev.index : index, role: t.role, reason: "partial" });
          if (keepNew) pass1[pass1.length - 1] = { t, k, index };
          return;
        }
      }
      pass1.push({ t, k, index });
    });
    const seen = new Set();
    const out = [];
    for (let j = 0; j < pass1.length; j++) {
      const a = pass1[j], b = pass1[j + 1];
      if (a.t.role === "user" && b && b.t.role === "assistant") {
        const pk = a.k + "\u0000" + b.k;
        if (seen.has(pk)) {
          removed.push({ index: a.index, role: "user", reason: "exchange" }, { index: b.index, role: "assistant", reason: "exchange" });
        } else { seen.add(pk); out.push(a.t, b.t); }
        j++;
        continue;
      }
      out.push(a.t);
    }
    removed.sort((x, y) => x.index - y.index);
    return { turns: out, removed };
  }

  const luhn = (digits) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = digits.charCodeAt(digits.length - 1 - i) - 48;
      if (i % 2) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return sum % 10 === 0;
  };
  const ibanOk = (s) => {
    const v = s.replace(/\s/g, "");
    const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let m = 0;
    for (const ch of r) m = (m * 10 + (ch.charCodeAt(0) - 48)) % 97;
    return m === 1;
  };

  // [kind, regex, opts]. `keep` = capture group to leave untouched in
  // front of the secret; `valid` = extra check on the matched secret.
  // Order matters: specific key formats before the generic key=value.
  const REDACT_RULES = [
    ["PRIVATE_KEY", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g],
    ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
    ["API_KEY", /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
    ["API_KEY", /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g],
    ["API_KEY", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
    ["API_KEY", /\bAIza[0-9A-Za-z_-]{35}/g],
    ["API_KEY", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ["TOKEN", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g],
    ["TOKEN", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
    ["TOKEN", /(\bBearer\s+)((?!\[)[A-Za-z0-9._~+/-]{16,}=*)/g, { keep: 1 }],
    ["SECRET", /(\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|password|passwd|pwd)\b["']?\s*[:=]\s*["']?)((?!\[)[^\s"'`,;]{6,})/gi, { keep: 1 }],
    ["EMAIL", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g],
    ["CARD", /\b(?:\d[ -]?){12,18}\d\b/g, { valid: (s) => { const d = s.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && /^(4|5[1-5]|2[2-7]|3[47]|6(011|5))/.test(d) && luhn(d); } }],
    ["IBAN", /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, { valid: ibanOk }],
    ["SSN", /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g],
    ["PHONE", /(?<![\w+])\+\d{1,3}[ .-]?(?:\(\d{1,4}\)[ .-]?)?\d{1,4}(?:[ .-]?\d{2,4}){1,4}(?![\w])/g, { valid: (s) => { const n = s.replace(/\D/g, "").length; return n >= 8 && n <= 15; } }],
    ["PHONE", /(?<!\w)\(\d{3}\)\s?\d{3}[ .-]\d{4}(?!\w)/g],
  ];

  // One redactor per export, so the same address becomes the same
  // placeholder in every turn: "[EMAIL_1] asked [EMAIL_2]" still reads.
  function createRedactor() {
    const ids = new Map();      // value -> placeholder
    const counts = {};          // kind -> distinct values
    const label = (kind, value) => {
      const key = kind + "\u0000" + value;
      if (!ids.has(key)) {
        counts[kind] = (counts[kind] || 0) + 1;
        ids.set(key, `[${kind}_${counts[kind]}]`);
      }
      return ids.get(key);
    };
    function redact(text) {
      let s = String(text == null ? "" : text);
      for (const [kind, re, o = {}] of REDACT_RULES) {
        s = s.replace(re, (...m) => {
          const whole = m[0];
          const secret = o.keep ? m[o.keep + 1] : whole;
          if (o.valid && !o.valid(secret)) return whole;
          return (o.keep ? m[o.keep] : "") + label(kind, secret);
        });
      }
      return s;
    }
    // Distinct values per kind — "3 secrets redacted" means three secrets.
    redact.report = () => ({ ...counts });
    return redact;
  }

  // The one call the export path makes. opts: { dedupe = true, redact = false }
  function prepare(turns, opts = {}) {
    let list = (turns || []).slice();
    let removed = [];
    if (opts.dedupe !== false) ({ turns: list, removed } = dedupe(list));
    let redacted = {};
    if (opts.redact) {
      const r = createRedactor();
      list = list.map((t) => ({ ...t, text: r(t.text), md: r(t.md) }));
      redacted = r.report();
    }
    const redactedTotal = Object.values(redacted).reduce((a, b) => a + b, 0);
    return { turns: list, report: { removed, deduped: removed.length, redacted, redactedTotal } };
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
      meta.prep && meta.prep.deduped ? `deduplicated: ${meta.prep.deduped}` : null,
      meta.prep && meta.prep.redactedTotal ? `redacted: ${meta.prep.redactedTotal}` : null,
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

  return {
    htmlToMd, htmlToPlain, turnToMd, buildMarkdown, buildJson, buildTxt, filename, slugify, stamp,
    dedupe, createRedactor, prepare, isThinking,
  };
})();
