/* ============================================================
   Platform fixtures — the canonical DOM snapshots.

   One file, two consumers: the node:test suite (require) and the docs
   playground (<script src>), so the demo shows exactly what is tested.

   Each fixture is a hand-reduced replica of the site's turn markup as it
   ships in the browser — tag names, class hooks, test ids, the code-block
   chrome, KaTeX's double rendering, reasoning panels, the composer — with
   the styling noise trimmed. They are NOT scraped captures (every site
   here needs a login), so when a site changes, update the fixture from
   "Copy diagnostics" output (firstUserTurnHTML / firstAssistantTurnHTML).

   All nine chat fixtures carry the SAME three-exchange conversation, so
   one set of expectations (EXPECT) checks every adapter:
     1. a multi-line prompt → a Python block whose language label sits
        wherever that site puts it
     2. math + a table → inline and display TeX, an aligned GFM table,
        and (where the site has one) a reasoning panel
     3. a Markdown file that itself contains a ```bash fence
   ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChatReplayFixtures = api;
})(typeof self !== "undefined" ? self : this, function () {

  const PROMPTS = [
    "Write a Python function that reverses a string.\nKeep it under 5 lines.",
    "Show the quadratic formula, then compare sorting algorithms in a table.",
    "Give me a README snippet that itself contains a fenced bash block.",
  ];
  const CODE_PY = 'def reverse(s: str) -> str:\n    return s[::-1]\n\nprint(reverse("hello"))  # olleh';
  const CODE_MD = "# Setup\n\n```bash\nnpm install\nnpm test\n```";
  const TEX_INLINE = "ax^2 + bx + c = 0";
  const TEX_BLOCK = "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}";
  const THINK = "The user wants the formula first, then a comparison table.";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (s) => esc(s).replace(/"/g, "&quot;");
  // Highlighters wrap tokens in spans; the exporter must see through them.
  const hl = (code) => esc(code)
    .replace(/\b(def|return)\b/g, '<span class="hljs-keyword">$1</span>')
    .replace(/(&quot;|")hello\1/g, '<span class="hljs-string">"hello"</span>')
    .replace(/(# olleh)/g, '<span class="hljs-comment">$1</span>');

  // KaTeX paints twice: MathML (with the TeX source in <annotation>) for
  // screen readers, and an aria-hidden HTML rendering for the eye.
  const katex = (tex, display) => {
    const k = `<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ""}><semantics><mrow><mi>x</mi><mo>=</mo><mn>2</mn></mrow><annotation encoding="application/x-tex">${esc(tex)}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:0.8641em;"></span><span class="mord mathnormal">${esc(tex.replace(/[\\{}]/g, ""))}</span></span></span></span>`;
    return display ? `<span class="katex-display">${k}</span>` : k;
  };

  const TABLE = (wrapOpen = "", wrapClose = "") => `${wrapOpen}<table>
    <thead><tr><th>Algorithm</th><th>Average</th><th style="text-align:center">Stable</th></tr></thead>
    <tbody>
      <tr><td>Merge sort</td><td><code>O(n log n)</code></td><td style="text-align:center">Yes</td></tr>
      <tr><td>Quicksort</td><td><code>O(n log n)</code></td><td style="text-align:center">No</td></tr>
      <tr><td>Bubble sort</td><td><code>O(n^2)</code></td><td style="text-align:center">Yes</td></tr>
    </tbody></table>${wrapClose}`;

  const LIST = `<ul><li>Run <code>npm install</code> once.</li><li>Then run the tests.</li></ul>`;
  const P1 = `<p>Here is a compact version using slicing:</p>`;
  const P1b = `<p>Slicing with <code>[::-1]</code> walks the string backwards.</p>`;
  const P2 = (m) => `<p>For ${m(TEX_INLINE, false)} the roots are:</p>`;
  const P3 = `<p>Here is the snippet:</p>`;

  /* ---------------- ChatGPT ---------------- */

  function chatgpt() {
    const code = (lang, c) => `<pre class="overflow-visible!" data-start="0" data-end="120"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="flex items-center text-token-text-secondary px-4 py-2 text-xs font-sans justify-between h-9 bg-token-sidebar-surface-primary select-none rounded-t-2xl">${lang}</div><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"><button class="flex gap-1 items-center select-none py-1" aria-label="Copy"><svg width="20" height="20" viewBox="0 0 20 20"><path d="M0 0h20v20H0z"></path></svg>Copy</button><span data-state="closed"><button class="flex select-none items-center gap-1"><svg width="20" height="20"><path d="M0 0"></path></svg>Edit</button></span></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-${lang}">${lang === "python" ? hl(c) : esc(c)}</code></div></div></pre>`;
    const user = (i, text) => `
      <article class="text-token-text-primary w-full focus:outline-none scroll-mt-[calc(var(--header-height)+min(200px,max(70px,20svh)))]" tabindex="-1" dir="auto" data-turn-id="u${i}" data-testid="conversation-turn-${i * 2 - 1}" data-scroll-anchor="false" data-turn="user">
        <h5 class="sr-only">You said:</h5>
        <div class="text-base my-auto mx-auto pt-12 [--thread-content-margin:--spacing(4)]">
          <div class="[--thread-content-max-width:40rem] mx-auto max-w-(--thread-content-max-width) flex-1 group/turn-messages focus-visible:outline-hidden relative flex w-full min-w-0 flex-col">
            <div class="flex max-w-full flex-col grow">
              <div data-message-author-role="user" data-message-id="msg-u${i}" dir="auto" class="min-h-8 text-message relative flex w-full flex-col items-end gap-2 text-start break-words whitespace-normal [.text-message+&]:mt-1">
                <div class="flex w-full flex-col gap-1 empty:hidden items-end rtl:items-start">
                  <div class="user-message-bubble-color relative max-w-[var(--user-chat-width,70%)] rounded-[18px] px-4 py-1.5 data-[multiline]:py-3" data-multiline="">
                    <div class="whitespace-pre-wrap">${esc(text)}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex justify-end"><button aria-label="Copy" data-testid="copy-turn-action-button">Copy</button><button aria-label="Edit message">Edit</button></div>
          </div>
        </div>
      </article>`;
    const asst = (i, inner) => `
      <article class="text-token-text-primary w-full focus:outline-none" tabindex="-1" dir="auto" data-turn-id="a${i}" data-testid="conversation-turn-${i * 2}" data-scroll-anchor="false" data-turn="assistant">
        <h6 class="sr-only">ChatGPT said:</h6>
        <div class="text-base my-auto mx-auto [--thread-content-margin:--spacing(4)]">
          <div class="flex max-w-full flex-col grow">
            <div data-message-author-role="assistant" data-message-id="msg-a${i}" data-message-model-slug="gpt-5-6-thinking" dir="auto" class="min-h-8 text-message relative flex w-full flex-col items-end gap-2 text-start break-words whitespace-normal">
              <div class="flex w-full flex-col gap-1 empty:hidden first:pt-[1px]">
                <div class="markdown prose dark:prose-invert w-full break-words light markdown-new-styling">${inner}</div>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-y-4 p-1 select-none touch:-me-2 touch:-ms-3.5 -ms-2.5 -me-1 justify-start">
            <button class="text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="Copy" data-testid="copy-turn-action-button"><span class="flex items-center justify-center touch:w-10 h-8 w-8"><svg width="20" height="20"><path d="M0 0"></path></svg></span></button>
            <button aria-label="Good response" data-testid="good-response-turn-action-button"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
            <button aria-label="Try again..." data-testid="regenerate-turn-action-button"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
          </div>
        </div>
      </article>`;
    const html = `
      <div id="thread" class="group/thread @container/thread h-full w-full">
        <div class="flex h-full flex-col overflow-y-auto" data-testid="thread-scroll">
          <div class="flex flex-col text-sm pb-25">
            ${user(1, PROMPTS[0])}
            ${asst(1, P1 + code("python", CODE_PY) + P1b)}
            ${user(2, PROMPTS[1])}
            ${asst(2, P2(katex) + katex(TEX_BLOCK, true) + `<div class="_tableContainer_1rjym_1"><div tabindex="-1" class="group _tableWrapper_1rjym_13 flex w-fit flex-col-reverse">${TABLE()}</div></div>`)}
            ${user(3, PROMPTS[2])}
            ${asst(3, P3 + code("markdown", CODE_MD) + LIST)}
          </div>
        </div>
      </div>
      <div id="thread-bottom-container">
        <form class="w-full [view-transition-name:var(--vt-composer)]" data-type="unified-composer">
          <div class="bg-token-bg-primary flex w-full cursor-text flex-col items-center justify-center overflow-clip bg-clip-padding contain-inline-size shadow-short rounded-[28px]">
            <div class="_prosemirror-parent_ebv8s_2 text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 min-h-[var(--deep-research-composer-extra-height,unset)] flex-1 overflow-auto">
              <div contenteditable="true" translate="no" class="ProseMirror" id="prompt-textarea" data-virtualkeyboard="true"><p data-placeholder="Ask anything" class="placeholder"><br class="ProseMirror-trailingBreak"></p></div>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="composer-btn" data-testid="composer-plus-btn" aria-label="Add photos &amp; files"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
              <button type="button" aria-haspopup="menu" class="__composer-pill">Thinking</button>
              <button id="composer-submit-button" aria-label="Send prompt" data-testid="send-button" class="composer-submit-btn composer-submit-button-color h-9 w-9"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
              <button data-testid="stop-button" aria-label="Stop streaming" style="display:none"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
            </div>
          </div>
        </form>
      </div>`;
    return { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/c/68f1a2b3-0000-8000-9000-abcdefabcdef", title: "String reversal and sorting - ChatGPT", html, thinking: false, send: "#composer-submit-button" };
  }

  /* ---------------- Claude ---------------- */

  function claude() {
    const code = (lang, c) => `<div class="relative group/copy bg-bg-000/50 border-0.5 border-border-400 rounded-lg"><div class="sticky opacity-0 group-hover/copy:opacity-100 top-2 py-2 h-12 w-0 float-right"><div class="absolute right-0 h-8 px-2 items-center inline-flex z-10"><button class="inline-flex items-center justify-center relative shrink-0 can-focus select-none" type="button" aria-label="Copy to clipboard" data-state="closed"><div class="relative"><svg width="20" height="20"><path d="M0 0"></path></svg></div></button></div></div><div class="text-text-500 font-small p-3.5 pb-0">${lang}</div><pre class="code-block__code !my-0 !rounded-lg !text-sm !leading-relaxed" style="background: transparent; color: rgb(171, 178, 191); font-family: var(--font-mono); direction: ltr; text-align: left; white-space: pre; word-spacing: normal; word-break: normal; line-height: 1.5; tab-size: 2; hyphens: none; padding: 1em; margin: 0.5em 0px; overflow: auto; border-radius: 0.3em;"><code class="language-${lang}" style="white-space: pre;">${lang === "python" ? hl(c) : esc(c)}</code></pre></div>`;
    const user = (text) => `
      <div data-test-render-count="1">
        <div class="mb-1 mt-1">
          <div class="mx-auto flex flex-col items-end">
            <div class="group relative inline-flex gap-2 bg-bg-300 rounded-xl pl-2.5 py-2.5 break-words text-text-100 transition-all max-w-[75ch] flex-col !px-4 ml-auto">
              <div class="flex flex-row gap-2 relative">
                <div class="shrink-0"><div class="flex shrink-0 items-center justify-center rounded-full font-bold select-none h-7 w-7 text-[12px] bg-text-200 text-bg-100">RJ</div></div>
                <div data-testid="user-message" class="font-large !font-user-message grid grid-cols-1 gap-2 py-0.5 text-[0.9375rem] leading-6"><p class="whitespace-pre-wrap break-words">${esc(text)}</p></div>
              </div>
            </div>
            <div class="flex justify-end"><button aria-label="Edit">Edit</button><button aria-label="Copy">Copy</button></div>
          </div>
        </div>
      </div>`;
    const asst = (inner) => `
      <div data-test-render-count="1">
        <div style="height: auto; opacity: 1; transform: none;">
          <div data-is-streaming="false" class="group relative pb-8" style="opacity: 1; transform: none;">
            <div class="font-claude-response relative leading-[1.65rem] [&_pre>div]:bg-bg-000/50 [&_pre>div]:border-0.5 [&_pre>div]:border-border-400 [&_.ignore-pre-bg>div]:bg-transparent [&_pre]:-mx-1">
              <div><div class="grid-cols-1 grid gap-2.5 [&_>_*]:min-w-0 standard-markdown">${inner}</div></div>
            </div>
            <div class="absolute -bottom-0 -right-1.5"><div class="flex"><button aria-label="Copy" data-testid="action-bar-copy">Copy</button><button aria-label="Retry" data-testid="action-bar-retry">Retry</button></div></div>
          </div>
        </div>
      </div>`;
    const html = `
      <div class="flex-1 flex flex-col gap-3 px-4 max-w-3xl mx-auto w-full pt-1">
        ${user(PROMPTS[0])}
        ${asst(P1.replace("<p>", '<p class="whitespace-normal break-words">') + code("python", CODE_PY) + P1b)}
        ${user(PROMPTS[1])}
        ${asst(P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="overflow-x-auto w-full px-2 mb-6">', "</div>"))}
        ${user(PROMPTS[2])}
        ${asst(P3 + code("markdown", CODE_MD) + LIST)}
      </div>
      <fieldset class="flex w-full min-w-0 flex-col">
        <div class="flex flex-col bg-bg-000 gap-1.5 border-0.5 border-border-300 pl-4 pt-2.5 pr-2.5 pb-2.5 sm:mx-0 items-stretch transition-all duration-200 relative cursor-text z-10 rounded-2xl">
          <div class="relative"><div class="w-full overflow-y-auto break-words max-h-96 min-h-[1.5rem] pl-[6px] pt-[6px]">
            <div contenteditable="true" role="textbox" translate="no" class="tiptap ProseMirror" aria-label="Write your prompt to Claude" aria-multiline="true" tabindex="0"><p data-placeholder="How can I help you today?" class="is-empty is-editor-empty before:!text-text-500 before:whitespace-nowrap"><br class="ProseMirror-trailingBreak"></p></div>
          </div></div>
          <div class="flex gap-2.5 w-full items-center">
            <button type="button" aria-label="Open attachments menu"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
            <button type="button" data-testid="model-selector-dropdown" aria-haspopup="menu">Claude Opus 5.5</button>
            <button type="button" aria-label="Send message" class="inline-flex items-center justify-center relative shrink-0 bg-accent-main-000 h-8 w-8 rounded-md"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
          </div>
        </div>
      </fieldset>`;
    return { id: "claude", label: "Claude", url: "https://claude.ai/chat/1f0e0d0c-0000-4000-8000-123456789abc", title: "String reversal and sorting - Claude", html, thinking: false, send: "button[aria-label='Send message']" };
  }

  /* ---------------- Gemini ---------------- */

  function gemini() {
    const gmath = (tex, display) => display
      ? `<div class="math-block" data-math="${attr(tex)}">${katex(tex, true)}</div>`
      : `<span class="math-inline" data-math="${attr(tex)}">${katex(tex, false)}</span>`;
    const code = (lang, c) => `<code-block _nghost-ng-c1 class="ng-tns-c1 ng-star-inserted"><div _ngcontent-ng-c1 class="code-block ng-tns-c1 ng-animate-disabled ng-trigger ng-trigger-codeBlockRevealAnimation"><div class="code-block-decoration header-formatted gds-title-s ng-tns-c1 ng-star-inserted"><span class="ng-tns-c1">${lang === "python" ? "Python" : "Markdown"}</span><div class="buttons ng-tns-c1 ng-star-inserted"><button mat-icon-button aria-label="Copy code" class="mdc-icon-button mat-mdc-icon-button copy-button"><span class="mat-mdc-button-persistent-ripple"></span><mat-icon role="img" fonticon="content_copy" class="mat-icon notranslate gds-icon-l google-symbols mat-ligature-font" aria-hidden="true">content_copy</mat-icon></button></div></div><div class="formatted-code-block-internal-container ng-tns-c1"><div class="animated-opacity ng-tns-c1"><pre class="ng-tns-c1"><code role="text" data-test-id="code-content" class="code-container formatted ng-tns-c1">${lang === "python" ? hl(c) : esc(c)}</code></pre></div></div></div></code-block>`;
    const user = (i, text) => `
      <user-query class="ng-star-inserted"><span class="user-query-container right-align-content ng-star-inserted">
        <user-query-content class="user-query-container user-query-bubble-container ng-star-inserted"><div class="file-preview-container ng-star-inserted"></div>
          <div class="query-content ng-star-inserted" id="user-query-content-${i}">
            <span class="user-query-bubble-with-background ng-star-inserted"><span class="horizontal-container">
              <div role="heading" aria-level="2" class="query-text gds-body-l" dir="ltr"><span class="cdk-visually-hidden">You said</span>${text.split("\n").map((l) => `<p class="query-text-line ng-star-inserted">${esc(l)}</p>`).join("")}</div>
            </span></span>
          </div>
        </user-query-content>
        <div class="query-actions"><button mat-icon-button aria-label="Edit text"><mat-icon fonticon="edit" aria-hidden="true">edit</mat-icon></button></div>
      </span></user-query>`;
    const asst = (i, inner, think) => `
      <model-response class="ng-star-inserted"><div><response-container class="ng-tns-c2 reduced-bottom-padding ng-star-inserted"><div class="response-container ng-tns-c2 response-container-with-gpi">
        <div class="response-container-content ng-tns-c2">
          ${think ? `<model-thoughts class="ng-tns-c3 ng-star-inserted"><div class="model-thoughts ng-tns-c3"><div class="thoughts-header ng-tns-c3"><button class="thoughts-header-button mdc-button"><span class="mdc-button__label"><span class="thoughts-header-button-content"><span class="thoughts-header-button-label">Show thinking</span><mat-icon aria-hidden="true">expand_more</mat-icon></span></span></button></div><div class="thoughts-body ng-tns-c3"><div class="thoughts-content ng-tns-c3"><div class="markdown markdown-main-panel ng-tns-c3"><p>${esc(think)}</p></div></div></div></div></model-thoughts>` : ""}
          <div class="presented-response-container ng-tns-c2"><div class="response-content ng-tns-c2">
            <message-content id="message-content-id-r_${i}" class="model-response-text has-thoughts ng-star-inserted"><div id="model-response-message-contentr_${i}" class="markdown markdown-main-panel stronger enable-updated-hr-color" dir="ltr" aria-live="polite" aria-busy="false">${inner}</div></message-content>
          </div></div>
        </div>
        <div class="response-container-footer"><message-actions><div class="actions-container-v2"><button aria-label="Good response"><mat-icon aria-hidden="true">thumb_up</mat-icon></button><button aria-label="Redo"><mat-icon aria-hidden="true">refresh</mat-icon></button><button aria-label="Copy"><mat-icon aria-hidden="true">content_copy</mat-icon></button></div></message-actions></div>
      </div></response-container></div></model-response>`;
    const html = `
      <div id="chat-history" class="chat-history-scroll-container ng-tns-c4">
        <infinite-scroller class="chat-history ng-tns-c4">
          <div class="conversation-container message-actions-hover-boundary ng-star-inserted" id="c_1">${user(1, PROMPTS[0])}${asst(1, P1 + code("python", CODE_PY) + P1b)}</div>
          <div class="conversation-container message-actions-hover-boundary ng-star-inserted" id="c_2">${user(2, PROMPTS[1])}${asst(2, P2(gmath) + gmath(TEX_BLOCK, true) + `<table-block><div class="table-block-component"><div class="horizontal-scroll-wrapper"><div class="table-block has-export-sheets-button">${TABLE()}</div></div></div></table-block>`, THINK)}</div>
          <div class="conversation-container message-actions-hover-boundary ng-star-inserted" id="c_3">${user(3, PROMPTS[2])}${asst(3, P3 + code("markdown", CODE_MD) + LIST)}</div>
        </infinite-scroller>
      </div>
      <input-container class="input-gradient">
        <input-area-v2><div class="text-input-field ng-tns-c5">
          <rich-textarea class="text-input-field_textarea ql-container ql-bubble" enterkeyhint="send"><div class="ql-editor ql-blank textarea new-input-ui" data-gramm="false" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Enter a prompt here" data-placeholder="Ask Gemini"><p><br></p></div></rich-textarea>
          <bard-mode-switcher><button data-test-id="bard-mode-menu-button" class="input-area-switch">3.1 Pro</button></bard-mode-switcher>
          <button class="mdc-icon-button mat-mdc-icon-button send-button submit" aria-label="Send message" aria-disabled="false"><mat-icon fonticon="send" aria-hidden="true">send</mat-icon></button>
        </div></input-area-v2>
      </input-container>`;
    return { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app/8f3c2a1b0d9e7f65", title: "Gemini", html, thinking: true, send: "button.send-button" };
  }

  /* ---------------- DeepSeek ---------------- */

  function deepseek() {
    const code = (lang, c) => `<div class="md-code-block md-code-block-light"><div class="md-code-block-banner-wrap"><div class="md-code-block-banner md-code-block-banner-lite"><div class="_121d384"><div class="d2a24f03"><span class="d813de27">${lang}</span></div><div class="d2a24f03 _246a029"><div class="efa13877"><button role="button" aria-disabled="false" class="ds-atom-button ds-text-button ds-text-button--with-icon"><div class="ds-button__icon"><span class="ds-icon"><svg width="16" height="16"><path d="M0 0"></path></svg></span></div><span>Copy</span></button><button role="button" class="ds-atom-button ds-text-button"><span>Download</span></button></div></div></div></div></div><pre>${lang === "python" ? hl(c) : esc(c)}</pre></div>`;
    const md = (inner) => `<div class="ds-markdown ds-markdown--block" style="--ds-md-zoom: 1.143;">${inner.replace(/<p>/g, '<p class="ds-markdown-paragraph">')}</div>`;
    const user = (text) => `
      <div class="_9663006"><div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4" style="white-space: pre-wrap;">${esc(text)}</div></div>
        <div class="_78e0558"><div class="ds-icon-button _7436101" role="button" tabindex="0" aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg></div><div class="ds-icon-button" role="button" tabindex="0" aria-label="Edit"><svg width="16" height="16"><path d="M0 0"></path></svg></div></div>
      </div>`;
    const asst = (inner, think) => `
      <div class="_4f9bf79 d7dc56a8 _43c05b5"><div class="ds-message _63c77b1">
        ${think ? `<div class="_74c0879"><div class="_5255ff8 _4d41763"><div class="_2b6f7d8">Thought for 9 seconds</div><div class="ds-icon"><svg width="12" height="12"><path d="M0 0"></path></svg></div></div><div class="ds-think-content _767406f"><div class="ds-markdown ds-markdown--block"><p class="ds-markdown-paragraph">${esc(think)}</p></div></div></div>` : ""}
        ${md(inner)}
      </div>
      <div class="ds-flex _965abe9"><div class="ds-icon-button" role="button" tabindex="0" aria-label="Copy"><svg width="20" height="20"><path d="M0 0"></path></svg></div><div class="ds-icon-button" role="button" tabindex="0" aria-label="Regenerate"><svg width="20" height="20"><path d="M0 0"></path></svg></div></div>
      </div>`;
    const html = `
      <div class="_8f60047"><div class="dad65929">
        ${user(PROMPTS[0])}${asst(P1 + code("python", CODE_PY) + P1b)}
        ${user(PROMPTS[1])}${asst(P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="markdown-table-wrapper">', "</div>"), THINK)}
        ${user(PROMPTS[2])}${asst(P3 + code("markdown", CODE_MD) + LIST)}
      </div></div>
      <div class="_77cefa5" data-box="0,800,800,120">
        <textarea id="chat-input" class="_27c9245 ds-scroll-area" placeholder="Message DeepSeek" rows="2" data-box="20,810,700,60"></textarea>
        <div class="ec4f5d61" data-box="20,880,700,36">
          <div role="button" class="ds-atom-button ds-toggle-button" tabindex="0" data-box="20,880,140,32"><span>DeepThink</span></div>
          <div role="button" class="ds-atom-button ds-toggle-button" tabindex="0" data-box="170,880,100,32"><span>Search</span></div>
          <div class="bf38813a" data-box="660,880,90,36">
            <div class="f02f0e25" role="button" aria-label="Upload" data-box="660,882,32,32"><svg width="16" height="16"><path d="M0 0"></path></svg></div>
            <div role="button" aria-disabled="false" class="_7436101 bcc55ca1" data-box="712,840,34,34"><div class="_6f28693"><svg width="16" height="16"><path d="M0 0"></path></svg></div></div>
          </div>
        </div>
      </div>`;
    return { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/a/chat/s/2c1d0e9f-aaaa-bbbb-cccc-1234567890ab", title: "String Reversal and Sorting - DeepSeek", html, thinking: true, send: ".bcc55ca1" };
  }

  /* ---------------- Kimi ---------------- */

  function kimi() {
    const code = (lang, c) => `<div class="segment-code"><div class="segment-code-header"><span class="segment-code-lang">${lang}</span><div class="segment-code-header-action"><div class="simple-button size-small"><svg width="14" height="14"><path d="M0 0"></path></svg><span class="simple-button-text">Copy</span></div></div></div><div class="segment-code-content"><pre class="language-${lang}"><code class="language-${lang}">${lang === "python" ? hl(c) : esc(c)}</code></pre></div></div>`;
    const user = (text) => `
      <div class="chat-content-item chat-content-item-user">
        <div class="segment segment-user"><div class="segment-container">
          <div class="segment-content"><div class="segment-content-box"><div class="user-content" style="white-space: pre-wrap;">${esc(text)}</div></div></div>
          <div class="segment-user-actions"><div class="simple-button size-small" role="button"><span class="simple-button-text">Edit</span></div><div class="simple-button size-small" role="button"><span class="simple-button-text">Copy</span></div></div>
        </div></div>
      </div>`;
    const asst = (inner, think) => `
      <div class="chat-content-item chat-content-item-assistant">
        <div class="segment segment-assistant"><div class="segment-container">
          <div class="segment-content"><div class="segment-content-box">
            ${think ? `<div class="thinking-container"><div class="thinking-header"><span class="thinking-title">Thinking complete</span><svg width="12" height="12"><path d="M0 0"></path></svg></div><div class="thinking-content"><div class="markdown-container"><div class="markdown"><p>${esc(think)}</p></div></div></div></div>` : ""}
            <div class="markdown-container"><div class="markdown">${inner.replace(/<p>/g, '<div class="paragraph">').replace(/<\/p>/g, "</div>")}</div></div>
          </div></div>
          <div class="segment-assistant-actions"><div class="segment-assistant-actions-content"><div class="simple-button size-small" role="button"><span class="simple-button-text">Copy</span></div><div class="simple-button size-small" role="button"><span class="simple-button-text">Retry</span></div><div class="simple-button size-small" role="button"><span class="simple-button-text">Share</span></div></div></div>
        </div></div>
      </div>`;
    const html = `
      <div class="chat-detail-main"><div class="chat-content-container"><div class="chat-content-list">
        ${user(PROMPTS[0])}${asst(P1 + code("python", CODE_PY) + P1b)}
        ${user(PROMPTS[1])}${asst(P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="table-container"><div class="table-wrapper">', "</div></div>"), THINK)}
        ${user(PROMPTS[2])}${asst(P3 + code("markdown", CODE_MD) + LIST)}
      </div></div></div>
      <div class="chat-editor"><div class="chat-input">
        <div class="chat-input-editor-container"><div class="chat-input-editor" contenteditable="true" role="textbox" spellcheck="false" data-lexical-editor="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;"><p><br></p></div></div>
        <div class="chat-editor-action"><div class="left-area"><div class="toolkit-item"><span>Researcher</span></div></div><div class="right-area"><div class="send-button-container"><div class="send-button"><svg width="20" height="20"><path d="M0 0"></path></svg></div></div></div></div>
      </div></div>`;
    return { id: "kimi", label: "Kimi", url: "https://www.kimi.com/chat/d3f2e1c0-1111-2222-3333-444455556666", title: "String reversal and sorting - Kimi", html, thinking: true, send: ".send-button" };
  }

  /* ---------------- Qwen ---------------- */

  function qwen() {
    // CodeMirror 6: no <pre>, one .cm-line div per line, a gutter of
    // line numbers beside it — the case "innerText of the block" gets wrong.
    const code = (lang, c) => `<div class="qwen-markdown-code"><div class="qwen-markdown-code-header"><div class="qwen-markdown-code-header-lang">${lang}</div><div class="qwen-markdown-code-header-actions"><div class="qwen-markdown-code-header-action-item">Copy</div></div></div><div class="qwen-markdown-code-body"><div class="cm-editor ͼ1 ͼ2 ͼ4"><div class="cm-scroller"><div class="cm-gutters" aria-hidden="true"><div class="cm-gutter cm-lineNumbers">${c.split("\n").map((_, k) => `<div class="cm-gutterElement">${k + 1}</div>`).join("")}</div></div><div class="cm-content" role="textbox" aria-readonly="true" data-language="${lang}">${c.split("\n").map((l) => `<div class="cm-line">${l ? (lang === "python" ? hl(l) : esc(l)) : "<br>"}</div>`).join("")}</div></div></div></div></div>`;
    const md = (inner) => `<div class="qwen-markdown">${inner.replace(/<p>/g, '<div class="qwen-markdown-paragraph">').replace(/<\/p>/g, "</div>")}</div>`;
    const user = (text) => `
      <div class="qwen-chat-message qwen-chat-message-user"><div class="chat-user-message-container"><div class="chat-user-message"><div class="user-message-content" style="white-space: pre-wrap;">${esc(text)}</div></div>
        <div class="qwen-chat-package-comp-new-action-control"><div class="qwen-chat-package-comp-new-action-control-container"><div role="button" aria-label="Edit">Edit</div><div role="button" aria-label="Copy">Copy</div></div></div>
      </div></div>`;
    const asst = (inner, think) => `
      <div class="qwen-chat-message qwen-chat-message-assistant"><div class="chat-response-message"><div class="chat-response-message-container">
        ${think ? `<div class="qwen-chat-thinking-status-card"><div class="qwen-chat-thinking-status-card-header"><span class="qwen-chat-thinking-status-card-title">Thinking completed</span></div><div class="qwen-chat-thinking-content">${md(`<p>${esc(think)}</p>`)}</div></div>` : ""}
        <div class="response-message-content phase-answer">${md(inner)}</div>
        <div class="qwen-chat-package-comp-new-action-control"><div role="button" aria-label="Copy">Copy</div><div role="button" aria-label="Regenerate">Regenerate</div></div>
      </div></div></div>`;
    const html = `
      <div id="chat-messages-scroll-container" class="chat-messages"><div id="chat-message-container" class="chat-message-container">
        ${user(PROMPTS[0])}${asst(P1 + code("python", CODE_PY) + P1b)}
        ${user(PROMPTS[1])}${asst(P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="qwen-markdown-table">', "</div>"), THINK)}
        ${user(PROMPTS[2])}${asst(P3 + code("markdown", CODE_MD) + LIST)}
      </div></div>
      <div class="message-input-container"><div class="message-input-container-area">
        <textarea id="chat-input" class="message-input-textarea" placeholder="How can I help you today?" rows="1"></textarea>
        <div class="message-input-right-button"><button id="send-message-button" class="send-button" aria-label="Send"><svg width="20" height="20"><path d="M0 0"></path></svg></button></div>
      </div></div>`;
    return { id: "qwen", label: "Qwen", url: "https://chat.qwen.ai/c/5a4b3c2d-1e0f-4a5b-9c8d-7e6f5a4b3c2d", title: "String reversal and sorting - Qwen", html, thinking: true, send: "#send-message-button" };
  }

  /* ---------------- Grok ---------------- */

  function grok() {
    const code = (lang, c) => `<div class="not-prose"><div class="relative not-prose @container/code-block [&_div+div]:!mt-0 mt-3 mb-3 @md:-mx-4 @md:-me-4" data-testid="code-block"><div class="flex flex-row px-4 py-2 h-10 items-center rounded-t-xl bg-surface-l2 border border-border-l1"><span class="font-mono text-xs">${lang}</span></div><div class="sticky w-full right-2 z-10 top-24 print:hidden"><div class="absolute bottom-1 right-1 flex flex-row gap-0.5"><div class="flex flex-row gap-0.5" style="opacity: 1;"><button class="inline-flex items-center justify-center gap-2" type="button" aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg><span>Copy</span></button></div></div></div><div class="shiki not-prose relative bg-surface-l1 text-sm font-[450] text-primary [&_pre]:overflow-auto [&_pre]:!bg-transparent [&_pre]:px-[1em] [&_pre]:py-[1em] [&_pre]:rounded-b-xl" style="white-space: pre-wrap;"><pre class="shiki slack-ochin" tabindex="0"><code>${c.split("\n").map((l) => `<span class="line"><span style="color:#24292E">${lang === "python" ? hl(l) : esc(l)}</span></span>`).join("\n")}</code></pre></div></div></div>`;
    const user = (i, text) => `
      <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-end" id="response-u${i}">
        <div dir="auto" class="message-bubble relative rounded-3xl text-primary min-h-7 prose dark:prose-invert break-words prose-p:opacity-100 prose-strong:opacity-100 prose-li:opacity-100 prose-ul:opacity-100 prose-ol:opacity-100 prose-ul:my-1 prose-ol:my-1 prose-li:my-2 last:prose-li:mb-3 prose-li:ps-1 prose-li:ms-1 bg-surface-l1 border border-border-l1 max-w-[100%] sm:max-w-[90%] px-4 py-2.5 rounded-br-lg"><span class="whitespace-pre-wrap">${esc(text)}</span></div>
        <div class="flex items-center gap-[2px] w-max -mr-1 opacity-0 group-hover:opacity-100"><button aria-label="Edit"><svg width="16" height="16"><path d="M0 0"></path></svg></button><button aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg></button></div>
      </div>`;
    const asst = (i, inner) => `
      <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-start" id="response-a${i}">
        <div dir="auto" class="message-bubble relative rounded-3xl text-primary min-h-7 prose dark:prose-invert break-words prose-p:opacity-100 w-full max-w-none">
          <div class="response-content-markdown markdown [&_a:not(.not-prose)]:text-current [&_a:not(.not-prose):hover]:text-primary [&_a:not(.not-prose):hover]:decoration-primary [&_a:not(.not-prose)]:underline [&_a:not(.not-prose)]:decoration-[33%] [&_a:not(.not-prose)]:underline-offset-2 [&_a:not(.not-prose)]:decoration-secondary">${inner.replace(/<p>/g, '<p dir="auto" class="break-words" style="white-space: pre-wrap;">')}</div>
        </div>
        <div class="action-buttons flex flex-row items-center"><button aria-label="Regenerate"><svg width="16" height="16"><path d="M0 0"></path></svg></button><button aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg></button></div>
      </div>`;
    const html = `
      <main class="h-dvh flex-grow flex flex-col relative">
        <div class="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-gutter-stable flex flex-col items-center px-gutter">
          <div class="relative w-full flex flex-col items-center gap-3 pt-16 pb-48">
            ${user(1, PROMPTS[0])}${asst(1, P1 + code("python", CODE_PY) + P1b)}
            ${user(2, PROMPTS[1])}${asst(2, P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="overflow-x-auto">', "</div>"))}
            <div id="last-reply-container">${user(3, PROMPTS[2])}${asst(3, P3 + code("markdown", CODE_MD) + LIST)}</div>
          </div>
        </div>
        <div class="absolute bottom-0 mx-auto inset-x-0 max-w-[51rem] z-40"><form class="bottom-0 w-full text-base flex flex-col gap-2 items-center justify-center relative z-10">
          <div class="query-bar group bg-surface-l1 duration-100 relative w-full ring-1 ring-border-l1 overflow-hidden @container/input hover:ring-card-border-focus">
            <div class="relative z-10"><textarea dir="auto" aria-label="Ask Grok anything" class="w-full px-2 @[480px]/input:px-3 bg-transparent focus:outline-none text-primary align-bottom min-h-14 pt-5 my-0 mb-5" style="resize: none; height: 44px !important;"></textarea></div>
            <div class="flex gap-1.5 absolute inset-x-0 bottom-0 border-2 border-transparent p-2 @[480px]/input:p-3 max-w-full">
              <button class="group flex flex-col justify-center rounded-full" type="button" aria-label="Attach"><svg width="18" height="18"><path d="M0 0"></path></svg></button>
              <button type="submit" aria-label="Submit" class="group flex flex-col justify-center rounded-full focus:outline-none focus-visible:outline-none"><svg width="20" height="20"><path d="M0 0"></path></svg></button>
            </div>
          </div>
        </form></div>
      </main>`;
    return { id: "grok", label: "Grok", url: "https://grok.com/chat/7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918", title: "String Reversal and Sorting - Grok", html, thinking: false, send: "button[type='submit']" };
  }

  /* ---------------- GLM / Z.ai (Open WebUI lineage) ---------------- */

  function glm() {
    const code = (lang, c) => `<div class="relative my-2 flex flex-col rounded-lg" dir="ltr"><div class="code-header sticky top-0 z-10 flex items-center justify-between rounded-t-lg bg-[#f5f5f5] px-4 py-1.5 text-xs"><div class="p-1">${lang}</div><div class="flex items-center"><button class="copy-code-button bg-none border-none p-1">Copy</button></div></div><pre class="hljs p-4 px-5 overflow-x-auto" style="border-top-left-radius: 0px; border-top-right-radius: 0px;"><code class="language-${lang} rounded-t-none whitespace-pre text-sm">${lang === "python" ? hl(c) : esc(c)}</code></pre></div>`;
    const user = (i, text) => `
      <div class="flex flex-col justify-between px-5 mb-3 w-full max-w-5xl mx-auto rounded-lg group" id="message-u${i}">
        <div class="user-message flex justify-end w-full"><div class="flex w-full justify-end pb-1"><div class="rounded-3xl max-w-[90%] px-5 py-2 bg-gray-50 dark:bg-gray-850"><div class="prose dark:prose-invert"><p class="whitespace-pre-wrap">${esc(text)}</p></div></div></div></div>
        <div class="flex justify-end text-gray-600 dark:text-gray-500"><button class="invisible group-hover:visible p-1.5" aria-label="Edit"><svg width="16" height="16"><path d="M0 0"></path></svg></button><button class="invisible group-hover:visible p-1.5 copy-response-button" aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg></button></div>
      </div>`;
    const asst = (i, inner, think) => `
      <div class="flex flex-col justify-between px-5 mb-3 w-full max-w-5xl mx-auto rounded-lg group" id="message-a${i}">
        <div class="flex w-full message-a${i}"><div class="flex-auto w-0 pl-1"><div class="chat-assistant w-full min-w-full markdown-prose">
          <div id="response-content-container">
            ${think ? `<div class="thinking-chain-container"><div class="thinking-block"><button class="flex w-full items-center gap-2 text-sm text-gray-500"><div>Thought Process</div><svg width="12" height="12"><path d="M0 0"></path></svg></button><blockquote class="thinking-content"><p>${esc(think)}</p></blockquote></div></div>` : ""}
            <div class="markdown-prose">${inner}</div>
          </div>
        </div></div></div>
        <div class="flex justify-start overflow-x-auto buttons text-gray-600"><button class="copy-response-button" aria-label="Copy"><svg width="16" height="16"><path d="M0 0"></path></svg></button><button class="regenerate-response-button" aria-label="Regenerate"><svg width="16" height="16"><path d="M0 0"></path></svg></button></div>
      </div>`;
    const html = `
      <div id="messages-container" class="h-full w-full flex flex-col overflow-auto"><div class="w-full pt-2"><div class="w-full">
        ${user(1, PROMPTS[0])}${asst(1, P1 + code("python", CODE_PY) + P1b)}
        ${user(2, PROMPTS[1])}${asst(2, P2(katex) + katex(TEX_BLOCK, true) + TABLE('<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full">', "</div>"), THINK)}
        ${user(3, PROMPTS[2])}${asst(3, P3 + code("markdown", CODE_MD) + LIST)}
      </div></div></div>
      <form class="w-full flex gap-1.5"><div class="flex-1 flex flex-col relative w-full rounded-3xl px-1.5 bg-gray-50">
        <textarea id="chat-input" class="scrollbar-hidden bg-gray-50 dark:bg-gray-850 dark:text-gray-100 outline-none w-full py-3 px-1 rounded-xl resize-none h-[48px]" placeholder="Send a Message" rows="1"></textarea>
        <div class="flex justify-between mt-1.5 mb-2.5 mx-0.5 max-w-full">
          <button id="model-selector-0-button" aria-haspopup="menu">GLM-5.2</button>
          <button type="button" class="deepthink-btn" aria-pressed="true">Deep Think</button>
          <button id="send-message-button" class="bg-black text-white transition rounded-full p-1.5 self-center" type="submit"><svg width="16" height="16"><path d="M0 0"></path></svg></button>
        </div>
      </div></form>`;
    return { id: "glm", label: "GLM", url: "https://chat.z.ai/c/9d8c7b6a-5f4e-4d3c-2b1a-0f9e8d7c6b5a", title: "String reversal and sorting | Z.ai Chat", html, thinking: true, send: "#send-message-button" };
  }

  /* ---------------- Outlier Playground ---------------- */

  function outlier() {
    const code = (lang, c) => `<pre><code class="language-${lang}">${lang === "python" ? hl(c) : esc(c)}</code></pre>`;
    const user = (i, text) => `
      <div class="flex flex-col" data-testid="prompt-message" data-has-images="false">
        <div class="rounded-xl ml-auto py-2 px-4 max-w-[75%] bg-neutral-3" data-box="410,${i * 300},380,60">
          <div class="overflow-x-auto prose prose-sm dark:prose-invert max-w-full whitespace-pre-wrap" data-testid="prompt-message-markdown">${esc(text)}</div>
        </div>
      </div>`;
    const asst = (i, inner) => `
      <div class="flex flex-col w-full">
        <div class="prose prose-sm dark:prose-invert max-w-full" data-box="0,${i * 300 + 80},790,200">${inner}</div>
        <div class="flex gap-1 ml-auto"><button aria-label="Copy">Copy</button><button>Retry</button></div>
      </div>`;
    const html = `
      <main><div class="flex flex-col gap-6 px-4" data-box="0,0,800,1300">
        ${user(0, PROMPTS[0])}${asst(0, P1 + code("python", CODE_PY) + P1b)}
        ${user(1, PROMPTS[1])}${asst(1, P2(katex) + katex(TEX_BLOCK, true) + TABLE())}
        ${user(2, PROMPTS[2])}${asst(2, P3 + code("markdown", CODE_MD) + LIST)}
      </div>
      <div class="sticky bottom-0"><textarea placeholder="Type a message" data-box="0,1320,700,60"></textarea><button type="button" data-box="710,1330,80,40">Send</button></div></main>`;
    return { id: "outlier", label: "Outlier Playground", url: "https://playground.outlier.ai/conversation/abc123", title: "Outlier Playground", html, thinking: false, send: "main .sticky button" };
  }

  /* ---------------- Mercado Libre search results ---------------- */

  const amount = (frac, cents) => `<span class="andes-money-amount andes-money-amount--cents-superscript" style="font-size:24px" role="img" aria-label="${frac} pesos${cents ? ` con ${cents} centavos` : ""}" aria-roledescription="Precio"><span class="andes-money-amount__currency-symbol" aria-hidden="true">$</span><span class="andes-money-amount__fraction" aria-hidden="true">${frac}</span>${cents ? `<span class="andes-money-amount__cents andes-money-amount__cents--superscript-24" style="font-size:12px;margin-top:2px" aria-hidden="true">${cents}</span>` : ""}</span>`;

  function polyCard(r) {
    const href = r.ads
      ? `https://click1.mercadolibre.com.ar/mclics/clicks/external/MLA/count?a=${encodeURIComponent(`https://articulo.mercadolibre.com.ar/MLA-${r.id}-x-_JM`)}&b=telemetry`
      : `https://articulo.mercadolibre.com.ar/MLA-${r.id}-${r.title.toLowerCase().replace(/\s+/g, "-")}-_JM#polycard_client=search-nordic&position=${r.pos}`;
    return `
      <li class="ui-search-layout__item">
        <div class="poly-card poly-card--list poly-card--large"><div class="poly-card__portada"><img decoding="async" class="poly-component__picture" src="https://http2.mlstatic.com/D_Q_NP_${r.id}-O.webp" alt="${attr(r.title)}"></div>
        <div class="poly-card__content">
          ${r.badge ? `<span class="poly-component__highlight">${r.badge}</span>` : ""}
          ${r.ads ? `<span class="poly-component__ads-promotions">Patrocinado</span>` : ""}
          <h3 class="poly-component__title-wrapper"><a href="${attr(href)}" class="poly-component__title" target="_self">${esc(r.title)}</a></h3>
          ${r.seller ? `<span class="poly-component__seller">Por ${esc(r.seller)}</span>` : ""}
          ${r.rating ? `<div class="poly-component__reviews"><span class="poly-reviews__rating">${r.rating}</span><span class="poly-reviews__total">(${r.count})</span></div>` : ""}
          <div class="poly-component__price">
            ${r.prev ? `<s class="andes-money-amount andes-money-amount--previous andes-money-amount--cents-comma" role="img" aria-label="Antes: ${r.prev} pesos"><span class="andes-money-amount__currency-symbol" aria-hidden="true">$</span><span class="andes-money-amount__fraction" aria-hidden="true">${r.prev}</span></s>` : ""}
            <div class="poly-price__current">${amount(r.price, r.cents)}${r.disc ? `<span class="andes-money-amount__discount">${r.disc}% OFF</span>` : ""}</div>
            ${r.cuotas ? `<span class="poly-price__installments">Mismo precio en ${r.cuotas} cuotas de ${amount(r.cuota, r.cuotaCents)}</span>` : ""}
          </div>
          ${r.ship ? `<div class="poly-component__shipping">${r.ship}</div>` : ""}
        </div></div>
      </li>`;
  }

  const ML_RESULTS = [
    { pos: 1, id: "1507831299", title: "Pack X6 Toallas Faciales Microfibra Suaves", price: "12.999", cents: "32", prev: "19.999", disc: "35", cuotas: 6, cuota: "2.166", cuotaCents: "55", ship: "Envío gratis", seller: "Casa Bella", rating: "4.7", count: "128", badge: "MÁS VENDIDO" },
    { pos: 2, id: "1422093317", title: "Toallas Faciales Microfibra X3 Premium", price: "8.450", ship: "Llega gratis mañana", seller: "Tienda Sol", rating: "4.2", count: "31", ads: true },
    { pos: 3, id: "1388412093", title: "Set 12 Toallitas Desmaquillantes Reutilizables", price: "21.300", cuotas: 3, cuota: "7.100", ship: "Envío gratis" },
    { pos: 4, id: "1290017744", title: "Toalla Turbante Secado Rápido Microfibra", price: "5.799", rating: "4.5", count: "2304" },
  ];

  function mercadolibre() {
    const html = `
      <header class="nav-header"><form class="nav-search" action="https://listado.mercadolibre.com.ar/"><input class="nav-search-input" name="as_word" value="pack toallas faciales microfibra"></form></header>
      <main id="root-app"><div class="ui-search-main ui-search-main--only-products">
        <aside class="ui-search-sidebar">
          <div class="ui-search-breadcrumb"><h1 class="ui-search-breadcrumb__title">Pack Toallas Faciales Microfibra</h1></div>
          <span class="ui-search-search-result__quantity-results">1.204 resultados</span>
          <section class="ui-search-filter-groups"><div class="ui-search-filter-dl"><h3 class="ui-search-filter-dt-title">Envío</h3><ul><li><a href="https://listado.mercadolibre.com.ar/toallas_CostoEnvio_Gratis">Gratis <span>(812)</span></a></li></ul></div></section>
        </aside>
        <section class="ui-search-results ui-search-results--without-disclaimer">
          <div class="ui-search-view-options"><div class="ui-search-sort-filter"><span class="ui-search-sort-filter__label">Ordenar por</span><button class="andes-dropdown__trigger"><span class="andes-dropdown__display-values">Más relevantes</span></button></div></div>
          <div class="ui-search-carousel"><div class="poly-card poly-card--carousel"><a class="poly-component__title" href="https://articulo.mercadolibre.com.ar/MLA-1507831299-pack-x6-toallas-faciales-microfibra-suaves-_JM">Pack X6 Toallas Faciales Microfibra Suaves</a><div class="poly-price__current">${amount("12.999", "32")}</div></div></div>
          <ol class="ui-search-layout ui-search-layout--stack shops__layout">${ML_RESULTS.map(polyCard).join("")}</ol>
          <nav class="ui-search-pagination"><ul class="andes-pagination"><li class="andes-pagination__button andes-pagination__button--current"><a href="#">1</a></li><li class="andes-pagination__button"><a href="https://listado.mercadolibre.com.ar/toallas_Desde_51">2</a></li></ul></nav>
        </section>
      </div></main>
      <footer class="nav-footer"><a href="https://www.mercadolibre.com.ar/ayuda">Ayuda</a></footer>`;
    return {
      id: "mercadolibre", label: "Mercado Libre (search)", url: "https://listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra#D[A:Pack%20Toallas%20Faciales%20Microfibra]",
      title: "Pack Toallas Faciales Microfibra | MercadoLibre", html, ecommerce: true, results: ML_RESULTS,
    };
  }

  const chats = [chatgpt(), claude(), gemini(), deepseek(), kimi(), qwen(), grok(), glm(), outlier()];
  const all = [...chats, mercadolibre()];

  // What every chat fixture must export. Strings are exact substrings of
  // the assistant turn's Markdown (or of the user prompt).
  const EXPECT = {
    roles: "user,assistant,user,assistant,user,assistant",
    prompts: PROMPTS,
    code: [
      { turn: 1, lang: "python", text: CODE_PY },
      { turn: 5, lang: "markdown", text: CODE_MD },
    ],
    nestedFence: "````markdown\n" + CODE_MD + "\n````",
    mathInline: "$" + TEX_INLINE + "$",
    mathBlock: "$$\n" + TEX_BLOCK + "\n$$",
    table: [
      "| Algorithm | Average | Stable |",
      "| --- | --- | :---: |",
      "| Merge sort | `O(n log n)` | Yes |",
      "| Quicksort | `O(n log n)` | No |",
      "| Bubble sort | `O(n^2)` | Yes |",
    ].join("\n"),
    list: "- Run `npm install` once.\n- Then run the tests.",
    think: THINK,
    inlineCode: "`[::-1]`",
  };

  return { chats, all, byId: Object.fromEntries(all.map((f) => [f.id, f])), EXPECT, PROMPTS };
});
