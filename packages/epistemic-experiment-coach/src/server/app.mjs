// HTTP layer for /api/coach. The OpenRouter key never leaves this process.
// createApp() takes its environment, fetch and limits as arguments so tests can run it without network.
import express from "express";
import path from "node:path";
import { SYSTEM_PROMPT, buildCoachPrompt, checkShape, parseModelJson } from "../core/prompts.mjs";

export const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

/** Fixed-window per-key limiter. In-memory: good for one process; put a shared store in front for more. */
export function createRateLimiter({ windowMs = 60_000, max = 20, now = Date.now } = {}) {
  const hits = new Map();
  return function take(key) {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) { entry = { count: 0, reset: t + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    return { allowed: entry.count <= max, limit: max, remaining: Math.max(0, max - entry.count), resetMs: entry.reset - t };
  };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

export function createApp({ env = process.env, fetchImpl = globalThis.fetch, rateLimit = {}, timeoutMs = 30_000, staticDir, log = console } = {}) {
  const app = express();
  const take = createRateLimiter(rateLimit);
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY === "true" ? true : env.TRUST_PROXY);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    next();
  });

  async function askModel({ prompt, json, maxTokens }) {
    if (!env.OPENROUTER_API_KEY) throw httpError(503, "No OPENROUTER_API_KEY is configured");
    let response;
    try {
      response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "x-openrouter-title": "Clash with Reality" },
        body: JSON.stringify({ model: env.OPENROUTER_MODEL || DEFAULT_MODEL, max_tokens: maxTokens, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }),
      });
    } catch (error) {
      log.error?.(`OpenRouter unreachable: ${error.message}`);
      throw httpError(error.name === "TimeoutError" ? 504 : 502, "The AI provider could not be reached");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      log.error?.(`OpenRouter ${response.status}: ${data.error?.message || "no message"}`);
      throw httpError(response.status === 429 ? 429 : 502, response.status === 429 ? "The AI provider is rate limiting; try again shortly" : "The AI provider returned an error");
    }
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw httpError(502, "The AI returned no text");
    if (!json) return text;
    try { return parseModelJson(text); } catch (error) { throw httpError(502, error.message); }
  }

  app.post("/api/coach", (req, res, next) => {
    const quota = take(req.ip || "unknown");
    res.set({ "RateLimit-Limit": String(quota.limit), "RateLimit-Remaining": String(quota.remaining) });
    if (!quota.allowed) {
      res.set("Retry-After", String(Math.ceil(quota.resetMs / 1000)));
      return res.status(429).json({ error: "Too many requests; please slow down" });
    }
    next();
  }, (req, res, next) => {
    if (!req.is("application/json")) return res.status(415).json({ error: "Content-Type must be application/json" });
    next();
  }, express.json({ limit: "64kb" }), async (req, res, next) => {
    try {
      const request = buildCoachPrompt(req.body);
      const raw = await askModel(request);
      const result = checkShape(req.body.action, req.body.action === "chat" ? { message: raw } : raw);
      res.set("Cache-Control", "no-store").json(result);
    } catch (error) { next(error); }
  });

  app.all("/api/*path", (req, res) => res.status(404).json({ error: "Not found" }));

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("*path", (req, res, next) => res.sendFile(path.join(staticDir, "index.html"), (error) => error && next(error)));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500 && !error.expose) log.error?.(error);
    const message = status === 400 && error.type === "entity.parse.failed" ? "Malformed JSON body"
      : status === 413 ? "Request body is too large"
      : error.expose || error.name === "CoachInputError" ? error.message
      : status < 500 ? "Bad request" : "Coach request failed";
    res.status(status).json({ error: message });
  });

  return app;
}
