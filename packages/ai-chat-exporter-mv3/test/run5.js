/* ============================================================
   run5 — the popup, driven the way Chrome drives it.

   run2 covers the content script's message API; nothing covered the
   popup itself, which is where v0.8's new behaviour actually lives:
   the page-kind labels, the search-only controls, and — the part that
   can silently destroy data — copy-then-clear.

   So this boots popup.html in jsdom with a stubbed `chrome`, points it
   at a Mercado Libre results tab, and clicks the buttons. The two
   assertions that matter most:

     - the list is emptied ONLY after a clipboard write that actually
       succeeded (a refused write that still cleared would lose the
       whole shopping trip);
     - flipping a formatting option re-renders from the cached read
       instead of re-scraping the page.

   node test/run5.js
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
const flush = (n = 6) => new Promise((r) => setTimeout(r, n * 5));

/* ---------------- the page the popup is standing on ---------------- */

const SEARCH_DATA = {
  kind: "search",
  site: "listado.mercadolibre.com.ar",
  url: "https://listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra",
  query: "Pack Toallas Faciales Microfibra",
  total: 54, totalText: "54 resultados", sort: "Más relevantes", filters: [], page: 1,
  extractedAt: new Date().toISOString(),
  results: [
    { title: "Pack X6 Toallas Faciales", url: "https://articulo.mercadolibre.com.ar/MLA-1-x-_JM", price: "$12.999,32", previous: "$19.999", discount: "35% OFF", instalments: "en 6 cuotas sin interés de $2.166", shipping: "Envío gratis", freeShipping: true, seller: "Casa Bella", rating: "4.7", ratingCount: "128", sold: "+50 vendidos", sponsored: false, attributes: [] },
    { title: "Toallas Microfibra X3", url: "https://articulo.mercadolibre.com.ar/MLA-2-x-_JM", price: "$8.450", shipping: "Llega gratis mañana", seller: "Tienda Sol", rating: "4.2", ratingCount: "31", sponsored: true, attributes: [] },
    { title: "Set 12 Toallitas", url: "https://articulo.mercadolibre.com.ar/MLA-3-x-_JM", price: "$21.300", shipping: "Envío gratis", sponsored: false, attributes: [] },
  ],
};

/* ---------------- boot ---------------- */

async function boot({ tabUrl, clipboardWorks = true, seed = null } = {}) {
  const dom = new JSDOM(read("popup.html"), {
    url: "chrome-extension://abc/popup.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const store = seed ? { ...seed } : {};
  const calls = [];       // every crp:* message the popup sends
  const badge = { text: "" };
  const clipboard = { text: null };

  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.8.0" }),
      sendMessage: async () => ({ runs: [] }),
    },
    tabs: {
      query: async () => [{ id: 7, url: tabUrl }],
      sendMessage: async (tabId, msg) => {
        calls.push(msg.crp || msg.cr);
        if (msg.crp === "ping") return { ok: true, host: "listado.mercadolibre.com.ar" };
        // The chat side: enough of a snapshot for render() to paint.
        if (msg.cr === "ping" || msg.cr === "state" || msg.cr === "settings") {
          return {
            ok: true, status: "Idle.", host: "claude.ai", adapterLabel: "Claude", model: "",
            promptCount: 0, progress: { i: 0, n: 0 }, range: { from: 1, to: 0, count: 0 },
            running: false, countdown: false, paused: false, busy: false, resumeAt: 0,
            turnCount: null, learned: "", pendingCopy: 0,
            settings: { settle: 4, minReply: 6, deep: true, showFab: false },
          };
        }
        if (msg.crp === "scrape" || msg.crp === "format") {
          return {
            ok: true, product: true, kind: "search",
            text: window.ChatReplayProduct.one(SEARCH_DATA, msg.opts || {}),
            stats: { results: 3, sponsored: 1, total: 54, via: ".poly-card" },
            data: SEARCH_DATA,
          };
        }
        throw new Error("no content script");
      },
    },
    scripting: { executeScript: async () => [], insertCSS: async () => [] },
    action: {
      setBadgeText: ({ text }) => { badge.text = text; },
      setBadgeBackgroundColor: () => {},
    },
    storage: {
      local: {
        get: async (k) => (typeof k === "string" ? { [k]: store[k] } : { ...store }),
        set: async (obj) => { Object.assign(store, obj); },
      },
    },
  };

  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (t) => {
        if (!clipboardWorks) throw new Error("blocked");
        clipboard.text = t;
      },
    },
  });
  // The execCommand fallback must not rescue a refused write in the
  // clipboard-blocked test.
  window.document.execCommand = () => clipboardWorks;

  window.eval(read("adapters.js"));
  window.eval(read("product-format.js"));

  // jsdom may or may not have fired DOMContentLoaded by the time the
  // scripts are evaluated. Firing our own unconditionally booted the
  // popup TWICE, which doubled every listener — worth catching here,
  // since a double-wired copy button would clear the list twice.
  let fired = false;
  window.document.addEventListener("DOMContentLoaded", () => { fired = true; });
  window.eval(read("popup.js"));
  await flush(2);
  if (!fired) window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await flush(20);

  const $ = (s) => window.document.querySelector(s);
  return { window, $, store, calls, badge, clipboard,
    basket: () => store["chatReplay.basket"] || [] };
}

