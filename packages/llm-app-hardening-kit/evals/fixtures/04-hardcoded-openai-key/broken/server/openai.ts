import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: 'sk-proj-Q8vX2mN4kL7pR1tY6wZ3bC5dF9gH0jK2' });

export async function complete(prompt: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.choices[0]?.message.content ?? '';
}
