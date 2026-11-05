/* ============================================================
   Chat Replay — site adapters

   v0.4.2 — the Outlier "everything is the assistant" bug:
   heuristicTurns() has a bail-out for the case where the rendered
   markdown blocks don't all share one parent, and that bail-out
   labelled every block "assistant". On Outlier Playground that fired
   for the whole conversation: 13 turns, 13 assistants, zero prompts
   captured, and an export in which the human never speaks.
   Three changes:
     1. A real Outlier adapter. The app DOES tag the human's turns
        (data-testid="prompt-message"); the model's turns are then just
        the other message blocks in the same list, so we anchor on the
        tag we know and derive the rest instead of guessing a testid
        that changes every release.
     2. A generic data-testid strategy, since "prompt-message" /
        "response-message" style hooks are common across React apps.
     3. Roles are inferred from LAYOUT when markup gives no signal —
        chat UIs right-align the human and full-width the model, and
        Tailwind can hide the semantics but not the geometry. Nothing
        is blanket-labelled "assistant" any more.

   Contract per adapter:
     options             what's configurable (model / effort / thinking…)
     applyConfig()       clicks the site's own pickers to set them
     currentModel()      best-effort label of the model in use (for export)
     turns()             [{ role, el, body }] in document order
                           el   = the whole turn block
                           body = the element holding the actual content
     userMessages()      user turn text only (drives Replay)
     getTranscriptRoot() container that holds the conversation
     getScrollRoot()     the element that scrolls the conversation
     getInput/getSendButton/getStopButton/isBusy

   v0.4.0 — the visibility fix that unblocked ChatGPT:
   `visible()` used bare el.checkVisibility(), which reports TRUE for
   anything hidden with visibility:hidden or opacity:0. Every site keeps
   a stop/abort button mounted-but-hidden next to the composer, so the
   fuzzy "find a button whose label says stop" search found one at idle
   and isBusy() answered true forever. That's why ChatGPT, GLM and Kimi
   all reported busyNow:true on quiet pages while Gemini (whose stop
   button is genuinely unmounted) reported false. Downstream, a
   permanently-busy site makes every prompt wait out the 120s
   stuck-busy timer, which reads as "the extension is broken".
   Two changes: visible() now checks opacity + CSS visibility + a real
   box, and stop-button hunting is scoped to the composer instead of
   the whole document.
   ============================================================ */

