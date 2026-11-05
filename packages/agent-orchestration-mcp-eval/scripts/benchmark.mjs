#!/usr/bin/env node
// Throughput and latency benchmark for the three MCP tools. Zero dependencies.
// Each tool is measured two ways:
//   callTool      in-process: input-schema validation + the policy handler (what the eval harness runs)
//   tools/call    the JSON-RPC path: handleMessage() dispatch + result serialization (what stdio/HTTP run, minus I/O)
// Every call is timed individually with process.hrtime.bigint(). Inputs rotate through accept and reject fixtures so the
// numbers are not one branch only.
//
// Usage: node scripts/benchmark.mjs [--iterations N] [--warmup N] [--json] [--write-readme]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool } from '../src/tools.mjs';
import { handleMessage } from '../src/jsonrpc.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');
const START = '<!-- benchmark:start -->';
const END = '<!-- benchmark:end -->';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const ITERATIONS = arg('--iterations', 20000);
const WARMUP = arg('--warmup', 2000);
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 100) throw new Error('--iterations must be an integer >= 100');
if (!Number.isInteger(WARMUP) || WARMUP < 0) throw new Error('--warmup must be a non-negative integer');

const budget = { usedCU: 12.5, capacityCU: 200, reservePct: 20, judgmentAllowanceCU: 18, judgmentUsedCU: 3.6 };
const SOURCE = Array.from({ length: 40 }, (_, i) => `Source line ${i + 1}: the cache keeps entries for ${300 + i} seconds.`);
const SCHEMA = {
  type: 'object',
  required: ['verdict', 'confidence', 'tags'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'risk'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    tags: { type: 'array', items: { type: 'string', maxLength: 32 } },
  },
  additionalProperties: false,
};
const contract = { anchor: 'bench', schema: SCHEMA, forbiddenClaims: ['guaranteed', '100% safe', 'final answer'], source: SOURCE };
const goodResponse = [
  'ANCHOR: bench',
  'The cache keeps entries for about five minutes.',
  `slice: L1-L2 ${JSON.stringify(SOURCE.slice(0, 2).join('\n'))}`,
  `slice: L20-L20 ${JSON.stringify(SOURCE[19])}`,
  '```json',
  '{"verdict": "ok", "confidence": 0.8, "tags": ["cache", "ttl"]}',
  '```',
].join('\n');
const badResponse = goodResponse.replace('five minutes', 'ｇｕａｒａｎｔｅｅｄ five minutes').replace('"ok"', '"maybe"');
const URLS = [
  'https://Example.org/a/?utm_source=x&b=2&a=1#frag', 'https://example.org/a?a=1&b=2', 'https://bücher.example/katalog',
  'https://xn--bcher-kva.example/katalog/', 'https://example.org/caf%c3%a9', 'http://example.org:80/x', 'javascript:alert(1)',
  'https://docs.example.org/guide/intro', 'https://docs.example.org/guide/intro/?ref=hn', 'https://example.org/a/./b/../c',
];
const DOSSIER = `# Cache review\n\n## Summary\nShip behind the flag.\n\n## Findings\n- Eviction matches the design ([design](https://docs.example.org/cache/design)).\n\n## Sources\n${
  Array.from({ length: 12 }, (_, i) => `- [Ref ${i}](https://docs.example.org/cache/ref-${i})`).join('\n')}\n`;

const WORKLOADS = {
  route_agent_seat: [
    { role: 'grunt', budget },
    { role: 'mechanic', mode: 'workspace-write', budget },
    { role: 'auditor', budget },
    { role: 'auditor', mode: 'workspace-write', budget },
    { role: 'scout', budget: { ...budget, consecutiveFailures: 3 } },
  ],
  evaluate_agent_response: [
    { response: goodResponse, contract },
    { response: badResponse, contract },
  ],
  dedup_and_lint_dossier: [
    { urls: URLS, markdown: DOSSIER },
    { urls: URLS.slice(0, 5) },
    { markdown: DOSSIER.replace('Ship', 'TODO ship') },
  ],
};

function measure(fn, inputs) {
  for (let i = 0; i < WARMUP; i++) fn(inputs[i % inputs.length]);
  const samples = new Float64Array(ITERATIONS);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) {
    const s = process.hrtime.bigint();
    fn(inputs[i % inputs.length]);
    samples[i] = Number(process.hrtime.bigint() - s) / 1000; // microseconds
  }
  const totalSec = Number(process.hrtime.bigint() - t0) / 1e9;
  samples.sort();
  const q = p => samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)];
  return { opsPerSec: Math.round(ITERATIONS / totalSec), p50us: q(0.5), p99us: q(0.99) };
}

