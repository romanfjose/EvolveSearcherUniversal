// Fixture loading, case execution and expectation matching. Used by the native runner,
// the Promptfoo provider and the Promptfoo assertion, so all three judge a case the same way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool } from '../src/tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CASES_PATH = path.join(here, 'cases.json');

export function loadSuite() {
  return JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
}

// Partial match. Objects: every expected key must match. Arrays: same length, element-wise.
// Primitives: strict equality. Returns a list of problems; empty means match.
export function matchExpect(actual, expected, at = '$') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [`${at}: expected array of length ${expected.length}, got ${JSON.stringify(actual)}`];
    }
    return expected.flatMap((e, i) => matchExpect(actual[i], e, `${at}[${i}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return [`${at}: expected object`];
    return Object.entries(expected).flatMap(([k, v]) => matchExpect(actual[k], v, `${at}.${k}`));
  }
  return Object.is(actual, expected) ? [] : [`${at}=${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`];
}

// `mentions` is a substring check against the JSON text of the result, with the needle JSON-escaped the same way.
const mentionsProblems = (result, mentions = []) => {
  const haystack = JSON.stringify(result);
  return mentions
    .filter(m => !haystack.includes(JSON.stringify(m).slice(1, -1)))
    .map(m => `result does not mention ${JSON.stringify(m)}`);
};

// JSON cannot carry NaN, Infinity or -0, so fixtures write them as {"$number": "NaN" | "Infinity" | "-Infinity" | "-0"}.
// reviveNumbers() turns those markers back into numbers before the call. Every other value is returned unchanged
// (own "__proto__" keys from JSON.parse stay own data properties: Object.entries + defineProperty never set a prototype).
const SPECIAL_NUMBERS = { NaN, Infinity, '-Infinity': -Infinity, '-0': -0 };
export function reviveNumbers(value) {
  if (Array.isArray(value)) return value.map(reviveNumbers);
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$number' && Object.hasOwn(SPECIAL_NUMBERS, value.$number)) return SPECIAL_NUMBERS[value.$number];
  const out = {};
  for (const [k, v] of Object.entries(value)) Object.defineProperty(out, k, { value: reviveNumbers(v), enumerable: true, writable: true, configurable: true });
  return out;
}

// Runs one case through callTool(), the same path the MCP server uses.
export function runCase(c) {
  const { isError, payload } = callTool(c.tool, reviveNumbers(c.input));
  const actual = { ...payload, isError };
  const { mentions, ...shape } = c.expect;
  const problems = [...matchExpect(actual, shape), ...mentionsProblems(actual, mentions)];
  return { id: c.id, category: c.category, actual, problems, pass: problems.length === 0 };
}
