# Self-Evolving Universal Template

Three independent, neutral discovery engines: Claude, Gemini and ChatGPT. Latest shared dashboard, fresh empty runtime state, no selected lane or personal profile.

- [Personalize a lane](PERSONALIZE.md)
- [Agent guide: duplicate and personalize with the user](SETUP_WITH_USER.md)
- [Provenance and retained reliability fixes](PROVENANCE.md)
- Claude: SelfEvolvingArchitectureClaude
- Gemini: SelfEvolvingArchitectureGemini
- ChatGPT: SelfEvolvingArchitectureGpt

Run npm test for dashboard tests; npm start or ui.bat opens the dashboard at http://127.0.0.1:4489/. Use SEA_UI_PORT to select another port. No package installation is required with Node.js 20+.

Each engine is its own Git repository; the parent repository tracks the dashboard and setup documents. Runner commands are intentionally unset and must match each engine's provider. The UI can display empty templates immediately; run controls refuse unresolved customization.

Copy this complete group for a new lane, then personalize all three engines for that lane. Do not mix different lanes in one shared comparison dashboard. Original source folders remain untouched.
