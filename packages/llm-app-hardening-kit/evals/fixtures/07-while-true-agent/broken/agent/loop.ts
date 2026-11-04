import { openai } from '../server/openai';
import { runTool } from './tools';

export async function agent(messages: any[]) {
  while (true) {
    const res = await openai.chat.completions.create({ model: 'gpt-5', messages, tools, max_completion_tokens: 2048 });
    const msg = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) return msg.content;
    for (const call of msg.tool_calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(call) });
    }
  }
}
