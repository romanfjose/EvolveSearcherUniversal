const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

export async function chat(messages: unknown[], attempts = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', messages, max_completion_tokens: 400 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (r.ok || !RETRYABLE.has(r.status) || i + 1 >= attempts) return r.json();
    await new Promise((res) => setTimeout(res, Math.min(8_000, 250 * 2 ** i) * (0.5 + Math.random() / 2)));
  }
}
