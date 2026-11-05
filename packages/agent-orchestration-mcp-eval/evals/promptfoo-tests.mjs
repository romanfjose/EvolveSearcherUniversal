// Promptfoo test generator. Reads the same evals/cases.json as the native harness, so the fixtures live in one place.
import { loadSuite } from './shared.mjs';

export default function generateTests() {
  return loadSuite().cases.map(c => ({
    description: `[${c.category}] ${c.id}`,
    vars: {
      payload: JSON.stringify({ tool: c.tool, input: c.input }),
      expectation: JSON.stringify(c.expect),
    },
    assert: [{ type: 'javascript', value: 'file://evals/promptfoo-assert.mjs' }],
  }));
}
