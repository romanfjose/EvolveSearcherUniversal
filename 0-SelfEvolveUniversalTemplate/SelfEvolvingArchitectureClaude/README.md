# Universal discovery engine — Claude

Unpersonalized template. See ../PERSONALIZE.md for the five customization documents and baseline procedure. This copy has independent Git history, constitution, leads, runtime state and runner configuration. No personal data or discovery run is included.

Retained: six-scout floor, eight-candidate quota, Verify → Try-worthy → Ready split, quoted evidence, stagnation/fitness rules, bounded waits, cancellation barriers, full-tree checkpoint/rollback and immutable Ring 0.

Generic tools: node tools/preflight-and-verify.mjs (usage), node tools/architecture-guard.mjs verify, node tools/template-check.mjs. Generic readers return evidence, never grades.

Tests: node --test tools/*.test.mjs. Start the latest shared dashboard from the parent directory with npm start. The runner is intentionally unset; set ui/config.json to a command for Claude that accepts the invocation prompt on stdin. You can also open this folder in your chosen agent and execute prompts/15_autoloop.md after personalization.
