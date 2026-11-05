/* ============================================================
   Chat Replay — Mercado Libre SEARCH RESULTS extractor (v0.8)

   product.js lifts one listing out of a product page. This file does
   the other half of the same job: the page you're actually on while
   you shop — `listado.mercadolibre.com.ar/pack-toallas-faciales`,
   `/jm/search`, an `ofertas` grid, a seller's store — where the whole
   point is that there are fifty candidates and you want a model to
   tell you which three are worth opening.

   Select-all there is even worse than on a listing: the fifty cards
   come out interleaved with the filter sidebar, the sort dropdown, the
   pagination, four promo carousels and the footer, and the prices come
   out mangled (see money() below). So this does the same thing
   product.js does — it collects the cards, by name, and nothing else.

   Reading a card, in order of preference:

     1. the current `poly-card` markup (`.poly-component__title`,
        `.poly-price__current`, `.poly-component__seller`…)
     2. the older `ui-search-*` markup, still served on some layouts
     3. a STRUCTURAL fallback that knows nothing about class names: an
        anchor whose href carries an item id (MLA-123…, /p/MLA123…)
        plus a price element somewhere above it is a result card.

   (3) is the one that keeps working when ML renames everything, which
   it does roughly twice a year. It's also why looksLikeSearch() is
   strict: a product page is full of anchors-with-prices too (the
   "Productos relacionados" carousels), and mistaking a listing for a
   search page would replace a good extraction with a bad one.

   Injected on demand by the popup alongside product-format.js and
   product.js. product.js owns the messaging; this file only exports
   window.ChatReplaySearch.
   ============================================================ */

