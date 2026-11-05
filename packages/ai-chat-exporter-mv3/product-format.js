/* ============================================================
   Chat Replay — product formatting (v0.7)

   Split out of product.js because two different documents now need to
   render the same data:

     - the injected script, for the preview of the page you're on;
     - the POPUP, for the saved list — which has to be copyable from a
       tab that has no listing in it at all (you're standing on
       claude.ai when you paste).

   So the popup can't ask a content script to format the list; there
   isn't one. This file loads in both places, the way adapters.js
   already does.

   The data objects are the ones product.js builds. Everything here is
   defensive about missing fields: an item saved by an older version,
   or one where a section wasn't on the page, must still render.
   ============================================================ */

(() => {
  const api = {};

  const rep = (n) => "#".repeat(Math.max(1, n));

  /* ---------------- one product ---------------- */

  // ctx.depth pushes every heading down a level so a product can sit
  // under a numbered list item without its "## Descripción" colliding
  // with the item boundary. ctx.index prints that number.
  function toMarkdown(d, opt, ctx) {
    d = d || {};
    opt = opt || {};
    ctx = ctx || {};
    const depth = ctx.depth || 0;
    const H1 = rep(depth + 1), H2 = rep(depth + 2), H3 = rep(depth + 3);
    const price = d.price || {};
    const L = [];

    L.push(`${H1} ${ctx.index ? ctx.index + ". " : ""}${d.title || "(sin título)"}`, "");

    const facts = [];
    if (d.url) facts.push(`- URL: ${d.url}`);
    const idbits = [d.catalog, d.publication && `publicación ${d.publication}`].filter(Boolean).join(" · ");
    if (idbits) facts.push(`- ID: ${idbits}`);
    if (d.breadcrumb?.length) facts.push(`- Categoría: ${d.breadcrumb.join(" > ")}`);
    if (d.brand) facts.push(`- Marca: ${d.brand}`);
    const state = [d.condition, d.sold].filter(Boolean).join(" · ");
    if (state) facts.push(`- Estado: ${state}`);
    if (d.badge) facts.push(`- Destacado: ${d.badge}`);
    if (d.rating) facts.push(`- Calificación: ${d.rating}/5${d.ratingCount ? ` (${d.ratingCount} opiniones)` : ""}`);

    let priceLine = price.current || "";
    if (priceLine && price.previous) {
      priceLine += ` (antes ${price.previous}${price.discount ? `, ${price.discount}` : ""})`;
    }
    if (priceLine) facts.push(`- Precio: ${priceLine}`);
    if (price.instalments) facts.push(`- Cuotas: ${price.instalments}`);
    if (price.taxFree) facts.push(`- ${price.taxFree}`);
    if (price.freeShipping) facts.push("- Envío gratis: sí");
    L.push(...facts, "");

    if (d.variations?.length) {
      L.push(`${H2} Variante seleccionada`);
      for (const v of d.variations) {
        const others = v.options?.length ? ` — otras opciones: ${v.options.join(", ")}` : "";
        L.push(`- ${v.name}: **${v.selected || "—"}**${others}`);
      }
      L.push("");
    }

    if (d.highlights?.length) {
      L.push(`${H2} Lo que tenés que saber`);
      d.highlights.forEach((h) => L.push(`- ${h}`));
      L.push("");
    }

    if (opt.specs && d.specs?.length) {
      L.push(`${H2} Características`);
      for (const g of d.specs) {
        if (g.group) L.push("", `${H3} ${g.group}`);
        (g.rows || []).forEach((r) => L.push(`- ${r.k}: ${r.v}`));
      }
      L.push("");
    }

    if (opt.description && d.description) {
      L.push(`${H2} Descripción`, "", d.description, "");
    }

    if (opt.logistics) {
      const b = d.buybox || {}, s = d.seller || {};
      const rows = [];
      if (b.delivery) rows.push(`- Entrega: ${b.delivery}`);
      if (b.pickup) rows.push(`- Retiro: ${b.pickup}`);
      if (b.stock) rows.push(`- Stock: ${b.stock}`);
      if (b.quantity) rows.push(`- Disponibilidad: ${b.quantity}`);
      if (b.fulfilled) rows.push(`- Logística: ${b.fulfilled}`);
      if (s.name) rows.push(`- Vendedor: ${s.name}${s.official ? " (tienda oficial)" : ""}`);
      (s.lines || []).forEach((t) => rows.push(`  - ${t}`));
      (d.guarantees || []).forEach((t) => rows.push(`- ${t}`));
      if (rows.length) L.push(`${H2} Envío, stock y vendedor`, ...rows, "");
    }

    const rv = d.reviews || {};
    if (opt.reviews && (rv.summary || rv.comments?.length)) {
      L.push(`${H2} Opiniones`);
      if (rv.summary) L.push(`- Resumen: ${rv.summary}`);
      (rv.comments || []).forEach((c) => L.push(`- ${c.stars ? `${c.stars}★ ` : ""}${c.text}`));
      L.push("");
    }

    if (ctx.footer !== false) {
      L.push(`_Extraído de ${d.site || "Mercado Libre"} el ${stamp(d.extractedAt)}._`);
    }
    return tidy(L.join("\n"));
  }

  const tidy = (s) => s.replace(/\n{3,}/g, "\n\n").trim();
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function stamp(iso) {
    const t = iso ? new Date(iso) : new Date();
    return isNaN(t) ? "" : t.toLocaleString();
  }

  /* ---------------- a page of search results ---------------- */

  // Fifty products rendered the way ONE product is rendered would be
  // two thousand lines, and the question being asked of them — "which
  // of these is worth opening?" — is a comparison. So the default is
  // one row per result: every card's numbers land in the same column,
  // which is the shape that makes them comparable at a glance and the
  // cheapest one to paste. `detail` (table off) is there for the cases
  // where a handful of results deserve their own block.

  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, " ").trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);

  // "en 6 cuotas sin interés de $ 2.166" is a column's worth of words
  // for two facts. → "6x $2.166 s/int"
  function shortInstalments(s) {
    const t = clean(s);
    if (!t) return "";
    const m = t.match(/(\d+)\s*(?:x|cuotas?)[^$]{0,20}(\$\s?[\d.]+(?:,\d+)?)/i);
    if (!m) return cut(t, 28);
    return `${m[1]}x ${m[2].replace(/\s/g, "")}${/sin inter[eé]s|s\/inter/i.test(t) ? " s/int" : ""}`;
  }

  function shortShipping(r) {
    const t = clean(r.shipping);
    if (!t) return "";
    if (/^env[ií]o gratis$/i.test(t)) return "Gratis";
    return cut(t, 26);
  }

  function resultsTable(results, opt) {
    const showLog = opt.logistics !== false;
    const cols = [
      { h: "#", get: (r, i) => String(i + 1) },
      {
        h: "Producto",
        get: (r) => {
          const name = cut(cell(r.title), 90);
          const linked = r.url ? `[${name}](${r.url})` : name;
          const tags = [r.sponsored ? "patr." : "", r.badge ? cut(cell(r.badge).toLowerCase(), 22) : ""].filter(Boolean);
          return linked + (tags.length ? ` _(${tags.join(", ")})_` : "");
        },
      },
      { h: "Precio", get: (r) => cell(r.price) },
      { h: "Antes", get: (r) => [cell(r.previous), cell(r.discount)].filter(Boolean).join(" ") },
      { h: "Cuotas", get: (r) => cell(shortInstalments(r.instalments)) },
      { h: "Envío", get: (r) => (showLog ? cell(shortShipping(r)) : ""), skip: !showLog },
      {
        h: "Calif.",
        get: (r) => (r.rating ? `${cell(r.rating)}${r.ratingCount ? ` (${cell(r.ratingCount)})` : ""}` : ""),
      },
      { h: "Vendidos", get: (r) => (showLog ? cell(r.sold) : ""), skip: !showLog },
      {
        h: "Vendedor",
        get: (r) => (showLog ? cut(cell(r.seller) + (r.official ? " ✓of." : ""), 30) : ""),
        skip: !showLog,
      },
    ].filter((c) => !c.skip);

    const rows = results.map((r, i) => cols.map((c) => c.get(r, i)));
    // A column nobody filled is a column of empty pipes — drop it.
    const keep = cols.map((c, ci) => ci < 3 || rows.some((row) => row[ci]));
    const head = cols.filter((_, i) => keep[i]).map((c) => c.h);

    const L = [
      `| ${head.join(" | ")} |`,
      `| ${head.map(() => "---").join(" | ")} |`,
    ];
    for (const row of rows) L.push(`| ${row.filter((_, i) => keep[i]).join(" | ")} |`);
    return L;
  }

  function resultsDetail(results, opt, H) {
    const L = [];
    results.forEach((r, i) => {
      L.push(`${H} ${i + 1}. ${r.title}${r.sponsored ? " (patrocinado)" : ""}`);
      const bits = [];
      let priceLine = r.price || "";
      if (priceLine && r.previous) priceLine += ` (antes ${r.previous}${r.discount ? `, ${r.discount}` : ""})`;
      if (priceLine) bits.push(`- Precio: ${priceLine}`);
      if (r.instalments) bits.push(`- Cuotas: ${r.instalments}`);
      if (r.badge) bits.push(`- Destacado: ${r.badge}`);
      if (r.rating) bits.push(`- Calificación: ${r.rating}${r.ratingCount ? ` (${r.ratingCount})` : ""}`);
      if (r.attributes?.length) bits.push(`- Atributos: ${r.attributes.join(" · ")}`);
      if (opt.logistics !== false) {
        if (r.shipping) bits.push(`- Envío: ${r.shipping}${r.full ? " (Full)" : ""}`);
        if (r.sold) bits.push(`- Vendidos: ${r.sold}`);
        if (r.seller) bits.push(`- Vendedor: ${r.seller}${r.official ? " (tienda oficial)" : ""}`);
      }
      if (r.url) bits.push(`- URL: ${r.url}`);
      else if (r.id) bits.push(`- ID: ${r.id}`);
      L.push(...bits, "");
    });
    return L;
  }

  function searchToMarkdown(d, opt, ctx) {
    d = d || {};
    opt = opt || {};
    ctx = ctx || {};
    const depth = ctx.depth || 0;
    const H1 = rep(depth + 1), H2 = rep(depth + 2);
    const max = Math.max(1, Number(opt.max) || 50);
    const all = d.results || [];
    const results = all.slice(0, max);

    const L = [];
    const what = d.query ? `Búsqueda: “${d.query}”` : "Resultados de Mercado Libre";
    L.push(`${H1} ${ctx.index ? ctx.index + ". " : ""}${what} — ${results.length} resultado${results.length === 1 ? "" : "s"}`, "");

    const facts = [];
    if (d.url) facts.push(`- URL: ${d.url}`);
    if (d.totalText || d.total) {
      const shown = all.length > results.length ? `, se muestran ${results.length}` : "";
      facts.push(`- Total en la búsqueda: ${d.totalText || d.total}${shown}`);
    } else if (all.length > results.length) {
      facts.push(`- Recortado a los primeros ${results.length} de ${all.length} de la página`);
    }
    if (d.page > 1) facts.push(`- Página: ${d.page}`);
    if (d.sort) facts.push(`- Orden: ${d.sort}`);
    if (d.filters?.length) facts.push(`- Filtros aplicados: ${d.filters.join(" · ")}`);
    const ads = results.filter((r) => r.sponsored).length;
    if (ads) facts.push(`- Patrocinados: ${ads} de ${results.length} (son anuncios, no ranking)`);
    if (facts.length) L.push(...facts, "");

    if (!results.length) {
      L.push("_No se encontraron resultados en esta página._");
    } else if (opt.table === false) {
      L.push(...resultsDetail(results, opt, H2));
    } else {
      L.push(...resultsTable(results, opt), "");
      L.push("_Precios tal como los muestra la página; los de cuotas pueden incluir interés salvo que diga “s/int”._");
    }

    if (ctx.footer !== false) {
      L.push("", `_Extraído de ${d.site || "Mercado Libre"} el ${stamp(d.extractedAt)}._`);
    }
    return tidy(L.join("\n"));
  }

  const isSearch = (d) => !!d && d.kind === "search";

  // Same content with the Markdown syntax taken off — for chat boxes
  // that render hashes and asterisks literally. A results table keeps
  // its pipes: they're still the thing holding the columns apart.
  const plainify = (md) => md
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/_/g, "")
    .replace(/^- /gm, "• ")
    .replace(/^ {2}- /gm, "   - ");

  // JSON honours the same include toggles, so what you copy matches
  // what the preview showed.
  function trimmed(d, opt) {
    const out = { ...d };
    if (isSearch(d)) {
      out.results = (d.results || []).slice(0, Math.max(1, Number(opt.max) || 50));
      if (!opt.logistics) {
        out.results = out.results.map(({ shipping, freeShipping, full, seller, official, sold, ...keep }) => keep);
      }
      return out;
    }
    if (!opt.specs) delete out.specs;
    if (!opt.description) delete out.description;
    if (!opt.logistics) { delete out.buybox; delete out.seller; delete out.guarantees; }
    if (!opt.reviews) delete out.reviews;
    return out;
  }

  const render = (d, opt, ctx) => (isSearch(d) ? searchToMarkdown(d, opt, ctx) : toMarkdown(d, opt, ctx));

  api.one = (d, opt) => {
    opt = opt || {};
    if (opt.format === "json") return JSON.stringify(trimmed(d, opt), null, 2);
    const md = render(d, opt, { depth: 0 });
    return opt.format === "plain" ? plainify(md) : md;
  };

  /* ---------------- a list of products ---------------- */

  // The separator carries the whole job: a model has to be able to say
  // "the third one" and mean the same product you do. A numbered `##`
  // heading per item does that in one line — no table of contents, no
  // repeated preamble, no per-item metadata block. Everything inside an
  // item is pushed a level down so the item headings stay the only
  // boundaries in the file.
  api.list = (items, opt) => {
    opt = opt || {};
    const datas = (items || []).map((i) => i?.data).filter(Boolean);
    if (!datas.length) return "";
    if (datas.length === 1 && opt.format !== "json") return api.one(datas[0], opt);

    if (opt.format === "json") {
      return JSON.stringify(datas.map((d) => trimmed(d, opt)), null, 2);
    }

    const parts = datas.map((d, i) =>
      render(d, opt, { depth: 1, index: i + 1, footer: false }));

    const md = tidy([
      `# Mercado Libre — ${countLabel(datas)}`,
      "",
      parts.join("\n\n"),
      "",
      `_Extraído de Mercado Libre el ${stamp()}._`,
    ].join("\n"));

    return opt.format === "plain" ? plainify(md) : md;
  };

  // A list can hold both kinds now, and "3 productos" would be a lie
  // when one of them is a page of fifty.
  function countLabel(datas) {
    const searches = datas.filter(isSearch).length;
    const products = datas.length - searches;
    const bits = [];
    if (products) bits.push(`${products} producto${products > 1 ? "s" : ""}`);
    if (searches) bits.push(`${searches} búsqueda${searches > 1 ? "s" : ""}`);
    return bits.join(" y ");
  }

  // One line per item for the popup's own list — not part of any
  // copied output.
  api.label = (item) => {
    const d = item?.data || {};
    if (isSearch(d)) {
      const n = (d.results || []).length;
      return { title: `🔎 ${d.query || d.url || "búsqueda"}`, price: `${n} res.` };
    }
    return { title: d.title || "(sin título)", price: d.price?.current || "" };
  };

  // The key decides what counts as "the same thing" when you add it
  // twice. For a search that's the URL including its query string —
  // page 2 of the same search is a different set of products, and
  // re-adding page 1 after re-sorting it should replace it.
  api.key = (d) => (isSearch(d)
    ? "search:" + (d.url || d.query || "")
    : (d?.catalog || d?.url || d?.title || "")).toString();

  (typeof window !== "undefined" ? window : globalThis).ChatReplayProduct = api;
})();
