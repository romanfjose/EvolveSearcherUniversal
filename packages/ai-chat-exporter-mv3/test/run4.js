/* ============================================================
   run4 — the v0.8 search-results path.

   Two things are worth testing here and neither is the happy path.

   1. ML renames its class names roughly twice a year, so the extractor
      has a structural fallback that knows nothing about them. A test
      that only feeds it today's `poly-card` markup would pass right up
      until the release that breaks it in the field — so the same page
      is asserted twice, once with real class names and once with
      deliberately meaningless ones.

   2. A product page is FULL of anchors-with-prices (the related-product
      carousels). If the search reader fired there it would replace a
      good listing extraction with a table of the carousel, which is a
      much worse failure than reading nothing. So: it must refuse.

   node test/run4.js
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let failures = 0;
function ok(label, cond, extra) {
  if (cond) { console.log("  ✓ " + label); return; }
  failures++;
  console.log("  ✗ " + label + (extra ? "\n      " + String(extra).replace(/\n/g, "\n      ") : ""));
}
const has = (hay, needle) => String(hay).includes(needle);

function boot(bodyHtml, url) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const { window } = dom;
  // innerText doesn't exist in jsdom; the extractor falls back to
  // textContent on its own, but block() reads innerText first.
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() { return this.textContent; },
  });
  window.eval(read("product-format.js"));
  window.eval(read("search.js"));
  return window;
}

/* ---------------- fixtures ---------------- */

// The cents live in a superscript: textContent on this returns
// "$12.99932", which is the bug the money() rebuild exists for.
const amount = (frac, cents) => `
  <span class="andes-money-amount">
    <span class="andes-money-amount__currency-symbol">$</span>
    <span class="andes-money-amount__fraction">${frac}</span>
    ${cents ? `<sup class="andes-money-amount__cents">${cents}</sup>` : ""}
  </span>`;

