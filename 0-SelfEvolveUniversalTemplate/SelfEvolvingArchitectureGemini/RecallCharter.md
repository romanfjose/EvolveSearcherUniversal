# Recall Charter (Ring 0)

Binding on every role; subordinate only to NorthStar.md. Purpose: high-recall discovery, honest verification and reachable targets.

## Discovery (scouts)
1. **Filing threshold**: file any named in-scope candidate with a live direct source and at least one claimed relevant benefit as Status Verify. Filing asserts nothing; never skip because facts are missing.
2. **Fact tags**: mark key facts [verified: <url> "<short quote>"], [claimed: <source url>] or [unknown]. A sensor result alone is not a gate pass.
3. **Screened ledger**: append every inspected candidate to leads/screened.md as YYYY-MM-DD | title | official url | filed|rejected|skipped | reason (at most 15 words). Evidenced NorthStar §4 Junk also gets a short dossier in leads/rejected/ with Rejection Reason.
4. **Quota**: each discovery scout screens at least 8 candidates per mission. Report partial coverage honestly; never invent screenings to meet a quota.

## Roster & sectors
5. **Roster floor**: every mission assigns at least 6 discovery scout slots. Fewer Active sectors means spare slots become Map Recon. Execute in waves within the host's actual concurrency limit; never reduce the assigned floor because nothing is proven yet. Proof sweeps are additional work, not substitutes for discovery slots.
6. **Sector status**: new sectors start Active (Exploring). Demote to Cooldown or Blocked only on evidence: dead DNS (NS/SOA without A/AAAA), or 2 consecutive fully covered missions yielding 0 filed dossiers. Transient DNS errors, access walls and incomplete slots do not prove a dead sector. Cite evidence in the cursor.

## Tiers (Assayer)
7. Verify (filed) → Try-worthy (all four gates pass) → Ready (Try-worthy plus the configured independent validation evidence). No other role may bypass these checks or assign a preset Fit score.
   - **G1 Live & Direct Source**: a current, identifiable primary source proves the opportunity exists and is available. Lane freshness rule: {{SOURCE_FRESHNESS_RULE}}.
   - **G2 Relevant Value**: quoted evidence meets the lane's minimum benefit/value: {{MINIMUM_VALUE_RULE}}. Preserve quantities, units and uncertainty; do not infer promised outcomes.
   - **G3 Eligibility & Constraints**: verified compatibility with the user's real constraints: {{ELIGIBILITY_RULE}}. Unknown eligibility is not a pass.
   - **G4 Feasible Access**: a verified practical route to use or pursue it: {{ACCESS_RULE}}. Unknown requirements remain unknown.
   - **Ready evidence**: {{READY_VALIDATION_RULE}}. This must be dated, attributable evidence independent of a mere claim; a user trial note may be used only if that policy explicitly allows it. Store trial notes in scratch/paste/trials/<opportunity-id>.md.
   Everything else is a Note, not a hidden gate. Fit is independent of verification tier. Unknowns and failed gates remain Verify; pending user evidence may be Waiting on Commander. Explicit hard exclusions go through Cleaner.

## Evolution (Brainstorm, Surgeon, AutoLoop)
8. **Fitness**: improvement requires at least one of screened_titles, filed, try_worthy or ready_total to increase and none to decrease. Use architecture-guard metrics and cross-check tiers with lead-lint. Context/cost reductions are maintenance, never evolution; never reduce scouts, sectors or filing to save bytes.
9. **Stagnation**: if Try-worthy + Ready is 0 for 2 consecutive iterations, the next Brainstorm must propose at least 3 new sectors and question one doctrine assumption, not propose compression. Doctrine changes go to DecisionBoard.md for the user; agents cannot rewrite Ring 0.
