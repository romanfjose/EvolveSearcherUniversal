# ARCHITECT BLUEPRINT: SELF-EVOLVING SCOUT SYSTEM

## 1. Constitutional Hierarchy & Silicon Evolution Laws
1. **Tier 0 — Supreme Constitution (`NorthStar.md`)**: Overrides all other files, prompts, and scripts: Core Mission, Two-Boards Law (our domain is stocking the Ready Shelf; Commander actions are out of scope), Silicon-Grade Self-Evolution, Hard Exclusions. `RecallCharter.md` (Ring 0, immutable) sits directly under it: filing, ledger, roster floor, sector demotion, the Verify → Try-worthy → Ready tiers (G1–G4) and the fitness rule.
2. **Tier 1 — Domain Doctrine (`CommanderKnowledge.md` & `pipeline/0-profile/PROFILE.md`)**: Standing domain rules and Commander's verified facts subordinate to `NorthStar.md`.
3. **Tier 2 — Mutable Engine (`ARCHITECT_BLUEPRINT.md`, `prompts/*.md`, `tools/*.mjs`, Search Maps)**: The Brainstorm War Room (`13_brainstorm.md`) and Architect-Surgeon (`14_architect_surgeon.md`) may evolve, simplify, merge, or offload roles and scripts here, subject to the `NorthStar.md` §3 guardrails:
   - **Code Over Tokens**: fetching, HTML stripping, API polling, source availability checks and dedup belong in zero-token `tools/` scripts.
   - **Die Shrink & Capped Frontiers**: queues in `SearchLocationsList.md`, `ExperimentalSearchLocations.md` and `ExperimentalApproaches.md` hold at most **12 items**; to add one, evict a dead one to `telemetry/`. Prune redundant rules; compression alone is never evolution (`RecallCharter.md` §8).
   - **Non-Blocking**: route around bot walls laterally (public APIs, public source data, publisher feeds) or park a fast-paste request on `DecisionBoard.md`.

---

## 2. Shared File Assets
- `NorthStar.md`, `RecallCharter.md`: Tier-0 and Ring-0 rules (immutable by automated agents).
- `leads/screened.md`: append-only screened ledger, one line per title a scout looked at.
- `CommanderKnowledge.md`: Tier-1 domain doctrine; §4 defines evidence, readiness, stable opportunity identity, and refresh rules.
- `SearchLocationsList.md`: Vetted active locations, resume cursors, status (`Active`, `Active (Exploring)`, `Active (Needs New Approach)`, `Cooldown until YYYY-MM-DD`, `Blocked until YYYY-MM-DD`; demotion per `RecallCharter.md` §6), and Best Known Approaches + Fallbacks.
- `ExperimentalSearchLocations.md` & `ExperimentalApproaches.md`: Rolling 1-line-per-entry active queues of untested places and search tactics (capped; old tested entries evicted to `telemetry/`).
- `AhaBoard.md` & `DecisionBoard.md`: Single-section, append-only field flashes and asynchronous Commander assist requests (never blocks execution).
- `MissionBoard.md` & `PostMortem.md`: Ephemeral run board and synthesis report (archived to `telemetry/`).
- `leads/seen_urls.txt`: Stable active opportunity IDs plus dated rejection metadata (`dedup_leads.mjs`); refreshes remain eligible. Durable source excerpts live in `leads/evidence/`.
- `scratch/` & `scratch/paste/`: Workspace for temporary scripts, sensor feeds, and Commander fast-paste fixtures.

---

## 3. Baseline Role Matrix (Evolvable via `14_architect_surgeon.md`)

