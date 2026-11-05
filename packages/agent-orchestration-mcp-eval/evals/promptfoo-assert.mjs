// Promptfoo javascript assertion. Passes when the provider output matches the case expectation.
import { matchExpect } from './shared.mjs';

export default function (output, context) {
  const expect = JSON.parse(context.vars.expectation);
  const { mentions = [], ...shape } = expect;
  const actual = JSON.parse(output);
  const problems = [
    ...matchExpect(actual, shape),
    ...mentions.filter(m => !output.includes(JSON.stringify(m).slice(1, -1))).map(m => `missing mention ${m}`),
  ];
  return { pass: problems.length === 0, score: problems.length === 0 ? 1 : 0, reason: problems.join('; ') || 'matches fixture' };
}
