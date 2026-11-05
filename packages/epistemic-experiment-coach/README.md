# Clash with Reality

A low-friction epistemic coach that turns a vague problem into one small real-world experiment.

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The built-in coach works without an API key and includes a detailed cooking path.

## Connect OpenRouter

Copy `.env.example` to `.env`, add your OpenRouter API key, and restart `npm run dev`:

```powershell
Copy-Item .env.example .env
```

The key stays in the server process and is never sent to the browser. You can select another supported model through `OPENROUTER_MODEL`.

## Production

```powershell
npm run build
npm start
```

The server hosts both the built frontend and `/api/coach`. Journeys are stored in the current browser's `localStorage`.
