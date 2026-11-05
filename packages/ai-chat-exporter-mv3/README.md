# Chat Replay

Capture the prompts you sent in one AI chat, then replay them one by one in a
fresh chat — on a different model — while the extension patiently waits for
each reply to finish before sending the next.

On Mercado Libre it lifts a listing — or a whole page of search
results — out of the page and into one pasteable document.

It also **exports any conversation as clean Markdown** — clearly split into
your turns and the model's — so a whole back-and-forth can drop straight into
a project workspace as context for another AI.

Currently wired for **Gemini**, **GLM** (chat.z.ai / chatglm.cn), **ChatGPT**,
**Claude**, **Kimi**, **DeepSeek**, **Qwen**, **Grok** and **Outlier
Playground** (app.outlier.ai / playground.outlier.ai). Any other site falls
back to generic heuristics — and if those aren't enough, **Teach this site**
(below) fixes it without a code change.

---

## New in v0.9 — exports that survive math, code chrome and reasoning panels

**[▶ Adapter playground](docs/index.html)** runs the extension's real
`adapters.js` and `md.js` in your browser. Pick a platform fixture, or paste
a chat page's HTML, and watch the turn split, the Markdown export and the
prompt-replay queue update live. It is a static file. Open it from a checkout
or from GitHub Pages; nothing leaves the browser.

What changed in the export:

- **Math round-trips as TeX.** KaTeX (ChatGPT, Claude, DeepSeek, Kimi, Qwen,
  Grok, GLM) paints each formula twice: a MathML copy and an `aria-hidden`
  HTML copy. The old walker read the MathML text, so `x^2` came out as
  `x2x^2`. The TeX source is now read from KaTeX's `<annotation>`, Gemini's
  `data-math`, or MathJax's `alttext`, and written as `$…$` / `$$…$$`.
- **Code blocks keep their language.** The language label usually sits
  outside `<code>`: Gemini's header bar, DeepSeek's banner, ChatGPT's sticky
  header, the Grok, Kimi and Qwen headers. It is now read from there and no
  longer leaks into the export as a stray `python` line above the block.
  Highlighters that render one `<div>` per line (CodeMirror on Qwen) keep
  their newlines. Line-number gutters are dropped. A sample that itself
  contains ```` ``` ```` fences gets a longer outer fence.
- **Reasoning panels become a foldout.** "Thought for 9 seconds" panels
  (Gemini `<model-thoughts>`, DeepSeek, Kimi, Qwen, GLM) export as
  `<details><summary>…</summary>` ahead of the answer. You can also quote
  or drop them (`thinking: "inline" | "drop"`). DeepSeek uses `.ds-markdown`
  for both reasoning and answer, so the heuristic used to split one reply
  into two turns and label the reasoning "user". The adapter now anchors
  on `.ds-message`.
- **Prompts keep their line breaks** in the Markdown, and a typed `## ` line
  is escaped so it can't pose as a turn boundary. Replay sends Gemini
  prompts line for line, without a blank line between each one.
- **Tables:** a nested table no longer leaks its rows into the outer one.
  Cells keep `<br>`, `colspan` pads correctly, and alignment is read from
  the column header.
- **Grok** roles come from each row's alignment, not from strict
  alternation, so one missing bubble no longer flips every role after it.
  The **Kimi** send click now goes to the inner `.send-button`; a click on
  its wrapper never reached the handler.

Two new export options, under **Export** in the popup:

- **drop duplicate turns** (on by default). Duplicates are removed
  deterministically: the same turn read twice in a row, a streaming snapshot
  followed by the finished turn (the longer one is kept), and a whole
  exchange that a virtualised list rendered twice. A prompt asked twice
  with *different* answers is kept.
- **redact emails, keys, tokens, cards & phones** (off by default). This
  covers emails; OpenAI, Anthropic, AWS, Google and Stripe keys; GitHub and
  Slack tokens; JWTs; bearer tokens; `password=`-style values; PEM private
  keys; Luhn-checked card numbers; mod-97-checked IBANs; US SSNs; and
  international phone numbers. Each distinct value gets a stable
  placeholder, so `[EMAIL_1]` means the same address in every turn. The
  count is written to the front matter (`redacted: 3`).

`md.js` → `ChatReplayMd.prepare(turns, { dedupe, redact })` is the single
step between harvesting and any export builder.

---

## New in v0.8 — the search page, not just the listing

Adding products one listing at a time solved the wrong half of the
problem. The page you're actually on while shopping is
`listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra` — fifty
candidates, and the question you want to ask is exactly the one you
can't ask from a single listing: *which of these is worth opening?*

So the popup now reads a results page too. **Add all 50 results to the
list** is one click, and the paste that comes out is a table:

