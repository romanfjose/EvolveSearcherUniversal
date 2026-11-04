import { openai } from '../server/openai';
import { runTool } from './tools';

const MAX_TURNS = 8;

export async function agent(messages: any[]) {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await openai.chat.completions.create({ model: 'gpt-5', messages, tools, max_completion_tokens: 2048 });
    const msg = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) return msg.content;
    for (const call of msg.tool_calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(call) });
    }
  }
  throw new Error(`agent exceeded ${MAX_TURNS} turns`);
}
