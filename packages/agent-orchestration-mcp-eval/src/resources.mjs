// MCP resources: read-only views of the tool contracts, the shared fixtures, and the latest scorecard.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from './tools.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'evals', 'cases.json');
const SCORECARD = path.join(ROOT, 'evals', 'results', 'scorecard.json');

const RESOURCES = Object.freeze([
  {
    uri: 'agent-eval://contracts/tools',
    name: 'tool-contracts',
    title: 'Tool contracts',
    description: 'Each tool description and its JSON input schema, in markdown.',
    mimeType: 'text/markdown',
    read: () => TOOLS.map(t => `## ${t.name}\n\n${t.description}\n\n\`\`\`json\n${JSON.stringify(t.inputSchema, null, 2)}\n\`\`\``).join('\n\n'),
  },
  {
    uri: 'agent-eval://fixtures/cases',
    name: 'eval-fixtures',
    title: 'Shared deterministic fixtures',
    description: 'The fixture file replayed by the native harness and the Promptfoo config.',
    mimeType: 'application/json',
    read: () => fs.readFileSync(FIXTURES, 'utf8'),
  },
  {
    uri: 'agent-eval://scorecard/latest',
    name: 'eval-scorecard',
    title: 'Latest eval scorecard',
    description: 'Output of the last `npm run eval`. Absent until the harness has run.',
    mimeType: 'application/json',
    read: () => fs.readFileSync(SCORECARD, 'utf8'),
  },
]);

export function listResources() {
  return RESOURCES.map(({ uri, name, title, description, mimeType }) => ({ uri, name, title, description, mimeType }));
}

// Returns { uri, mimeType, text } or null when the URI is not registered or its backing file is missing.
export function readResource(uri) {
  const res = RESOURCES.find(r => r.uri === uri);
  if (!res) return null;
  try {
    return { uri, mimeType: res.mimeType, text: res.read() };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
