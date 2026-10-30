# Personalize a new lane

For an agent helping the user create a copy, first read [SETUP_WITH_USER.md](SETUP_WITH_USER.md). It explains which decisions to discuss, where they belong, and which files the autonomous loop can later change.

1. Copy the complete universal-template folder to a new lane folder. Keep the three engines and shared ui/ together. Each engine has an independent Git baseline and no remotes.
2. In each engine, replace every double-brace placeholder in these five documents:
   - NorthStar.md: lane name, target outcome/types and evidenced hard exclusions.
   - RecallCharter.md §7: source freshness, minimum value, eligibility, feasible access and dated independent Ready validation. Ready validation can be a reproducible test, attributable outcome or approved user trial; it need not involve money. Keep §1–6 and §8–9 reliability invariants.
   - CommanderKnowledge.md: priorities, profile-based fit dimensions and source strategy.
   - pipeline/0-profile/PROFILE.md: only user-approved facts, preferences and constraints.
   - SearchLocationsList.md: six starting sources or categories with exact initial cursors.
3. Optionally configure ui/config.json per engine. Set runner and runnerArgs to a trusted provider-specific CLI accepting the prompt on stdin; provider labels do not install a CLI or choose a model. Configure the correct Claude, Gemini or ChatGPT-compatible runner; no fallback to another provider occurs. Manual execution in the corresponding agent is also supported.
4. In each engine run node tools/template-check.mjs, then node --test tools/*.test.mjs. Resolve every reported placeholder before discovery. Tests and architecture verification are safe on an unpersonalized template; template-check intentionally fails until setup is complete.
5. Commit the personalized Ring-0 baseline and replace the template checkpoint, in this exact order, inside each engine:

```powershell
git add -A
git commit -m "Personalize discovery lane baseline"
node tools/architecture-guard.mjs snapshot
node tools/architecture-guard.mjs verify
```

6. Start the parent dashboard with npm start, select an engine and iteration count, or tell the corresponding agent to execute prompts/15_autoloop.md from that engine folder. Initial discovery runs before evolution when there is no completed mission.

The guard compares Ring 0 against both Git HEAD and scratch/.checkpoint; committing alone or snapshotting alone is insufficient after personalization. Only explicit user-directed setup can change the constitution. During autonomous evolution it remains immutable. Unknown facts remain unknown; never fill placeholders with invented facts.

The host must support subagents. Dispatch at least six discovery slots in waves within its available concurrency, with bounded waits and confirmed cancellation barriers. A missing host capability is reported as incomplete, never simulated.

Preserve a pristine template by personalizing a copy. Shared canonical identity uses Opportunity ID or a specific Canonical URL, never titles or platform homepages.
