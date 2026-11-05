#!/usr/bin/env node
// MCP stdio transport: newline-delimited JSON-RPC on stdin/stdout. Diagnostics go to stderr only.
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMessage, ERR } from './jsonrpc.mjs';

async function processLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: ERR.PARSE, message: 'parse error' } });
  }
  const reply = await handleMessage(message);
  return reply === null ? null : JSON.stringify(reply);
}

// Requests are processed strictly in arrival order, so replies never interleave out of sequence.
export function serveStdio({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let queue = Promise.resolve();
  rl.on('line', line => {
    if (!line.trim()) return;
    queue = queue
      .then(() => processLine(line))
      .then(out => { if (out !== null) output.write(out + '\n'); })
      .catch(e => process.stderr.write(`stdio transport error: ${e.message}\n`));
  });
  return new Promise(resolve => rl.on('close', () => queue.then(resolve)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  serveStdio();
}
