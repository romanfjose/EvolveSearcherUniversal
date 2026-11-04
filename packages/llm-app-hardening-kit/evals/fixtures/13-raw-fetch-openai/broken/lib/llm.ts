export async function chat(messages: unknown[]) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5-mini', messages, max_completion_tokens: 400 }),
  });
  return r.json();
}
