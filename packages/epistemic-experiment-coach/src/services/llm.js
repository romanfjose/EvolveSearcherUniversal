import { SYSTEM_PROMPT, buildCoachPrompt, checkShape, parseModelJson } from "../core/prompts.mjs";

// Route order: a key the user saved in Settings (called from the browser) → the Express server's
// /api/coach (server-held OPENROUTER_API_KEY) → throw, so the caller falls back to the built-in coach.

async function readError(response, fallback) {
  const data = await response.json().catch(() => ({}));
  return new Error(data.error?.message || data.error || `${fallback} (status ${response.status})`);
}

async function askBrowserProvider(provider, apiKey, model, { prompt, json, maxTokens }) {
  if (provider === "gemini") {
    const modelName = model || "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: json ? "application/json" : "text/plain" },
      }),
    });
    if (!response.ok) throw await readError(response, "Gemini API request failed");
    const text = (await response.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("The Gemini model returned no text");
    return json ? parseModelJson(text) : text;
  }
  if (provider === "openrouter") {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "x-openrouter-title": "Clash with Reality" },
      body: JSON.stringify({ model: model || "meta-llama/llama-3.3-70b-instruct", max_tokens: maxTokens, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }),
    });
    if (!response.ok) throw await readError(response, "OpenRouter request failed");
    const text = (await response.json()).choices?.[0]?.message?.content;
    if (!text) throw new Error("The OpenRouter model returned no text");
    return json ? parseModelJson(text) : text;
  }
  throw new Error(`Unsupported API provider: ${provider}`);
}

async function askServer(payload) {
  const response = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw await readError(response, "Coach server request failed");
  return response.json();
}

/** @param {object} payload - { action, problem, journey, message, challenge } */
export async function coachRequest(payload) {
  const request = buildCoachPrompt(payload);
  const apiKey = localStorage.getItem("coach_api_key");
  if (!apiKey) return checkShape(payload.action, await askServer(payload));
  const provider = localStorage.getItem("coach_api_provider") || "gemini";
  const raw = await askBrowserProvider(provider, apiKey, localStorage.getItem("coach_api_model"), request);
  return checkShape(payload.action, payload.action === "chat" ? { message: raw } : raw);
}
