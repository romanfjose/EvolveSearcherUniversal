# Agent handoff: create a lane with the user

Read this guide when the user asks to duplicate this template and personalize it for a new purpose. Use [PERSONALIZE.md](PERSONALIZE.md) for the technical setup and validation sequence.

The user chooses the direction and defines useful results. The autonomous loop improves discovery and verification within those boundaries. Creating a new lane is a collaborative setup task, not a discovery mission.

## 1. Create the copy

Establish the lane's purpose and destination folder with the user, using any instructions already supplied. Copy the complete template group, including all three engine folders, their independent Git repositories, and the shared dashboard. Keep the original template pristine; do not overwrite an existing destination. Check the copied repositories' status and history before making changes, and do all personalization in the copy.

Read each copied engine's AGENTS.md before editing it. Keep all three engines configured for the same lane. Do not start discovery or the evolution loop while required setup answers are missing.

## 2. Work through these five files with the user

Paths below are relative to each engine folder. Ask short, focused questions, reuse answers already given, and propose concrete wording for the user to review. The agent should do the editing; the user should not need to learn the file structure or fill placeholders by hand.

| File | Establish with the user | Autonomous behavior after setup |
|---|---|---|
| NorthStar.md | What should we find? What outcomes and target categories matter? What is out of scope? Which evidenced conditions justify rejection? | Protected by the architecture guard. The loop cannot rewrite it. |
| pipeline/0-profile/PROFILE.md | What verified facts, resources, availability, preferences, and constraints affect suitability? | Only user-approved information belongs here. This file is not currently protected by the guard; do not treat that gap as permission to invent or change user preferences. |
| RecallCharter.md section 7 | How fresh must sources be? What minimum benefit matters? What eligibility and access requirements apply? What dated independent evidence makes something Ready? | Protected by the guard. Preserve the reliability rules in sections 1-6 and 8-9 during setup. |
| CommanderKnowledge.md | How should we prioritize within scope, judge fit, and choose search strategies? | Explicitly mutable. The loop may improve strategy, subordinate to NorthStar.md, RecallCharter.md, and approved profile facts. |
| SearchLocationsList.md | What six sources or source categories should discovery start with? What is each starting point? | Explicitly mutable. The loop updates sources, approaches, statuses, and resume cursors. |

## 3. Separate durable direction from evolving tactics

PROFILE.md describes the user; CommanderKnowledge.md describes how the engine searches and ranks for that user. For example, "I have 10 hours per week" is a profile constraint; "prefer sources that expose time requirements clearly" is a search tactic.

Put non-negotiable scope and exclusions in NorthStar.md and qualification requirements in RecallCharter.md section 7. Keep personal facts and preferences in PROFILE.md. Have CommanderKnowledge.md refer to those authorities instead of becoming the only home for a durable requirement. Explain that profile constraints currently rely on instructions rather than an immutability check; adding guard protection would be a separate architecture change.

Fit and verification are separate: a candidate can fit the user well while its claims remain unverified. Define a useful fit rubric in CommanderKnowledge.md from the approved profile; do not make a high fit score a substitute for passing the charter's gates.

Normally leave prompts/05_assayer.md unchanged. It already reads the charter, doctrine, and profile to grade candidates. Personalization should configure those inputs rather than rewrite the grading workflow.

Discovery alone does not authorize purchases, registrations, submissions, messages, or other commitments. Record any additional user-approved boundaries clearly without weakening the existing rules.

## 4. Resolve decisions and validate the result

Before sealing the baseline, show the user a compact summary of the proposed mission, hard constraints, qualification rules, fit priorities, and initial sources. Resolve missing or ambiguous choices with them. Reuse prior explicit approvals; do not ask the same questions again.

Unknown personal facts stay unknown. Do not invent facts or silently choose consequential preferences to pass the placeholder check. Source suggestions can be researched and proposed by the agent. Record an honest initial cursor such as a specific starting URL/query or an explicitly unstarted sector; never imply a search has already run.

Apply the agreed configuration consistently to all three engines. Then follow PERSONALIZE.md: resolve every placeholder, run each engine's template check and tests, commit each personalized baseline, snapshot it, and verify it in that order. Configure provider runners only from known, trusted commands; do not guess a provider or model from its label.

Report the copy's location, the files changed, validation results, and any remaining questions or runtime requirements. Start discovery only within the user's requested scope, after setup is complete. A request to create and personalize a copy alone does not request a discovery run.
