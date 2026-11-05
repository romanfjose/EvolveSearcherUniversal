/* ============================================================
   Chat Replay — Mercado Libre product extractor (v0.6)

   The problem this solves: select-all on a Mercado Libre listing gives
   you the header nav, "También puede interesarte", forty related
   products, the seller's other forty products, "Quienes vieron este
   producto también compraron", the category footer and the corporate
   links — with the actual product scattered across five separate
   sections in the middle of it.

   The fix is NOT to filter noise out of a whole-page grab. It's to
   collect the handful of blocks that ARE the product, by name, and
   ignore everything else by default. Anything this file doesn't
   explicitly reach for never appears in the output — so a new carousel
   or promo strip on the page can't leak in.

   The blocks that count as "the product":

     header      title, condition + units sold, best-seller badge, rating
     price       amount, previous amount, discount, instalments, tax-free
     variations  the picker labels — which colour/size is SELECTED
     highlights  "Lo que tenés que saber de este producto"
     specs       "Características del producto" (the full striped table)
     description "Descripción"
     buybox      delivery estimate, stock, purchase cap
     seller      name, official-store flag, sales volume, reputation
     guarantees  returns window, factory warranty, buyer protection
     reviews     opt-in only — the AI summary plus a few top comments

   Everything else on the page is, by construction, not product info.

   Robustness note: ML renames its `ui-pdp-*` classes every few months.
   Every read goes through a list of candidate selectors ending in a
   structural fallback, and the JSON-LD Product block (which ML also
   emits, and which changes far more slowly) backfills title, price,
   rating and description if the DOM read comes up empty. A missing
   section is omitted from the output, never guessed at.

   Injected on demand by the popup via activeTab + scripting — it is
   NOT in the manifest's content_scripts, so it costs nothing on the
   thousands of ML pages that aren't listings. Rendering lives in
   product-format.js, injected alongside it, because the popup needs
   the same formatter to copy a saved list from a tab that has no
   listing in it.
   ============================================================ */