const ChatReplayAdapters = (() => {

  const $ = (sel, root = document) => { try { return root.querySelector(sel); } catch { return null; } };
  const $$ = (sel, root = document) => { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // STRICT. See the v0.4.0 note above — the loose version was the bug.
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const SR_LABELS = /^(you said|dijiste|dijo|tu dijiste|você disse|has dicho|chatgpt said|claude said)\s*:?\s*$/i;
  const stripSrLabels = (t) =>
    (t || "").split("\n").filter((l) => !SR_LABELS.test(l.trim())).join("\n").trim();

  const ours = (el) => !!(el && el.closest && el.closest("#chat-replay-root"));

  function findButtonByHint(hints, root = document) {
    const lc = (s) => (s || "").toLowerCase();
    return $$("button, [role='button']", root).filter(visible).filter((b) => !ours(b)).find((b) => {
      const hay = lc(b.getAttribute("aria-label")) + " " + lc(b.getAttribute("title")) + " " + lc(b.textContent);
      return hints.some((h) => hay.includes(h));
    }) || null;
  }

  const NOT_SEND = /(mic|micro|voice|voz|audio|dictat|attach|adjuntar|upload|archivo|file|emoji|camera|cámara|image|imagen|photo|foto|settings|ajustes|stop|parar|detener|cancel|语音|附件|上传|设置|图片|停止|取消)/i;

  function nearestButtonToInput(input) {
    if (!input) return null;
    const r = input.getBoundingClientRect();
    const cx = r.right, cy = r.top + r.height / 2;
    let best = null, bestD = Infinity;
    for (const b of $$("button, [role='button']").filter(visible)) {
      if (b.disabled || b.getAttribute("aria-disabled") === "true") continue;
      if (ours(b)) continue;
      const label = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "");
      if (NOT_SEND.test(label)) continue;
      const br = b.getBoundingClientRect();
      const d = Math.hypot(br.left + br.width / 2 - cx, br.top + br.height / 2 - cy);
      if (d < bestD && d < 300) { bestD = d; best = b; }
    }
    return best;
  }

  // The composer neighbourhood: where a REAL stop button lives while a
  // reply streams. Searching document-wide instead is what produced the
  // permanent-busy false positives.
  function composerScope(input) {
    if (!input) return null;
    return input.closest("form") ||
           input.closest("[class*='composer'],[class*='input-area'],[class*='chat-input'],footer") ||
           input.parentElement?.parentElement?.parentElement ||
           null;
  }

  const STOP_RE = /\b(stop|abort|halt|parar|detener|cancel(ar)? generat|停止|取消|중지)\b/i;

  function scopedStopButton(input) {
    const scope = composerScope(input);
    if (!scope) return null;
    return $$("button,[role='button']", scope).filter(visible).filter((b) => !ours(b)).find((b) => {
      const hay = [b.id, b.getAttribute("aria-label"), b.getAttribute("title"),
                   b.getAttribute("data-testid"), (b.textContent || "").slice(0, 24)].join(" ");
      return STOP_RE.test(hay);
    }) || null;
  }

  function containerOf(selector) {
    const nodes = $$(selector).filter(visible);
    if (!nodes.length) return null;
    let anc = nodes[0].parentElement;
    while (anc && anc !== document.body && !nodes.every((n) => anc.contains(n))) {
      anc = anc.parentElement;
    }
    return anc && anc !== document.body ? anc : null;
  }

  const CLICKABLES =
    "[role='menuitem'],[role='menuitemradio'],[role='menuitemcheckbox'],[role='option'],[role='tab'],button,[role='button'],li,a,[data-radix-collection-item]";

  // Radix UI (@radix-ui/react-dropdown-menu, used by ChatGPT and Claude) opens
  // triggers on `pointerdown` (button===0, ctrlKey===false) and selects items on
  // `pointerup`/`click`. A bare `el.click()` skips pointer events, so menus often
  // refuse to open or close. `humanClick` dispatches the full pointer + mouse chain.
  function humanClick(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch { /* ignore */ }
    const r = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 10, height: 10 };
    const cx = Math.round(r.left + Math.max(2, r.width / 2));
    const cy = Math.round(r.top + Math.max(2, r.height / 2));
    const baseOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: typeof window !== "undefined" ? window : null,
      clientX: cx,
      clientY: cy,
      button: 0,
      buttons: 1,
    };
    try {
      if (typeof PointerEvent === "function") {
        const pOpts = { ...baseOpts, pointerId: 1, pointerType: "mouse", isPrimary: true };
        el.dispatchEvent(new PointerEvent("pointerover", pOpts));
        el.dispatchEvent(new PointerEvent("pointerenter", { ...pOpts, bubbles: false }));
        el.dispatchEvent(new PointerEvent("pointermove", pOpts));
        el.dispatchEvent(new PointerEvent("pointerdown", pOpts));
      }
      el.dispatchEvent(new MouseEvent("mouseover", baseOpts));
      el.dispatchEvent(new MouseEvent("mousedown", baseOpts));
      try { el.focus?.({ preventScroll: true }); } catch { /* ignore */ }
      if (typeof PointerEvent === "function") {
        const pUp = { ...baseOpts, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
        el.dispatchEvent(new PointerEvent("pointerup", pUp));
      }
      el.dispatchEvent(new MouseEvent("mouseup", { ...baseOpts, buttons: 0 }));
    } catch { /* fallback to .click() below */ }
    try { el.click(); } catch { /* ignore */ }
    return true;
  }

  function clickByText(texts, root = document) {
    const lc = (s) => (s || "").trim().toLowerCase();
    const wanted = texts.map(lc).filter(Boolean);
    if (!wanted.length) return null;
    for (const el of $$(CLICKABLES, root).filter(visible)) {
      if (ours(el)) continue;
      const first = lc((el.innerText || "").split("\n")[0]);
      if (!first) continue;
      if (wanted.some((w) => first === w || first.startsWith(w))) { humanClick(el); return el; }
    }
    // Second pass: match anywhere in the label, not just the first line.
    for (const el of $$(CLICKABLES, root).filter(visible)) {
      if (ours(el)) continue;
      const hay = lc(el.innerText) + " " + lc(el.getAttribute("aria-label"));
      if (wanted.some((w) => hay.includes(w))) { humanClick(el); return el; }
    }
    return null;
  }

  function byDocOrder(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  function pickBody(turn, sels) {
    for (const s of sels) { const e = $(s, turn); if (e && (e.innerText || "").trim()) return e; }
    return turn;
  }

  // Drop turns nested inside other turns (sites love wrapping).
  function outermost(nodes) {
    return nodes.filter((n) => !nodes.some((m) => m !== n && m.contains(n)));
  }

  // Lowest common ancestor of a set of nodes. Unlike containerOf() this
  // takes the nodes directly, so it works after we've already found the
  // turns by some other means.
  function containerOfNodes(nodes) {
    const ns = (nodes || []).filter(Boolean);
    if (!ns.length) return null;
    if (ns.length === 1) return ns[0].parentElement || null;
    let anc = ns[0].parentElement;
    while (anc && anc !== document.documentElement && !ns.every((n) => anc.contains(n))) {
      anc = anc.parentElement;
    }
    return anc || null;
  }

  // Walk up from n until we're a direct child of root. Used to raise a
  // prose block to the level the site renders one-per-turn.
  function childOf(root, n) {
    if (!root || !n || root === n || !root.contains(n)) return null;
    let a = n;
    while (a.parentElement && a.parentElement !== root) a = a.parentElement;
    return a.parentElement === root ? a : null;
  }

  /* ------- layout-based role inference -------
     Tailwind-styled apps have no class="user-message" to read, but they
     can't hide where the text is painted: the human's turn is a narrow
     bubble pushed to the right, the model's runs the full width. Two
     signals, cheap and independent of any site's naming. */

  const ALIGN_USER_CLS = /(^|[\s:])(ml-auto|justify-end|items-end|self-end|text-right|justify-self-end)(\s|$)/;

  // The wrappers that actually hold this turn's text — el plus any
  // descendant carrying most of it. Stops an "ml-auto" on some tiny
  // action-button row from being read as an alignment signal.
  function nearTextWrappers(el, depth = 3) {
    const total = (el.innerText || "").trim().length;
    if (!total) return [el];
    const out = [el];
    let level = [el];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const n of level) {
        for (const c of Array.from(n.children || [])) {
          if ((c.innerText || "").trim().length >= total * 0.6) { out.push(c); next.push(c); }
        }
      }
      level = next;
      if (!next.length) break;
    }
    return out;
  }

  function classAlignRole(el) {
    for (const n of nearTextWrappers(el)) {
      if (ALIGN_USER_CLS.test(" " + (n.getAttribute("class") || "") + " ")) return "user";
    }
    return null;
  }

  // A Range over the contents reports the union of the painted text
  // runs, so a full-width wrapper around a right-aligned bubble still
  // measures as the bubble. That's the whole trick.
  function textBox(el) {
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      if (b.width > 1 && b.height > 1) return b;
    } catch { /* detached or exotic node */ }
    return el.getBoundingClientRect();
  }

  function alignRole(el, container) {
    const ref = (container && container.getBoundingClientRect)
      ? container.getBoundingClientRect()
      : (el.parentElement || document.body).getBoundingClientRect();
    const box = textBox(el);
    if (!box.width || !ref.width) return null;
    if (box.width > ref.width * 0.94) return null; // full width: no signal
    const left = box.left - ref.left;
    const right = ref.right - box.right;
    if (left > right * 2 + 16) return "user";
    if (right > left * 2 + 16) return "assistant";
    return null;
  }

  // Roles for a list of turn elements, in document order. Markup first
  // (caller supplies it), then alignment, then — only if the page gave
  // us nothing at all — strict alternation starting with the human.
  function assignRoles(nodes, container) {
    const guesses = nodes.map((n) => classAlignRole(n) || alignRole(n, container));
    if (!guesses.some(Boolean)) return nodes.map((_, i) => (i % 2 === 0 ? "user" : "assistant"));
    // Unsignalled turns are the model's: it's the side that goes full width.
    return guesses.map((g) => g || "assistant");
  }

  // Safety net for every generic strategy: a conversation in which one
  // side never speaks is almost always a detection failure, not a real
  // transcript. If the layout disagrees with a single-role result, trust
  // the layout. If the layout has nothing to say, leave the result alone
  // rather than inventing an alternation.
  function diversify(turns) {
    if (!turns || turns.length < 2) return turns;
    if (new Set(turns.map((t) => t.role)).size > 1) return turns;
    const container = containerOfNodes(turns.map((t) => t.el));
    const guesses = turns.map((t) => classAlignRole(t.el) || alignRole(t.el, container));
    if (!guesses.some(Boolean)) return turns;
    const filled = guesses.map((g) => g || "assistant");
    if (new Set(filled).size < 2) return turns;
    return turns.map((t, i) => ({ ...t, role: filled[i] }));
  }

  function scrollRootFrom(el) {
    let a = el;
    while (a && a !== document.body && a !== document.documentElement) {
      const st = getComputedStyle(a);
      if (/(auto|scroll|overlay)/.test(st.overflowY) && a.scrollHeight > a.clientHeight + 40) return a;
      a = a.parentElement;
    }
    return null; // caller falls back to window
  }

  /* ---------------- generic strategies ---------------- */

  const ROLE_ATTR_SEL = "[data-message-author-role],[data-role='user'],[data-role='assistant'],[data-turn]";

  function attrTurns() {
    const nodes = outermost($$(ROLE_ATTR_SEL).filter(visible));
    return nodes.sort(byDocOrder).map((n) => {
      const raw = n.getAttribute("data-message-author-role") || n.getAttribute("data-role") || n.getAttribute("data-turn") || "";
      return { role: /user|human/i.test(raw) ? "user" : "assistant", el: n, body: n };
    });
  }

  /* ---- data-testid strategy ----
     React apps that ship no semantic classes still ship test hooks, and
     they're usually honest about who's speaking: "prompt-message",
     "response-message", "assistant-turn". Outlier Playground is exactly
     this case. Cheap to check, and it runs before the class and
     heuristic passes because it's far more reliable than either. */

  const TID_MSG   = /(message|turn|bubble|chat[-_]?item|conversation[-_]?item)/i;
  const TID_NOISE = /(markdown|input|textarea|composer|editor|toolbar|action|button|attachment|avatar|copy|feedback|regenerate|placeholder|skeleton|loading|empty|scroll|list$|container$)/i;
  const TID_USER  = /(^|[-_.])(prompt|user|human|request|question|query)([-_.]|$)/i;
  const TID_ASST  = /(^|[-_.])(response|assistant|completion|model|answer|reply|bot|ai|output)([-_.]|$)/i;

  const MSG_BODY_SELS = [
    "[data-testid$='markdown']", "[class*='markdown']", "[class*='prose']",
    "[class*='message-content']", "[class*='response-content']",
  ];

  function testidTurns() {
    const nodes = outermost($$("[data-testid]").filter(visible).filter((n) => {
      if (ours(n)) return false;
      const tid = n.getAttribute("data-testid") || "";
      if (!TID_MSG.test(tid) || TID_NOISE.test(tid)) return false;
      return !!(n.innerText || "").trim();
    }));
    if (nodes.length < 2) return [];
    const sorted = nodes.sort(byDocOrder);
    const container = containerOfNodes(sorted);
    const explicit = sorted.map((n) => {
      const tid = n.getAttribute("data-testid") || "";
      if (TID_USER.test(tid)) return "user";
      if (TID_ASST.test(tid)) return "assistant";
      return null;
    });
    // If the testids name only ONE side (Outlier tags the human and
    // nothing else), the unnamed blocks are the other side by
    // elimination — don't fall back to alternation and re-introduce the
    // bug we're fixing.
    const named = new Set(explicit.filter(Boolean));
    const fallback = named.size === 1
      ? sorted.map(() => (named.has("user") ? "assistant" : "user"))
      : assignRoles(sorted, container);
    return sorted.map((n, i) => ({
      role: explicit[i] || fallback[i],
      el: n,
      body: pickBody(n, MSG_BODY_SELS),
    }));
  }

  const USER_CLASS_RE = /(^|[-_ ])(user|human|question|query|prompt)([-_ ]|$)/i;
  const ASST_CLASS_RE = /(^|[-_ ])(assistant|answer|model|bot|response|reply|ai)([-_ ]|$)/i;

  function classTurns() {
    const cands = $$("[class]").filter(visible).filter((el) => {
      if (ours(el)) return false;
      const c = el.getAttribute("class") || "";
      if (!(USER_CLASS_RE.test(c) || ASST_CLASS_RE.test(c))) return false;
      const txt = (el.innerText || "").trim();
      return txt.length > 1;
    });
    const nodes = outermost(cands);
    if (nodes.length < 2) return [];
    return nodes.sort(byDocOrder).map((n) => {
      const c = n.getAttribute("class") || "";
      return { role: USER_CLASS_RE.test(c) && !ASST_CLASS_RE.test(c) ? "user" : "assistant", el: n, body: n };
    });
  }

  // Last resort, and surprisingly durable: nearly every chat UI renders
  // the model's reply inside a container classed markdown/prose, while
  // the human's message is a plain sibling block. Find the rendered
  // markdown, walk up to the turn wrapper, and read the siblings.
  function heuristicTurns() {
    const marks = outermost($$("[class*='markdown'],[class*='prose'],[class*='message-content'],[class*='response-content']")
      .filter(visible).filter((el) => !ours(el) && (el.innerText || "").trim()));
    if (!marks.length) return [];
    // Walk up from the rendered markdown to the element that represents
    // the whole turn — but STOP as soon as the next parent up would also
    // swallow a sibling that has text of its own. Without that guard the
    // walk climbs all the way to the scroll container, and the entire
    // conversation collapses into a single "assistant" turn.
    const hasText = (el) => ((el.innerText || el.textContent || "").trim().length > 0);
    const blocks = marks.map((m) => {
      let a = m;
      while (a.parentElement && a.parentElement !== document.body) {
        const p = a.parentElement;
        if (marks.filter((x) => p.contains(x)).length !== 1) break;
        const cur = a;
        if (Array.from(p.children).some((c) => c !== cur && hasText(c))) break;
        a = p;
      }
      return a;
    });
    const parent = blocks[0].parentElement;
    if (!parent || !blocks.every((b) => b.parentElement === parent)) {
      // v0.4.2: this used to label EVERY block "assistant", which is how
      // a 13-turn Outlier chat exported with no human in it. The blocks
      // are real turns; only the role is unknown — so infer it from
      // layout (and, failing that, alternate) instead of guessing one
      // side for all of them.
      const sorted = blocks.slice().sort(byDocOrder);
      const container = containerOfNodes(sorted);
      const roles = assignRoles(sorted, container);
      return sorted.map((b, i) => ({
        role: roles[i],
        el: b,
        body: marks[blocks.indexOf(b)] || b,
      }));
    }
    const out = [];
    for (const child of Array.from(parent.children)) {
      if (ours(child) || !visible(child)) continue;
      const txt = (child.innerText || "").trim();
      if (!txt) continue;
      const idx = blocks.indexOf(child);
      if (idx >= 0) out.push({ role: "assistant", el: child, body: marks[idx] });
      else out.push({ role: "user", el: child, body: child });
    }
    return out;
  }

  function genericTurns() {
    // attrTurns reads an explicit role attribute, so it's taken at its
    // word. The other three INFER the split, and a single-role answer
    // from any of them gets sanity-checked against the layout.
    const t0 = attrTurns();
    if (t0.length) return t0;
    for (const fn of [testidTurns, classTurns, heuristicTurns]) {
      const t = fn();
      if (t.length) return diversify(t);
    }
    return [];
  }

  const generic = {
    getInput() {
      const ok = (el) => !ours(el);
      const ce = $$("[contenteditable='true']").filter(visible).filter(ok);
      if (ce.length) return ce[ce.length - 1];
      const tas = $$("textarea").filter(visible).filter(ok);
      tas.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
      return tas[0] || null;
    },
    getSendButton(input) {
      return findButtonByHint(["send", "enviar", "发送", "submit"]) ||
             nearestButtonToInput(input || generic.getInput());
    },
    getStopButton() { return scopedStopButton(generic.getInput()); },
    isBusy() { return visible(scopedStopButton(generic.getInput())); },
    turns: genericTurns,
    transcript() {
      return genericTurns().map((t) => ({ role: t.role, text: stripSrLabels(t.body.innerText) }))
        .filter((t) => t.text);
    },
    getTranscriptRoot() {
      return containerOf(ROLE_ATTR_SEL) ||
             containerOf("[class*='message'],[class*='chat-item'],[class*='bubble']");
    },
    getScrollRoot() {
      const root = generic.getTranscriptRoot();
      return root ? scrollRootFrom(root) : null;
    },
    currentModel: () => "",
  };

  // Fill in the derived members every adapter shares.
  function derive(adp) {
    if (!adp.transcript) {
      adp.transcript = () => (adp.turns() || [])
        .map((t) => ({ role: t.role, text: stripSrLabels((t.body || t.el).innerText) }))
        .filter((t) => t.text);
    }
    if (!adp.userMessages) {
      adp.userMessages = () => (adp.transcript() || [])
        .filter((t) => t.role === "user").map((t) => t.text).filter(Boolean);
    }
    if (!adp.getScrollRoot) {
      adp.getScrollRoot = () => {
        const r = adp.getTranscriptRoot?.();
        return r ? scrollRootFrom(r) : null;
      };
    }
    if (!adp.currentModel) adp.currentModel = () => "";
    if (!adp.getSendButton) adp.getSendButton = () => generic.getSendButton(adp.getInput());
    if (!adp.getStopButton) adp.getStopButton = () => scopedStopButton(adp.getInput());
    if (!adp.isBusy) adp.isBusy = () => visible(adp.getStopButton());
    return adp;
  }

  /* ================= Gemini ================= */

  const gemini = derive({
    id: "gemini",
    label: "Gemini",
    hostMatch: /(^|\.)gemini\.google\.com$/,
    newChatUrl: "https://gemini.google.com/app",

    options: {
      model: ["(leave as is)", "3.1 Flash-Lite", "3.5 Flash", "3.1 Pro"],
      thinking: ["(leave as is)", "Standard", "Extended"],
    },

    modeTrigger() {
      return $("button[data-test-id='bard-mode-menu-button']") || $("bard-mode-switcher button") || null;
    },

    currentModel() {
      const t = gemini.modeTrigger();
      return t ? (t.innerText || "").trim().split("\n")[0] : "";
    },

    async applyConfig(cfg) {
      const notes = [];
      const overlayRoot = () => $(".cdk-overlay-container") || document;
      const trigger = gemini.modeTrigger();
      if (!trigger) return { ok: false, note: "model picker button not found" };

      if (cfg.model && !/leave/i.test(cfg.model)) {
        trigger.click();
        await sleep(900);
        const hit = clickByText([cfg.model], overlayRoot());
        await sleep(900);
        if (!hit) notes.push(`couldn't find "${cfg.model}" in menu`);
      }
      if (cfg.thinking && !/leave/i.test(cfg.thinking)) {
        gemini.modeTrigger()?.click();
        await sleep(900);
        const sub = clickByText(["thinking level"], overlayRoot());
        await sleep(700);
        const hit = sub ? clickByText([cfg.thinking], overlayRoot()) : null;
        await sleep(600);
        if (!hit) notes.push(`couldn't set thinking "${cfg.thinking}" (Pro only)`);
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      return { ok: notes.length === 0, note: notes.join("; ") };
    },

    turns() {
      const nodes = $$("user-query, model-response").filter(visible);
      if (!nodes.length) return genericTurns();
      return nodes.sort(byDocOrder).map((n) => {
        const isUser = n.tagName.toLowerCase() === "user-query";
        const body = isUser
          ? pickBody(n, [".query-text", "[class*='query-text']"])
          : pickBody(n, ["message-content .markdown", "message-content", "[class*='response-text']"]);
        return { role: isUser ? "user" : "assistant", el: n, body };
      });
    },

    getTranscriptRoot() {
      return $("#chat-history") || containerOf("user-query, model-response") || generic.getTranscriptRoot();
    },

    inputArea() {
      const input = gemini.getInput();
      return input?.closest("input-container, .input-area, form, footer") ||
             input?.parentElement?.parentElement || document;
    },
    getInput() {
      return $("rich-textarea .ql-editor") || $("rich-textarea [contenteditable='true']") || generic.getInput();
    },
    getSendButton() {
      const area = gemini.inputArea();
      return $("button.send-button", area === document ? document : area) ||
             findButtonByHint(["send", "enviar"], area) ||
             generic.getSendButton(gemini.getInput());
    },
    isBusy() {
      const area = gemini.inputArea();
      const stop = $("button.send-button.stop", area === document ? document : area) ||
                   findButtonByHint(["stop", "parar", "detener"], area);
      return visible(stop);
    },
  });

  /* ================= GLM / Open WebUI ================= */

  const glm = derive({
    id: "glm",
    label: "GLM",
    hostMatch: /(^|\.)(chat\.z\.ai|chatglm\.cn)$/,
    newChatUrl: "https://chat.z.ai/",

    options: {
      model: ["(leave as is)", "GLM-5.2", "GLM-5.1", "GLM-5-Turbo", "GLM-5V-Turbo", "GLM-4.7"],
      deepthink: ["(leave as is)", "on", "off"],
    },

    modelTrigger() {
      return $$("button,[role='button'],[aria-haspopup]").filter(visible).find((b) => {
        if (ours(b)) return false;
        return /^GLM-/.test((b.innerText || "").trim().split("\n")[0]);
      }) || $("[id^='model-selector'][id$='-button']") || null;
    },

    currentModel() {
      const t = glm.modelTrigger();
      return t ? (t.innerText || "").trim().split("\n")[0] : "";
    },

    deepthinkButton() { return findButtonByHint(["deep think", "deepthink", "深度思考"]); },

    async applyConfig(cfg) {
      const notes = [];
      if (cfg.model && !/leave/i.test(cfg.model)) {
        const trig = glm.modelTrigger();
        if (!trig) notes.push("model dropdown not found");
        else {
          trig.click();
          await sleep(800);
          const hit = clickByText([cfg.model]);
          await sleep(700);
          if (!hit) notes.push(`couldn't find "${cfg.model}" in menu`);
        }
      }
      if (cfg.deepthink && !/leave/i.test(cfg.deepthink)) {
        const btn = glm.deepthinkButton();
        if (!btn) notes.push("Deep Think button not found (send diagnostics)");
        else {
          const pressed = btn.getAttribute("aria-pressed");
          const active = pressed != null ? pressed === "true"
            : /active|selected|primary|checked|blue/i.test(btn.className);
          const want = cfg.deepthink === "on";
          if (active !== want) { btn.click(); await sleep(400); }
          notes.push(`DeepThink ${want ? "on" : "off"} (detected ${active ? "on" : "off"} before)`);
        }
      }
      return { ok: !notes.some((n) => /not found|couldn't/.test(n)), note: notes.join("; ") };
    },

    isEditEl(el) {
      return /^(message-edit|confirm-edit|cancel-edit)/.test((el && el.id) || "") ||
             !!(el && el.closest && el.closest("[id^='message-edit']"));
    },

    composer() {
      const input = glm.getInput();
      return input?.closest("form") || input?.parentElement?.parentElement?.parentElement || document;
    },

    getInput() {
      const main = $("#chat-input");
      if (main && visible(main)) return main;
      const g = generic.getInput();
      if (g && !glm.isEditEl(g)) return g;
      const others = $$("textarea, [contenteditable='true']").filter(visible)
        .filter((x) => !ours(x) && !glm.isEditEl(x));
      return others[others.length - 1] || g || null;
    },

    getSendButton() {
      const byId = $("#send-message-button");
      if (byId && visible(byId)) return byId;
      const c = glm.composer();
      const isStopish = (b) => STOP_RE.test([b.id, b.getAttribute("aria-label"), b.getAttribute("title"),
                                             (b.textContent || "").slice(0, 30)].join(" "));
      const cands = [
        findButtonByHint(["send", "发送", "enviar"], c === document ? document : c),
        nearestButtonToInput(glm.getInput()),
      ];
      return cands.find((b) => b && !glm.isEditEl(b) && !isStopish(b)) || null;
    },

    getStopButton() {
      const byId = $("#stop-response-button");
      if (byId && visible(byId)) return byId;
      return scopedStopButton(glm.getInput());
    },

    turns() {
      const nodes = outermost($$("[id^='message-']").filter(visible)
        .filter((n) => !/^message-edit/.test(n.id) && n.tagName !== "TEXTAREA"));
      if (nodes.length) {
        return nodes.sort(byDocOrder).map((n) => {
          const ta = $("textarea[id^='message-edit']", n);
          const isUser = !!$("[class*='user-message']", n) || !!ta;
          const body = isUser
            ? pickBody(n, ["[class*='user-message'] [class*='prose']", "[class*='user-message']"])
            : pickBody(n, ["[class*='markdown-prose']", "[class*='prose']", "[id$='response-content']"]);
          return { role: isUser ? "user" : "assistant", el: n, body, editTa: ta || null };
        });
      }
      return genericTurns();
    },

    transcript() {
      return glm.turns().map((t) => ({
        role: t.role,
        text: t.editTa ? (t.editTa.value || "").trim() : stripSrLabels((t.body || t.el).innerText),
      })).filter((t) => t.text);
    },

    getTranscriptRoot() {
      return containerOf("[id^='message-']:not([id^='message-edit'])") ||
             containerOf("[class*='user-message'],[class*='question'],[data-role]") ||
             generic.getTranscriptRoot();
    },
  });

  /* ================= ChatGPT ================= */

  // The current build (and the separate "work" surface, which is where
  // the 5.6 family lives) renders turns as <article data-turn="user">
  // rather than the old per-message wrapper. Try new markup, then the
  // classic attribute, then the testid, then the generic strategies.
  const chatgpt = derive({
    id: "chatgpt",
    label: "ChatGPT",
    hostMatch: /(^|\.)(chatgpt\.com|chat\.openai\.com)$/,
    newChatUrl: "https://chatgpt.com/",

    options: {
      model: ["(leave as is)", "GPT-5.6 Thinking", "GPT-5.6", "GPT-5.6 Pro", "Auto", "Thinking", "Instant"],
      effort: ["(leave as is)", "Instant", "Light", "Medium", "High"],
    },

    modelTrigger() {
      return $("[data-testid='model-switcher-dropdown-button']") ||
             $$("button[aria-haspopup='menu']").filter(visible)
               .find((b) => /gpt|auto|thinking|instant|model/i.test(b.innerText || b.getAttribute("aria-label") || "")) ||
             null;
    },

    effortTrigger() {
      return $$("button.__composer-pill[aria-haspopup='menu'], button[aria-haspopup='menu']")
        .filter(visible)
        .find((b) => /^(instant|light|medium|high|standard|thinking|auto)$/i.test((b.innerText || "").trim().split("\n")[0])) || null;
    },

    plusTrigger() {
      const input = chatgpt.getInput();
      const scope = composerScope(input) || document;
      // 1) Explicit testids or aria-labels on the composer + / attach / tools button
      const explicit = $$(
        "button[data-testid='composer-plus-btn'], button[data-testid*='plus' i], button[data-testid='system-hint-button'], " +
        "button[aria-label*='Add' i], button[aria-label*='Attach' i], button[aria-label*='Tools' i], " +
        "button[aria-label*='Añadir' i], button[aria-label*='Adjuntar' i], button[aria-label*='Herramientas' i]",
        scope
      ).filter(visible).filter((b) => !ours(b) && !b.disabled);
      if (explicit.length) return explicit[0];

      // 2) Button whose visible text is literally "+" or "＋" inside composer
      const byPlusText = $$("button, [role='button']", scope).filter(visible).filter((b) => !ours(b) && !b.disabled)
        .find((b) => /^[+＋]$/.test((b.innerText || b.textContent || "").trim()));
      if (byPlusText) return byPlusText;

      // 3) Geometric fallback inside the composer container: the + button sits at the
      // bottom-left of the composer, whereas Effort ("Instant v"), Voice, and Send ("↑")
      // sit on the right half. Pick the leftmost visible button in the left 45% of the composer.
      if (scope && scope !== document) {
        const sr = scope.getBoundingClientRect();
        const RM_RE = /\b(remove|close|delete|clear|quitar|eliminar|cerrar|cancel)\b/i;
        const leftBtns = $$("button, [role='button']", scope).filter(visible).filter((b) => {
          if (ours(b) || b.disabled) return false;
          const label = [b.getAttribute("aria-label"), b.getAttribute("title"), b.innerText].join(" ");
          if (RM_RE.test(label) || STOP_RE.test(label)) return false;
          const br = b.getBoundingClientRect();
          return sr.width > 100 && br.left <= sr.left + sr.width * 0.45 && br.top >= sr.top;
        });
        leftBtns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        if (leftBtns.length) return leftBtns[0];
      }
      return null;
    },

    currentModel() {
      const m = chatgpt.modelTrigger();
      const e = chatgpt.effortTrigger();
      const name = m ? (m.innerText || "").trim().split("\n")[0] : "";
      const eff = e ? (e.innerText || "").trim().split("\n")[0] : "";
      return [name, eff && eff !== name ? `effort: ${eff}` : ""].filter(Boolean).join(" · ");
    },

    async applyConfig(cfg) {
      const notes = [];
      const openMenu = () => $("[role='menu'][data-state='open']") ||
                             $("[data-testid='composer-intelligence-picker-content']") ||
                             $("[role='menu']") || document;

      if (cfg.model && !/leave/i.test(cfg.model)) {
        const trig = chatgpt.modelTrigger();
        if (!trig) notes.push("model switcher not found");
        else {
          humanClick(trig);
          await sleep(800);
          let hit = clickByText([cfg.model], openMenu());
          if (!hit) {
            // Specific versions often sit behind a "More models" submenu.
            const more = clickByText(["more models", "otros modelos", "legacy"], openMenu());
            if (more) { await sleep(700); hit = clickByText([cfg.model], openMenu()); }
          }
          await sleep(700);
          if (!hit) notes.push(`couldn't find model "${cfg.model}"`);
        }
      }

      if (cfg.effort && !/leave/i.test(cfg.effort)) {
        const trig = chatgpt.effortTrigger();
        if (!trig) notes.push("effort pill not found");
        else {
          humanClick(trig);
          await sleep(700);
          const hit = clickByText([cfg.effort], openMenu());
          await sleep(500);
          if (!hit) notes.push(`couldn't find effort "${cfg.effort}"`);
        }
      }
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return { ok: !notes.length, note: notes.join("; ") };
    },

    turns() {
      // 1) current markup
      let nodes = outermost($$("article[data-turn]").filter(visible));
      if (nodes.length) {
        return nodes.sort(byDocOrder).map((n) => {
          const role = /user/i.test(n.getAttribute("data-turn") || "") ? "user" : "assistant";
          const body = role === "user"
            ? pickBody(n, ["[data-message-author-role='user'] .whitespace-pre-wrap", ".whitespace-pre-wrap",
                           "[class*='user-message-bubble']", "[data-message-author-role='user']"])
            : pickBody(n, ["[data-message-author-role='assistant'] .markdown", ".markdown", ".prose",
                           "[data-message-author-role='assistant']"]);
          return { role, el: n, body };
        });
      }
      // 2) classic markup
      nodes = outermost($$("[data-message-author-role]").filter(visible));
      if (nodes.length) {
        return nodes.sort(byDocOrder).map((n) => {
          const role = n.getAttribute("data-message-author-role") === "user" ? "user" : "assistant";
          const body = role === "user"
            ? pickBody(n, [".whitespace-pre-wrap", "[class*='user-message-bubble']"])
            : pickBody(n, [".markdown", ".prose"]);
          return { role, el: n, body };
        });
      }
      // 3) testid wrapper
      nodes = outermost($$("[data-testid^='conversation-turn']").filter(visible));
      if (nodes.length) {
        return nodes.sort(byDocOrder).map((n, i) => {
          const inner = $("[data-message-author-role]", n);
          const role = inner ? (inner.getAttribute("data-message-author-role") === "user" ? "user" : "assistant")
                             : (i % 2 === 0 ? "user" : "assistant");
          return { role, el: n, body: pickBody(n, [".markdown", ".prose", ".whitespace-pre-wrap"]) };
        });
      }
      return genericTurns();
    },

    getTranscriptRoot() {
      return containerOf("article[data-turn]") ||
             containerOf("[data-message-author-role]") ||
             containerOf("[data-testid^='conversation-turn']") ||
             generic.getTranscriptRoot();
    },

    getInput() { return $("#prompt-textarea") || generic.getInput(); },

    getSendButton() {
      const b = $("#composer-submit-button") || $("[data-testid='send-button']");
      // While streaming, this same slot BECOMES the stop button. Clicking
      // it then aborts the reply instead of sending anything.
      if (b && !STOP_RE.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || ""))) return b;
      return findButtonByHint(["send prompt", "send", "enviar"]) || nearestButtonToInput(chatgpt.getInput());
    },

    getStopButton() {
      const t = $("[data-testid='stop-button']");
      if (t && visible(t)) return t;
      const b = $("#composer-submit-button");
      if (b && visible(b) &&
          STOP_RE.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || ""))) return b;
      return scopedStopButton(chatgpt.getInput());
    },

    isBusy() { return visible(chatgpt.getStopButton()); },
  });

  /* ================= Claude ================= */

  const claude = derive({
    id: "claude",
    label: "Claude",
    hostMatch: /(^|\.)claude\.ai$/,
    newChatUrl: "https://claude.ai/new",
    options: {},
    async applyConfig() { return { ok: true, note: "" }; },

    currentModel() {
      const b = $$("button[data-testid='model-selector-dropdown'], button[aria-haspopup='menu']")
        .filter(visible).find((x) => /claude|opus|sonnet|haiku|fable|mythos/i.test(x.innerText || ""));
      return b ? (b.innerText || "").trim().split("\n")[0] : "";
    },

    turns() {
      const users = $$("[data-testid='user-message']").filter(visible);
      const asst = $$(".font-claude-response, .font-claude-message, [data-is-streaming] .font-claude-response")
        .filter(visible);
      const all = outermost([...users, ...asst]);
      if (all.length) {
        return all.sort(byDocOrder).map((n) => ({
          role: n.matches?.("[data-testid='user-message']") ? "user" : "assistant",
          el: n,
          body: n,
        }));
      }
      return genericTurns();
    },

    getTranscriptRoot() {
      return containerOf("[data-testid='user-message'],.font-claude-response,.font-claude-message") ||
             generic.getTranscriptRoot();
    },
    getInput() { return $("div.ProseMirror[contenteditable='true']") || generic.getInput(); },
    getSendButton() {
      const b = $("button[aria-label='Send message'], button[aria-label*='Send' i]");
      if (b && visible(b)) return b;
      return findButtonByHint(["send", "enviar"]) || nearestButtonToInput(claude.getInput());
    },
    getStopButton() {
      const b = $("button[aria-label*='Stop' i]");
      if (b && visible(b)) return b;
      return scopedStopButton(claude.getInput());
    },
  });

  /* ================= Kimi ================= */

  const kimi = derive({
    id: "kimi",
    label: "Kimi",
    hostMatch: /(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/,
    newChatUrl: "https://www.kimi.com/",
    options: {},
    async applyConfig() { return { ok: true, note: "" }; },

    turns() {
      const nodes = outermost($$(".segment-user, .segment-assistant, [class*='chat-content-item-user'], [class*='chat-content-item-assistant']")
        .filter(visible));
      if (nodes.length) {
        return nodes.sort(byDocOrder).map((n) => {
          const c = n.getAttribute("class") || "";
          const isUser = /user/i.test(c);
          return {
            role: isUser ? "user" : "assistant",
            el: n,
            body: pickBody(n, ["[class*='markdown']", "[class*='segment-content']", "[class*='user-content']"]),
          };
        });
      }
      return genericTurns();
    },

    getTranscriptRoot() {
      return containerOf(".segment-user,.segment-assistant,[class*='chat-content-item']") ||
             generic.getTranscriptRoot();
    },
    getInput() { return $(".chat-input-editor[contenteditable='true']") || generic.getInput(); },
    getSendButton() {
      const b = $("[class*='send-button'], [data-testid='send-button']");
      if (b && visible(b)) return b;
      return generic.getSendButton(kimi.getInput());
    },
  });

  /* ================= DeepSeek ================= */

  const deepseek = derive({
    id: "deepseek",
    label: "DeepSeek",
    hostMatch: /(^|\.)deepseek\.com$/,
    newChatUrl: "https://chat.deepseek.com/",
    options: {},
    async applyConfig() { return { ok: true, note: "" }; },
    turns() {
      // DeepSeek ships hashed class names, but the rendered-answer
      // container `.ds-markdown` has been stable — anchor on it.
      if (!$$(".ds-markdown").filter(visible).length) return genericTurns();
      return heuristicTurns();
    },
    getTranscriptRoot() { return containerOf(".ds-markdown") || generic.getTranscriptRoot(); },
    getInput() { return $("#chat-input") || generic.getInput(); },
  });

  /* ================= Qwen ================= */

  const qwen = derive({
    id: "qwen",
    label: "Qwen",
    hostMatch: /(^|\.)(qwen\.ai|tongyi\.com)$/,
    newChatUrl: "https://chat.qwen.ai/",
    options: {},
    async applyConfig() { return { ok: true, note: "" }; },
    turns: genericTurns,
    getTranscriptRoot: generic.getTranscriptRoot,
    getInput: generic.getInput,
  });

  /* ================= Grok ================= */

  const grok = derive({
    id: "grok",
    label: "Grok",
    hostMatch: /(^|\.)grok\.com$/,
    newChatUrl: "https://grok.com/",
    options: {},
    async applyConfig() { return { ok: true, note: "" }; },
    turns() {
      const nodes = outermost($$("[class*='message-bubble']").filter(visible));
      if (!nodes.length) return genericTurns();
      return nodes.sort(byDocOrder).map((n, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        el: n,
        body: pickBody(n, ["[class*='markdown']", "[class*='prose']"]),
      }));
    },
    getTranscriptRoot: generic.getTranscriptRoot,
    getInput: generic.getInput,
  });

  /* ================= Outlier Playground ================= */

  // app.outlier.ai/playground — a Next.js app whose conversation route is
  // /conversation/<id>. It ships Tailwind utility classes and a Scale
  // design system, so there are no semantic class names like
  // "user-message" to anchor on, and the server response is an empty
  // shell (React mounts the thread afterwards). Rather than guess, this
  // adapter leans on the generic strategies and on whatever the user
  // teaches it via "Teach this site" — see learn.* below.
  const outlier = derive({
    id: "outlier",
    label: "Outlier Playground",
    hostMatch: /(^|\.)outlier\.ai$/,
    newChatUrl: "https://app.outlier.ai/playground",

    options: {
      // Free-text combo in the run builder: type the label exactly as the
      // model dropdown shows it. The roster here rotates often.
      model: ["(leave as is)", "Claude Opus 4", "Claude Sonnet 4", "GPT-4.1", "o3",
              "Gemini 2.5 Pro", "Gemini 2.5 Flash", "Grok 3", "Llama 4 Maverick", "Astral"],
    },

    modelTrigger() {
      const MODELS = /(gpt|claude|gemini|grok|llama|astral|qwen|deepseek|mistral|opus|sonnet|haiku|maverick|flash|\bo[134]\b)/i;
      const pool = [
        ...$$("[data-testid*='model'],[data-test-id*='model'],[aria-label*='model' i]"),
        ...$$("button,select,[role='combobox'],[aria-haspopup='listbox'],[aria-haspopup='menu']"),
      ].filter(visible).filter((b) => !ours(b));
      const seen = new Set();
      for (const b of pool) {
        if (seen.has(b)) continue;
        seen.add(b);
        const head = (b.innerText || b.value || "").trim().split("\n")[0];
        if (head && head.length < 60 && MODELS.test(head)) return b;
      }
      return null;
    },

    currentModel() {
      const t = outlier.modelTrigger();
      const head = t ? (t.innerText || t.value || "").trim().split("\n")[0] : "";
      return head.length < 60 ? head : "";
    },

    async applyConfig(cfg) {
      if (!cfg.model || /leave/i.test(cfg.model)) return { ok: true, note: "" };
      const trig = outlier.modelTrigger();
      if (!trig) return { ok: false, note: "model dropdown not found — pick it by hand" };
      trig.click();
      await sleep(800);
      const hit = clickByText([cfg.model], $("[role='listbox']") || $("[role='menu']") || document);
      await sleep(600);
      return hit ? { ok: true, note: "" } : { ok: false, note: `couldn't find model "${cfg.model}"` };
    },

    // The app tags the HUMAN's turns and nothing else:
    //   <div data-testid="prompt-message" ...>   ← you
    //   <div class="… prose …">                  ← the model, unlabelled
    // So anchor on the tag we actually know, then take every other
    // rendered-markdown block in the same list as the model's. That
    // survives a testid rename on the assistant side, which is the part
    // most likely to churn.
    turns() {
      const users = outermost($$("[data-testid='prompt-message'],[data-testid^='prompt-message-']")
        .filter(visible).filter((n) => !ours(n)));

      if (users.length) {
        const md = $$("[class*='prose'],[class*='markdown']").filter(visible)
          .filter((n) => !ours(n) && (n.innerText || "").trim())
          .filter((n) => !users.some((u) => u.contains(n)));

        const root = containerOfNodes([...users, ...md]);
        const lift = (n) => (root && childOf(root, n)) || n;
        const liftedU = users.map(lift);
        const liftedA = outermost([...new Set(md.map(lift))]);

        // If lifting lands a model block on the same element as one of
        // yours, the shared ancestor wraps BOTH sides of an exchange —
        // raising to it would merge the pair into one turn. Use the raw
        // blocks in that case.
        const collided = liftedA.some((n) => liftedU.includes(n));
        const uNodes = collided ? users : liftedU;
        const aNodes = collided ? md : liftedA;

        const uSet = new Set(uNodes);
        const nodes = outermost([...uNodes, ...aNodes])
          .filter((n) => n && n !== root && (n.innerText || "").trim());

        if (nodes.length) {
          return nodes.sort(byDocOrder).map((n) => ({
            role: uSet.has(n) ? "user" : "assistant",
            el: n,
            body: pickBody(n, ["[data-testid$='markdown']", "[class*='prose']",
                               "[class*='markdown']", "[class*='message-content']"]),
          }));
        }
      }

      // No prompt-message tag on this build — the generic chain now
      // starts with testids and falls back to layout, so it no longer
      // collapses the whole chat into one role.
      return genericTurns();
    },

    getTranscriptRoot() {
      let nodes = [];
      try { nodes = outlier.turns().map((t) => t.el).filter(Boolean); } catch { nodes = []; }
      if (nodes.length >= 2) {
        const c = containerOfNodes(nodes);
        if (c && c !== document.body && c !== document.documentElement) return c;
      }
      return containerOf("[data-testid='prompt-message']") || generic.getTranscriptRoot();
    },

    getInput: generic.getInput,
  });

  /* ================= point-and-teach ================= */

  // When a site's markup can't be anticipated (Tailwind utility soup, or
  // an app nobody has selectors for yet), the user points at one of their
  // own messages and one of the model's. We derive a repeatable signature
  // for each and match every other turn with it — no CSS-path fragility,
  // no code change, and it survives class reordering.

  const BODY_SELS = [
    "[class*='markdown']", "[class*='prose']", "[class*='message-content']",
    "[class*='response-content']", "[class*='content']",
  ];

  const SIG_ATTRS = ["data-message-author-role", "data-turn", "data-role", "data-testid", "data-test-id"];

  const classTokens = (el) =>
    String(el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).sort();

  function sigsFor(el) {
    const out = [];
    for (const a of SIG_ATTRS) {
      const v = el.getAttribute?.(a);
      if (v) out.push({ tag: el.tagName, attr: a, value: v, classes: null });
    }
    const cls = classTokens(el);
    if (cls.length) out.push({ tag: el.tagName, attr: null, value: null, classes: cls });
    return out;
  }

  const sigEqual = (a, b) =>
    !!a && !!b && a.tag === b.tag && a.attr === b.attr && a.value === b.value &&
    JSON.stringify(a.classes) === JSON.stringify(b.classes);

  function sigLabel(sig) {
    if (!sig) return "(none)";
    if (sig.attr) return `${sig.tag.toLowerCase()}[${sig.attr}="${sig.value}"]`;
    const c = (sig.classes || []).slice(0, 3).join(" ");
    return `${sig.tag.toLowerCase()}.${c}${(sig.classes || []).length > 3 ? "…" : ""}`;
  }

  // Matching is done in JS rather than by building a selector string:
  // Tailwind class names are full of characters that need CSS escaping
  // (md:w-1/2, bg-[#fff], hover:opacity-50) and one missed escape throws.
  function matchSig(sig) {
    if (!sig) return [];
    if (sig.attr) {
      const v = String(sig.value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return $$(`[${sig.attr}="${v}"]`).filter((el) => el.tagName === sig.tag && visible(el) && !ours(el));
    }
    const want = sig.classes || [];
    if (!want.length) return [];
    return $$(sig.tag.toLowerCase()).filter((el) => {
      if (!visible(el) || ours(el)) return false;
      const got = classTokens(el);
      return got.length === want.length && got.every((c, i) => c === want[i]);
    });
  }

  // All ancestors of the clicked node whose signature REPEATS on the page,
  // lowest first. A repeated signature is the tell that we've found the
  // component the site renders once per message.
  function ladder(clicked) {
    const out = [];
    let a = clicked, depth = 0;
    while (a && a !== document.body && a !== document.documentElement && depth++ < 25) {
      if (!ours(a)) {
        for (const sig of sigsFor(a)) {
          const n = matchSig(sig).length;
          if (n >= 2 && n <= 500) { out.push({ el: a, sig, count: n }); break; }
        }
      }
      a = a.parentElement;
    }
    return out;
  }

  // Pick the HIGHEST pair of levels that don't contain one another: the
  // outermost repeated block is the whole turn, which is what we want to
  // export. If the only workable pair shares one signature, the site uses
  // an identical wrapper for both sides — fall back to strict alternation.
  function reconcile(userLadder, asstLadder) {
    let sharedFallback = null;
    for (let i = userLadder.length - 1; i >= 0; i--) {
      for (let j = asstLadder.length - 1; j >= 0; j--) {
        const u = userLadder[i], a = asstLadder[j];
        if (u.el === a.el || u.el.contains(a.el) || a.el.contains(u.el)) continue;
        if (sigEqual(u.sig, a.sig)) {
          if (!sharedFallback) sharedFallback = { user: u.sig, assistant: u.sig, alternating: true };
          continue;
        }
        // The two clicked elements not overlapping isn't enough: the outer
        // wrapper of one side and the inner prose block of the other never
        // overlap EACH OTHER, yet every wrapper contains a prose block, so
        // the pairing would tag the same turn twice. Demand that the two
        // match SETS are fully disjoint — if merging them drops anything,
        // one side nests inside the other and this pairing is wrong.
        const ue = matchSig(u.sig), ae = matchSig(a.sig);
        if (!ue.length || !ae.length) continue;
        if (outermost([...ue, ...ae]).length !== ue.length + ae.length) continue;
        return { user: u.sig, assistant: a.sig, alternating: false };
      }
    }
    return sharedFallback;
  }

  function learnedTurns(cfg) {
    if (!cfg) return [];
    if (cfg.alternating) {
      const nodes = outermost(matchSig(cfg.user)).sort(byDocOrder);
      return nodes.map((n, i) => ({
        role: i % 2 === 0 ? "user" : "assistant", el: n, body: pickBody(n, BODY_SELS),
      }));
    }
    const u = matchSig(cfg.user);
    const a = matchSig(cfg.assistant);
    const uSet = new Set(u);
    return outermost([...u, ...a]).sort(byDocOrder).map((n) => ({
      role: uSet.has(n) ? "user" : "assistant", el: n, body: pickBody(n, BODY_SELS),
    }));
  }

  function learnedRoot(cfg) {
    const nodes = learnedTurns(cfg).map((t) => t.el);
    if (nodes.length < 2) return null;
    let anc = nodes[0].parentElement;
    while (anc && anc !== document.body && !nodes.every((n) => anc.contains(n))) anc = anc.parentElement;
    return anc && anc !== document.body ? anc : null;
  }

  // Replace an adapter's reading of the page with what the user taught.
  function applyLearned(adp, cfg) {
    if (!cfg || !cfg.user) return adp;
    adp.turns = () => {
      const t = learnedTurns(cfg);
      return t.length ? t : genericTurns();
    };
    adp.transcript = () => adp.turns()
      .map((t) => ({ role: t.role, text: stripSrLabels((t.body || t.el).innerText) }))
      .filter((t) => t.text);
    adp.userMessages = () => adp.transcript().filter((t) => t.role === "user").map((t) => t.text);
    const originalRoot = adp.getTranscriptRoot;
    adp.getTranscriptRoot = () => learnedRoot(cfg) || originalRoot?.call(adp) || null;
    adp.learned = cfg;
    return adp;
  }

  const learn = { ladder, reconcile, matchSig, learnedTurns, applyLearned, sigLabel, sigEqual, BODY_SELS };

  /* ================= registry ================= */

  const all = [gemini, glm, chatgpt, claude, kimi, deepseek, qwen, grok, outlier];

  const fallback = derive({
    id: "generic", label: "This site", options: {},
    async applyConfig() { return { ok: true, note: "" }; },
    turns: genericTurns,
    getTranscriptRoot: generic.getTranscriptRoot,
    getInput: generic.getInput,
  });

  function forHost(hostname) {
    return all.find((a) => a.hostMatch.test(hostname)) || fallback;
  }

  const launchTargets = all.map((a) => ({
    id: a.id, label: a.label, url: a.newChatUrl, options: a.options || {},
  }));

  /* ---------------- diagnostics ---------------- */

  function diagnose(adp) {
    const clip = (el, n = 700) => (el ? el.outerHTML.slice(0, n) : null);
    const input = adp.getInput();
    let turns = [];
    try { turns = adp.turns() || []; } catch { turns = []; }
    const msgs = (() => { try { return adp.userMessages(); } catch { return []; } })();
    const firstUser = turns.find((t) => t.role === "user");
    const firstAsst = turns.find((t) => t.role === "assistant");
    const root = (() => { try { return adp.getTranscriptRoot?.(); } catch { return null; } })();

    return JSON.stringify({
      // Read from the manifest rather than hardcoded: a stale version in
      // a diagnostics paste sends whoever reads it hunting the wrong code.
      version: (() => { try { return chrome.runtime.getManifest().version; } catch { return "?"; } })(),
      site: location.hostname,
      path: location.pathname,
      title: document.title,
      adapter: adp.id,
      learned: adp.learned
        ? { user: sigLabel(adp.learned.user), assistant: sigLabel(adp.learned.assistant), alternating: !!adp.learned.alternating }
        : null,
      model: (() => { try { return adp.currentModel(); } catch { return ""; } })(),
      capturedCount: msgs.length,
      capturedPreview: msgs.map((m) => m.slice(0, 80)),
      turnCount: turns.length,
      turnRoles: turns.map((t) => t.role).join(","),
      // Role + the opening words of each turn: if the split is wrong,
      // this shows it immediately without reading any HTML.
      turnSample: turns.slice(0, 8).map((t) => {
        const tid = t.el?.getAttribute?.("data-testid") || "";
        const txt = ((t.body || t.el)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
        return `${t.role}${tid ? `[${tid}]` : ""}: ${txt}`;
      }),
      // These two samples are what actually lets a fix be written for a
      // site that isn't parsing: they show the real turn markup.
      firstUserTurnHTML: clip(firstUser?.el, 900),
      firstAssistantTurnHTML: clip(firstAsst?.el, 900),
      transcriptRootHTML: clip(root, 400),
      scrollRoot: (() => {
        try { const s = adp.getScrollRoot?.(); return s ? s.tagName + "." + String(s.className || "").slice(0, 60) : "window"; }
        catch { return "err"; }
      })(),
      inputHTML: clip(input),
      sendButtonHTML: clip(adp.getSendButton?.()),
      plusButtonHTML: clip(adp.plusTrigger?.(), 900),
      modelPickerHTML: clip(adp.modeTrigger?.() || adp.modelTrigger?.() || adp.effortTrigger?.(), 900),
      deepthinkHTML: clip(adp.deepthinkButton?.(), 900),
      stopButtonHTML: clip(adp.getStopButton?.(), 900),
      busyNow: (() => { try { return adp.isBusy(); } catch (e) { return "err:" + e.message; } })(),
    }, null, 2);
  }

  return {
    forHost, generic, findButtonByHint, nearestButtonToInput, clickByText, humanClick, composerScope,
    diagnose, launchTargets, visible, scrollRootFrom, stripSrLabels, learn,
  };
})();
