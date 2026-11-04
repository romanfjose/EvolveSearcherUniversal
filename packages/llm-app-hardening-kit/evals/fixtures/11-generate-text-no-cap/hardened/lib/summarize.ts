import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function summarize(doc: string) {
  const { text } = await generateText({
    model: openai('gpt-5-mini'),
    system: 'Summarize the document for an executive.',
    prompt: doc.slice(0, 60_000),
    maxOutputTokens: 700,
  });
  return text;
}
