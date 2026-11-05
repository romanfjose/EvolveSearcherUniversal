// The Web Inspector: static files are dependency-free and in sync with src/, and the /inspector route serves only them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpServer, INSPECTOR_FILES, INSPECTOR_CSP } from '../src/http.mjs';
import { LIB_MODULES, staleModules } from '../scripts/sync-docs.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const read = rel => fs.readFileSync(path.join(DOCS, rel), 'utf8');

test('docs/lib is a byte-for-byte copy of the browser-safe src modules', () => {
  assert.deepEqual(staleModules(), [], 'run npm run sync-docs');
  for (const name of LIB_MODULES) assert.doesNotMatch(read(`lib/${name}`), /from ['"]node:/, `${name} must not import node built-ins`);
});

test('the /inspector allowlist covers exactly the inspector files', () => {
  const served = new Set(Object.values(INSPECTOR_FILES).map(([file]) => file));
  assert.deepEqual([...served].sort(), ['app.mjs', 'index.html', 'styles.css', ...LIB_MODULES.map(n => `lib/${n}`)].sort());
});

test('the playground loads nothing from outside its own origin', () => {
  const html = read('index.html');
  const app = read('app.mjs');
  const css = read('styles.css');
  for (const [name, text] of [['index.html', html], ['app.mjs', app], ['styles.css', css]]) {
    assert.doesNotMatch(text, /(src|href)\s*=\s*["']?(https?:)?\/\//i, `${name}: external src/href`);
    assert.doesNotMatch(text, /@import|url\(\s*["']?(https?:)?\/\//i, `${name}: external CSS import`);
  }
  for (const m of app.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)) assert.match(m[1], /^\.\/lib\/[a-z]+\.mjs$/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'no inline scripts (the CSP forbids them)');
  assert.doesNotMatch(html, /\sstyle=/i, 'no inline style attributes (the CSP forbids them)');
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.match(html, /<script type="module" src="\.\/app\.mjs">/);
});

test('GET /inspector serves the page with a strict CSP and refuses everything else', async t => {
  const server = createHttpServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const redirect = await fetch(`${base}/inspector`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/inspector/');

  const page = await fetch(`${base}/inspector/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(page.headers.get('content-security-policy'), INSPECTOR_CSP);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /MCP Policy &amp; Eval Playground/);

  const mod = await fetch(`${base}/inspector/lib/tools.mjs?v=1`);
  assert.equal(mod.status, 200);
  assert.match(mod.headers.get('content-type'), /^text\/javascript/);
  assert.equal(await mod.text(), fs.readFileSync(path.join(ROOT, 'src', 'tools.mjs'), 'utf8'));

  assert.equal((await fetch(`${base}/inspector/styles.css`)).headers.get('content-type'), 'text/css; charset=utf-8');
  const head = await fetch(`${base}/inspector/app.mjs`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  for (const p of ['/inspector/../src/http.mjs', '/inspector/%2e%2e/package.json', '/inspector/lib/..%2f..%2fpackage.json',
    '/inspector/lib/', '/inspector/lib/server.mjs', '/inspector/README.md', '/inspector/lib/__proto__', '/inspector/constructor']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await fetch(`${base}/inspector/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/inspector/`, { headers: { origin: 'https://evil.example' } })).status, 403);
});
