// Tiny recursive-descent evaluator: numbers, + - * / and parentheses only.
export const calculator = {
  name: 'calculator',
  description: 'Evaluate an arithmetic expression',
  run(toolCall: { arguments: { expression: string } }) {
    const src = toolCall.arguments.expression;
    if (!/^[\d\s+\-*/().]{1,200}$/.test(src)) throw new Error('unsupported expression');
    let i = 0;
    const peek = () => src[i], skip = () => { while (src[i] === ' ') i++; };
    const num = (): number => { skip(); if (peek() === '(') { i++; const v = expr(); skip(); i++; return v; } if (peek() === '-') { i++; return -num(); } const m = /^\d+(\.\d+)?/.exec(src.slice(i)); if (!m) throw new Error('bad number'); i += m[0].length; return Number(m[0]); };
    const term = (): number => { let v = num(); for (skip(); peek() === '*' || peek() === '/'; skip()) v = src[i++] === '*' ? v * num() : v / num(); return v; };
    const expr = (): number => { let v = term(); for (skip(); peek() === '+' || peek() === '-'; skip()) v = src[i++] === '+' ? v + term() : v - term(); return v; };
    return String(expr());
  },
};