const ML = "https://listado.mercadolibre.com.ar/pack-toallas-faciales-microfibra#D[A:Pack]";

async function main() {
  /* ---------------- 1. arriving on a results page ---------------- */

  console.log("\npopup — on a Mercado Libre results page");
  {
    const { $, calls, window } = await boot({ tabUrl: ML });

    ok("only the Product tab is offered", 
      Array.from(window.document.querySelectorAll(".tab")).every((t) => t.hidden === (t.dataset.tab !== "product")));
    ok("the product pane is showing", $(".pane[data-pane='product']").classList.contains("on"));
    ok("it read the page once", calls.filter((c) => c === "scrape").length === 1, calls.join(","));

    ok("the pane says what kind of page this is", $("#pwhat").textContent === "This search", $("#pwhat").textContent);
    ok("the add button counts the results", /Add all 3 results/.test($("#pkeep").textContent), $("#pkeep").textContent);
    ok("the add button is live", $("#pkeep").disabled === false);
    ok("copy-one is relabelled for a page", /this page/.test($("#pcopy").textContent), $("#pcopy").textContent);
    ok("the search controls are visible", $("#psearchrow").hidden === false);
    ok("the spec-sheet expander is hidden (no listing to expand)", $("#pexpandrow").hidden === true);
    ok("the preview holds the table", $("#ppreview").value.includes("| # | Producto | Precio |"));
    ok("stats mention the page total", /3 results.*54/.test($("#pstats").textContent), $("#pstats").textContent);
  }

  /* ---------------- 2. adding, copying, clearing ---------------- */

  console.log("\npopup — add, copy, clear");
  {
    const { $, basket, badge, clipboard } = await boot({ tabUrl: ML });

    $("#pkeep").click();
    await flush();
    ok("one entry saved, not fifty", basket().length === 1);
    ok("it's the search, with its results inside", basket()[0].data.kind === "search" && basket()[0].data.results.length === 3);
    ok("the badge counts entries", badge.text === "1", badge.text);
    ok("the list line counts the results too", /3 resultados/.test($("#pcount").textContent), $("#pcount").textContent);
    ok("Clear is enabled now", $("#pclear").disabled === false);

    // Adding the same search again replaces it rather than duplicating.
    $("#pkeep").click();
    await flush();
    ok("re-adding the same search doesn't duplicate it", basket().length === 1);
    ok("the button says so", /Already in the list/.test($("#pkeep").textContent), $("#pkeep").textContent);

    $("#pcopylist").click();
    await flush();
    ok("the clipboard got the markdown", /^# Búsqueda: “Pack Toallas/.test(clipboard.text || ""), (clipboard.text || "").slice(0, 40));
    ok("the list is NOT cleared behind your back", basket().length === 1);
    ok("Clear becomes the obvious next step", $("#pclear").classList.contains("primary") && /copied it/.test($("#pclear").textContent), $("#pclear").textContent);

    $("#pclear").click();
    await flush();
    ok("Clear empties the list", basket().length === 0);
    ok("and the badge goes with it", badge.text === "");
    ok("Clear goes quiet again", !$("#pclear").classList.contains("primary") && $("#pclear").disabled === true);
  }

  /* ---------------- 3. copy-then-clear ---------------- */

  console.log("\npopup — the opt-in 'empty it as soon as it's copied'");
  {
    const { $, basket, clipboard } = await boot({ tabUrl: ML });
    $("#pkeep").click();
    await flush();
    $("#pautoclear").click();          // opt in
    await flush();
    $("#pcopylist").click();
    await flush();
    ok("copied", /Búsqueda/.test(clipboard.text || ""));
    ok("and emptied", basket().length === 0);
    ok("the preference persists for next time", $("#pautoclear").checked === true);
  }

  console.log("\npopup — a refused clipboard write must not empty the list");
  {
    const { $, basket } = await boot({ tabUrl: ML, clipboardWorks: false });
    $("#pkeep").click();
    await flush();
    $("#pautoclear").click();
    await flush();
    $("#pcopylist").click();
    await flush();
    ok("the list survives", basket().length === 1);
    ok("and the text is offered for a manual copy", $("#pfallback").hidden === false);
    ok("with the markdown in it", /Búsqueda/.test($("#pfalltext").value));
  }

  /* ---------------- 4. options don't re-touch the page ---------------- */

  console.log("\npopup — formatting options re-render, they don't re-scrape");
  {
    const { $, calls, window } = await boot({ tabUrl: ML });
    const scrapes = () => calls.filter((c) => c === "scrape").length;
    const before = scrapes();

    $("#ptable").checked = false;
    $("#ptable").dispatchEvent(new window.Event("change"));
    await flush();
    ok("table off switches the preview to blocks",
      $("#ppreview").value.includes("## 1. Pack X6") && !$("#ppreview").value.includes("| # |"),
      $("#ppreview").value.split("\n").slice(0, 6).join("\n"));

    $("#pmax").value = "2";
    $("#pmax").dispatchEvent(new window.Event("change"));
    await flush();
    ok("max trims the preview", ($("#ppreview").value.match(/^## \d+\./gm) || []).length === 2);

    ok("neither re-read the page", scrapes() === before, `${scrapes()} vs ${before}`);

    $("#prescan").click();
    await flush();
    ok("Re-read the page does", scrapes() === before + 1);

    ok("the choices are remembered", JSON.parse(JSON.stringify(
      (await window.chrome.storage.local.get("chatReplay.product"))["chatReplay.product"])).table === false);
  }

  /* ---------------- 5. arriving at the chat with a search saved ---------------- */

  console.log("\npopup — the saved search is reachable from the chat tab");
  {
    const saved = {
      "chatReplay.basket": [{
        key: "search:" + SEARCH_DATA.url,
        addedAt: Date.now(),
        data: SEARCH_DATA,
      }],
    };
    const { $, clipboard, badge } = await boot({ tabUrl: "https://claude.ai/chat/abc", seed: saved });

    ok("the badge says something is waiting", badge.text === "1", badge.text);
    ok("the product pane is what you land on", $(".pane[data-pane='product']").classList.contains("on"));
    ok("the page-dependent half is hidden", $(".pane[data-pane='product']").classList.contains("listonly"));
    ok("the saved search is listed", /🔎 Pack Toallas/.test($("#plist").textContent), $("#plist").textContent.trim());
    ok("its size is shown", /3 res\./.test($("#plist").textContent));
    ok("the search formatting controls came along", $("#psearchrow").hidden === false);

    $("#pcopylist").click();
    await flush();
    ok("copying works with no listing under the popup", /^# Búsqueda/.test(clipboard.text || ""), (clipboard.text || "").slice(0, 30));
    ok("and Clear is right there", $("#pclear").disabled === false && /copied it/.test($("#pclear").textContent));
  }

  console.log(failures ? `\n${failures} failure(s)\n` : "\nall good\n");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
