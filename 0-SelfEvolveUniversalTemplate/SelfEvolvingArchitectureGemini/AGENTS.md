# Universal discovery engine — Gemini

Read NorthStar.md, RecallCharter.md, ARCHITECT_BLUEPRINT.md and PROFILE.md before a mission. Follow the startup personalization gate in tools/template-check.mjs. This is a fresh unpersonalized template; never infer a lane from old examples.

Use the host's native tools and route subagent models and effort per `ARCHITECT_BLUEPRINT.md` §4 within the **Guiding Compute Budget (`≤ 55 CU` target / `70 CU` ceiling per full iteration; $\text{Agent CU} = \text{Base CU} \times \text{Effort Multiplier}$)**:
- **Gemini Model Base Cost (`medium` = `1.0×`)**: `Gemini 4 Argon` = `4.5 CU` (heavy architect/surgeon/coordinator) | `Gemini 3.8 Flash` = `1.5 CU` (primary workhorse for scouts, brainstorm, assayer, postmortem) | `Gemini Flash-Lite` = `0.8 CU` (fast sweeps, stretchers, cleaner, retries).
- **Gemini Effort Multipliers**: `low` = `0.6×` | `medium` = `1.0×` | `high` = `1.6×`.
- **Autonomy & Hygiene**: Never default every worker to `Gemini 4 Argon` (`high`). The project owns its workflow (`prompts/15_autoloop.md`, default `N=1` iteration) and may freely add/remove/merge phases and agents or adjust model/effort assignments within the CU budget. Never read raw `scratch/.read-cache/` or `scratch/.checkpoint/` files into LLM context (`+5 CU` bloat penalty; cap tool stdout at `<= 10 KB`). Never attach to or debug the user's active logged-in Chrome browser (extension/chrome backend); use `tools/preflight-and-verify.mjs` HTTP readers or an isolated/guest/headless browser (`iab`/Chromium) only. Schedule at least six discovery slots in waves within actual worker limits; bound waits to 60 seconds and workers to 15 minutes; confirmed cancellation is required before phase transitions. If the host lacks subagents, report that capability gap; never fabricate independent workers or completion.

Ring 0 is NorthStar.md, RecallCharter.md, prompts/05_assayer.md and tools/architecture-guard.mjs. Automated evolution cannot edit it. User-directed personalization explicitly permits changing the domain rules before sealing a new baseline, while retaining reliability invariants.

Use the shared parent dashboard, or copy the complete template group for another lane. Provider label: Gemini. Configure this engine's own runner explicitly; never silently substitute another provider.
