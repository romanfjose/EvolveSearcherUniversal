#!/usr/bin/env node
// Local console: http://127.0.0.1:4490/ . Binds to loopback only; every write re-parses the pasted text server-side
// (the browser's preview is never trusted), and POSTs need a same-origin JSON request (blocks drive-by CSRF and DNS rebinding).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pack } from '../src/packer.mjs';
import { unpack, plan } from '../src/unpacker.mjs';
import { commit, diskReader, resolveSafe } from '../src/commit.mjs';
import { loadAssay, readManifest } from '../src/cli.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const STATIC_DIRS = ['ui', 'src', 'docs', 'examples'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY = 16 * 1024 * 1024;

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const publicItem = ({ before, after, ...rest }) => rest;

export function createServer({ root = process.cwd(), manifest: manifestFile, assay } = {}) {
  const loadManifest = () => readManifest(root, manifestFile);
  const run = (text, strict) => {
    const manifest = loadManifest();
    const result = unpack(String(text ?? ''), { manifest, strict: !!strict, assay });
    return { manifest, result, planned: plan(result, diskReader(root)) };
  };
  const server = http.createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const hosts = [`${HOST}:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) return send(res, 403, { error: 'Invalid host' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && !hosts.map(h => 'http://' + h).includes(origin)) return send(res, 403, { error: 'Cross-origin request refused' });
        if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Content-Type must be application/json' });
        const body = await readBody(req);
        if (url.pathname === '/api/preview') {
          const { result, planned } = run(body.text, body.strict);
          return send(res, 200, { ...result, items: planned.map(publicItem) });
        }
        if (url.pathname === '/api/commit') {
          const { result, planned } = run(body.text, body.strict);
          const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
          const written = commit(planned.filter(p => !ids || ids.has(p.id)), root);
          return send(res, 200, { summary: result.summary, written });
        }
        if (url.pathname === '/api/pack') {
          const spec = body.spec || {};
          spec.sources = (spec.sources || []).map(s => {
            if (typeof s.text === 'string' || !s.file) return s;
            const r = resolveSafe(root, s.file);
            if (r.error) throw Object.assign(new Error(`${s.file}: ${r.error}`), { status: 400 });
            return { path: s.path || s.file, ...s, text: fs.readFileSync(r.abs, 'utf8') };
          });
          const out = pack(spec);
          if (body.save) {
            const dir = path.join(root, '.wbp');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(out.manifest, null, 2) + '\n');
          }
          return send(res, 200, { batch: out.batch, packets: out.packets, saved: !!body.save });
        }
        return send(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      if (url.pathname === '/api/state') {
        const m = loadManifest();
        return send(res, 200, { mode: 'local', root, assay: !!assay,
          manifest: m && { batch: m.batch, outputs: m.outputs, packets: Object.keys(m.packets || {}), sources: (m.sources || []).map(s => s.url || s.path) } });
      }
      if (url.pathname === '/') { res.writeHead(302, { location: '/ui/' }); return res.end(); }
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '').replace(/\/$/, '/index.html');
      const abs = path.resolve(PKG, rel);
      if (!STATIC_DIRS.some(d => abs.startsWith(path.join(PKG, d) + path.sep)) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return send(res, 404, { error: 'Not found' });
      return send(res, 200, fs.readFileSync(abs), TYPES[path.extname(abs)] || 'application/octet-stream');
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  });
  return server;
}

export async function startServer({ root = process.cwd(), port = 4490, manifest, assay, quiet = false } = {}) {
  const server = createServer({ root, manifest, assay: assay === undefined ? await loadAssay() : assay });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, HOST, resolve); });
  if (!quiet) console.log(`webchat-batch-packer console: http://${HOST}:${server.address().port}/  (root ${root})`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
  startServer({ root: path.resolve(arg('root') || '.'), port: arg('port') ? +arg('port') : undefined, manifest: arg('manifest') });
}
