// JSON-RPC 2.0 MCP behaviour: in-process, then the real stdio and HTTP transports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMessage, ERR } from '../src/jsonrpc.mjs';
import { createHttpServer } from '../src/http.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, '..', 'src', 'server.mjs');
const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });

test('initialize negotiates a supported protocol version and advertises tools and resources', async () => {
  const r = await handleMessage(req(1, 'initialize', { protocolVersion: '2024-11-05' }));
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.ok(r.result.capabilities.tools);
  assert.ok(r.result.capabilities.resources);
  const unknown = await handleMessage(req(2, 'initialize', { protocolVersion: '1999-01-01' }));
  assert.equal(unknown.result.protocolVersion, '2025-06-18');
});

test('notifications get no reply', async () => {
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list exposes the three tools with JSON input schemas', async () => {
  const r = await handleMessage(req(3, 'tools/list'));
  assert.deepEqual(r.result.tools.map(t => t.name).sort(), ['dedup_and_lint_dossier', 'evaluate_agent_response', 'route_agent_seat']);
  for (const t of r.result.tools) assert.equal(t.inputSchema.type, 'object');
});

test('tools/call returns text content and isError=false for a policy decision', async () => {
  const r = await handleMessage(req(4, 'tools/call', { name: 'route_agent_seat', arguments: { role: 'grunt', budget: { usedCU: 0, capacityCU: 5, reservePct: 0 } } }));
  assert.equal(r.result.isError, false);
  assert.equal(JSON.parse(r.result.content[0].text).ok, true);
});

test('tools/call with invalid arguments returns isError=true, not a protocol error', async () => {
  const r = await handleMessage(req(5, 'tools/call', { name: 'route_agent_seat', arguments: { role: 'grunt', budget: { usedCU: -1, capacityCU: 5, reservePct: 0 } } }));
  assert.equal(r.error, undefined);
  assert.equal(r.result.isError, true);
});

test('tools/call with an unknown tool name is a JSON-RPC invalid-params error', async () => {
  const r = await handleMessage(req(6, 'tools/call', { name: 'shell_exec', arguments: {} }));
  assert.equal(r.error.code, ERR.INVALID_PARAMS);
});

test('resources/list and resources/read return the contracts and fixtures', async () => {
  const list = await handleMessage(req(7, 'resources/list'));
  assert.ok(list.result.resources.some(r => r.uri === 'agent-eval://contracts/tools'));
  const read = await handleMessage(req(8, 'resources/read', { uri: 'agent-eval://contracts/tools' }));
  assert.match(read.result.contents[0].text, /route_agent_seat/);
  const fixtures = await handleMessage(req(9, 'resources/read', { uri: 'agent-eval://fixtures/cases' }));
  assert.equal(JSON.parse(fixtures.result.contents[0].text).suite, 'agent-orchestration-policy');
});

test('unknown resource URI is -32002', async () => {
  const r = await handleMessage(req(10, 'resources/read', { uri: 'file:///etc/passwd' }));
  assert.equal(r.error.code, ERR.RESOURCE_NOT_FOUND);
});

test('malformed requests and unknown methods get the standard error codes', async () => {
  assert.equal((await handleMessage({ id: 1, method: 'ping' })).error.code, ERR.INVALID_REQUEST);
  assert.equal((await handleMessage(req(11, 'no/such'))).error.code, ERR.METHOD_NOT_FOUND);
  assert.equal((await handleMessage(req({ bad: true }, 'ping'))).error.code, ERR.INVALID_REQUEST);
  assert.equal((await handleMessage([])).error.code, ERR.INVALID_REQUEST);
});

test('request IDs must be strings or integers: null and fractional numbers are refused', async () => {
  for (const id of [null, 1.5, -0.25, 0.1]) {
    const r = await handleMessage({ jsonrpc: '2.0', id, method: 'ping' });
    assert.equal(r.error.code, ERR.INVALID_REQUEST, `id ${id} must be refused`);
    assert.equal(r.id, null);
  }
  assert.deepEqual((await handleMessage(req('req-1', 'ping'))).result, {});
  assert.deepEqual((await handleMessage(req(0, 'ping'))).result, {});
});

test('stdio transport answers over newline-delimited JSON', async t => {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const lines = [];
  let buf = '';
  child.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      lines.push(JSON.parse(buf.slice(0, i)));
      buf = buf.slice(i + 1);
    }
  });
  child.stdin.write(JSON.stringify(req(1, 'initialize', { protocolVersion: '2025-06-18' })) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify(req(2, 'tools/list')) + '\n');
  child.stdin.write('{not json\n');
  child.stdin.write(JSON.stringify(req(3, 'tools/call', { name: 'evaluate_agent_response', arguments: { response: 'ANCHOR: x', contract: { anchor: 'x' } } })) + '\n');
  child.stdin.end();
  await new Promise(resolve => child.on('close', resolve));
  assert.equal(lines.length, 4, 'the notification must not produce a reply');
  assert.equal(lines[0].result.serverInfo.name, 'agent-eval-policy');
  assert.equal(lines[1].result.tools.length, 3);
  assert.equal(lines[2].error.code, ERR.PARSE);
  assert.equal(JSON.parse(lines[3].result.content[0].text).ok, true);
});

test('HTTP transport accepts POST /mcp and rejects other methods, paths and foreign origins', async t => {
  const server = createHttpServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  const ok = await post(req(1, 'tools/call', { name: 'dedup_and_lint_dossier', arguments: { urls: ['https://a.test/', 'https://a.test/'] } }));
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse((await ok.json()).result.content[0].text).ok, false);

  assert.equal((await post(req(2, 'ping'), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(req(3, 'ping'), { origin: 'http://localhost:3000' })).status, 200);
  assert.equal((await post('{bad', {})).status, 400);
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
  assert.equal((await fetch(`${base}/other`, { method: 'POST' })).status, 404);
  assert.equal((await post(req(4, 'ping'), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
});

test('HTTP refuses unsupported MCP-Protocol-Version headers and batch bodies', async t => {
  const server = createHttpServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  assert.equal((await post(req(1, 'ping'), { 'mcp-protocol-version': '1999-01-01' })).status, 400);
  assert.equal((await post(req(2, 'ping'), { 'mcp-protocol-version': '2025-06-18' })).status, 200);
  assert.equal((await post(req(3, 'ping'))).status, 200);

  const batch = await post([req(4, 'ping'), req(5, 'ping')]);
  assert.equal(batch.status, 400);
  assert.equal((await batch.json()).error.code, ERR.INVALID_REQUEST);

  const badId = await post({ jsonrpc: '2.0', id: null, method: 'ping' });
  assert.equal((await badId.json()).error.code, ERR.INVALID_REQUEST);
});