| # | Role | Core Directive (Reads/Writes: see each prompt's Inputs) |
|---|------|----------------|
| 01 | Mission Drafter | Builds a ≤2 KB MissionBoard header and per-slot briefs; covers every Active sector and at least 6 scouts. |
| 02 | Harvester Scout | Mines its sector from the cursor with `tools/` sensors and lateral recon; files high-recall dossiers; parks blocked high-value leads for fast-paste. |
| 03 | MapRecon Scout | Tests a brand-new hunting ground (`Where`): signal density, relevance and profile fit. |
| 04 | ApproachRecon Scout | Tests a new sensor or lateral method (`How`), or resolves parked high-ceiling `60% Fit` leads. |
| 05 | Assayer | Independent referee: grades leads (`100% / 80% / 60% / Junk`) against `NorthStar.md` & `CommanderKnowledge.md`. |
| 10 | Cleaner | Second opinion on `Junk`; rescues false rejections, moves confirmed Junk to `leads/rejected/`. |
| 06 | PostMortem Analyst | Synthesizes yield, bottlenecks, and efficiency into `PostMortem.md`; archives `MissionBoard.md` and reviewed board entries to `telemetry/`. |
| 07 | MapStretcher | Queues fresh hunting grounds, evicting dead or tested ones. |
| 08 | ApproachStretcher | Queues fresh technical/lateral tactics, evicting old ones. |
| 09 | RouteAdjuster | Updates cursors, promotes winning recon, quarantines 2-run-zero sites. |
| 13 | Brainstorm War Room | 5-agent debate on shelf quality, discovery blindspots, and **Silicon Efficiency** (lag, token waste, deadlocks, HTML bloat). |
| 14 | Architect-Surgeon | Applies the Brainstorm `Surgeon Action Manifest`: checkpoint, minimal changes, `architecture-guard` verify, full rollback on failure. |
| 15 | Auto-Evolution Loop | Step 0 Assayer-only regate every iteration (`lead-lint` `regate_needed`: `NO_GATES_LINE`, `STALE_GRADE`, `CLOSABLE`, `DEADLINE_PAST_REVIEW`), then `Brainstorm -> Architect-Surgeon -> Mission`; judges each iteration by `RecallCharter.md` §8 fitness (screened, filed, Try-worthy, Ready); context and cost are maintenance. |

---

## 4. Model Menu, Effort Multipliers & Compute Budget (Evolvable Roster)
- **Guiding Iteration Budget**: Target **≤ 55 CU** (soft ceiling **70 CU**) per full iteration: $\text{Agent CU} = \text{Base CU} \times \text{Effort Multiplier}$.
- **ChatGPT Model Menu (Base CU at `medium` = `1.0×`)**:
  - **Tier 4 — Apex (`GPT-6 Astra`)**: `8.0 CU` *(Optional deep thinker; reserve for rare architectural knots, never routine roles).*
  - **Tier 3 — Heavy (`GPT-6.1 Sol` / `GPT-6 Sol` / `GPT-5.6 Sol`)**: `4.5 CU` *(Architect-Surgeon, Coordinator, or ambiguous Assayer rulings).*
  - **Tier 2 — Middle Workhorse (`GPT-6.1 Terra` / `GPT-5.6 Terra`)**: `1.5 CU` *(Primary sweet spot for Field Scouts, Recon, Brainstormers, PostMortem, and standard Assayer passes).*
  - **Tier 1 — Light / Fast (`GPT-6 Luna` / `GPT-5.6 Luna`)**: `0.8 CU` *(High-volume parallel sweeps, Stretchers, Cleaner, and capacity-fallback retries).*
- **ChatGPT Effort Multipliers**: `light` = `0.6×` | `medium` = `1.0×` | `high` = `1.6×` | `extra high` = `2.5×` | `ultra` = `4.0×`.
- **Baseline Routing & Full Evolution Freedom**: Default `14_architect_surgeon` and `00_mission_coordinator` to `GPT-6.1 Sol` (`medium`/`high`), `05_assayer`, `06_post_mortem`, `13_brainstorm` and Scouts `02–04` to `GPT-6.1 Terra` (`medium`/`high`), and `01`/`07–10` to `GPT-6 Luna` (`medium`). Brainstorm, Surgeon, and Coordinator may freely add/remove/merge phases or agents and reassign any model + effort from the menu within the CU budget.
- **Cache Hygiene & Telemetry**: Reading raw files `>50 KB` from `scratch/.read-cache/` or `scratch/.checkpoint/` into LLM context adds a `+5 CU` bloat penalty; keep HTML parsing in `tools/*.mjs` (`<=10 KB` stdout). Log `compute_units` in `PostMortem.md` and `telemetry/autoloop_log.md`.