// handleMessage() is async (stdio batches resolve in parallel), so this path includes one awaited promise per call,
// plus JSON.stringify of the reply, which is what a transport writes.
async function measureRpc(name, inputs) {
  let id = 0;
  const call = args => handleMessage({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  for (let i = 0; i < WARMUP; i++) await call(inputs[i % inputs.length]);
  const samples = new Float64Array(ITERATIONS);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) {
    const s = process.hrtime.bigint();
    const reply = await call(inputs[i % inputs.length]);
    JSON.stringify(reply);
    samples[i] = Number(process.hrtime.bigint() - s) / 1000;
  }
  const totalSec = Number(process.hrtime.bigint() - t0) / 1e9;
  samples.sort();
  const q = p => samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)];
  return { opsPerSec: Math.round(ITERATIONS / totalSec), p50us: q(0.5), p99us: q(0.99) };
}

// Sanity: every workload input must be a valid call (policy refusals are fine, schema errors are not).
for (const [name, inputs] of Object.entries(WORKLOADS)) {
  for (const input of inputs) {
    const r = callTool(name, input);
    if (r.isError) throw new Error(`benchmark input for ${name} is invalid: ${JSON.stringify(r.payload)}`);
  }
}

const rows = [];
for (const [name, inputs] of Object.entries(WORKLOADS)) {
  rows.push({ tool: name, path: 'callTool', inputs: inputs.length, ...measure(args => callTool(name, args), inputs) });
  rows.push({ tool: name, path: 'tools/call', inputs: inputs.length, ...(await measureRpc(name, inputs)) });
}

const env = {
  node: process.version,
  platform: `${os.platform()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'unknown',
  cpus: os.cpus().length,
  iterations: ITERATIONS,
  warmup: WARMUP,
};

const fmtUs = us => (us < 10 ? us.toFixed(2) : us < 100 ? us.toFixed(1) : us.toFixed(0));
const md = [
  `Measured with \`npm run bench\` (${ITERATIONS.toLocaleString('en-US')} timed calls per row after ${WARMUP.toLocaleString('en-US')} warm-up calls, inputs rotating through accept and reject fixtures) on Node ${env.node}, ${env.platform}, ${env.cpu} (${env.cpus} vCPU). Single-threaded, in-process, no transport I/O. Numbers vary by machine; rerun locally before relying on them.`,
  '',
  '| Tool | Path | Inputs | Throughput (ops/sec) | p50 latency (µs) | p99 latency (µs) |',
  '| :--- | :--- | ---: | ---: | ---: | ---: |',
  ...rows.map(r => `| \`${r.tool}\` | ${r.path} | ${r.inputs} | ${r.opsPerSec.toLocaleString('en-US')} | ${fmtUs(r.p50us)} | ${fmtUs(r.p99us)} |`),
].join('\n');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ env, rows }, null, 2));
} else {
  console.log(md);
}

if (process.argv.includes('--write-readme')) {
  const readme = fs.readFileSync(README, 'utf8');
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`README.md needs ${START} and ${END} markers`);
  fs.writeFileSync(README, `${readme.slice(0, a + START.length)}\n${md}\n${readme.slice(b)}`, 'utf8');
  console.error('README.md benchmark section updated');
}
