export const calculator = {
  name: 'calculator',
  description: 'Evaluate an arithmetic expression',
  run(toolCall: { arguments: { expression: string } }) {
    return String(eval(toolCall.arguments.expression));
  },
};
