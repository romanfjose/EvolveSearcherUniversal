import Anthropic from '@anthropic-ai/sdk';
import { breaker } from '../lib/budget.js';
const anthropic = new Anthropic();

export async function run(messages, tools, execute, { tenant, maxTurns = 10 } = {}) {
  let turns = 0;
  for (;;) {
    if (++turns > maxTurns) throw new Error('turn limit reached');
    const { value: msg } = await breaker.run({ tenant, model: 'claude-sonnet-5-5', inputTokens: 8000, maxOutputTokens: 4096 },
      async ({ model }) => {
        const m = await anthropic.messages.create({ model, max_tokens: 4096, tools, messages });
        return { value: m, usage: { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens } };
      });
    if (msg.stop_reason !== 'tool_use') return msg;
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({ role: 'user', content: await execute(msg.content) });
  }
}