function polyCard({ id, title, price, cents, prev, disc, cuotas, ship, seller, rating, count, sold, ads }) {
  return `
  <li class="ui-search-layout__item">
    <div class="poly-card">
      <a class="poly-component__title" href="https://articulo.mercadolibre.com.ar/MLA-${id}-${title.toLowerCase().replace(/\s+/g, "-")}-_JM">${title}</a>
      <div class="poly-price__current">${amount(price, cents)}</div>
      ${prev ? `<s class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__fraction">${prev}</span></s>` : ""}
      ${disc ? `<span class="andes-money-amount__discount">${disc}% OFF</span>` : ""}
      ${cuotas ? `<span class="poly-price__installments">en ${cuotas} cuotas sin interés de ${amount("2.166", "50")}</span>` : ""}
      ${ship ? `<span class="poly-component__shipping">${ship}</span>` : ""}
      ${seller ? `<span class="poly-component__seller">Por ${seller}</span>` : ""}
      ${rating ? `<span class="poly-reviews__rating">${rating}</span><span class="poly-reviews__total">(${count})</span>` : ""}
      ${sold ? `<span class="poly-component__highlight">MÁS VENDIDO</span><span>${sold} vendidos</span>` : ""}
      ${ads ? `<span class="poly-component__ads-promotions">Patrocinado</span>` : ""}
    </div>
  </li>`;
}

const CARDS = [
  polyCard({ id: "111111111", title: "Pack X6 Toallas Faciales Microfibra", price: "12.999", cents: "32", prev: "19.999", disc: "35", cuotas: 6, ship: "Envío gratis", seller: "Casa Bella", rating: "4.7", count: "128", sold: "+50" }),
  polyCard({ id: "222222222", title: "Toallas Faciales Microfibra X3 Premium", price: "8.450", ship: "Llega gratis mañana", seller: "Tienda Sol", rating: "4.2", count: "31", ads: true }),
  polyCard({ id: "333333333", title: "Set 12 Toallitas Desmaquillantes", price: "21.300", cuotas: 3, ship: "Envío gratis" }),
];

const SEARCH_PAGE = `
  <h1 class="ui-search-page-title">Pack Toallas Faciales Microfibra</h1>
  <span class="ui-search-search-result__quantity-results">54 resultados</span>
  <div class="ui-search-sort-filter"><span class="andes-dropdown__display-values">Más relevantes</span></div>
  <section class="ui-search-results">
    <ol>${CARDS.join("")}</ol>
  </section>`;

const SEARCH_URL = "https://listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra#D[A:Pack%20Toallas%20Faciales%20Microfibra]";

/* ---------------- 1. reading the page ---------------- */

console.log("\nsearch extractor — current markup");
{
  const w = boot(SEARCH_PAGE, SEARCH_URL);
  ok("recognises a results page", w.ChatReplaySearch.looksLikeSearch());

  const d = w.ChatReplaySearch.scrape();
  ok("all three cards found", d.results.length === 3, `got ${d.results.length} via ${d.via}`);
  ok("query read from the heading", d.query === "Pack Toallas Faciales Microfibra", d.query);
  ok("total parsed", d.total === 54 && has(d.totalText, "54"), d.totalText);
  ok("sort order read", d.sort === "Más relevantes", d.sort);

  const [a, b] = d.results;
  ok("title", a.title === "Pack X6 Toallas Faciales Microfibra", a.title);
  // The whole reason money() exists: textContent here is "$12.99932".
  ok("cents rebuilt, not concatenated", a.price === "$12.999,32", a.price);
  ok("previous price kept out of the current one", a.previous === "$19.999", a.previous);
  ok("discount", a.discount === "35% OFF", a.discount);
  ok("instalments carry a readable amount", has(a.instalments, "$2.166,50"), a.instalments);
  ok("free shipping flagged", a.freeShipping === true);
  ok("seller stripped of 'Por '", a.seller === "Casa Bella", a.seller);
  ok("rating + count", a.rating === "4.7" && a.ratingCount === "128");
  ok("units sold", has(a.sold, "50"), a.sold);
  ok("item URL kept", has(a.url, "MLA-111111111") && !has(a.url, "#"), a.url);
  ok("sponsored card flagged", b.sponsored === true);
  ok("organic card not flagged", a.sponsored === false);
}

/* ---------------- 2. the class names all changed ---------------- */

console.log("\nsearch extractor — structural fallback (unknown class names)");
{
  const scrambled = SEARCH_PAGE
    .replace(/poly-component__title/g, "xx-a1")
    .replace(/poly-price__current/g, "xx-b2")
    .replace(/poly-component__shipping/g, "xx-c3")
    .replace(/poly-component__seller/g, "xx-d4")
    .replace(/ui-search-layout__item/g, "xx-e5")
    .replace(/poly-card/g, "xx-f6");
  const w = boot(scrambled, SEARCH_URL);
  const d = w.ChatReplaySearch.scrape();
  ok("still finds the cards", d.results.length === 3, `got ${d.results.length} via ${d.via}`);
  ok("used the structural path", has(d.via, "structure"), d.via);
  ok("titles survive", d.results[0].title === "Pack X6 Toallas Faciales Microfibra", d.results[0].title);
  ok("prices survive", d.results[0].price === "$12.999,32", d.results[0].price);
}

/* ---------------- 3. it must not fire on a listing ---------------- */

console.log("\nsearch extractor — refuses to run on a product page");
{
  const pdp = `
    <div class="ui-pdp-container">
      <h1 class="ui-pdp-title">Juego De Sábanas 180 Hilos</h1>
      <div class="ui-pdp-price">${amount("28.999", "00")}</div>
    </div>
    <section class="carousel">
      <h2>Productos relacionados</h2>
      ${CARDS.join("")}
    </section>`;
  const w = boot(pdp, "https://articulo.mercadolibre.com.ar/MLA-999-juego-de-sabanas-_JM");
  ok("looksLikeSearch() says no", w.ChatReplaySearch.looksLikeSearch() === false);
  ok("scrape returns nothing", w.ChatReplaySearch.scrape().results.length === 0);
}

/* ---------------- 4. duplicates, empty pages, hash query ---------------- */

console.log("\nsearch extractor — edge cases");
{
  // The same product in a top carousel and again in the grid.
  const dupes = SEARCH_PAGE.replace("<ol>", `<ol>${CARDS[0]}`);
  const w = boot(dupes, SEARCH_URL);
  const d = w.ChatReplaySearch.scrape();
  ok("a product repeated on the page is counted once", d.results.length === 3, `got ${d.results.length}`);

  const w2 = boot(`<section class="ui-search-results"></section>`, SEARCH_URL);
  const d2 = w2.ChatReplaySearch.scrape();
  ok("an empty results page yields no rows", d2.results.length === 0);
  // …and still knows what was searched for, from the fragment.
  ok("query recovered from the URL fragment", d2.query === "Pack Toallas Faciales Microfibra", d2.query);

  const w3 = boot(SEARCH_PAGE, "https://listado.mercadolibre.com.ar/toallas_Desde_51");
  ok("page number read from _Desde_", w3.ChatReplaySearch.scrape().page === 2);
}

/* ---------------- 5. formatting ---------------- */

console.log("\nformatter — a page of results");
{
  const w = boot(SEARCH_PAGE, SEARCH_URL);
  const d = w.ChatReplaySearch.scrape();
  const F = w.ChatReplayProduct;

  const md = F.one(d, { format: "md", table: true, logistics: true, max: 50 });
  ok("names the search", has(md, "Búsqueda: “Pack Toallas Faciales Microfibra”"), md.split("\n")[0]);
  ok("says how many were found", has(md, "3 resultados"));
  ok("reports the real total too", has(md, "54 resultados"));
  ok("renders a table header", has(md, "| # | Producto | Precio |"), md.split("\n").find((l) => l.startsWith("| #")));
  ok("one row per result", md.split("\n").filter((l) => /^\| \d+ \|/.test(l)).length === 3);
  ok("titles are links", has(md, "](https://articulo.mercadolibre.com.ar/MLA-111111111"));
  ok("instalments compressed", has(md, "6x $2.166,50 s/int"), md);
  ok("sponsored marked in the row", has(md, "patr."));
  ok("warns that sponsored rows are ads", has(md, "Patrocinados: 1"));

  const noLog = F.one(d, { format: "md", table: true, logistics: false, max: 50 });
  ok("logistics off drops the shipping column", !has(noLog, "Envío"), noLog.split("\n")[6]);
  ok("logistics off keeps the price column", has(noLog, "| Precio |"));

  const two = F.one(d, { format: "md", table: true, logistics: true, max: 2 });
  ok("max slices the table", two.split("\n").filter((l) => /^\| \d+ \|/.test(l)).length === 2);
  ok("and says it did", has(two, "se muestran 2"), two);

  const detail = F.one(d, { format: "md", table: false, logistics: true, max: 50 });
  ok("detail mode uses headings, not a table", has(detail, "## 1. Pack X6") && !has(detail, "| # |"));
  ok("detail mode keeps the URL", has(detail, "- URL: https://articulo"));

  const plain = F.one(d, { format: "plain", table: true, logistics: true, max: 50 });
  ok("plain drops the link syntax", !has(plain, "](http") && has(plain, "Pack X6 Toallas Faciales Microfibra"));
  ok("plain keeps the columns", has(plain, "| Precio |"));

  const json = JSON.parse(F.one(d, { format: "json", table: true, logistics: true, max: 2 }));
  ok("json honours max", json.results.length === 2);
  ok("json keeps the query", json.query === "Pack Toallas Faciales Microfibra");
}

/* ---------------- 6. mixed list ---------------- */

console.log("\nformatter — a list holding both kinds");
{
  const w = boot(SEARCH_PAGE, SEARCH_URL);
  const F = w.ChatReplayProduct;
  const search = w.ChatReplaySearch.scrape();
  const product = {
    title: "Juego De Sábanas 180 Hilos",
    site: "articulo.mercadolibre.com.ar",
    url: "https://articulo.mercadolibre.com.ar/MLA-777-sabanas-_JM",
    price: { current: "$28.999" },
    specs: [{ group: "", rows: [{ k: "Material", v: "Algodón" }] }],
    highlights: [], variations: [], breadcrumb: [], description: "",
  };

  const items = [
    { key: F.key(product), data: product },
    { key: F.key(search), data: search },
  ];
  const md = F.list(items, { format: "md", table: true, logistics: true, specs: true, max: 50 });

  ok("heading counts each kind", has(md, "# Mercado Libre — 1 producto y 1 búsqueda"), md.split("\n")[0]);
  ok("both items are numbered at the same level", has(md, "## 1. Juego De Sábanas") && has(md, "## 2. Búsqueda:"), md);
  ok("the search's own headings stay below the item heading", !/^## \d+\. Pack X6/m.test(md));
  ok("keys don't collide", F.key(product) !== F.key(search));
  ok("a search key is stable", F.key(search) === F.key(w.ChatReplaySearch.scrape()));

  const label = F.label({ data: search });
  ok("popup row labels a search as one", has(label.title, "🔎") && label.price === "3 res.", JSON.stringify(label));

  // One entry alone still renders as a standalone document.
  const solo = F.list([items[1]], { format: "md", table: true, logistics: true, max: 50 });
  ok("a single saved search renders on its own", solo.startsWith("# Búsqueda:"), solo.split("\n")[0]);
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
