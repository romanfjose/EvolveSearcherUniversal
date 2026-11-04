import { handlers } from './handlers.js';

export async function dispatch(toolCalls) {
  return Promise.all(toolCalls.map(async (call) => {
    const handler = Object.hasOwn(handlers, call.function.name) ? handlers[call.function.name] : null;
    if (!handler) return { tool_call_id: call.id, error: 'unknown_tool' };
    try {
      return { tool_call_id: call.id, result: await handler(JSON.parse(call.function.arguments)) };
    } catch (err) {
      return { tool_call_id: call.id, error: String(err?.message ?? err) }; // fed back to the model, not thrown
    }
  }));
}
