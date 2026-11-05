// Promptfoo custom provider. The prompt is a JSON string {"tool", "input"}; the output is the tool result as JSON.
// Calls the same callTool() path as MCP and the native runner.
import { callTool } from '../src/tools.mjs';
import { reviveNumbers } from './shared.mjs';

export default class AgentEvalPolicyProvider {
  id() {
    return 'agent-eval-policy';
  }

  async callApi(prompt) {
    const { tool, input } = JSON.parse(prompt);
    const { isError, payload } = callTool(tool, reviveNumbers(input));
    return { output: JSON.stringify({ ...payload, isError }) };
  }
}
