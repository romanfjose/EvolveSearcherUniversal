import OpenAI from 'openai';
const openai = new OpenAI();

export async function POST(req: Request) {
  const { messages } = await req.json();
  const stream = await openai.chat.completions.create({
    model: 'gpt-5',
    messages,
    stream: true,
  });
  return new Response(stream.toReadableStream());
}
