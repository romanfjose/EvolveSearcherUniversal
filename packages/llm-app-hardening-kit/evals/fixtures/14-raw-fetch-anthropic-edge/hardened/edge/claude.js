export default async function handler(request) {
  const { prompt } = await request.json();
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 512, messages: [{ role: "user", content: String(prompt).slice(0, 8000) }] }),
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
  });
  return new Response(upstream.body, { status: upstream.status });
}
