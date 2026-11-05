# Clash with Reality

A low-friction epistemic coach. It turns a vague personal or engineering bottleneck into **one small, falsifiable real-world experiment**, asks you to forecast the result before you start, and scores that forecast once you know what happened.

The flow is **understand → try → reflect**. You describe the friction in plain words. You pick a working hypothesis. You run a 5–25 minute test that states what result would *weaken* that hypothesis. Then you answer one debrief question. Your forecasts build a personal calibration curve over time.

## Two ways to run it

| | Standalone demo | Full app |
| --- | --- | --- |
| Entry | [`docs/index.html`](docs/index.html) | `npm run dev` / `npm start` |
| Needs | A browser | Node ≥ 22 |
| Coach | Built-in deterministic trees | LLM (your key or the server's), with the built-in trees as fallback |
| Storage | `localStorage` | `localStorage`, or Firestore when signed in |
| Network | None (enforced by CSP) | OpenRouter / Gemini when configured |

### Standalone (zero dependencies)

Open `docs/index.html` directly, or host it on any static server. To publish it on GitHub Pages, point a Pages workflow at `packages/epistemic-experiment-coach/docs`. The branch-based "/docs" option only serves the repository root's `docs/` folder.

The page is **generated**: never edit it by hand. Edit `src/core/` or `src/standalone/app.js`, then run:

```bash
npm run build:standalone
```

### Full app

```bash
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The app asks for a coach in this order:

1. A key the user saved in **Settings** (Gemini or OpenRouter), called from the browser.
2. The Express server's `/api/coach`, using the server-held `OPENROUTER_API_KEY`. Copy `.env.example` to `.env` and add the key; it never reaches the browser.
3. The built-in deterministic coach, if neither of the above answers.

For production:

```bash
npm run build
npm start
```

`npm run build` builds both `dist/` (served by `server.mjs`) and the standalone page.

## Built-in coaching trees

[`src/core/domains.mjs`](src/core/domains.mjs) holds five domains plus a general fallback. The domain is detected from keyword matches in the problem text, in English and Spanish.

| Domain | Hypotheses it can test |
| --- | --- |
| Cooking & Sensory Mastery | don't know how · too much effort · not worth it · food turns out badly |
| Software Architecture & Bottleneck Debugging | waiting not computing · one hot path · can't reproduce · coupling |
| Freelance & Market Demand Testing | no demand · unclear offer · unknown buyer · avoiding exposure |
| Habit & Energy Calibration | wrong time of day · habit too big · no cue · irregular sleep |
| Social & Communication Hypothesis Testing | harsh judgment · blanking · waiting for the perfect moment · not interested |

Every hypothesis has one challenge designed to test it. Each challenge comes with a complete beginner plan and a stated **falsifier**: the observation that would count against the hypothesis. The first step of each plan usually asks you to write a prediction. Where relevant, plans carry safety notes, such as food safety or "not medical advice".

## Calibration ledger

Before each experiment, you record your confidence (0–100%) that you'll reach the minimum success. The debrief turns the outcome into a hit or a miss. "Done" counts as a hit, whether it was easier than expected or annoying. "Stuck" and "didn't do it" count as misses. Once the outcome is recorded, the forecast is frozen, so you can't edit it in hindsight.

[`src/core/calibration.mjs`](src/core/calibration.mjs) computes these measures from your history:

- **Brier score**: the mean of (confidence − outcome)². 0 is perfect; 0.25 is what you get by always saying 50%.
- **Murphy decomposition**: BS = reliability − resolution + uncertainty. Forecasts are grouped by their exact value, so the identity holds exactly.
- **Brier skill**: your score compared with always forecasting your own base rate.
- **Reliability diagram**: forecasts grouped into five confidence bins, plus a one-line reading of over- or underconfidence.
- **Export**: the ledger downloads as JSON (`clash-with-reality/calibration-ledger` v1) or Markdown.

## Architecture

```
src/core/          pure ES modules, shared by every surface and the tests
  domains.mjs      coaching trees, domain detection, offline coach
  journey.mjs      phase state machine: guarded, pure transitions
  calibration.mjs  Brier math, ledger, exports, SVG chart
  prompts.mjs      LLM prompts, request validation, response-shape checks
  styles.mjs       shared stylesheet
src/server/app.mjs createApp(): /api/coach with validation, rate limit, timeouts, security headers
src/standalone/    vanilla UI for docs/index.html
scripts/build-standalone.mjs   inlines core + standalone UI into docs/index.html (--check to verify)
epistemic-engine.jsx           React UI
server.mjs                     production entry point
```

What the server enforces:

- **Requests**: JSON-only (415 otherwise), a 64 KB body limit, and an action whitelist.
- **Context sent to the model**: whitelisted, length-capped fields; only `user`/`assistant` chat roles, last 12 turns.
- **Rate limit**: a per-IP fixed window (default 20 requests/min, with `RateLimit-*` and `Retry-After` headers). Set `TRUST_PROXY` when running behind a proxy.
- **Upstream calls**: 30 s timeout. Provider errors are mapped to generic 502/504 responses, and model output is shape-checked before it reaches the UI.

## Tests

```bash
npm test
```

The suite contains 81 `node:test` cases and needs no network:

| File | Covers |
| --- | --- |
| `test/domains.test.mjs` | Domain detection; tree completeness and plan contract; challenge ordering; offline plans and chat |
| `test/journey.test.mjs` | Every transition and guard; purity; forecast freezing |
| `test/calibration.test.mjs` | Brier values; Murphy identity; skill; curve bins; ledger; exports; chart |
| `test/server.test.mjs` | Validation; 400/413/415/429/502/503/504 paths; header and leak checks; prompt building |
| `test/standalone.test.mjs` | `docs/index.html` matches the build; self-contained; boots in a VM DOM stub |

The cooking walkthrough with screenshots is in [`docs/cooking-flow/`](docs/cooking-flow/README.md).
