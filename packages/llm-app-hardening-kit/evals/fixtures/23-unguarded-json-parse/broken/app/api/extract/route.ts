import OpenAI from 'openai';
const openai = new OpenAI();

export async function POST(req: Request) {
  const { invoice } = await req.json();
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: 'Return {"total": number, "currency": string}' }, { role: 'user', content: invoice }],
  });
  const data = JSON.parse(completion.choices[0].message.content!);
  return Response.json({ total: data.total, currency: data.currency });
}
