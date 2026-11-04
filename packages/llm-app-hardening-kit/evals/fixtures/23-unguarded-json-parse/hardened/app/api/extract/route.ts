import OpenAI from 'openai';
import { extractJson, validateSchema } from 'llm-app-hardening-kit';
const openai = new OpenAI();

const Invoice = { type: 'object', required: ['total', 'currency'], additionalProperties: false,
  properties: { total: { type: 'number', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } } };

export async function POST(req: Request) {
  const { invoice } = await req.json();
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: 'Return {"total": number, "currency": string}' }, { role: 'user', content: invoice }],
  });
  const parsed = extractJson(completion.choices[0].message.content ?? '');
  const check = parsed.ok ? validateSchema(parsed.value, Invoice) : { valid: false, errors: [parsed.error] };
  if (!check.valid) return Response.json({ error: 'extraction_failed', details: check.errors }, { status: 422 });
  return Response.json(parsed.value);
}