```markdown
# Búsqueda: "Pack Toallas Faciales Microfibra" — 50 resultados

- URL: https://listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra
- Total en la búsqueda: 1.204 resultados
- Orden: Más relevantes
- Patrocinados: 6 de 50 (son anuncios, no ranking)

| # | Producto | Precio | Antes | Cuotas | Envío | Calif. | Vendidos | Vendedor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Pack X6 Toallas Faciales Microfibra](https://…) | $12.999,32 | $19.999 35% OFF | 6x $2.166 s/int | Gratis | 4.7 (128) | +50 vendidos | Casa Bella |
```

A table rather than fifty blocks, because the question is a comparison
and a comparison wants its numbers in columns. Untick **compact table**
if you'd rather have a block per result; **Keep the first #** decides
how many rows get pasted (the read grabs the whole page either way, so
changing the number re-renders instantly and never re-touches the page).

Three details that aren't obvious:

- **The query travels with the results.** Fifty rows of towels with no
  stated criterion make the model guess what you were after. The
  heading carries the search terms, the sort order and any filters you
  applied — pulled from the page, or from the `#D[A:…]` fragment in
  the URL when the heading isn't there.
- **Sponsored rows are labelled.** Six of the first fifty results are
  ads, and a model told "these are the top results" will happily
  explain why the ad ranked first. They're marked `patr.` in the row
  and counted in the header.
- **Prices are rebuilt, not read.** Same trap as on a listing, fifty
  times over: `.andes-money-amount` puts the cents in a superscript, so
  `textContent` turns $12.999,32 into `$12.99932` — a 33-peso
  difference read as 33,000.

Adding a search saves **one** entry holding its results, so a list can
mix "these three listings I opened" with "and this whole page of
results", and `Copy list` still produces one document. Re-adding the
same search replaces it; the same search *sorted differently* is a
different URL and therefore a different entry, which is what you want
when you're comparing "cheapest first" against "most relevant".

### Clearing the list

Nothing in a browser can tell the extension you pasted — the clipboard
is write-only from an extension and the paste lands in a page it isn't
in. So the handover gets marked at the last moment that *is* visible:

- **Clear list** is now always there and always enabled when there's
  something to clear, instead of appearing and disappearing;
- right after a successful copy it lights up and says **"you've copied
  it"**, so the next step is the obvious one rather than a button you
  have to remember exists;
- and there's an opt-in **empty the list as soon as it's copied**, for
  when the copy really is the end of the trip.

That last one only fires on a clipboard write that actually
succeeded. A refused write leaves the list untouched and drops the text
into the manual-copy box — clearing on a failed copy would throw away
a shopping trip that no longer exists anywhere.

### How it reads a page it's never seen

`search.js` tries three things in order: the current `poly-card`
markup, the older `ui-search-*` markup, and then a **structural** pass
that knows no class names at all — an anchor whose href carries an item
id (`MLA-123…`, `/p/MLA123…`) plus a price element above it is a result
card, whatever ML is calling that div this year. The tests assert the
same page twice, once with real class names and once with deliberately
scrambled ones, because the failure this guards against only shows up
in the field.

It also has to *refuse*. A product page is full of
anchors-with-prices — the "Productos relacionados" carousels — so if
the search reader ran there it would replace a good listing extraction
with a table of the carousel. It checks for the PDP container first and
declines; `product.js` asks it before it treats a page as a listing,
which also means a results page never pays for the
"Ver todas las características" expander.

---

## New in v0.7 — collect five listings, paste once

Copying one product at a time meant a round trip to the LLM per
product: copy, switch tabs, paste, switch back, find the next listing.
Five products is five of those, and four interruptions to whatever you
were actually asking.

So the primary button is now **Add to list**. Browse, add, browse, add.
When you're done, **Copy list** once — and a single Ctrl+V drops all of
them into the chat. *Copy just this one* is still there for when it
really is one product.

### The list is in storage, not in the popup

It has to be. A popup is destroyed the moment it loses focus, so a list
held in that document would be gone before you opened the next listing.
Storage also buys two things worth having:

- it survives the browser restarting;
- it can be copied from a tab that has **no listing in it** — which is
  exactly where you are when you paste.

That last one is why the **Product** tab now also appears on chat sites
whenever the list isn't empty. Walking to claude.ai with five products
saved and no copy taken used to be a dead end: the popup there would
show the chat tabs and no way to reach them. Now the pane appears in
list-only mode — the list, Copy and Clear, with everything that needs a
page hidden. It won't steal focus from a replay in progress, though; if
that tab is mid-run, the tab appears but doesn't open itself.

The toolbar badge shows the count. It's set globally rather than
per-tab, so it follows you to the chat; a replay's per-tab `▶` still
wins on its own tab. One consequence worth knowing: the worker used to
blank a tab's badge on navigation to clear a stale `▶`, which would
also have wiped the count every time you opened the next listing — it
now repaints the count instead of blanking.

### What the paste looks like

