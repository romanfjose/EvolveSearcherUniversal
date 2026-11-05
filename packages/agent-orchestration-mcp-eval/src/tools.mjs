// Tool registry. The MCP server, the native eval harness and the Promptfoo provider all call
// through callTool(), so every interface runs the same validation and the same policy code.
import { routeAgentSeat, WRITE_MODES, ROLE_TIERS, DEFAULT_FAILURE_THRESHOLD, MAX_CU } from './policy.mjs';
import { evaluateAgentResponse, CONTRACT_SCHEMA } from './evaluate.mjs';
import { dedupUrls, lintDossier } from './dossier.mjs';
import { assertSupportedSchema, validate } from './schema.mjs';

const num = (description, extra = {}) => ({ type: 'number', description, maximum: MAX_CU, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, maximum: MAX_CU, ...extra });

const BUDGET_SCHEMA = {
  type: 'object',
  description: `Accounting snapshot for the admission decision. All values are supplied by the caller and must be finite and <= ${MAX_CU}.`,
  properties: {
    usedCU: num('CU already spent this window. Must be >= 0.', { minimum: 0 }),
    capacityCU: num('Total window capacity in CU. Must be > 0.', { minimum: 0, exclusiveMinimum: 0 }),
    reservePct: num('Percent of capacity held back for the operator (0-100).', { minimum: 0, maximum: 100 }),
    judgmentUsedCU: num('CU already spent on judgment-tier seats. Must be >= 0.', { minimum: 0 }),
    judgmentAllowanceCU: num('Judgment-tier CU granted for this window. Must be >= 0. Default 0 refuses judgment seats.', { minimum: 0 }),
    consecutiveFailures: int('Consecutive failed seat runs. Must be >= 0.', { minimum: 0 }),
    failureThreshold: int(`Failures that open the circuit breaker. Must be >= 1. Default ${DEFAULT_FAILURE_THRESHOLD}.`, { minimum: 1 }),
  },
  required: ['usedCU', 'capacityCU', 'reservePct'],
  additionalProperties: false,
};

const TOOL_DEFS = [
  {
    name: 'route_agent_seat',
    description: 'Route a worker role to a cost tier and admit its planned spend against the budget snapshot. Fails closed on unknown roles, modes, or malformed accounting values.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: Object.keys(ROLE_TIERS), description: 'Worker role. auditor is always read-only.' },
        mode: { type: 'string', enum: WRITE_MODES, description: 'read-only (default) or workspace-write.' },
        budget: BUDGET_SCHEMA,
      },
      required: ['role', 'budget'],
      additionalProperties: false,
    },
    handler: args => routeAgentSeat(args),
  },
  {
    name: 'evaluate_agent_response',
    description: 'Check one agent response against a contract: anchor line, JSON payload schema, forbidden claims, and verified source-slice citations.',
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Full text of the agent response.' },
        contract: CONTRACT_SCHEMA,
      },
      required: ['response', 'contract'],
      additionalProperties: false,
    },
    handler: args => evaluateAgentResponse(args),
  },
  {
    name: 'dedup_and_lint_dossier',
    description: 'Canonicalize and deduplicate URLs, and/or lint a markdown dossier against the dossier schema. ok is false on any duplicate, invalid URL, or lint violation.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'URLs to canonicalize and deduplicate.' },
        markdown: { type: 'string', description: 'Dossier markdown to lint.' },
      },
      additionalProperties: false,
    },
    handler: ({ urls, markdown }) => {
      if (urls === undefined && markdown === undefined) throw new Error('provide urls, markdown, or both');
      const out = { ok: true };
      if (urls !== undefined) {
        out.dedup = dedupUrls(urls);
        if (out.dedup.duplicates.length || out.dedup.invalid.length) out.ok = false;
      }
      if (markdown !== undefined) {
        out.lint = lintDossier(markdown);
        if (!out.lint.ok) out.ok = false;
      }
      return out;
    },
  },
];

for (const tool of TOOL_DEFS) assertSupportedSchema(tool.inputSchema, tool.name);

export const TOOLS = Object.freeze(TOOL_DEFS);
export const hasTool = name => TOOLS.some(t => t.name === name);

export function listTools() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

// Returns { isError, payload }. Schema violations and handler exceptions are isError results.
// Policy refusals (ok: false) are normal results, not tool errors.
export function callTool(name, args) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  const errors = validate(tool.inputSchema, args ?? {});
  if (errors.length) {
    return { isError: true, payload: { ok: false, error: 'invalid arguments', errors } };
  }
  try {
    return { isError: false, payload: tool.handler(args ?? {}) };
  } catch (e) {
    return { isError: true, payload: { ok: false, error: e.message } };
  }
}
