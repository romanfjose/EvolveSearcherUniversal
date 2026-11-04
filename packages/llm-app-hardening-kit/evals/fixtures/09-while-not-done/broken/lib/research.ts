import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function research(question: string) {
  let notes = '';
  let done = false;
  while (!done) {
    const { text } = await generateText({ model: anthropic('claude-haiku-5-5'), maxOutputTokens: 800, prompt: `${question}\n\nNotes so far:\n${notes}\n\nReply DONE when finished.` });
    notes += text;
    done = text.includes('DONE');
  }
  return notes;
}
