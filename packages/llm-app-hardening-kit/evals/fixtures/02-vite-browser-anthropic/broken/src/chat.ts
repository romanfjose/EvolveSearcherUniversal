import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export async function ask(question: string) {
  const msg = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: question }],
  });
  return msg.content;
}
