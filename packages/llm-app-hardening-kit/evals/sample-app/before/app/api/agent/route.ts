import OpenAI from 'openai';
import { tools, handlers } from '@/lib/tools';

const openai = new OpenAI({ apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();
  while (true) {
    const res = await openai.chat.completions.create({ model: 'gpt-5', messages, tools });
    const msg = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls) return Response.json({ reply: msg.content });
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const out = await handlers[call.function.name](args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
}
