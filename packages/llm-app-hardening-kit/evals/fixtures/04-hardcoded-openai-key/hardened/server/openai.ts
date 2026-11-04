import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
export const openai = new OpenAI({ apiKey });

export async function complete(prompt: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.choices[0]?.message.content ?? '';
}