Just enough Markdown to keep the products apart, and no more:

```markdown
# 3 productos de Mercado Libre

## 1. Juego De Sabanas 180 Hilos Gris oscuro

- Precio: $28.999
...
### Características
#### Composición
- Cantidad de hilos: 180

## 2. Sabanas Fieldcrest Cannon 144 Hilos
...
```

A numbered `##` heading per item, and everything inside it pushed one
level down so those headings stay the only boundaries in the file. No
table of contents, no repeated preamble, no per-item metadata block —
the number is the whole separator, and it means "the third one" refers
to the same product in the popup and in the chat.

**Weight is controlled by the include toggles**, which apply to the list
as well as to a single product. Five listings with the spec sheet and
description off is five short blocks; with everything on it's a
comparison table's worth of detail. Same four checkboxes either way.

Adding a listing you've already added **updates** it rather than
duplicating it — you'll often reopen one to switch the colour before
adding, and the picker value is exactly the thing that changed.

### Formatting moved out of the content script

`product-format.js` is new, and both documents load it: the injected
script renders the preview with it, and the popup renders the list with
it. It had to move — the popup formats the list on a tab where no
content script exists.

---

## New in v0.6 — lifting a Mercado Libre listing out of the page

The other half of the same problem the export solves: getting real
context into a model that can't browse. Open a listing, click the
toolbar icon, and take the product with you. (v0.7 replaced the single
copy button with a list — see above.)

### Why select-all doesn't work

A listing page is maybe 5% product. Selecting the whole thing gets you
the site nav, "También puede interesarte", *Productos relacionados*
(fifty cards), *Productos de Amarelo* (twenty more), *Quienes vieron
este producto también compraron*, the category footer and the corporate
links — and the product itself is scattered across five separate
sections in the middle of that, so copying it by hand means five
selections and five pastes.

### So it doesn't filter — it collects

The extractor never sees a whole-page grab. It reaches for the blocks
that *are* the product, by name, and everything else is excluded by
construction rather than by a rule that has to anticipate it:

| Block | What comes out |
| --- | --- |
| header | title, condition, units sold, best-seller rank, rating |
| price | amount, previous amount, discount, instalments, tax-free price |
| variations | **which** colour and size you're looking at, plus the others |
| highlights | *Lo que tenés que saber de este producto* |
| specs | the full *Características* table, grouped |
| description | the seller's description |
| buybox | delivery estimate, stock, purchase cap |
| seller | name, official-store flag, sales volume, reputation |
| guarantees | returns window, factory warranty, buyer protection |
| reviews | opt-in: the AI summary plus a few top comments |

A new promo strip or carousel appearing on the page can't leak in,
because nothing collects it.

**The variant matters most.** A listing sells eleven colours and three
mattress sizes from one page; the title only names the one you're on.
Ask a model "will this fit my bed?" and it needs to know the picker
says *1 1/2 plaza*, not that sizes exist.

### The spec sheet isn't in the page until you ask for it

*Ver todas las características* is not a CSS toggle — the remaining
attributes are fetched when you click. On the sheets listing that's the
difference between six attributes and thirty. So **open "Ver todas las
características" first** is on by default: the extractor clicks the
expanders, waits, reads, and closes the modal behind itself. Turn it off
if you'd rather it not touch the page.

### Output

**Markdown** by default, **Plain text** for chat boxes that render
hashes and asterisks literally, and **JSON** for anything programmatic.
Four toggles decide what's included — specs, description, logistics and
seller, reviews (off by default; the comments are the noisiest part).
The preview pane is there so you can confirm nothing from a carousel got
in before you paste.

Prices are rebuilt from their parts rather than read as text.
`.andes-money-amount` puts the cents in a superscript element, so
`textContent` returns `$10.99932` — the extractor renders `$10.999,32`.

### How it's wired

`product.js` is **not** in `content_scripts`. The popup injects it —
with `product-format.js` and, since v0.8, `search.js` — using
`activeTab` + `scripting` when you open it on a Mercado Libre host, the
same on-demand path v0.5 already used for the chat engine — so it costs
nothing on the thousands of ML pages that aren't listings, and needs no
new permissions.

