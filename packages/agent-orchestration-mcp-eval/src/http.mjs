#!/usr/bin/env node
// MCP HTTP transport: POST /mcp with one JSON-RPC message per request, JSON reply. GET /inspector/ serves the Web Inspector.
// Binds to 127.0.0.1 by default and rejects browser origins other than localhost (DNS-rebinding guard).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMessage, ERR, SUPPORTED_PROTOCOL_VERSIONS } from './jsonrpc.mjs';

const MAX_BODY_BYTES = 1_000_000;
const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');

// The Web Inspector is served from a fixed allowlist of files under docs/. Request paths are looked up in this map,
// never joined onto the filesystem, so no path (encoded dots, backslashes, NUL) can reach another file.
const LIB_MODULES = ['policy.mjs', 'evaluate.mjs', 'dossier.mjs', 'schema.mjs', 'tools.mjs', 'simulate.mjs'];
const JS = 'text/javascript; charset=utf-8';
export const INSPECTOR_FILES = Object.freeze(Object.fromEntries([
  ['/inspector/', ['index.html', 'text/html; charset=utf-8']],
  ['/inspector/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/inspector/app.mjs', ['app.mjs', JS]],
  ['/inspector/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ...LIB_MODULES.map(name => [`/inspector/lib/${name}`, [`lib/${name}`, JS]]),
]));
// Same-origin only: scripts, styles and fetch() to /mcp. No inline script, no inline style attribute, no framing.
export const INSPECTOR_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function serveInspector(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return send(res, 405, { error: 'method not allowed' });
  }
  if (pathname === '/inspector') {
    res.writeHead(308, { location: '/inspector/' });
    return res.end();
  }
  const entry = Object.hasOwn(INSPECTOR_FILES, pathname) ? INSPECTOR_FILES[pathname] : null;
  if (!entry) return send(res, 404, { error: 'not found' });
  const body = fs.readFileSync(path.join(DOCS, entry[0]));
  res.writeHead(200, {
    'content-type': entry[1],
    'content-length': body.length,
    'content-security-policy': INSPECTOR_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  });
  return res.end(req.method === 'HEAD' ? undefined : body);
}
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => (tooLarge ? reject(Object.assign(new Error('body too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

export function createHttpServer() {
  return http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) return send(res, 403, { error: 'origin not allowed' });
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname === '/inspector' || pathname.startsWith('/inspector/')) return serveInspector(req, res, pathname);
      if (req.url !== '/mcp') return send(res, 404, { error: 'not found' });
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST');
        return send(res, 405, { error: 'method not allowed' });
      }
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return send(res, 415, { error: 'content-type must be application/json' });
      }
      // An absent header is allowed (the spec then assumes 2025-03-26). A present header must name a version this server speaks.
      const protocolVersion = req.headers['mcp-protocol-version'];
      if (protocolVersion !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
        return send(res, 400, { error: `unsupported MCP-Protocol-Version: ${protocolVersion}` });
      }
      const text = await readBody(req);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: ERR.PARSE, message: 'parse error' } });
      }
      // Batching was removed in MCP 2025-06-18. Over HTTP a batch is refused outright, not answered element by element.
      if (Array.isArray(message)) {
        return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: ERR.INVALID_REQUEST, message: 'JSON-RPC batch requests are not supported over HTTP' } });
      }
      const reply = await handleMessage(message);
      if (reply === null) {
        res.writeHead(202);
        return res.end();
      }
      return send(res, 200, reply);
    } catch (e) {
      return send(res, e.status ?? 500, { error: e.status ? e.message : 'internal error' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3333);
  createHttpServer().listen(port, '127.0.0.1', () => {
    process.stderr.write(`agent-eval-policy MCP over HTTP on http://127.0.0.1:${port}/mcp\n`);
    process.stderr.write(`Web Inspector on http://127.0.0.1:${port}/inspector/\n`);
  });
}
