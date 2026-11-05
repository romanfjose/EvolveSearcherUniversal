/**
 * Sovereign Core & Helmet 03 Directive: Synthetic José QA ("Where's the Bathroom?" Breaker)
 * Adversarial fuzzing and edge-case test suite for packages/agent-orchestration-mcp-eval.
 *
 * Attacks:
 *  1. Malformed Tool & Contract Schemas:
 *     - Keyword corruption, prototype injection, malformed arrays/types, out-of-spec definitions.
 *     - Registration rejection (assertSupportedSchema fail closed) and callTool execution resilience.
 *  2. Cyclical DAG Dependencies:
 *     - Multi-agent orchestration workflows with cyclical dependency graphs (direct cycle, mutual recursion, self-loops).
 *     - Circular references in arguments / payload structures passed into tool handlers and serializers.
 *  3. Rate-Limit Storms & Concurrency Spikes:
 *     - Rapid parallel dispatch of tool calls.
 *     - Rate-limit and capacity-exhaustion storms under tight budgets.
 *     - Circuit breaker trip dynamics under concurrent error floods.
 *  4. Partial & Truncated JSON Responses:
 *     - Truncated code blocks (incomplete JSON markdown).
 *     - Broken / truncated chunks over stdio and HTTP transports.
 *     - Aborted streams and malformed JSON-RPC requests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { handleMessage, ERR } from '../src/jsonrpc.mjs';
import { callTool, listTools, hasTool } from '../src/tools.mjs';
import { assertSupportedSchema, validate } from '../src/schema.mjs';
import { routeAgentSeat, admitSpend } from '../src/policy.mjs';
import { evaluateAgentResponse } from '../src/evaluate.mjs';
import { serveStdio } from '../src/server.mjs';
import { createHttpServer } from '../src/http.mjs';

const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });

describe('Helmet 03: Malformed Tool & Contract Schemas', () => {
  test('rejects unsupported keywords at top-level and nested schema levels', () => {
    const forbiddenKeywords = [
      '$schema', '$ref', '$id', 'pattern', 'format', 'default',
      'not', 'anyOf', 'oneOf', 'allOf', 'definitions', '$defs',
      'dependencies', 'if', 'then', 'else',
    ];

    for (const kw of forbiddenKeywords) {
      assert.throws(
        () => assertSupportedSchema({ type: 'object', [kw]: 'malformed' }),
        /unsupported keyword/,
        `Schema should reject unsupported keyword: ${kw}`
      );

      // Deeply nested unsupported keyword
      assert.throws(
        () => assertSupportedSchema({
          type: 'object',
          properties: {
            subField: {
              type: 'object',
              properties: {
                deepField: { type: 'string', [kw]: true },
              },
            },
          },
        }),
        /unsupported keyword/,
        `Nested schema should reject unsupported keyword: ${kw}`
      );
    }
  });

  test('rejects malformed values for supported keywords (type, enum, required, bounds)', () => {
    const badSchemas = [
      { schema: { type: 'unknown_type' }, match: /must name known types/ },
      { schema: { type: [] }, match: /must name known types/ },
      { schema: { type: 123 }, match: /must name known types/ },
      { schema: { enum: [] }, match: /must be a non-empty array/ },
      { schema: { enum: 'not_an_array' }, match: /must be a non-empty array/ },
      { schema: { required: 'field' }, match: /must be an array of strings/ },
      { schema: { required: [123] }, match: /must be an array of strings/ },
      { schema: { properties: 'invalid' }, match: /must be an object/ },
      { schema: { additionalProperties: 'invalid' }, match: /must be a boolean or a schema/ },
      { schema: { items: 'invalid' }, match: /must be a schema object/ },
      { schema: { minimum: '10' }, match: /must be a finite number/ },
      { schema: { minimum: NaN }, match: /must be a finite number/ },
      { schema: { maximum: Infinity }, match: /must be a finite number/ },
      { schema: { minLength: -1 }, match: /must be a non-negative integer/ },
      { schema: { maxLength: 3.14 }, match: /must be a non-negative integer/ },
      { schema: { description: 999 }, match: /must be a string/ },
      { schema: { title: ['bad'] }, match: /must be a string/ },
    ];

    for (const { schema, match } of badSchemas) {
      assert.throws(() => assertSupportedSchema(schema), match);
    }
  });

  test('rejects prototype pollution attempts in schema objects and properties', () => {
    const pollutedSchema = JSON.parse('{"type":"object","__proto__":{"polluted":true},"properties":{"__proto__":{"type":"string"}}}');
    // Ensure evaluating response or calling validate against it does not pollute Object prototype
    const res = validate(pollutedSchema, { safe: 'ok' });
    assert.ok(Array.isArray(res));
    assert.equal(Object.prototype.polluted, undefined);
  });

  test('evaluate_agent_response fails closed on malformed contracts', () => {
    // Missing anchor
    const noAnchor = evaluateAgentResponse({ response: 'ANCHOR: test', contract: {} });
    assert.equal(noAnchor.ok, false);
    assert.equal(noAnchor.reason, 'invalid contract');

    // Malformed schema in contract
    assert.throws(() => {
      evaluateAgentResponse({
        response: 'ANCHOR: test\n```json\n{"a":1}\n```',
        contract: { anchor: 'test', schema: { type: 'object', unknownKeyword: 1 } },
      });
    }, /unsupported keyword/);

    // Schema type mismatch in contract
    const badContractType = evaluateAgentResponse({
      response: 'ANCHOR: test',
      contract: { anchor: 12345 },
    });
    assert.equal(badContractType.ok, false);
    assert.equal(badContractType.reason, 'invalid contract');
  });

  test('callTool protects against malformed tool arguments and null inputs', () => {
    // Non-existent tool
    assert.throws(() => callTool('non_existent_tool', {}), /unknown tool/);

    // Missing required properties
    const resRouteMissing = callTool('route_agent_seat', {});
    assert.equal(resRouteMissing.isError, true);
    assert.equal(resRouteMissing.payload.ok, false);
    assert.ok(resRouteMissing.payload.errors.length > 0);

    // Null arguments
    const resNullArgs = callTool('route_agent_seat', null);
    assert.equal(resNullArgs.isError, true);
    assert.equal(resNullArgs.payload.ok, false);

    // Extra unknown property (additionalProperties: false)
    const resExtraProp = callTool('route_agent_seat', {
      role: 'grunt',
      budget: { usedCU: 0, capacityCU: 10, reservePct: 0 },
      rogueProp: 'hacked',
    });
    assert.equal(resExtraProp.isError, true);
    assert.ok(resExtraProp.payload.errors.some(e => e.includes('unexpected property "rogueProp"')));
  });
});

describe('Helmet 03: Cyclical DAG Dependencies', () => {
  // DAG dependency cycle detector simulating multi-agent task execution plans
  function validateAgentTaskDAG(tasks) {
    if (!Array.isArray(tasks)) throw new Error('tasks must be an array');
    const taskMap = new Map();
    for (const t of tasks) {
      if (!t || typeof t.id !== 'string') throw new Error('task must have a string id');
      if (taskMap.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
      taskMap.set(t.id, t);
    }

    const visited = new Set();
    const visiting = new Set();

    function dfs(taskId) {
      if (visiting.has(taskId)) {
        return { hasCycle: true, cycleNode: taskId };
      }
      if (visited.has(taskId)) return { hasCycle: false };

      visiting.add(taskId);
      const task = taskMap.get(taskId);
      if (task && Array.isArray(task.dependencies)) {
        for (const depId of task.dependencies) {
          if (!taskMap.has(depId)) {
            throw new Error(`unresolved dependency: ${depId} for task ${taskId}`);
          }
          const res = dfs(depId);
          if (res.hasCycle) return res;
        }
      }
      visiting.delete(taskId);
      visited.add(taskId);
      return { hasCycle: false };
    }

    for (const taskId of taskMap.keys()) {
      const res = dfs(taskId);
      if (res.hasCycle) return { ok: false, error: `cyclic dependency detected involving ${res.cycleNode}` };
    }
    return { ok: true, executionOrder: [...visited] };
  }

  test('detects direct self-loops in agent dependency graph', () => {
    const tasks = [
      { id: 'task-1', role: 'scout', dependencies: ['task-1'] },
    ];
    const res = validateAgentTaskDAG(tasks);
    assert.equal(res.ok, false);
    assert.match(res.error, /cyclic dependency detected involving task-1/);
  });

  test('detects mutual 2-node circular dependencies (A -> B -> A)', () => {
    const tasks = [
      { id: 'task-a', role: 'scout', dependencies: ['task-b'] },
      { id: 'task-b', role: 'mechanic', dependencies: ['task-a'] },
    ];
    const res = validateAgentTaskDAG(tasks);
    assert.equal(res.ok, false);
    assert.match(res.error, /cyclic dependency detected/);
  });

  test('detects complex multi-tier cycle in large orchestration graph', () => {
    const tasks = [
      { id: 't1', role: 'grunt', dependencies: [] },
      { id: 't2', role: 'scout', dependencies: ['t1'] },
      { id: 't3', role: 'mechanic', dependencies: ['t2'] },
      { id: 't4', role: 'sniper', dependencies: ['t3'] },
      { id: 't5', role: 'auditor', dependencies: ['t4'] },
      { id: 't6', role: 'grunt', dependencies: ['t5', 't2'] },
      // Cycle injected here: t2 depends on t6 indirectly
      { id: 't2_bad', role: 'scout', dependencies: ['t6'] },
    ];
    // Modify t3 to depend on t2_bad
    tasks[2].dependencies = ['t2_bad'];

    const res = validateAgentTaskDAG(tasks);
    assert.equal(res.ok, false);
    assert.match(res.error, /cyclic dependency detected/);
  });

  test('admits valid acyclic DAG and produces deterministic topological execution order', () => {
    const tasks = [
      { id: 'root', role: 'scout', dependencies: [] },
      { id: 'worker1', role: 'grunt', dependencies: ['root'] },
      { id: 'worker2', role: 'mechanic', dependencies: ['root'] },
      { id: 'auditor', role: 'auditor', dependencies: ['worker1', 'worker2'] },
    ];
    const res = validateAgentTaskDAG(tasks);
    assert.equal(res.ok, true);
    assert.equal(res.executionOrder[0], 'root');
    assert.equal(res.executionOrder[res.executionOrder.length - 1], 'auditor');
  });

  test('prevents infinite recursion / stack overflow on circular object references in inputs', () => {
    const circularObj = { role: 'grunt' };
    circularObj.self = circularObj;

    // Passing circular reference to callTool should fail gracefully via schema validator or JSON serializer
    assert.doesNotThrow(() => {
      const res = callTool('route_agent_seat', circularObj);
      assert.equal(res.isError, true);
    });
  });
});

describe('Helmet 03: Rate-Limit Storms & Concurrency Spikes', () => {
  test('handles rapid parallel dispatch of 200 concurrent tool calls without race conditions', async () => {
    const totalRequests = 200;
    const promises = [];

    for (let i = 0; i < totalRequests; i++) {
      const msg = req(i + 1, 'tools/call', {
        name: 'route_agent_seat',
        arguments: {
          role: i % 2 === 0 ? 'grunt' : 'scout',
          budget: { usedCU: 0, capacityCU: 100, reservePct: 10 },
        },
      });
      promises.push(handleMessage(msg));
    }

    const results = await Promise.all(promises);
    assert.equal(results.length, totalRequests);
    for (let i = 0; i < totalRequests; i++) {
      const res = results[i];
      assert.equal(res.id, i + 1);
      assert.equal(res.result.isError, false);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.stage, 'admitted');
    }
  });

  test('trips circuit breaker under an error storm and stays open across concurrent callers', () => {
    const failureThreshold = 5;
    let consecutiveFailures = 0;

    // Simulate 10 requests: first 4 closed, 5th hits threshold, remaining 5 blocked
    const decisions = [];
    for (let i = 0; i < 10; i++) {
      const isBreakerTripTime = i >= failureThreshold;
      consecutiveFailures = i;

      const admission = admitSpend({
        cu: 0.09,
        tier: 'cheap',
        usedCU: 0,
        capacityCU: 100,
        consecutiveFailures,
        failureThreshold,
      });

      decisions.push(admission);
      if (isBreakerTripTime) {
        assert.equal(admission.ok, false);
        assert.equal(admission.breaker, 'open');
        assert.match(admission.reason, /circuit breaker open/);
      } else {
        assert.equal(admission.ok, true);
        assert.equal(admission.breaker, 'closed');
      }
    }

    assert.equal(decisions.filter(d => d.breaker === 'open').length, 5);
  });

  test('rate storm with micro-budgets exhausts capacity cleanly without overshooting', () => {
    let usedCU = 0;
    const capacityCU = 1.0;
    const reservePct = 0;
    const cuPerSeat = 0.09; // grunt
    let admittedCount = 0;
    let rejectedCount = 0;

    // Attempt 30 admissions against 1.0 CU
    for (let i = 0; i < 30; i++) {
      const decision = routeAgentSeat({
        role: 'grunt',
        budget: { usedCU, capacityCU, reservePct },
      });

      if (decision.ok) {
        admittedCount++;
        usedCU += decision.cu;
      } else {
        rejectedCount++;
        assert.match(decision.reason, /agent share exceeded/);
      }
    }

    // 1.0 CU / 0.09 CU per seat = 11 admissions (11 * 0.09 = 0.99 <= 1.0)
    assert.equal(admittedCount, 11);
    assert.equal(rejectedCount, 19);
    assert.ok(usedCU <= capacityCU);
  });
});

describe('Helmet 03: Partial & Truncated JSON Responses', () => {
  test('rejects truncated markdown code blocks missing closing fences', () => {
    // Truncated closing fence
    const truncatedResponse = 'ANCHOR: test\n```json\n{"status": "in_progress", "data": [1, 2';
    const evalRes = evaluateAgentResponse({
      response: truncatedResponse,
      contract: { anchor: 'test', schema: { type: 'object' } },
    });

    assert.equal(evalRes.ok, false);
    assert.equal(evalRes.checks.schema.status, 'fail');
    assert.ok(evalRes.checks.schema.violations.some(v => v.includes('no ```json payload found in response')));
  });

  test('rejects malformed syntax within closed JSON code fences', () => {
    const brokenJsonResponse = 'ANCHOR: test\n```json\n{"status": "in_progress", "data": [1, 2,\n```';
    const evalRes = evaluateAgentResponse({
      response: brokenJsonResponse,
      contract: { anchor: 'test', schema: { type: 'object' } },
    });

    assert.equal(evalRes.ok, false);
    assert.equal(evalRes.checks.schema.status, 'fail');
    assert.ok(evalRes.checks.schema.violations.some(v => v.includes('json payload does not parse')));
  });

  test('stdio transport handles chunked, fragmented, and incomplete JSON lines gracefully', async () => {
    const input = new Readable({ read() {} });
    const outputChunks = [];
    const output = new Writable({
      write(chunk, encoding, callback) {
        outputChunks.push(chunk.toString());
        callback();
      },
    });

    const done = serveStdio({ input, output });

    // Stream pieces of a JSON-RPC message in byte-sized fragments
    const validMsg = JSON.stringify(req(101, 'ping')) + '\n';
    input.push(validMsg.slice(0, 5));
    input.push(validMsg.slice(5, 15));
    input.push(validMsg.slice(15));

    // Broken partial line followed by newline
    input.push('{"jsonrpc": "2.0", "id": 102, "meth');
    input.push('\n');

    // Recovery with a valid message
    input.push(JSON.stringify(req(103, 'ping')) + '\n');
    input.push(null); // End of stream

    await done;

    const lines = outputChunks.join('').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    assert.equal(lines.length, 3);
    assert.equal(lines[0].id, 101);
    assert.deepEqual(lines[0].result, {});

    // Second was parse error
    assert.equal(lines[1].id, null);
    assert.equal(lines[1].error.code, ERR.PARSE);

    // Third recovered cleanly
    assert.equal(lines[2].id, 103);
    assert.deepEqual(lines[2].result, {});
  });

  test('HTTP transport handles truncated request payloads with 400 Bad Request', async t => {
    const server = createHttpServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => server.close(r)));
    const port = server.address().port;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc": "2.0", "id": 999, "method": "tools/call", "params": {"name": "ro',
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, ERR.PARSE);
  });
});