(() => {
  // Re-injection is normal: the popup injects on every open. Keep the
  // first listener and bail, or we answer each message N times.
  if (window.__crProductReady) return;
  window.__crProductReady = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const block = (el) =>
    !el ? "" : String(el.innerText || el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const q = (sel, root) => { try { return (root || document).querySelector(sel); } catch { return null; } };
  const qa = (sel, root) => { try { return Array.from((root || document).querySelectorAll(sel)); } catch { return []; } };

  // First selector in the list that yields text wins.
  function firstText(sels, root) {
    for (const s of sels) {
      const t = clean(q(s, root)?.textContent);
      if (t) return t;
    }
    return "";
  }
  function firstEl(sels, root) {
    for (const s of sels) { const el = q(s, root); if (el) return el; }
    return null;
  }

  /* ---------------- money ---------------- */

  // .andes-money-amount is a composite: symbol + fraction + superscript
  // cents. Reading textContent gives "$28.99932" — the cents run into
  // the fraction. Rebuild it instead.
  function money(el) {
    if (!el) return "";
    const amount = el.classList?.contains("andes-money-amount") ? el : q(".andes-money-amount", el) || el;
    const sym = clean(q(".andes-money-amount__currency-symbol", amount)?.textContent);
    const frac = clean(q(".andes-money-amount__fraction", amount)?.textContent);
    const cents = clean(q(".andes-money-amount__cents", amount)?.textContent);
    if (frac) return `${sym || "$"}${frac}${cents ? "," + cents : ""}`;
    const t = clean(amount.textContent);
    return /\d/.test(t) ? t : "";
  }

  // Text that CONTAINS prices — "3 cuotas de $10.999,32 con tarjeta
  // Mercado Pago". Reading textContent gives "$10.99932": the
  // superscript cents run straight into the fraction with no
  // separator, which turns a 33-peso difference into a 33,000-peso
  // one. Rebuild each amount in place first.
  function textWithMoney(el) {
    if (!el) return "";
    let copy;
    try { copy = el.cloneNode(true); } catch { return clean(el.textContent); }
    for (const amt of qa(".andes-money-amount", copy)) {
      const rebuilt = money(amt);
      if (rebuilt) amt.replaceWith(copy.ownerDocument.createTextNode(" " + rebuilt + " "));
    }
    return clean(copy.textContent);
  }

  /* ---------------- JSON-LD backfill ---------------- */

  function jsonLd() {
    for (const s of qa('script[type="application/ld+json"]')) {
      let parsed;
      try { parsed = JSON.parse(s.textContent); } catch { continue; }
      const pool = [];
      const visit = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(visit);
        pool.push(o);
        if (o["@graph"]) visit(o["@graph"]);
      };
      visit(parsed);
      const hit = pool.find((o) => {
        const t = o["@type"];
        return t === "Product" || (Array.isArray(t) && t.includes("Product"));
      });
      if (hit) return hit;
    }
    return null;
  }

  /* ---------------- expanding collapsed sections ---------------- */

  // The full spec sheet sits behind "Ver todas las características" and
  // is genuinely absent from the DOM until you click it — on this
  // listing that's the difference between 6 attributes and 30. Scoped
  // to the spec/description containers so a stray "Ver más" in a
  // carousel can't be clicked.
  const EXPANDERS = /ver\s+(todas\s+las\s+)?caracter|ver\s+m[aá]s|ver\s+descripci|mostrar\s+m[aá]s/i;
  const EXPAND_SCOPES = [
    "#specifications",
    '[class*="striped-specs"]',
    '[class*="ui-pdp-specs"]',
    '[class*="highlighted-specs"]',
    '[class*="ui-pdp-description"]',
    '[class*="ui-vpp-highlighted"]',
  ];

  async function expandSections() {
    const seen = new Set();
    for (const scope of EXPAND_SCOPES) {
      for (const root of qa(scope)) {
        for (const b of qa('button, [role="button"], .ui-pdp-collapsable__action', root)) {
          const t = clean(b.textContent);
          if (!t || t.length > 60 || !EXPANDERS.test(t) || seen.has(b)) continue;
          seen.add(b);
          try { b.click(); } catch { /* detached */ }
        }
      }
    }
    if (seen.size) await sleep(900);
    return seen.size;
  }

  function closeModal() {
    for (const b of qa('.andes-modal__close, [class*="modal__close"], [aria-label="Cerrar"]')) {
      try { b.click(); } catch { /* ignore */ }
    }
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    } catch { /* ignore */ }
  }

  /* ---------------- the product blocks ---------------- */

  function readBreadcrumb() {
    const root = firstEl([".andes-breadcrumb", '[class*="breadcrumb"]']);
    if (!root) return [];
    return qa("li, a", root)
      .map((el) => clean(el.textContent))
      .filter((t) => t && !/^volver|^vender/i.test(t))
      .filter((t, i, a) => a.indexOf(t) === i);
  }

  function readHeader() {
    const head = firstEl([".ui-pdp-header", '[class*="ui-pdp-header"]']) || document;
    const title = firstText(["h1.ui-pdp-title", ".ui-pdp-title", "h1"], document);

    // "Nuevo | +100 vendidos" — one string on the page, two facts.
    const subtitle = firstText([".ui-pdp-subtitle", '[class*="header__subtitle"]'], head);
    const parts = subtitle.split(/\s*[|·]\s*/).map(clean).filter(Boolean);
    const condition = parts.find((p) => /^(nuevo|usado|reacondicionado|novo)/i.test(p)) || "";
    const sold = parts.find((p) => /vendid|sold/i.test(p)) || "";

    // Best-seller ribbon: "MÁS VENDIDO" + "1º en Sábanas Amarelo".
    let badge = "";
    const badgeEl = firstEl([
      '[class*="header__bottom-subtitle"]',
      '[class*="ui-pdp-highlight"]',
      '[class*="highlighted-label"]',
    ], head);
    if (badgeEl) badge = clean(badgeEl.textContent).slice(0, 120);

    const ratingVal = firstText([".ui-pdp-review__rating", '[class*="review__rating"]'], head);
    const ratingCount = firstText([".ui-pdp-review__amount", '[class*="review__amount"]'], head)
      .replace(/[()]/g, "");

    return { title, condition, sold, badge, ratingVal, ratingCount };
  }

  function readPrice() {
    const root = firstEl([
      ".ui-pdp-price__second-line",
      '[class*="ui-pdp-price__second-line"]',
      ".ui-pdp-price",
      '[class*="ui-pdp-price"]',
    ]);
    const out = { current: "", previous: "", discount: "", instalments: "", taxFree: "", freeShipping: false };
    if (!root) return out;

    // The previous price is also a money-amount inside this block, so
    // read it first and exclude its node from the "current" search.
    const prevEl = firstEl([
      ".ui-pdp-price__original-value",
      "s.andes-money-amount--previous",
      '[class*="original-value"]',
    ], root);
    out.previous = money(prevEl);

    const amounts = qa(".andes-money-amount", root).filter((el) => !prevEl || !prevEl.contains(el));
    out.current = money(amounts[0]);

    out.discount = firstText([".andes-money-amount__discount", '[class*="__discount"]'], root);
    out.instalments = textWithMoney(firstEl([".ui-pdp-price__subtitles", '[class*="price__subtitles"]'], root));

    // "Precio sin impuestos nacionales: $23.966" lives in its own strip
    // below the price on AR listings.
    const taxEl = firstEl(['[class*="price-tax"]', '[class*="pricing_price_tax"]']) ||
      qa('[class*="ui-pdp-price"] p, [class*="ui-pdp-price"] span')
        .find((el) => /sin impuestos/i.test(el.textContent || ""));
    if (taxEl) out.taxFree = textWithMoney(taxEl);

    const shipEl = firstEl(['[class*="shipping-price"]', '[class*="ui-pdp-color--GREEN"]']);
    out.freeShipping = /env[ií]o gratis|frete gr[aá]tis/i.test(clean(shipEl?.textContent) || "");

    return out;
  }

  // The picker label already carries the selected value ("Color y
  // Diseño: Gris oscuro"), which is the fact that matters — an LLM
  // asked "is this the right size?" needs to know WHICH variant you're
  // looking at, not just that variants exist.
  function readVariations() {
    const out = [];
    const pickers = qa('.ui-pdp-variations__picker, [class*="variations__picker"]');
    for (const p of pickers) {
      const label = clean(firstText([".ui-pdp-variations__label", '[class*="variations__label"]'], p));
      if (!label) continue;
      const [name, ...rest] = label.split(":");
      const selected = clean(rest.join(":"));

      const options = qa("[title], li, .andes-button", p)
        .map((el) => clean(el.getAttribute?.("title") || el.textContent))
        .filter((t) => t && t.length < 60)
        .filter((t) => !/ver opciones|ver mais|see options/i.test(t))
        .filter((t) => t !== selected)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 24);

      out.push({ name: clean(name), selected, options });
    }
    return out;
  }

  function readHighlights() {
    const root = firstEl([
      '[class*="highlighted-specs"]',
      "#highlighted_specs_attrs",
      '[class*="ui-vpp-highlighted"]',
    ]);
    if (!root) return [];
    const items = qa("li, .ui-pdp-list__item, [class*='key-value']", root)
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length > 2 && t.length < 300)
      .filter((t) => !EXPANDERS.test(t))
      .filter((t, i, a) => a.indexOf(t) === i);
    return items.slice(0, 25);
  }

  function groupTitleFor(node) {
    let cur = node;
    for (let hop = 0; hop < 4 && cur; hop++) {
      let sib = cur.previousElementSibling;
      while (sib) {
        if (/^H[2-5]$/.test(sib.tagName) || /title|header/i.test(sib.className || "")) {
          const t = clean(sib.textContent);
          if (t && t.length < 80) return t;
        }
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return "";
  }

  function readSpecs() {
    const roots = [
      ...qa("#specifications"),
      ...qa('[class*="striped-specs"]'),
      ...qa('[class*="ui-pdp-specs"]'),
      // The expander opens a full-screen modal on some layouts; its
      // table is the complete one, so read it too and merge.
      ...qa(".andes-modal__content"),
    ];
    const groups = [];
    const seen = new Set();

    const add = (group, k, v) => {
      k = clean(k); v = clean(v);
      if (!k || !v) return;
      const key = (group + "|" + k).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      let g = groups.find((x) => x.group === group);
      if (!g) { g = { group, rows: [] }; groups.push(g); }
      g.rows.push({ k, v });
    };

    for (const root of roots) {
      for (const table of qa("table, .andes-table", root)) {
        const group = groupTitleFor(table);
        for (const tr of qa("tr", table)) {
          const th = q("th", tr), td = q("td", tr);
          if (th && td) add(group, th.textContent, td.textContent);
        }
      }
      // Non-table variant ML uses for some categories.
      for (const kv of qa('[class*="specs__key-value"], [class*="key-value__labels"]', root)) {
        const t = clean(kv.textContent);
        const m = t.match(/^([^:]{2,40}):\s*(.+)$/);
        if (m) add(groupTitleFor(kv), m[1], m[2]);
      }
    }
    return groups.filter((g) => g.rows.length);
  }

  function readDescription() {
    const el = firstEl([
      ".ui-pdp-description__content",
      '[class*="description__content"]',
      "#description p",
      '[class*="ui-pdp-description"] p',
    ]);
    return block(el).slice(0, 6000);
  }

  function readBuybox() {
    const out = { delivery: "", pickup: "", stock: "", quantity: "", fulfilled: "" };
    out.delivery = firstText([
      "#shipping_summary .ui-pdp-media__title",
      '[class*="ui-pdp-shipping"] .ui-pdp-media__title',
      '[class*="shipping"] [class*="media__title"]',
    ]);
    out.pickup = firstText([
      '[class*="pick-up"] .ui-pdp-media__title',
      '[class*="pick_up"] [class*="media__title"]',
    ]);
    out.stock = firstText([
      ".ui-pdp-stock-information__title",
      '[class*="stock-information"]',
      '[class*="buybox__quantity__available"]',
    ]);
    const qty = firstEl(['[class*="buybox__quantity"]']);
    if (qty) out.quantity = clean(qty.textContent).slice(0, 160);
    const ful = qa('[class*="ui-pdp-icon--full"], [class*="fulfillment"]')[0];
    if (ful) out.fulfilled = clean(ful.closest("div")?.textContent || "").slice(0, 80);
    return out;
  }

  function readSeller() {
    const root = firstEl([
      '[class*="ui-pdp-seller"]',
      "#seller_data",
      '[class*="ui-box-component"] [class*="seller"]',
    ]);
    const out = { name: "", official: false, lines: [] };
    if (!root) return out;

    out.name = firstText([
      ".ui-pdp-seller__link-trigger-button",
      '[class*="seller__link-trigger"]',
      ".ui-pdp-seller__header__title",
      '[class*="seller__header__title"]',
    ], root).replace(/^vendido por\s*/i, "");

    const text = block(root);
    out.official = /tienda oficial|loja oficial|official store/i.test(text);
    out.lines = text
      .split("\n")
      .map(clean)
      .filter((t) => t && t.length < 90)
      .filter((t) => /venta|vendas|seguidor|producto|mercadol[ií]der|platinum|gold|atenci[oó]n|entrega a tiempo|reputaci/i.test(t))
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 6);
    return out;
  }

  function readGuarantees() {
    const roots = qa('[class*="pay-more-safely"], [class*="ui-pdp-warranty"], [class*="benefits"], [class*="returns"]');
    const out = [];
    for (const r of roots) {
      for (const el of qa('.ui-pdp-media__title, [class*="media__title"], li', r)) {
        const t = clean(el.textContent);
        if (t && t.length > 5 && t.length < 160 && !out.includes(t)) out.push(t);
      }
    }
    return out.slice(0, 6);
  }

  function readReviews() {
    const root = firstEl([
      "#reviews_capability_v3",
      '[class*="ui-review-capability"]',
      '[class*="ui-pdp-reviews"]',
    ]);
    const out = { summary: "", comments: [] };
    if (!root) return out;

    // The AI-written summary paragraph sits above the comment list.
    const sum = qa("p, div", root).find((el) => {
      const t = clean(el.textContent);
      return t.length > 60 && t.length < 600 && el.children.length === 0;
    });
    if (sum) out.summary = clean(sum.textContent);

    for (const c of qa('[class*="comments__comment__content"], [class*="review__comment"]', root)) {
      const text = clean(c.textContent);
      if (!text || text.length < 8) continue;
      const art = c.closest("article, li, div[class*='comment']");
      const stars = clean(q('[aria-label*="alificaci"], [aria-label*="star"]', art)?.getAttribute("aria-label") || "")
        .match(/(\d)/)?.[1] || "";
      out.comments.push({ stars, text: text.slice(0, 400) });
      if (out.comments.length >= 6) break;
    }
    return out;
  }

  function readIds() {
    const out = { catalog: "", publication: "", url: "" };
    try {
      const u = new URL(location.href);
      out.url = u.origin + u.pathname;             // drop the tracking query
      out.catalog = (u.pathname.match(/\/p\/(ML[A-Z]\d+)/i) || [])[1] || "";
      const wid = u.searchParams.get("wid");
      if (wid) out.publication = wid;
    } catch { /* exotic URL */ }

    if (!out.publication) {
      const el = qa('[class*="denounce"], [class*="ui-pdp-container__row--denounce"]')[0];
      const m = clean(el?.textContent || "").match(/#?\s*(\d{9,})/);
      if (m) out.publication = m[1];
    }
    if (!out.catalog) {
      const m = location.pathname.match(/(ML[A-Z]-?\d+)/i);
      if (m) out.catalog = m[1].toUpperCase();
    }
    return out;
  }

  /* ---------------- assemble ---------------- */

  function scrape() {
    const ld = jsonLd() || {};
    const head = readHeader();
    const price = readPrice();
    const ids = readIds();

    const data = {
      site: location.hostname,
      extractedAt: new Date().toISOString(),
      ...ids,
      title: head.title || clean(ld.name),
      condition: head.condition,
      sold: head.sold,
      badge: head.badge,
      rating: head.ratingVal || (ld.aggregateRating ? String(ld.aggregateRating.ratingValue) : ""),
      ratingCount: head.ratingCount || (ld.aggregateRating ? String(ld.aggregateRating.reviewCount || ld.aggregateRating.ratingCount || "") : ""),
      brand: clean(typeof ld.brand === "object" ? ld.brand?.name : ld.brand),
      breadcrumb: readBreadcrumb(),
      price,
      variations: readVariations(),
      highlights: readHighlights(),
      specs: readSpecs(),
      description: readDescription() || clean(ld.description),
      buybox: readBuybox(),
      seller: readSeller(),
      guarantees: readGuarantees(),
      reviews: readReviews(),
    };

    // JSON-LD prices are bare numbers ("31990"). Format them the way
    // the page would, or the LLM sees a different figure than the user
    // is looking at.
    if (!data.price.current && ld.offers) {
      const o = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
      const n = Number(o?.price);
      if (Number.isFinite(n)) {
        try {
          data.price.current = new Intl.NumberFormat(document.documentElement.lang || "es-AR", {
            style: "currency",
            currency: o.priceCurrency || "ARS",
            maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
          }).format(n);
        } catch { data.price.current = `${o.priceCurrency || ""} ${o.price}`.trim(); }
      } else if (o?.price) {
        data.price.current = `${o.priceCurrency || ""} ${o.price}`.trim();
      }
    }
    return data;
  }

  // A listing has a title AND a price. Search pages, the home page and
  // category pages have neither, and should say so rather than
  // producing a confident, empty document.
  const looksLikeProduct = (d) => !!(d.title && (d.price.current || d.specs.length || d.description));

  /* ---------------- output ---------------- */

  // Rendering lives in product-format.js: the popup has to render the
  // saved list from a tab with no listing in it, so the formatter can't
  // be trapped in a content script.
  const fmt = () => (window.ChatReplayProduct || null);

  /* ---------------- messaging ---------------- */

  let cached = null;

  // v0.8: two kinds of page are worth reading, and which one you're on
  // is a fact about the page, not a mode the user should have to pick.
  //
  // Order matters. A LISTING also contains a dozen anchors-with-prices
  // (the "Productos relacionados" carousels), so if the search reader
  // ran first and unconditionally, it could out-vote a perfectly good
  // product extraction with a table of the carousel. search.js's own
  // looksLikeSearch() already refuses to fire on a page that has the
  // PDP container; asking it first here is safe, and it means a
  // results page never pays for expandSections().
  const searcher = () => (window.ChatReplaySearch || null);

  async function readPage(opts) {
    const S = searcher();
    if (S?.looksLikeSearch()) {
      const sd = S.scrape();
      if (sd.results.length) return sd;
      // Looked like a results page and wasn't one (an empty search, a
      // category splash) — fall through and try it as a listing.
    }

    const expanded = opts?.expand ? await expandSections() : 0;
    const pd = scrape();
    if (expanded) closeModal();
    if (looksLikeProduct(pd)) return pd;

    // Neither read the way it should. If a few cards were found after
    // all, they beat an empty answer.
    const sd = S ? S.scrape() : null;
    return sd?.results.length ? sd : null;
  }

  const handlers = {
    ping: async () => ({ ok: true, host: location.hostname }),

    scrape: async ({ opts }) => {
      cached = await readPage(opts || {});
      return reply(opts);
    },

    // Toggling a checkbox shouldn't re-touch the page.
    format: async ({ opts }) => (cached ? reply(opts) : handlers.scrape({ opts })),
  };

  // `data` goes back with every reply: the popup keeps it so "Add to
  // list" costs nothing, and so a saved item survives navigating away
  // from the page it came from.
  function reply(opts) {
    if (!cached) {
      return { ok: true, product: false, kind: "none", text: "", stats: null, data: null };
    }
    const f = fmt();
    if (!f) return { ok: false, error: "product-format.js did not load" };
    const isSearch = cached.kind === "search";
    return {
      ok: true,
      product: true,
      kind: isSearch ? "search" : "product",
      text: f.one(cached, opts || {}),
      stats: isSearch ? searcher()?.stats(cached) : stats(cached),
      data: cached,
    };
  }

  function stats(d) {
    return {
      specs: d.specs.reduce((n, g) => n + g.rows.length, 0),
      highlights: d.highlights.length,
      variations: d.variations.length,
      description: d.description.length,
      reviews: d.reviews.comments.length,
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const fn = msg && msg.crp && handlers[msg.crp];
    if (!fn) return; // not ours
    Promise.resolve(fn(msg))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async
  });
})();
