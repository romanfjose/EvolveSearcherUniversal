import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();

export async function run(messages, tools, execute) {
  for (;;) {
    const msg = await anthropic.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 4096, tools, messages });
    if (msg.stop_reason !== 'tool_use') return msg;
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({ role: 'user', content: await execute(msg.content) });
  }
}