On an ML tab the popup switches into product mode: the chat tabs are
hidden (Replay can't do anything on a shopping page), there's no state
polling, and no engine runs. Its messages use `crp:` where the chat
engine uses `cr:`, so if both scripts ever end up in one tab they ignore
each other's traffic.

Works on every ML domain — `.com.ar`, `.com.mx`, `.cl`, `.com.co` and
`mercadolivre.com.br` all share the `ui-pdp-*` layout. Labels in the
output are Spanish, matching the source.

ML renames its classes every few months, so every read runs through a
list of candidate selectors ending in a structural fallback, and the
page's JSON-LD `Product` block backfills title, price, rating and
description if the DOM read comes up empty. A section that can't be
found is omitted, never guessed at. If a listing comes out thin, **Fix →
Copy diagnostics** still works on chat sites; here, the preview pane is
the tell.

---

## New in v0.5.1 — keeping several chats in step

The workflow this is for: you're running the same conversation in three
chats, you push ahead in one of them by four prompts, and now you want the
other two caught up to the same point — without babysitting them one at a
time.

### Send a range, not always everything

**Replay** now has **From #** and **To #**, plus one-tap chips: *All ·
Last 1 · Last 2 · Last 3 · Last 4 · Last 5*.

Capture the whole conversation as usual, tap **Last 4**, then walk to your
other two chats and just hit **▶ Replay here** in each. The range lives in
shared storage, so it's already set when you get there — the second and
third chats are one click each.

The range replaced the old **Start at #** rather than sitting beside it,
because they were the same idea: its lower bound *is* where a replay
starts. One set of numbers, no chance of the two disagreeing.

Changing the loaded prompts — a fresh capture, an edit, loading a library
set, or a launched parallel run — resets the range to everything. A "last
3" left over from an earlier set would otherwise silently drop the opening
prompts of the next one.

### Resume is per tab

When a run halts you get a **Resume from #** button in that tab. It is
deliberately *not* written to the shared range: with three tabs replaying
the same prompts, persisting one tab's halt point would move where the
other two start and silently skip prompts in chats that were running fine.

### Replays actually run in the background now

They were always independent — each tab has its own content script with
its own state, so two replays never shared anything. But **Chrome
throttles timers in a hidden tab**: to once a second after ten seconds,
and to once a *minute* after five minutes hidden. The poll that decides
"the model has finished" runs every 500ms, so a backgrounded replay was
waking roughly once a minute and sitting idle for most of it after every
reply.

Timers can't be un-throttled. Messages aren't throttled at all — a
`chrome.tabs.sendMessage` reaches a hidden tab immediately — so:

- the waits inside the replay loop resolve on **either** their own timer
  **or** a wake ping, whichever lands first;
- the service worker pings every replaying tab every three seconds;
- each running tab re-announces itself every few seconds, which both
  revives the worker (MV3 kills it when idle) and re-registers the tab, so
  the arrangement rebuilds itself with nothing persisted. A tab that
  finished, crashed or navigated away simply stops announcing and ages
  out.

One deliberate exception: the pause between send attempts still burns real
time. Waking that one early would let `sendVerified` check "did it leave?"
too soon, decide it hadn't, and escalate to a second send method — which
is how you get the same prompt posted twice.

### Seeing the tabs you aren't looking at

Since the point is that you're elsewhere, the popup header lists any other
tabs mid-replay. Click one to jump to it. The badge on the toolbar icon
still shows `▶` per tab.

---

## New in v0.5 — the interface moved to the toolbar

The old floating panel is gone. Two problems killed it:

1. The `⏵⏵` button sat on top of the page and got in the way of the site's
   own controls.
2. The panel grew with its content. Six stacked `<details>` blocks, a
   prompt editor and a library list have no upper bound, so on a laptop it
   ran off the bottom of the viewport and the only fix was zooming the
   whole page out.

A popup can't do either. It's anchored to the toolbar, so it never covers
anything, and Chrome caps it at 800x600 — so v0.5 pins it at 384x548 and
scrolls internally. It cannot outgrow the screen.

### What that changed underneath

The panel wasn't just a view; the engine *read state off it* —
`document.querySelector("#cr-startat")`, the deep-scan checkbox, and an
auto-run countdown that attached click listeners to the ▶ and Stop
buttons. None of that can survive in a popup, because **Chrome destroys a
popup the moment it loses focus**.

So the engine went headless. It still lives in the content script, where
it always did, but the `ui` object it talks through now records facts in a
plain state object instead of painting widgets. The popup asks for a
snapshot, draws it, and forgets. The replay loop never waits on the popup
for anything, because there may not be one.

The practical upshot: **closing the popup no longer stops anything.** A
replay keeps running while you work in another tab. The toolbar badge
shows `▶` while it does.

### Smaller consequences worth knowing

- **The clipboard fix got simpler.** v0.4.2 fought browser *user
  activation*: the deep scan ran first, took tens of seconds, and by the
  time there was markdown to write the click had stopped counting as a
  gesture. Now the content script hands the markdown back and the **popup**
  writes it — an extension document holding `clipboardWrite`, with no scan
  standing between the click and the clipboard. The "Copy now" fallback is
  still there; it should rarely appear. Markdown built during a scan is
  also retained, so a popup you closed mid-scan can collect it on reopen
  instead of rescanning.
- **The `LOAD-BEARING INVARIANT` is retired.** The panel had to be parented
  outside `<body>` so its own twice-a-second status updates didn't register
  as page activity and hold "quiet" hostage forever. With no panel in the
  page, that hazard is gone.
- **On-demand injection.** Reloading the extension used to orphan every
  open chat tab until you reloaded each one. The popup now injects the
  content script itself if it's missing (`activeTab` + `scripting`).
- **The library moved out of the content script entirely.** It's storage
  plus one message to the service worker — no page access needed — which
  deleted about ninety lines from `content.js`.
- **`Start at #` survives a closed popup.** The resume point is persisted
  when a run halts, so it's waiting for you whenever you next open the
  popup rather than being written into a field that no longer exists.

---

## Exporting a conversation (v0.4)

The **Export this conversation** block turns whatever chat you're looking at
into a file built to be read by another model.

| Button | What you get |
| --- | --- |
| **Copy as Markdown** | The whole transcript on your clipboard. |
| **.md** | Same thing as a downloaded file. |
| **Download .json** | One object per turn — for scripts and agents. |
| **Download .txt** | Plain, no formatting. |
| **Scan chat** | Counts turns without exporting, so you can sanity-check. |

Leave **"scroll the whole chat first"** ticked. These sites only keep the
turns near your viewport in the page; without the scroll pass a long chat
exports as just its tail. With it ticked the extension walks the conversation
from the top and collects everything, then puts you back where you were.

### What the Markdown looks like

```markdown
---
source: chatgpt.com
assistant: ChatGPT
model: GPT-5.6 Thinking
title: "Owl & Dragon — pilot"
exported: 2026-07-27T22:10:04.881Z
turns: 24
---

# Conversation — ChatGPT · GPT-5.6 Thinking

> **How to read this file.** ...

## ▸ USER — turn 1
<!-- role="user" turn="1" source="chatgpt.com" -->

How should the pilot open?

---

## ▸ ASSISTANT — turn 1
<!-- role="assistant" turn="1" source="chatgpt.com" model="GPT-5.6 Thinking" -->

Three options...
```

Three things make it safe to feed to an agent:

- **Turn boundaries can't be faked.** Headings written *inside* a message get
  demoted (h1 → h3), so every `## ` line in the file is a real turn marker.
- **Machine-readable comments** carry role, turn number, source and model, in
  case whatever reads it prefers structure over prose.
- **Real Markdown, not flattened text.** Code blocks keep their fences and
  language, lists keep their bullets, tables stay tables, links keep their
  URLs — and the site's own "Copy code / Edit / Retry" button labels are
  stripped instead of ending up as words the model appears to have said.

Turn numbering is shared: a USER turn and the ASSISTANT reply that follows it
are both "turn 7", so that phrase means the same thing in every file you
export regardless of which site it came from.

---

## Fixed in v0.4.2

**Outlier Playground exported conversations with no human in them.** Every
one of 13 turns came back tagged `assistant`, `capturedCount` was 0, and the
Markdown had thirteen `## ▸ ASSISTANT` headings in a row. The cause was a
bail-out inside `heuristicTurns()`: when the rendered-markdown blocks don't
all share a single parent, it gave up on roles and labelled *everything*
assistant. On Outlier that fired for the whole conversation.

Three changes, in increasing order of generality:

1. **A real Outlier adapter.** The app does tag your side —
   `data-testid="prompt-message"` — so the adapter anchors on that and
   derives the model's turns as *the other message blocks in the same list*.
   That deliberately avoids hardcoding a testid for the assistant side,
   which is the part most likely to be renamed.
2. **A generic `data-testid` strategy**, tried before the class and
   heuristic passes. `prompt-message` / `response-message` hooks are common
   across React apps, and they're far more reliable than guessing at
   Tailwind classes. When testids name only *one* side, the unnamed blocks
   are taken as the other side by elimination.
3. **Roles are inferred from layout when markup says nothing.** Chat UIs
   right-align the human and run the model full width; Tailwind can hide the
   semantics but not the geometry. The measurement uses a `Range` over the
   turn's contents, which reports where the text is actually painted — so a
   full-width wrapper around a right-aligned bubble still measures as the
   bubble. Nothing is blanket-labelled `assistant` any more: a single-role
   result from any inferring strategy is re-checked against the layout.

**Copy as Markdown silently lost the transcript.** Not a clipboard-API
problem — a **user-activation** one. Copy runs the deep scan *first*, which
scrolls the whole chat and takes tens of seconds; transient activation
expires after about five, and programmatic scrolling doesn't renew it. So
the browser refused the write, the fallback (a textarea parented to `<html>`,
where selection doesn't reliably work) refused too, and the code answered
"Clipboard blocked by the page" and discarded a transcript it had already
built. Now:

- harvests are **cached** for two minutes, so a second click returns
  instantly and still holds its gesture;
- the fallback textarea lives inside `<body>` and sets its data from a
  `copy` listener;
- and if the browser still says no, the markdown is **kept** and the panel
  offers a **Copy now** button — a click that *is* a fresh gesture, so it
  can't be refused for activation. The text is also selected in the box, so
  ⌘/Ctrl+C always works as a last resort.

**Also in this release**

- The deep scan finds an inner scroll container when the adapter can't name
  one; previously it scrolled the window, moved nothing, and exported only
  the turns that happened to be mounted.
- Chats that *paginate* (fetching older turns when you hit the top) are given
  time to finish loading before the walk down starts.
- `.txt` export and the dedupe key no longer pick up "Copy code" / "Retry"
  button labels — but a message whose entire text is the word *Retry* is
  kept, which the old blanket line-filter ate.
- Exports from single-page apps that never set a per-conversation title no
  longer all land as `outlier-playground-…`; the conversation id is used.
- Diagnostics gained a `turnSample` (role + opening words per turn), which
  makes a bad split obvious without reading any HTML.

---

## Fixed in v0.4

**ChatGPT (and Kimi, and GLM) looked permanently busy.** The visibility test
used a bare `el.checkVisibility()`, which returns `true` for elements hidden
with `opacity: 0` or `visibility: hidden`. Every one of these sites keeps a
stop/abort button mounted-but-hidden beside the composer, so the fuzzy
"find a button labelled stop" search found one on a completely idle page and
`isBusy()` answered `true` forever. Downstream, that means every prompt waits
out the full 120-second stuck-busy timer before moving on. Two changes:
visibility now checks opacity, CSS visibility and a real box, and the stop
button is only looked for inside the composer rather than document-wide.

**ChatGPT's rebuilt UI.** Turns now render as `<article data-turn="user">`
rather than the old per-message wrapper. The adapter tries the new markup
first, then the classic `data-message-author-role`, then the conversation-turn
testid, then generic heuristics — so it keeps working across the surfaces
(including the work surface where the 5.6 models live).

**Model names you can type.** Model / effort / thinking fields in the run
builder are now editable combo boxes with suggestions, not fixed dropdowns.
When a site renames a model, type the label exactly as it's shown on screen
instead of waiting for a code change.

---

## Teach this site (v0.4.1)

Under the **Fix** tab in the popup.

Some apps can't be supported from the outside. Outlier Playground *was* the
clean example — a single-page app that serves an empty shell, lets React fill
the conversation in afterwards, and styles everything with Tailwind utility
classes (`flex w-full justify-end px-4 py-2`) that carry no meaning about who
said what. There is no `class="user-message"` to find. As of v0.4.2 it has a
proper adapter, but the next site like it won't, and this is how you fix that
one in thirty seconds instead of waiting for a release.

So instead: click **Teach this site**, then click one of *your* messages, then
one of the *AI's*. The popup closes itself (it would be covering the chat),
then the page dims and outlines the block it would
capture as you move the mouse. Esc cancels.

What happens underneath:

1. From the element you clicked, it walks up the tree and keeps every
   ancestor whose *signature* (tag + full class list, or a `data-` attribute)
   repeats elsewhere on the page. A signature that repeats is the tell that
   you've found the component the site renders once per message.
2. It takes the **outermost** repeating level from each pick — that's the
   whole turn rather than one paragraph inside it.
3. It checks the two match sets are fully disjoint. This matters more than it
   sounds: the outer wrapper of one side and the inner text block of the other
   never overlap each other, yet every wrapper contains a text block, so a
   naive pairing tags the same turn twice.
4. If both sides genuinely share one wrapper, it stores "alternating" mode and
   assigns roles by document order instead.

The result is saved per hostname in extension storage and applied on every
page load for that site. **Forget what I taught** clears it.

Matching is done in JavaScript rather than by building a CSS selector, because
Tailwind class names are full of characters that need escaping (`md:w-1/2`,
`bg-[#fff]`, `hover:opacity-50`) and one missed escape throws.

---

## A note on Outlier

Export is read-only — it reads the page you're already looking at. **Replay**
is different: it types and sends on your behalf. Work platforms generally have
opinions about automating their interface, and an account is a bad thing to
lose over a convenience feature. Use export freely there; think twice before
pointing Replay at it.

---

## Install (Chrome / Edge / Brave)

1. Unzip this folder somewhere permanent (the browser reads it from disk).
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Click the puzzle-piece icon in the toolbar and **pin Chat Replay**, so
   its icon is always there. That icon is the whole interface now.

Upgrading from v0.4.x? Hit the ↻ reload icon on the extension card. You do
**not** need to reload your open chat tabs — v0.5 injects itself into a tab
that's missing the content script the first time you open the popup there.

---

## How to use

Everything lives in the toolbar popup: click the icon on any supported
chat page.

**In the conversation you want to clone (tab A):**
1. Click the toolbar icon → **Replay** tab.
2. Click **Capture prompts from this chat**. It scrapes every message *you*
   sent, in order, and stores them.

**In a fresh chat (tab B):**
1. Open a new conversation and **pick the model yourself** (this stays a
   manual click on purpose — model pickers change constantly and it keeps
   you in control).
2. Click the toolbar icon — your captured prompts are already loaded (they
   travel between tabs through extension storage; no copy-paste).
3. Click **▶ Replay here**.

**You can close the popup.** The replay runs inside the tab, not inside the
popup, so it survives clicking away, switching tabs, and working elsewhere.
The toolbar badge shows `▶` while a run is going; reopen the popup any time
to see the status line and progress bar.

**Manual mode:** if capture fails on some site, open the **Prompts** tab and
paste your prompts by hand, separated by a line containing only `---`, then
**Apply edits**.

### The five tabs

| Tab | What's in it |
| --- | --- |
| **Replay** | Capture, load, the range picker, timings, ▶ / Pause / Stop. |
| **Export** | Copy as Markdown, `.md` / `.json` / `.txt`, Scan chat. |
| **Prompts** | View and edit the loaded prompt list; pin it to the library. |
| **Library** | Pinned sets — load one, delete it, or launch parallel runs. |
| **Fix** | Teach this site, diagnostics, and the `⏵⏵` toggle. |

Everything is one click from anywhere; nothing is nested behind a
disclosure triangle. The popup remembers which tab you were last on.

### Controls

- **Settle (s)** — how many seconds of "page quiet" to require after the
  model looks done before sending the next prompt. Raise it (5-8) if a site
  streams in bursts and the replay jumps the gun.
- **From # / To #** — which slice of the captured prompts to send. The
  chips (*All · Last 2 · Last 3 …*) set both at once. Shared across tabs,
  so you pick it once and replay it in each chat.
- **Resume from #** — appears in a tab whose run halted. Per tab, so it
  never moves the shared range out from under your other chats.
- **Pause / Stop** — pause finishes politely; stop aborts after the current
  wait.

### The `⏵⏵` button

Off by default in v0.5. Turn it on under **Fix** if you want it: on a
maximised window the toolbar is a long way from the composer, and some
people would rather have the control near the chat. Its only job now is
one-click capture — it flashes ✓ or ✕ and gets on with it.

### How "wait for the model" works

Two signals combined:
1. The site's own busy indicator (the send button turning into a stop
   button), from `adapters.js`.
2. DOM quiescence — no page mutations for *Settle* seconds.

Only when both say "idle" does the next prompt go out. Timeouts are
layered: the 7-min soft timeout only fires when the site itself says it's
idle; while the site reports "still generating", the wait is patient (up
to a 30-min absolute cap). A busy signal that's silent for 2+ minutes is
treated as stuck and skipped.

---

## v0.3.2 changes

**GLM / chat.z.ai fixed** (the "long reply" bug)
- The stuck-busy bail-out used to fire after only **12 s of page silence**
  — but a model chewing on a long prompt is silent for longer than that
  before the first token, so the replay "moved on" and sent the next
  prompt into a chat that was **still generating**, where the send slot is
  actually the Stop button. The bail-out now requires 2 minutes of silence
  (scales with Settle), the 7-min timeout only fires when the site says
  idle, and the loop refuses to type while the busy signal is up.
- The adapter now targets Open WebUI's stable ids (`#chat-input`,
  `#send-message-button`, `#stop-response-button`) and **explicitly
  excludes the in-place "edit message" box** (`message-edit-…` /
  `confirm-edit-message-button`), which used to hijack input/send
  detection and even got captured as a fake `"Cancel/Send"` prompt.
