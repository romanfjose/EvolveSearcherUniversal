// Transport-agnostic MCP core: JSON-RPC 2.0 request handling for initialize, ping, tools/*, resources/*.
// Returns the response object to send, or null when the message is a notification.
import { listTools, callTool, hasTool } from './tools.mjs';
import { listResources, readResource } from './resources.mjs';

export const SERVER_INFO = Object.freeze({ name: 'agent-eval-policy', version: '0.3.0' });
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const ERR = Object.freeze({
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  RESOURCE_NOT_FOUND: -32002,
});

export class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const errorResponse = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

function initialize(params) {
  const requested = isObject(params) ? params.protocolVersion : undefined;
  return {
    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: 'Deterministic policy tools: route_agent_seat, evaluate_agent_response, dedup_and_lint_dossier. Same input yields the same output.',
  };
}

function callToolRpc(params) {
  if (!isObject(params) || typeof params.name !== 'string') throw new RpcError(ERR.INVALID_PARAMS, 'tools/call requires a string "name"');
  if (!hasTool(params.name)) throw new RpcError(ERR.INVALID_PARAMS, `unknown tool: ${params.name}`);
  const { isError, payload } = callTool(params.name, params.arguments ?? {});
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError };
}

function readResourceRpc(params) {
  if (!isObject(params) || typeof params.uri !== 'string') throw new RpcError(ERR.INVALID_PARAMS, 'resources/read requires a string "uri"');
  const resource = readResource(params.uri);
  if (!resource) throw new RpcError(ERR.RESOURCE_NOT_FOUND, `resource not found: ${params.uri}`);
  return { contents: [resource] };
}

function dispatch(method, params) {
  switch (method) {
    case 'initialize': return initialize(params);
    case 'notifications/initialized': return undefined;
    case 'ping': return {};
    case 'tools/list': return { tools: listTools() };
    case 'tools/call': return callToolRpc(params);
    case 'resources/list': return { resources: listResources() };
    case 'resources/read': return readResourceRpc(params);
    default: throw new RpcError(ERR.METHOD_NOT_FOUND, `method not found: ${method}`);
  }
}

async function handleOne(message) {
  if (!isObject(message) || message.jsonrpc !== '2.0') {
    return errorResponse(null, ERR.INVALID_REQUEST, 'not a JSON-RPC 2.0 message');
  }
  const notification = !Object.hasOwn(message, 'id');
  // MCP request IDs are strings or integers. Null and fractional numbers are refused, since they cannot be matched reliably.
  if (!notification && !(typeof message.id === 'string' || Number.isInteger(message.id))) {
    return errorResponse(null, ERR.INVALID_REQUEST, 'id must be a string or an integer');
  }
  if (typeof message.method !== 'string') {
    // A response to a server-initiated request. This server never sends requests, so ignore it.
    if (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error')) return null;
    return errorResponse(message.id ?? null, ERR.INVALID_REQUEST, 'method must be a string');
  }
  try {
    const result = dispatch(message.method, message.params);
    return notification ? null : { jsonrpc: '2.0', id: message.id, result };
  } catch (e) {
    if (notification) return null;
    if (e instanceof RpcError) return errorResponse(message.id, e.code, e.message);
    return errorResponse(message.id, ERR.INTERNAL, 'internal error');
  }
}

export async function handleMessage(message) {
  if (Array.isArray(message)) {
    if (message.length === 0) return errorResponse(null, ERR.INVALID_REQUEST, 'empty batch');
    const replies = (await Promise.all(message.map(handleOne))).filter(r => r !== null);
    return replies.length ? replies : null;
  }
  return handleOne(message);
}
