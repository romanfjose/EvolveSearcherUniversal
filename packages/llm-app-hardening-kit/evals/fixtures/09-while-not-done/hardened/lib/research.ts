import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function research(question: string, maxSteps = 6) {
  let notes = '';
  let done = false;
  let steps = 0;
  while (!done && steps < maxSteps) {
    steps++;
    const { text } = await generateText({ model: anthropic('claude-haiku-5-5'), maxOutputTokens: 800, prompt: `${question}\n\nNotes so far:\n${notes}\n\nReply DONE when finished.` });
    notes += text;
    done = text.includes('DONE');
  }
  return notes;
}

// Non-LLM stream reader loops are fine:
export async function drain(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const r = await reader.read();
    done = r.done;
    if (r.value) chunks.push(r.value);
  }
  return chunks;
}