- Messages open in edit mode capture their real text (from the edit
  textarea) instead of the button labels.
- Transcript scraping now works on chat.z.ai (`id="message-…"` wrappers),
  so TXT export and send-verification finally have real data there.
- Busy detection is scoped to the composer — a page-wide fuzzy match
  reported "busy" at idle.
- Buttons labeled stop/cancel can never be chosen as the "nearest send
  button" on any site.
- Diagnostics now include the detected stop button.

---

## Tests

```bash
npm test
```

The suite has no dependencies. It runs on `node:test` (Node ≥ 20) over
[`test/dom.js`](test/dom.js), a small DOM written for it: an HTML parser,
a CSS selector engine, `innerText`, Range/Selection, events and
`execCommand`. It loads the extension's own files unmodified. Two browser
behaviours are reproduced on purpose because the code depends on them:
SVG and MathML elements report a lowercase `tagName`, and geometry comes
from `data-box="left,top,width,height"`. That lets layout-based role
inference run without a layout engine.

| File | Covers |
|---|---|
| [`fixtures/fixtures.js`](test/fixtures/fixtures.js) | Hand-reduced copies of each site's turn markup: ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, Grok, GLM/Z.ai, Outlier, plus a Mercado Libre results page. Every chat fixture carries the same three exchanges, so one `EXPECT` checks them all. The playground loads this same file. |
| [`platforms.test.js`](test/platforms.test.js) | Per platform: adapter resolution, exact role order, prompts captured verbatim, code language and text, nested fences, TeX, tables, lists, reasoning foldouts, no UI chrome in the export, one `##` per turn, prompt injection into the real composer (textarea setter / ProseMirror `beforeinput`), the send button, and idle detection. |
| [`md.test.js`](test/md.test.js) | Converter edge cases: MathJax, `<br>`/per-line-div code, gutters, inline backticks, code inside lists, nested tables, `colspan`, alignment, `<details>`, task lists. |
| [`prepare.test.js`](test/prepare.test.js) | Dedupe rules and their determinism. Every redaction rule, plus the look-alikes it must leave alone (prices, versions, Luhn-invalid numbers, IPs). |
| [`ecommerce.test.js`](test/ecommerce.test.js) | The results page: cents rebuilt from the superscript, sponsored flag, tracker URL dropped, carousel duplicate removed, structural fallback when class names change. |
| [`legacy.test.js`](test/legacy.test.js) | Runs the scenario scripts `run.js`–`run5.js`. These cover the Outlier role split, the headless message API and clipboard fallback, the replay loop (range, per-tab resume, two tabs at once, wake pings), the search extractor, and the popup's copy-then-clear path. |

