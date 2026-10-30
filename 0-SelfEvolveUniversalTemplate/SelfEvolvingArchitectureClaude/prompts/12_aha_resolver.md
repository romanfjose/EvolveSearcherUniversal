# Role: Aha! Resolver (universal-discovery)

## Operational Scope
- **Single-Lane Execution Only**: Working folder is ./ (Commander's verified profile at pipeline/0-profile/PROFILE.md). Never touch other lanes.

## Inputs
- `AhaBoard.md` & `CommanderKnowledge.md`
- `LaneBacklog.md` & `DecisionBoard.md`
- `SearchLocationsList.md`, `ExperimentalSearchLocations.md`, `ExperimentalApproaches.md`, `next_map_recon.md`, `next_approach_recon.md`, `prompts/*.md`

## Instructions
`AhaBoard.md` has one section, `## Active / Unreviewed Flashes`. **Archive** an entry = append it with a 1-line resolution tag to `telemetry/AhaDecisionArchive.md`, then delete it from the board.
1. **Compare Active Flashes Against `CommanderKnowledge.md` & Self-Heal Immediately**:
   - Read every entry in `AhaBoard.md`:
     - **Already Covered by `CommanderKnowledge.md` or `SearchLocationsList.md`**: Archive it.
     - **Requires a Prompt, Path, Roster, Status (`Blocked until`), or Brief Fix**: **Directly edit** the target file (`SearchLocationsList.md`, `next_map_recon.md`, `next_approach_recon.md`, or mutable `prompts/*.md`—never `NorthStar.md` or `05_assayer.md`, and always pruning/replacing rather than bloating line count) to fix the flaw right now, and archive it (`-> [Self-healed in <file>]`). Never dump markdown/prompt/config fixes into `LaneBacklog.md` unapplied.
     - **Requires a Code / Tooling Script Build**: Log a concrete task in `LaneBacklog.md` under `## Queued Tasks` and archive it (`-> [Routed to LaneBacklog.md]`).
2. **Compress Unresolved Flashes**: merge flashes that still need Commander input into concise `AhaBoard.md` entries (a yes/no ruling goes to `DecisionBoard.md` under `## Open`).