(() => {
  if (window.__crSearchReady) return;
  window.__crSearchReady = true;

  const clean = (s) => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const q = (sel, root) => { try { return (root || document).querySelector(sel); } catch { return null; } };
  const qa = (sel, root) => { try { return Array.from((root || document).querySelectorAll(sel)); } catch { return []; } };

  const block = (el) =>
    !el ? "" : String(el.innerText || el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

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

  /* ---------------- money ----------------
     Same trap as on a listing, and it bites harder here because it hits
     fifty rows at once: `.andes-money-amount` renders the cents in a
     superscript, so textContent on "$12.999,32" returns "$12.99932".
     Rebuilt from the parts instead. */

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

  /* ---------------- is this a results page at all? ---------------- */

  // Containers that only exist on a results page. A product page has
  // none of these, which is what keeps the carousels on a listing from
  // being read as search results.
  const SEARCH_ROOTS = [
    ".ui-search-results",
    '[class*="ui-search-results"]',
    ".ui-search-layout",
    '[class*="ui-search-layout"]',
    '[class*="results-item"]',
    '[class*="promotions-grid"]',
    '[class*="deal-grid"]',
  ];

  // …and the URL shapes, for layouts whose containers get renamed.
  const SEARCH_URL = /(^|\/\/)listado\.|\/jm\/search|[?&]as_word=|[?&]search=|\/ofertas|_Desde_\d+|\/tienda\//i;

  const isPdp = () => !!q('.ui-pdp-container, h1.ui-pdp-title, [class*="ui-pdp-container__row"]');

  function looksLikeSearch() {
    if (isPdp()) return false;
    if (firstEl(SEARCH_ROOTS)) return true;
    return SEARCH_URL.test(location.href);
  }

  /* ---------------- finding the cards ---------------- */

  const ITEM_ID = /(ML[A-Z]|MCO|MLU|MPE)-?\d{6,}/i;

  function isProductHref(href) {
    if (!href) return false;
    if (/^(javascript:|#)/i.test(href)) return false;
    return ITEM_ID.test(href) || /\/p\/(ML[A-Z]|MCO|MLU|MPE)\d/i.test(href) || /\/mclics\/|\/clicks\//i.test(href);
  }

  // Sponsored cards link through a click tracker whose URL is a hundred
  // characters of telemetry and useless in a paste. Keep the item id
  // instead — it's what actually identifies the product.
  function linkInfo(a) {
    const href = a?.getAttribute?.("href") || "";
    if (!href) return { url: "", id: "" };
    let u;
    try { u = new URL(href, location.href); } catch { return { url: "", id: "" }; }
    let decoded = u.href;
    try { decoded = decodeURIComponent(u.href); } catch { /* keep raw */ }
    const m = decoded.match(ITEM_ID);
    const id = m ? m[0].toUpperCase().replace("-", "") : "";
    const tracker = /click|mclics|ads\./i.test(u.hostname) || /\/mclics\/|\/clicks\//i.test(u.pathname);
    return { url: tracker ? "" : u.origin + u.pathname, id };
  }

  const CARD_SELECTORS = [
    "li.ui-search-layout__item",
    ".ui-search-layout__item",
    ".poly-card",
    '[class*="ui-search-result__wrapper"]',
    '[class*="ui-search-result"]',
    '[class*="promotion-item"]',
  ];

  const hasPrice = (el) => !!q(".andes-money-amount", el) || /\$\s?\d/.test(el?.textContent || "");

  function productLinks(root) {
    return qa("a[href]", root).filter((a) => isProductHref(a.getAttribute("href")));
  }

  // No class names involved: walk up from a product link until the
  // ancestor holds a price, and stop before it swallows a second
  // product. That ancestor is the card, whatever it's called this year.
  function cardsStructurally(root) {
    const out = [];
    const seen = new Set();
    for (const a of productLinks(root)) {
      let el = a.parentElement;
      let card = null;
      for (let hop = 0; hop < 8 && el && el !== root; hop++) {
        const links = productLinks(el);
        const ids = new Set(links.map((x) => linkInfo(x).id || x.getAttribute("href")));
        if (ids.size > 1) break;          // gone too far: this is the grid
        if (hasPrice(el)) { card = el; break; }
        el = el.parentElement;
      }
      if (!card || seen.has(card)) continue;
      // A card that contains another already-collected card is a wrapper.
      if (out.some((c) => c.contains(card) || card.contains(c))) continue;
      seen.add(card);
      out.push(card);
    }
    return out;
  }

  function findCards() {
    const root = firstEl(SEARCH_ROOTS) || document.body;

    for (const sel of CARD_SELECTORS) {
      const hits = qa(sel, root).filter((el) => hasPrice(el) && productLinks(el).length);
      // Nested matches (a wrapper and its inner card both match) would
      // double every result — keep the outermost of any overlapping set.
      const outer = hits.filter((el) => !hits.some((o) => o !== el && o.contains(el)));
      if (outer.length >= 2) return { cards: outer, root, via: sel };
    }

    const cards = cardsStructurally(root);
    if (cards.length) return { cards, root, via: "structure" };

    // Last resort: the grid may live outside anything we recognise.
    if (root !== document.body) {
      const wide = cardsStructurally(document.body);
      if (wide.length) return { cards: wide, root: document.body, via: "structure/document" };
    }
    return { cards: [], root, via: "none" };
  }

  /* ---------------- reading one card ---------------- */

  const SHORT = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);

  function readCard(el) {
    const text = block(el);

    const linkEl =
      firstEl(["a.poly-component__title", "h2 a", "h3 a", "a.ui-search-link", "a.ui-search-item__group__element"], el) ||
      productLinks(el)[0] ||
      null;
    const { url, id } = linkInfo(linkEl);

    let title = firstText([
      ".poly-component__title",
      ".ui-search-item__title",
      '[class*="component__title"]',
      '[class*="item__title"]',
      "h2", "h3",
    ], el);
    if (!title) title = clean(linkEl?.getAttribute("title") || linkEl?.textContent || "");
    if (!title) title = clean(q("img[alt]", el)?.getAttribute("alt") || "");
    title = SHORT(title, 160);

    // Price. Three amounts can live in one card — the price, the
    // struck-through previous one, and the "6 cuotas de $2.166" — and
    // the only difference between them is which element they sit in.
    // Picking a container by name is what breaks when the names change
    // (a scrambled card leaves `poly-price__installments` matching a
    // `[class*="price"]` guess, and the card gets priced at one
    // instalment). So: find the two amounts that AREN'T the price,
    // exclude their nodes, and take the first of what's left.
    const prevEl = firstEl([
      "s.andes-money-amount",
      ".andes-money-amount--previous",
      '[class*="price__original-value"]',
      '[class*="original-value"]',
    ], el);

    const instEl = firstEl([
      ".poly-price__installments",
      ".ui-search-installments",
      '[class*="installment"]',
      '[class*="cuota"]',
    ], el);

    const priceRoot = firstEl([
      ".poly-price__current",
      ".ui-search-price__second-line",
      '[class*="price__second-line"]',
      '[class*="price__current"]',
    ], el) || el;

    const usable = (root) => qa(".andes-money-amount", root)
      .filter((a) => !prevEl?.contains(a) && !instEl?.contains(a));
    const amounts = usable(priceRoot).length ? usable(priceRoot) : usable(el);

    const price = money(amounts[0]) || (clean(text.match(/\$\s?[\d.]+(,\d+)?/)?.[0] || ""));
    const previous = money(prevEl);
    const discount = firstText([".andes-money-amount__discount", '[class*="__discount"]'], el);

    let instalments = textWithMoney(instEl);
    if (!instalments) {
      const m = text.match(/\d+\s*x?\s*cuotas?[^\n]{0,60}/i);
      if (m) instalments = clean(m[0]);
    }

    let shipping = firstText([
      ".poly-component__shipping",
      ".ui-search-item__shipping",
      '[class*="component__shipping"]',
      '[class*="item__shipping"]',
    ], el);
    if (!shipping) {
      const m = text.match(/(env[ií]o gratis|llega gratis[^\n]{0,30}|llega[^\n]{0,30}|frete gr[aá]tis)/i);
      if (m) shipping = clean(m[0]);
    }

    let seller = firstText([
      ".poly-component__seller",
      ".ui-search-official-store-label",
      '[class*="component__seller"]',
      '[class*="official-store"]',
    ], el).replace(/^(por|vendido por|by)\s+/i, "");
    seller = SHORT(seller, 60);

    const rating = firstText([
      ".poly-reviews__rating",
      ".ui-search-reviews__rating-number",
      '[class*="reviews__rating"]',
    ], el);
    const ratingCount = firstText([
      ".poly-reviews__total",
      ".ui-search-reviews__amount",
      '[class*="reviews__total"]',
      '[class*="reviews__amount"]',
    ], el).replace(/[()]/g, "");

    let badge = firstText([
      ".poly-component__highlight",
      ".ui-search-item__highlight-label",
      '[class*="component__highlight"]',
      '[class*="highlight-label"]',
    ], el);
    badge = SHORT(badge, 40);

    const attributes = qa('[class*="attributes_list__item"], [class*="attributes-list__item"], [class*="group--attributes"] li', el)
      .map((a) => clean(a.textContent))
      .filter((t) => t && t.length < 60)
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .slice(0, 4);

    const sold = clean(text.match(/[+]?\s?\d[\d.]*\s+vendidos?/i)?.[0] || "");
    const sponsored = !!q('[class*="ads-promotions"], [class*="__ad-label"]', el) || /\bpatrocinado\b|\bpublicidad\b/i.test(text);
    const official = /tienda oficial|loja oficial/i.test(text);
    const fullShipping = /\bfull\b/i.test(clean(q('[class*="icon--full"], [class*="fulfillment"]', el)?.textContent || "")) ||
      !!q('[class*="icon-full"], [class*="icon--full"]', el);

    return {
      title, url, id, price, previous, discount, instalments,
      shipping, freeShipping: /gratis|gr[aá]tis/i.test(shipping),
      full: fullShipping,
      rating, ratingCount, seller, official, badge, sold, sponsored,
      attributes,
    };
  }

  /* ---------------- page-level context ---------------- */

  // The query is worth more than it looks: pasted without it, fifty
  // rows of towels have no stated criterion, and the model has to guess
  // what you were looking for.
  function readQuery() {
    const h = firstText([
      "h1.ui-search-page-title",
      '[class*="ui-search-page-title"]',
      ".ui-search-search-result__title",
      "h1",
    ]);
    if (h && h.length < 120) return h;

    try {
      const u = new URL(location.href);
      // ML puts the human-readable query in the fragment on /listado/:
      // #D[A:Pack%20Toallas%20Faciales%20Microfibra]
      const frag = decodeURIComponent(u.hash || "").match(/A:([^\]]+)/);
      if (frag) return clean(frag[1]);
      const param = u.searchParams.get("as_word") || u.searchParams.get("q") || u.searchParams.get("search");
      if (param) return clean(param);
      const seg = u.pathname.split("/").filter(Boolean).pop() || "";
      if (seg && !/^_/.test(seg)) return clean(seg.replace(/_Desde_\d+.*$/i, "").replace(/-/g, " "));
    } catch { /* exotic URL */ }
    return "";
  }

  function readTotal() {
    const t = firstText([
      ".ui-search-search-result__quantity-results",
      '[class*="quantity-results"]',
      '[class*="search-result__quantity"]',
    ]);
    const n = Number(clean(t).replace(/[^\d]/g, "")) || 0;
    return { totalText: t, total: n };
  }

  function readSort() {
    const s = firstText([
      ".ui-search-sort-filter .andes-dropdown__display-values",
      '[class*="sort-filter"] [class*="display-values"]',
      '[class*="sort-filter"] button',
    ]);
    return SHORT(clean(s).replace(/^ordenar por\s*/i, ""), 40);
  }

  function readFilters() {
    const roots = qa('[class*="applied-filters"], [class*="filter-applied"], [class*="andes-tag"]');
    const out = [];
    for (const r of roots) {
      const t = clean(r.textContent);
      if (t && t.length < 60 && !out.includes(t) && !/limpiar|borrar filtros/i.test(t)) out.push(t);
    }
    return out.slice(0, 10);
  }

  function readPage() {
    const cur = clean(firstText([
      ".andes-pagination__button--current",
      '[class*="pagination__button--current"]',
    ]));
    const n = Number(cur.replace(/[^\d]/g, ""));
    if (n) return n;
    const m = location.href.match(/_Desde_(\d+)/i);
    if (m) return Math.floor(Number(m[1]) / 50) + 1;
    return 1;
  }

  /* ---------------- assemble ---------------- */

  const MAX_CARDS = 200; // a page holds ~50; the cap is for pathological grids

  function scrape() {
    const base = {
      kind: "search",
      site: location.hostname,
      extractedAt: new Date().toISOString(),
      url: (() => { try { const u = new URL(location.href); return u.origin + u.pathname + u.search; } catch { return location.href; } })(),
      query: readQuery(),
      ...readTotal(),
      sort: readSort(),
      filters: readFilters(),
      page: readPage(),
      via: "",
      results: [],
    };

    if (!looksLikeSearch()) return base;

    const { cards, via } = findCards();
    base.via = via;

    const seen = new Set();
    for (const el of cards.slice(0, MAX_CARDS)) {
      const r = readCard(el);
      if (!r.title || !r.price) continue;
      // Carousels above the grid repeat products that are also in it.
      const key = (r.id || r.url || r.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      base.results.push(r);
    }
    return base;
  }

  function stats(d) {
    return {
      results: d.results.length,
      sponsored: d.results.filter((r) => r.sponsored).length,
      total: d.total || 0,
      via: d.via,
    };
  }

  window.ChatReplaySearch = { looksLikeSearch, scrape, stats };
})();