The fixtures are **not** scraped captures, because every site needs a login.
They copy the hooks the adapters depend on (tags, classes, test ids,
code-block chrome, KaTeX's double rendering, reasoning panels, the composer)
and drop the styling noise. When a site changes, refresh its fixture from
**Copy diagnostics**.

Nothing in `test/` ships to the browser; Chrome ignores it.

---

## Fixing selectors when a site redesigns

Everything site-specific lives in `adapters.js`. Each adapter has four jobs:

| Function         | What it must return                          |
|------------------|----------------------------------------------|
| `userMessages()` | array of strings — your prompts, in order    |
| `getInput()`     | the message box element                      |
| `getSendButton()`| the send button element                      |
| `isBusy()`       | `true` while the model is generating         |

When a site redesigns, start from **Copy diagnostics**: its
`firstUserTurnHTML` / `firstAssistantTurnHTML` are what to paste into that
site's fixture in [`test/fixtures/fixtures.js`](test/fixtures/fixtures.js)
(or into the [playground](docs/index.html)'s *Paste HTML* tab first).
Then `npm test` says exactly which part of the export broke.

To find new selectors: right-click the element on the site → *Inspect* →
note a stable-looking class or `aria-label` → update the adapter → go to
`chrome://extensions` → hit the ↻ reload icon on Chat Replay → reload the
chat tab.

To add a brand-new site: copy the `glm` adapter block, adjust the
`hostMatch` regex and selectors, add the site's URL to
`content_scripts.matches` in `manifest.json`, reload.

---

## Good citizenship

This tool types at roughly human pace, adds small random pauses, and never
runs unattended loops — it replays a conversation *you* already had, once,
while you watch. Keep it that way: no rapid-fire loops, no mass runs.
Automating web UIs is technically outside most chat services' terms of
service, so use it gently and at your own judgement.

---

## v0.3.1 changes

**Fixes**
- Pressing ▶ during the auto-run countdown no longer leaves Stop/Pause
  disabled while the replay runs (the countdown and the normal Run button
  were fighting over the controls).
- A failure on the *last* prompt is no longer reported as "Replay
  complete ✓".
- After any stop or halt, **Start at #** is set to the resume point
  automatically.
- Launched-run configs now expire after 3 minutes and are cleaned up when
  their tab closes — a stale config can never auto-replay in an unrelated
  tab that reuses the same tab id.
- Library names are no longer injected as HTML.

**Completion detection**
- The "page quiet" watcher is now scoped to the chat transcript container
  (per adapter, with a generic fallback) instead of the whole page. Sites
  with ticking timestamps, ads, or animations elsewhere on the page used to
  hold "quiet" hostage, so waits only ended at the hard timeout.

**Human-pace hardening**
- Parallel windows now open **staggered** (3–8 s apart, randomized) and
  **tiled** across the screen, instead of all at once and stacked. Four
  first-messages landing in the same second is the most machine-like
  pattern this tool could produce; the stagger removes it, and the tiling
  keeps every window unoccluded (occluded windows get their timers
  throttled).
- The ready countdown is randomized (≈6–12 s, or ≈20–28 s when you need to
  pick the model manually) so runs never fire in lockstep.
- Send-verification now also checks whether the transcript gained your
  message before escalating to a second send method — on sites that keep
  the input text until the server acknowledges, escalation could have
  produced a duplicate send.

One deliberate non-change: no keystroke-by-keystroke typing simulation.
Pasting a prepared prompt in one go is what real humans do; synthetic
keystrokes at machine-even intervals are a classic bot tell.
