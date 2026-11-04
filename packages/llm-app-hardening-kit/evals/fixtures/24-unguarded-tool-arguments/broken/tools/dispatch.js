import { handlers } from './handlers.js';

export async function dispatch(toolCalls) {
  return Promise.all(toolCalls.map((call) => {
    const args = JSON.parse(call.function.arguments);
    return handlers[call.function.name](args);
  }));
}
