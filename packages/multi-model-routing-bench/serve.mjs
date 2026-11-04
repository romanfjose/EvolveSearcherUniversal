// Static server for docs/index.html (browsers block ES module imports on file://).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4490);
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? 'docs/index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)] || !fs.existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': `${TYPES[path.extname(file)]}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`CU Routing Calculator: http://127.0.0.1:${PORT}/`));
