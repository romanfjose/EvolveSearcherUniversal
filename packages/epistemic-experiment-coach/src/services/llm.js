const system = `You are a practical epistemic coach. Turn vague frustration into a tiny, safe, real-world experiment. Use ordinary friendly language, never therapy language or academic jargon. Treat explanations as hypotheses, not diagnoses. Optimize for low friction and action within 5–25 minutes. Never shame the user. For cooking, include basic food-safety cautions and tell the user to follow package timing when it varies. Return only valid JSON when asked for JSON.`;

function parseJson(text) {
  const clean = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("The AI returned an unexpected format");
  }
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

async function askModel(prompt, { json = false, maxTokens = 700 } = {}) {
  const provider = localStorage.getItem("coach_api_provider") || "gemini";
  const apiKey = localStorage.getItem("coach_api_key");
  const configuredModel = localStorage.getItem("coach_api_model");

  if (!apiKey) {
    throw new Error("API key is not configured. Please open Settings in the top-right corner to set up your API key");
  }

  if (provider === "gemini") {
    const modelName = configuredModel || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      systemInstruction: {
        parts: [{ text: system }]
      },
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: json ? "application/json" : "text/plain"
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `Gemini API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("The Gemini model returned no text");
    return json ? parseJson(text) : text;

  } else if (provider === "openrouter") {
    const modelName = configuredModel || "meta-llama/llama-3.3-70b-instruct";
    const url = "https://openrouter.ai/api/v1/chat/completions";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
        "x-openrouter-title": "Clash with Reality"
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `OpenRouter request failed with status ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("The OpenRouter model returned no text");
    return json ? parseJson(text) : text;
  } else {
    throw new Error(`Unsupported API provider: ${provider}`);
  }
}

/**
 * Replaces the Express backend /api/coach post endpoint
 * @param {object} payload - { action, problem, journey, message, challenge }
 */
export async function coachRequest(payload) {
  const { action, problem, journey, message, challenge } = payload || {};
  
  if (action === "understand") {
    if (!problem || typeof problem !== "string" || problem.length > 3000) {
      throw new Error("Please provide a shorter description");
    }
    const context = journeyContext({ ...journey, problem });
    const prompt = `CONTEXT: ${JSON.stringify(context)}\n\nGenerate only possible reasons behind the user's resistance. Use information from the chat as evidence, including location, constraints, preferences, and corrections. Return exactly this JSON shape:\n{"reflection":"2-3 warm, concrete sentences separating the problem into possible sources of friction","hypotheses":[{"id":"short-id","title":"first-person label, max 8 words","explanation":"one specific sentence"}]}\nProvide exactly 4 distinct, non-overlapping hypotheses. Do not generate challenges or a plan yet.`;
    return askModel(prompt, { json: true, maxTokens: 900 });
  }
  
  if (action === "challenges") {
    if (!journey?.problem || !journey?.selectedHypothesis) {
      throw new Error("Choose a reason before generating challenges");
    }
    const context = journeyContext(journey);
    const prompt = `CONTEXT: ${JSON.stringify(context)}\n\nGenerate only three small reality-challenge choices that test the selected hypothesis. Use every relevant detail from recent_chat; for example, localize ingredients and examples to the user's country. The three options should differ meaningfully in effort or approach. Return exactly:\n{"challenge_intro":"one sentence describing what these tests could teach","challenges":[{"id":"short-id","title":"concrete action, max 8 words","time":"5–25 min","difficulty":"Almost effortless|Very easy|Easy","why":"one sentence linking this action to the hypothesis"}]}\nDo not generate materials, detailed steps, upgrades, or a debrief yet.`;
    return askModel(prompt, { json: true, maxTokens: 900 });
  }
  
  if (action === "plan") {
    const selected = challenge || journey?.challenge;
    if (!journey?.problem || !selected?.title) {
      throw new Error("Choose a challenge before generating its plan");
    }
    const context = { ...journeyContext({ ...journey, challenge: selected }), requested_challenge: selected };
    const prompt = `CONTEXT: ${JSON.stringify(context)}\n\nGenerate only the detailed execution plan for requested_challenge. Incorporate relevant chat constraints, location, available tools, and questions. Assume a complete beginner. Return exactly:\n{"minimum_success":"observable and forgiving","materials":["specific item"],"steps":["tiny physical instruction in safe chronological order"],"upgrades":["optional harder addition"],"success_signals":["observable signal"]}\nGive 5-9 steps, 1-5 materials, 2-3 upgrades, and 2-3 success signals. For variable timings, tell the user to follow the package. Do not generate new challenge choices.`;
    return askModel(prompt, { json: true, maxTokens: 1500 });
  }
  
  if (action === "chat") {
    if (!journey || !message || typeof message !== "string" || message.length > 2000) {
      throw new Error("Invalid chat message");
    }
    const context = { ...journeyContext(journey), phase: journey.phase };
    const chatInstruction = journey.phase === "complete"
      ? "The user is sharing a reflection after trying the challenge. Respond warmly in 1–4 concise sentences. Help them notice the finding, emotion, surprise, or remaining friction without forcing a positive spin or turning it into homework. You may ask one gentle follow-up question when it would help them unpack what happened."
      : "Answer the exact question in 1–4 concise sentences. Make instructions concrete enough for a total beginner. Treat the answer as context for later steps, but do not restart the whole coaching flow.";
    
    const prompt = `CONTEXT: ${JSON.stringify(context)}\nUSER MESSAGE: ${JSON.stringify(message)}\n${chatInstruction}`;
    const answer = await askModel(prompt, { maxTokens: 500 });
    return { message: answer };
  }
  
  throw new Error("Unknown coach action");
}
