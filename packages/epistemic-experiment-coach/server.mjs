import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8787);
const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "200kb" }));

const system = `You are a practical epistemic coach. Turn vague frustration into a tiny, safe, real-world experiment. Use ordinary friendly language, never therapy language or academic jargon. Treat explanations as hypotheses, not diagnoses. Optimize for low friction and action within 5–25 minutes. Never shame the user. For cooking, include basic food-safety cautions and tell the user to follow package timing when it varies. Return only valid JSON when asked for JSON.`;

function parseJson(text) {
  const clean = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try { return JSON.parse(clean); } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("The AI returned an unexpected format");
  }
}

async function askModel(prompt, { json = false, maxTokens = 700 } = {}) {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("No OPENROUTER_API_KEY is configured");
    error.status = 503;
    throw error;
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "x-openrouter-title": "Clash with Reality",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenRouter request failed");
    error.status = response.status;
    throw error;
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("The AI returned no text");
  return json ? parseJson(text) : text;
}

function journeyContext(journey = {}) {
  return {
    problem: journey.problem,
    selected_hypothesis: journey.selectedHypothesis,
    selected_challenge: journey.challenge && {
      id: journey.challenge.id,
      title: journey.challenge.title,
      time: journey.challenge.time,
      difficulty: journey.challenge.difficulty,
      why: journey.challenge.why,
    },
    outcome: journey.outcome,
    learning: journey.learning,
    recent_chat: (journey.chat || []).slice(-12),
  };
}

app.post("/api/coach", async (req, res) => {
  try {
    const { action, problem, journey, message, challenge } = req.body || {};
    if (action === "understand") {
      if (!problem || typeof problem !== "string" || problem.length > 3000) return res.status(400).json({ error: "Please provide a shorter description" });
      const context = journeyContext({ ...journey, problem });
      const result = await askModel(`CONTEXT: ${JSON.stringify(context)}\n\nGenerate only possible reasons behind the user's resistance. Use information from the chat as evidence, including location, constraints, preferences, and corrections. Return exactly this JSON shape:\n{"reflection":"2-3 warm, concrete sentences separating the problem into possible sources of friction","hypotheses":[{"id":"short-id","title":"first-person label, max 8 words","explanation":"one specific sentence"}]}\nProvide exactly 4 distinct, non-overlapping hypotheses. Do not generate challenges or a plan yet.`, { json: true, maxTokens: 900 });
      return res.json(result);
    }
    if (action === "challenges") {
      if (!journey?.problem || !journey?.selectedHypothesis) return res.status(400).json({ error: "Choose a reason before generating challenges" });
      const context = journeyContext(journey);
      const result = await askModel(`CONTEXT: ${JSON.stringify(context)}\n\nGenerate only three small reality-challenge choices that test the selected hypothesis. Use every relevant detail from recent_chat; for example, localize ingredients and examples to the user's country. The three options should differ meaningfully in effort or approach. Return exactly:\n{"challenge_intro":"one sentence describing what these tests could teach","challenges":[{"id":"short-id","title":"concrete action, max 8 words","time":"5–25 min","difficulty":"Almost effortless|Very easy|Easy","why":"one sentence linking this action to the hypothesis"}]}\nDo not generate materials, detailed steps, upgrades, or a debrief yet.`, { json: true, maxTokens: 900 });
      return res.json(result);
    }
    if (action === "plan") {
      const selected = challenge || journey?.challenge;
      if (!journey?.problem || !selected?.title) return res.status(400).json({ error: "Choose a challenge before generating its plan" });
      const context = { ...journeyContext({ ...journey, challenge: selected }), requested_challenge: selected };
      const result = await askModel(`CONTEXT: ${JSON.stringify(context)}\n\nGenerate only the detailed execution plan for requested_challenge. Incorporate relevant chat constraints, location, available tools, and questions. Assume a complete beginner. Return exactly:\n{"minimum_success":"observable and forgiving","materials":["specific item"],"steps":["tiny physical instruction in safe chronological order"],"upgrades":["optional harder addition"],"success_signals":["observable signal"]}\nGive 5-9 steps, 1-5 materials, 2-3 upgrades, and 2-3 success signals. For variable timings, tell the user to follow the package. Do not generate new challenge choices.`, { json: true, maxTokens: 1500 });
      return res.json(result);
    }
    if (action === "chat") {
      if (!journey || !message || typeof message !== "string" || message.length > 2000) return res.status(400).json({ error: "Invalid chat message" });
      const context = { ...journeyContext(journey), phase: journey.phase };
      const chatInstruction = journey.phase === "complete"
        ? "The user is sharing a reflection after trying the challenge. Respond warmly in 1–4 concise sentences. Help them notice the finding, emotion, surprise, or remaining friction without forcing a positive spin or turning it into homework. You may ask one gentle follow-up question when it would help them unpack what happened."
        : "Answer the exact question in 1–4 concise sentences. Make instructions concrete enough for a total beginner. Treat the answer as context for later steps, but do not restart the whole coaching flow.";
      const answer = await askModel(`CONTEXT: ${JSON.stringify(context)}\nUSER MESSAGE: ${JSON.stringify(message)}\n${chatInstruction}`, { maxTokens: 500 });
      return res.json({ message: answer });
    }
    return res.status(400).json({ error: "Unknown coach action" });
  } catch (error) {
    console.error(error.message);
    res.status(error.status || 500).json({ error: error.message || "Coach request failed" });
  }
});

app.use(express.static(path.join(here, "dist")));
app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(here, "dist", "index.html"), (error) => error && next(error));
});

app.listen(port, () => console.log(`Coach API listening on http://localhost:${port}`));
