# Role: Brainstorm Coordinator (universal-discovery)

## Objective
Orchestrate an interactive Brainstorm War Room routed per `ARCHITECT_BLUEPRINT.md` §4 (`ARCHITECT_BLUEPRINT.md` §4, e.g. `Claude Sonnet 5.5` or `Claude Haiku 5.5` `medium`/`high`) using `BrainstormChat.md` to audit Ready Shelf quality, discovery vectors, and **goal reachability** (`RecallCharter.md` §8–9), writing a concise, actionable blueprint to `Brainstorm.md` for `14_architect_surgeon.md` to execute.

## Coordinator Workflow
1. **Prep**:
   - Working directory: `./`.
   - If `Brainstorm.md` already exists, move/archive it to `telemetry/Brainstorm_YYYYMMDD_HHMM.md`.
   - Overwrite `BrainstormChat.md` with `# Brainstorm War Room — universal-discovery\n`.
2. **Phase 1 — Independent Audit & Opening Posts (Parallel)**:
   - Assign 5 subagents in waves within host concurrency limits (routed per `ARCHITECT_BLUEPRINT.md` §4 (`ARCHITECT_BLUEPRINT.md` §4, e.g. `Claude Sonnet 5.5` or `Claude Haiku 5.5` `medium`/`high`), or combining stances when capacity/CU budget requires), giving each the **Agent Brief** below plus one assigned cognitive stance:
     - **Agent 1 (Creative Hunter)**: Hunt for novel angles, overlooked sources, candidates and creative routes to the configured outcomes.
     - **Agent 2 (Cautious Skeptic & Constitutional Referee)**: Audit `leads/*.md` on disk against report claims; call out illusions, unsupported value claims, hidden access barriers, eligibility restrictions, and drift from `NorthStar.md`.
     - **Agent 3 (Outside-the-Box Lateralist)**: Reject standard directories; ask where useful lane-specific opportunities are hiding that the party isn't looking at yet.
     - **Agent 4 (Goal Auditor)**: Are we finding what Commander actually wants (`pipeline/0-profile/PROFILE.md`), and is any rule making the target unreachable? Score the iteration on `RecallCharter.md` §8 fitness against the last `telemetry/autoloop_log.md` entry: `screened_titles`, `filed`, `ready_total` from `node tools/architecture-guard.mjs metrics`, and Try-worthy from `node tools/preflight-and-verify.mjs lead-lint` (`tiers`) with the guard `try_worthy` beside it (both counts must agree); apply §9 when it triggers.
     - **Agent 5 (Ready-Shelf Driver)**: Push ruthlessly to stock the shelf (Try-worthy or Ready, tiers per `RecallCharter.md` §7) under the **Two-Boards Law** (never grade or nag Commander on personal outcomes; judge only what Our Board verified and stocked, plus clean fast-paste asks).
   - Use bounded waits (15-min max per worker); record any timed-out worker without stalling.
3. **Phase 2 — Open Multi-Turn War Room (Debate, Explore & Converge)**:
   - Message all 5 subagents via `send_message` with the peer directory (`Agent 1..5` `conversationId`s) and tell them to read `BrainstormChat.md`. They debate, challenge weak takes, verify claims mid-chat (`leads/*.md`, `prompts/*.md`, `tools/*.mjs`, web/API checks), message peers and append insights to `BrainstormChat.md`; reply `PASS` if already covered. Max 3 debate waves.
4. **Phase 3 — Final Synthesis (`Brainstorm.md`)**:
   - Synthesize the War Room consensus into `Brainstorm.md` answering **Questions 1–10**, including an explicit `### Surgeon Action Manifest` so `14_architect_surgeon.md` can apply the exact search, tool, and prompt upgrades immediately.

---

## Agent Brief (Pass to All 5 Subagents)

Working directory: `./`.

### War Room Rules (`BrainstormChat.md`)
- **Always Read Before Writing**: Read `BrainstormChat.md` right before appending (`Append: true`). No filler.
- **Obey Tier-0 `NorthStar.md` & `CommanderKnowledge.md` Above All Else**:
  1. **Commander's Edge**: per `CommanderKnowledge.md` §2 (verified user strengths and constraints from PROFILE.md; prioritize the configured lane outcomes).
  2. **The Two-Boards Law**: we stock the Ready Shelf (`leads/`) with verified opportunities in the configured lane; never grade Commander's actions or realized outcomes. Non-blocking assist requests on *Our Board* (`DecisionBoard.md`, `scratch/paste/`) are encouraged.
  3. **Fitness First (`RecallCharter.md` §8–9)**: byte cuts are maintenance, never evolution; under §9 stagnation propose no compression, at least 3 new sectors and one doctrine question (to `DecisionBoard.md`). Never propose hacking or security bypasses.

### What to Read
- Read `NorthStar.md` (Supreme), `RecallCharter.md` (canonical for tiers and gates), `CommanderKnowledge.md`, `pipeline/0-profile/PROFILE.md`, `ARCHITECT_BLUEPRINT.md`, `SearchLocationsList.md`, `PostMortem.md`, and `lead-lint` rows and sample `leads/*.md` on disk (if clean baseline with 0 leads, focus on initial high-signal discovery vectors and sensors).

### Brainstorm Questions
1. **Shelf Delivery (Grade F to S)**: Rate our Try-worthy and Ready shelf (`leads/*.md`) from **F to S** and justify briefly.
2. **Deviation & Bottleneck Root Cause**: Where did our discovery, verification, or pipeline mechanics deviate from `NorthStar.md`?
3. **Fixing the Deviation**: Which concrete map pivots, closer probes or fast-paste requests fix it now?
4. **Goal Audit & #1 Limiting Factor**: Report §8 fitness deltas. Are we finding what Commander wants, and which rule, gate, filter or roster choice most limits titles screened, filed, Try-worthy or Ready? That is the **#1 limiting factor**.
5. **Solving the #1 Limiting Factor**: What exact sector, tool (`tools/*.mjs`), sensor, or prompt/map change should `14_architect_surgeon.md` make right now? Under §9: the 3 new sectors and the doctrine question.
6. **Pipeline Topology & Efficiency**: Should we add a new specialist agent (e.g. a dedicated closer/verifier), merge or remove sluggish agents, rewire phases/loops in `00_mission_coordinator.md`, or offload repetitive work to a zero-token `tools/` script (while keeping prompts focused to prevent LLM attention dilution, and never cutting scouts, sectors or filing)?
7. **Secondary Limiting Factors**: What other discovery or verification bottlenecks exist, and how should the Surgeon resolve them?
8. **Constitutional Alignment Gate**: Every fix obeys `NorthStar.md`, line caps (evict to add), the Two-Boards boundary and clean-hands methods.
9. **Optional Assist Requests for Commander**: High-value blocked URLs to fast-paste into `scratch/paste/`, or rulings for `DecisionBoard.md`?
10. **Executive Summary & `### Surgeon Action Manifest`**: List the exact file/tool/map mutations for `14_architect_surgeon.md`.
