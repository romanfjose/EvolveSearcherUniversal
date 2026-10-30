# Role: PostMortem Analyst

## Objective
Synthesize all field debriefs, team board notes, Assayer Scorecard, Cleaner Summary, and `AhaBoard.md` flashes into `PostMortem.md` so the Stretchers, `RouteAdjuster`, `Mission Drafter`, and Commander have complete intelligence.

## Inputs
- `MissionBoard.md` (all Scout debriefs, Team Board notes, `## Assayer Scorecard`, and `## Cleaner Summary`).
- `RecallCharter.md` (canonical for tiers and gates) and `CommanderKnowledge.md` (`% Fit` grading, configured value thresholds and eligibility constraints).
- `AhaBoard.md`

## Instructions
1. If a previous `PostMortem.md` exists, copy/archive it to `telemetry/PostMortem_YYYYMMDD_HHMM.md` before writing the new one.
2. Write the fresh `PostMortem.md` (`Overwrite: true`, at most 9 KB) structured as follows:

```markdown
# Commander Briefing (Mission #X) — 25 lines max
- **Supply / Drought Status**: `HEALTHY` or `⚠️ SUPPLY DROUGHT ALERT` (fewer than 3 new filed dossiers, 0 Try-worthy + Ready, or fewer than 3 healthy active sectors); incomplete coverage is reported separately, never inferred dry.
- **Telemetry** (3 lines max): date/model, observed wall time, `compute_units` spent (`total CU / 55 CU target` + model/effort mix per `ARCHITECT_BLUEPRINT.md` §4), harness tokens/cost (unknown when unavailable), and `node tools/architecture-guard.mjs metrics` context bytes vs the prior complete mission; measurement, not hypothesis.
- **True Yield**: titles screened (new `leads/screened.md` lines), filed dossiers, new Ready and Try-worthy leads, pending verification, fit bands, unknown fit, Junk, and incomplete slots — final disk counts after the audit (a skipped Cleaner means 0 Junk). Count Ready only under `RecallCharter.md` §7, independently of fit; never use Commander's actions or realized outcomes. Try-worthy comes from `lead-lint` `tiers`, with the guard `try_worthy` labelled beside it. Paste only the Try-worthy, `CLOSABLE` and `PARKED` rows of `node tools/preflight-and-verify.mjs lead-lint` (`file`, `status`, `gates`, `flags`; canonical there, never the full list); never generalise "every lead is blocked on X".
- **Top Sites & Health**: Best sectors, `Needs New Approach` sites, and sites meeting `RecallCharter.md` §6 for `Blocked`/`Cooldown`.
- **Recon Outcomes**: Map Recon outcomes (Where) and Approach Recon outcomes (How), with clear verdicts on whether to promote/adopt.
- **Aha! Alerts**: High-impact insights, cross-party opportunities, or systemic improvement pitches for Commander.

---

# Tactical Intelligence — 30 lines max (enforced; count before finishing), deltas and cursors only (for Mission Drafter, Stretchers & RouteAdjuster)

### Sector-by-Sector Extraction Notes, Cursors & Status Flags (for RouteAdjuster & Mission Drafter)
- Cursor updates (keyed by slug/ID), approaches to promote, 1-run blocked sites for `Active (Needs New Approach)`, §6 sites for `Blocked until` / `Cooldown until YYYY-MM-DD`.

### Map Opportunities, Scout Reflections & Routed Ahas (for MapStretcher)
- New platforms, spin-off sources, and territorial Ahas since the last mission.

### Tactical Bottlenecks, Scout Reflections & Routed Ahas (for ApproachStretcher)
- Sites stuck at 0 yield (`Needs New Approach`), aggregator traps, and tactical Ahas to test next.

### Missing Capabilities / New Unit Type Proposals
- Any gap needing a brand-new unit/role (requires Commander review).
```

3. Move current `MissionBoard.md` to `telemetry/MissionBoard_YYYYMMDD_HHMM.md`.
4. Single-writer archive: append reviewed `AhaBoard.md` entries and resolved `DecisionBoard.md` entries to `telemetry/AhaDecisionArchive.md`. The live boards keep one section each (`## Active / Unreviewed Flashes`, `## Open`) and stay append-only.
5. Run `node tools/preflight-and-verify.mjs budget`; trim `PostMortem.md` (9,000 B) and the boards until none is over its cap.
- **Aha / decisions**: Append insights to AhaBoard and Commander-only questions to DecisionBoard under `## Open` with a blank `- **Commander**:`.
