# EvolveSearcherUniversal

Autonomous self-evolving search and discovery framework with isolated verification harnesses, compute-budget subagent routing, and a shared multi-engine comparison dashboard (`Claude`, `Gemini`, `ChatGPT`).

## Architecture Overview

- **[`0-SelfEvolveUniversalTemplate/`](0-SelfEvolveUniversalTemplate/README.md)** — Clean universal lane template containing three independent, self-evolving discovery architectures:
  - [`SelfEvolvingArchitectureClaude`](0-SelfEvolveUniversalTemplate/SelfEvolvingArchitectureClaude/README.md) — Defensive, strict-verification engine designed for Claude Code (`ARCHITECT_BLUEPRINT.md`, `prompts/15_autoloop.md`).
  - [`SelfEvolvingArchitectureGemini`](0-SelfEvolveUniversalTemplate/SelfEvolvingArchitectureGemini/README.md) — Gemini discovery engine.
  - [`SelfEvolvingArchitectureGpt`](0-SelfEvolveUniversalTemplate/SelfEvolvingArchitectureGpt/README.md) — GPT discovery engine.
- **[`ui/`](ui/serve.mjs)** — Zero-dependency Node.js (`>=20`) telemetry, prompt orchestration, and multi-lane comparison dashboard (`http://127.0.0.1:4489/`).
- **[`0-SelfEvolveUniversalTemplate/PERSONALIZE.md`](0-SelfEvolveUniversalTemplate/PERSONALIZE.md)** — Lane personalization guide and verification gates.
- **[`0-SelfEvolveUniversalTemplate/PROVENANCE.md`](0-SelfEvolveUniversalTemplate/PROVENANCE.md)** — Architecture provenance and retained reliability fixes.

## Quick Start

Requires **Node.js 20+** (zero external npm dependencies).

```bash
# Run dashboard & orchestration verification suite
npm test

# Start the live comparison & telemetry dashboard at http://127.0.0.1:4489/
npm start
```
