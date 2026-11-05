/* Mercado Libre search results page → search.js → the pasteable table.
   (The deep extractor cases — scrambled classes, PDP refusal, pagination —
   live in run4.js; this checks the shared fixture the demo also shows.) */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");
const { byId } = require("./fixtures/fixtures");

const f = byId.mercadolibre;
const load = (html = f.html) => boot(html, { url: f.url, title: f.title, files: ["product-format.js", "search.js"] });

describe("Mercado Libre search results", () => {
  const w = load();
  const d = w.ChatReplaySearch.scrape();

  test("recognised as a results page", () => assert.equal(w.ChatReplaySearch.looksLikeSearch(), true));

  test("every grid card, and the carousel duplicate only once", () => {
    assert.deepEqual(d.results.map((r) => r.title), f.results.map((r) => r.title));
  });

  test("page context: query, total, sort, page", () => {
    assert.equal(d.query, "Pack Toallas Faciales Microfibra");
    assert.equal(d.total, 1204);
    assert.equal(d.sort, "Más relevantes");
    assert.equal(d.page, 1);
  });

  test("superscript cents are rebuilt, not concatenated", () => {
    assert.equal(d.results[0].price, "$12.999,32");
    assert.equal(d.results[0].previous, "$19.999");
    assert.equal(d.results[0].discount, "35% OFF");
    assert.match(d.results[0].instalments, /6 cuotas de \$2\.166,55/);
  });

  test("sponsored card is flagged and its click-tracker URL dropped", () => {
    const ad = d.results[1];
    assert.equal(ad.sponsored, true);
    assert.equal(ad.url, "");
    assert.equal(ad.id, "MLA1422093317");
    assert.equal(d.results[0].sponsored, false);
  });

  test("organic URLs lose the tracking fragment", () => {
    assert.equal(d.results[0].url, "https://articulo.mercadolibre.com.ar/MLA-1507831299-pack-x6-toallas-faciales-microfibra-suaves-_JM");
  });

  test("seller, rating, shipping", () => {
    const [a] = d.results;
    assert.equal(a.seller, "Casa Bella");
    assert.equal(a.rating, "4.7");
    assert.equal(a.ratingCount, "128");
    assert.equal(a.freeShipping, true);
  });

  test("renders a Markdown table with one row per result", () => {
    const md = w.ChatReplayProduct.one(d, {});
    const rows = md.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    assert.equal(rows.length, f.results.length, md);
    assert.ok(rows[0].includes("$12.999,32"));
  });

  test("class names renamed wholesale: the structural fallback still finds every card", () => {
    const scrambled = f.html
      .replace(/poly-component__title/g, "q1").replace(/poly-price__current/g, "q2")
      .replace(/poly-card/g, "q3").replace(/ui-search-layout__item/g, "q4");
    const d2 = load(scrambled).ChatReplaySearch.scrape();
    assert.match(d2.via, /structure/);
    assert.equal(d2.results.length, f.results.length);
    assert.equal(d2.results[0].price, "$12.999,32");
  });
});
