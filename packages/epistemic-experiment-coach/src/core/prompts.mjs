// Single source for LLM prompts, request validation and response-shape checks.
// Used by the Express server (server-held OpenRouter key) and the browser client (user-supplied key).

export const SYSTEM_PROMPT = "You are a practical epistemic coach. Turn vague frustration into a tiny, safe, real-world experiment that could prove the user's explanation wrong. Use ordinary friendly language, never therapy language or academic jargon. Treat explanations as hypotheses, not diagnoses. Optimize for low friction and action within 5–25 minutes. Never shame the user. For cooking, include basic food-safety cautions and tell the user to follow package timing when it varies. For health or energy topics, say it is not medical advice when relevant. Return only valid JSON when asked for JSON.";

export const ACTIONS = ["understand", "challenges", "plan", "chat"];
export const LIMITS = { problem: 3000, message: 2000, chatTurns: 12, text: 2000, field: 600 };

export class CoachInputError extends Error {
  constructor(message) { super(message); this.name = "CoachInputError"; this.status = 400; }
}

const str = (value, max) => (typeof value === "string" ? value.slice(0, max) : undefined);

/** Whitelisted, length-capped view of a journey: nothing else from the client reaches the model. */
export function journeyContext(journey = {}) {
  const c = journey.challenge;
  return {
    problem: str(journey.problem, LIMITS.problem),
    domain: str(journey.domain, 40),
    selected_hypothesis: journey.selectedHypothesis && { title: str(journey.selectedHypothesis.title, LIMITS.field), explanation: str(journey.selectedHypothesis.explanation, LIMITS.field) },
    selected_challenge: c && { id: str(c.id, 80), title: str(c.title, LIMITS.field), time: str(c.time, 80), difficulty: str(c.difficulty, 80), why: str(c.why, LIMITS.field) },
    outcome: journey.outcome && { label: str(journey.outcome.label, 200) },
    learning: str(journey.learning, LIMITS.text),
    recent_chat: (Array.isArray(journey.chat) ? journey.chat : [])
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .slice(-LIMITS.chatTurns)
      .map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.text) })),
  };
}

/** Validates a coach request and returns the prompt to send. Throws CoachInputError (HTTP 400). */
export function buildCoachPrompt(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CoachInputError("Request body must be a JSON object");
  const { action, problem, journey, message, challenge } = payload;
  if (!ACTIONS.includes(action)) throw new CoachInputError("Unknown coach action");
  if (journey !== undefined && (journey === null || typeof journey !== "object" || Array.isArray(journey))) throw new CoachInputError("journey must be an object");

  if (action === "understand") {
    if (typeof problem !== "string" || !problem.trim()) throw new CoachInputError("Please describe the problem");
    if (problem.length > LIMITS.problem) throw new CoachInputError("Please provide a shorter description");
    const context = journeyContext({ ...journey, problem });
    return { json: true, maxTokens: 900, prompt: `CONTEXT: ${JSON.stringify(context)}\n\nGenerate only possible reasons behind the user's resistance. Use information from the chat as evidence, including location, constraints, preferences, and corrections. Return exactly this JSON shape:\n{"reflection":"2-3 warm, concrete sentences separating the problem into possible sources of friction","hypotheses":[{"id":"short-id","title":"first-person label, max 8 words","explanation":"one specific sentence"}]}\nProvide exactly 4 distinct, non-overlapping, testable hypotheses. Do not generate challenges or a plan yet.` };
  }
  if (action === "challenges") {
    if (typeof journey?.problem !== "string" || !journey.problem.trim() || !journey.selectedHypothesis?.title) throw new CoachInputError("Choose a reason before generating challenges");
    return { json: true, maxTokens: 900, prompt: `CONTEXT: ${JSON.stringify(journeyContext(journey))}\n\nGenerate only three small reality-challenge choices that test the selected hypothesis. Use every relevant detail from recent_chat; for example, localize ingredients and examples to the user's country. The three options should differ meaningfully in effort or approach. Return exactly:\n{"challenge_intro":"one sentence describing what these tests could teach","challenges":[{"id":"short-id","title":"concrete action, max 8 words","time":"5–25 min","difficulty":"Almost effortless|Very easy|Easy","why":"one sentence linking this action to the hypothesis","falsifier":"one sentence: the observable result that would weaken the hypothesis"}]}\nDo not generate materials, detailed steps, upgrades, or a debrief yet.` };
  }
  if (action === "plan") {
    const selected = challenge || journey?.challenge;
    if (typeof journey?.problem !== "string" || !journey.problem.trim() || typeof selected?.title !== "string" || !selected.title.trim()) throw new CoachInputError("Choose a challenge before generating its plan");
    const context = { ...journeyContext({ ...journey, challenge: selected }), requested_challenge: journeyContext({ challenge: selected }).selected_challenge };
    return { json: true, maxTokens: 1500, prompt: `CONTEXT: ${JSON.stringify(context)}\n\nGenerate only the detailed execution plan for requested_challenge. Incorporate relevant chat constraints, location, available tools, and questions. Assume a complete beginner. Return exactly:\n{"minimum_success":"observable and forgiving","falsifier":"the observable result that would weaken the selected hypothesis","materials":["specific item"],"steps":["tiny physical instruction in safe chronological order"],"upgrades":["optional harder addition"],"success_signals":["observable signal"]}\nGive 5-9 steps, 1-5 materials, 2-3 upgrades, and 2-3 success signals. Make the first step a written prediction when the test allows it. For variable timings, tell the user to follow the package. Do not generate new challenge choices.` };
  }
  if (typeof message !== "string" || !message.trim() || message.length > LIMITS.message || !journey) throw new CoachInputError("Invalid chat message");
  const context = { ...journeyContext(journey), phase: str(journey.phase, 20) };
  const instruction = journey.phase === "complete"
    ? "The user is sharing a reflection after trying the challenge. Respond warmly in 1–4 concise sentences. Help them notice the finding, emotion, surprise, or remaining friction without forcing a positive spin or turning it into homework. You may ask one gentle follow-up question when it would help them unpack what happened."
    : "Answer the exact question in 1–4 concise sentences. Make instructions concrete enough for a total beginner. Treat the answer as context for later steps, but do not restart the whole coaching flow.";
  return { json: false, maxTokens: 500, prompt: `CONTEXT: ${JSON.stringify(context)}\nUSER MESSAGE: ${JSON.stringify(message)}\n${instruction}` };
}

export function parseModelJson(text) {
  const clean = String(text).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try { return JSON.parse(clean); } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
    throw new Error("The AI returned an unexpected format");
  }
}

const nonEmptyArray = (value, key) => Array.isArray(value) && value.length > 0 && value.every((item) => (key ? typeof item?.[key] === "string" : typeof item === "string"));

/** Rejects model output the UI cannot render, so callers can fall back instead of crashing. */
export function checkShape(action, result) {
  const ok = action === "understand" ? nonEmptyArray(result?.hypotheses, "title")
    : action === "challenges" ? nonEmptyArray(result?.challenges, "title")
    : action === "plan" ? nonEmptyArray(result?.steps) && typeof result?.minimum_success === "string"
    : typeof result?.message === "string" && result.message.trim().length > 0;
  if (!ok) throw Object.assign(new Error("The AI response was missing required fields"), { status: 502, expose: true });
  return result;
}
