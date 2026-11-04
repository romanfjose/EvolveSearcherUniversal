import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pack } from '../src/packer.mjs';
import { unpack, plan } from '../src/unpacker.mjs';
import { commit, diskReader, resolveSafe } from '../src/commit.mjs';
import { main } from '../src/cli.mjs';
import { createServer } from '../ui/serve.mjs';

const EX = new URL('../examples/grant-check/', import.meta.url).pathname;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-'));
const run = async (argv, cwd) => {
  const out = [], err = [], prev = process.cwd();
  if (cwd) process.chdir(cwd);
  try { const code = await main(argv, { out: s => out.push(s), err: s => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; }
  finally { process.chdir(prev); }
};
const wrap = (id, body) => `=== BEGIN_BUNDLE packet=${id} ===\n${body}\n=== END_BUNDLE packet=${id} ===`;
const SPEC = { task: 'T', outputs: ['leads/', 'notes/'] };

describe('commit to disk', () => {
  let root;
  before(() => { root = tmp(); });
  after(() => fs.rmSync(root, { recursive: true, force: true }));
  const go = text => { const { manifest, packets } = pack(SPEC); const r = unpack(wrap(packets[0].id, text), { manifest }); return { r, p: plan(r, diskReader(root)) }; };

  test('writes ready items, creates directories, never writes held items', () => {
    const { p } = go('=== FILE: leads/a/b.md ===\nhello\n=== END FILE ===\n=== FILE: ../escape.md ===\nx\n=== END FILE ===');
    const w = commit(p, root);
    assert.deepEqual(w.map(x => [x.path, x.ok]), [['leads/a/b.md', true]]);
    assert.equal(fs.readFileSync(path.join(root, 'leads/a/b.md'), 'utf8'), 'hello\n');
    assert.ok(!fs.existsSync(path.join(root, '..', 'escape.md')));
  });
  test('append chains onto existing content; re-commit is a no-op', () => {
    fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'notes/log.md'), '# Log');
    const text = '=== APPEND: notes/log.md ===\n- a\n=== END APPEND ===';
    commit(go(text).p, root);
    assert.equal(fs.readFileSync(path.join(root, 'notes/log.md'), 'utf8'), '# Log\n- a\n');
    const again = go(text).p;
    assert.equal(again[0].action, 'unchanged');
    assert.deepEqual(commit(again, root), []);
  });
  test('a file changed after preview is refused as STALE_PLAN', () => {
    const { p } = go('=== FILE: leads/s.md ===\nnew\n=== END FILE ===');
    fs.writeFileSync(path.join(root, 'leads/s.md'), 'someone else\n');
    assert.equal(commit(p, root)[0].error, 'STALE_PLAN');
    assert.equal(fs.readFileSync(path.join(root, 'leads/s.md'), 'utf8'), 'someone else\n');
  });
  test('symlinked directory pointing outside the root is refused for read and write', () => {
    const outside = tmp();
    fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
    fs.symlinkSync(outside, path.join(root, 'notes', 'link'));
    const { p } = go('=== FILE: notes/link/secret.md ===\npwned\n=== END FILE ===');
    assert.equal(p[0].before, null, 'diff must not leak the outside file');
    assert.equal(commit(p, root)[0].error, 'SYMLINK_REFUSED');
    assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret');
    fs.rmSync(outside, { recursive: true, force: true });
  });
  test('symlinked target file is refused', () => {
    const outside = path.join(tmp(), 'x.md');
    fs.writeFileSync(outside, 'keep');
    fs.symlinkSync(outside, path.join(root, 'leads', 'ln.md'));
    assert.equal(resolveSafe(root, 'leads/ln.md').error, 'SYMLINK_REFUSED');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
  });
  test('a regular file where a directory is expected is refused', () => {
    fs.writeFileSync(path.join(root, 'leads', 'plain'), 'x');
    assert.equal(resolveSafe(root, 'leads/plain/child.md').error, 'PARENT_NOT_DIR');
  });
  test('no temp files are left behind', () => {
    const left = fs.readdirSync(root, { recursive: true }).filter(f => String(f).includes('.wbp-'));
    assert.deepEqual(left, []);
  });
});

describe('CLI', () => {
  let dir;
  before(() => {
    dir = tmp();
    for (const f of ['task.json', 'program-page.html', 'reply.txt']) fs.copyFileSync(path.join(EX, f), path.join(dir, f));
    fs.mkdirSync(path.join(dir, 'notes'));
    fs.writeFileSync(path.join(dir, 'notes/log.md'), '# Log\n');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('pack writes packets and a manifest; the example reply routes to its packet id', async () => {
    const r = await run(['pack', 'task.json'], dir);
    assert.equal(r.code, 0, r.err);
    const m = JSON.parse(fs.readFileSync(path.join(dir, '.wbp/manifest.json'), 'utf8'));
    const id = Object.keys(m.packets)[0];
    assert.ok(fs.readFileSync(path.join(dir, 'reply.txt'), 'utf8').includes(`packet=${id}`), 'examples/grant-check/reply.txt is stale: re-pack and update its packet id');
  });
  test('verify accepts the written packet and rejects an edited one', async () => {
    const f = fs.readdirSync(path.join(dir, '.wbp/packets'))[0], p = path.join(dir, '.wbp/packets', f);
    assert.equal((await run(['verify', p])).code, 0);
    fs.writeFileSync(path.join(dir, 'edited.txt'), fs.readFileSync(p, 'utf8').replace('verifying', 'faking'));
    const bad = await run(['verify', path.join(dir, 'edited.txt')]);
    assert.equal(bad.code, 2);
    assert.match(bad.out, /CHECKSUM_MISMATCH/);
  });
  test('unpack previews by default (exit 2: held items) and writes nothing', async () => {
    const r = await run(['unpack', 'reply.txt', '--no-assay'], dir);
    assert.equal(r.code, 2);
    assert.match(r.out, /2 ready, 2 held/);
    assert.match(r.out, /PATH_TRAVERSAL/);
    assert.ok(!fs.existsSync(path.join(dir, 'leads')));
  });
  test('unpack --commit writes only ready items', async () => {
    const r = await run(['unpack', 'reply.txt', '--commit', '--no-assay'], dir);
    assert.match(r.out, /wrote leads\/open-science-fund\.md/);
    assert.ok(fs.existsSync(path.join(dir, 'leads/open-science-fund.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'leads/invented-fund.md')));
    assert.equal(fs.readFileSync(path.join(dir, 'notes/log.md'), 'utf8'), '# Log\n- open-science-fund: G1-G3 sourced, G4 pending portal check.\n');
  });
  test('unpack --json is machine-readable', async () => {
    const r = await run(['unpack', 'reply.txt', '--json', '--no-assay'], dir);
    const j = JSON.parse(r.out);
    assert.deepEqual(Object.keys(j.summary).sort(), ['bundles', 'held', 'items', 'missing', 'ready', 'repairs', 'skipped']);
    assert.ok(j.items.every(i => !('after' in i)));
  });
  test('strip prints numbered text and stats', async () => {
    const r = await run(['strip', 'program-page.html'], dir);
    assert.match(r.out, /^L1 # Open Science Fund$/m);
    assert.match(r.err, /-9\d\.\d%/);
  });
  test('usage errors exit 1; help exits 0', async () => {
    assert.equal((await run(['pack'])).code, 1);
    assert.equal((await run(['nope'])).code, 1);
    assert.equal((await run(['help'])).code, 0);
    assert.equal((await run(['unpack', 'x', '--assay', '/no/such.mjs'], dir)).code, 1);
  });
});

describe('local server', () => {
  let server, port, root;
  const req = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, res => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: s, json: (() => { try { return JSON.parse(s); } catch { return null; } })() }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
  before(async () => {
    root = tmp();
    const { manifest, packets } = pack(SPEC);
    fs.mkdirSync(path.join(root, '.wbp'));
    fs.writeFileSync(path.join(root, '.wbp/manifest.json'), JSON.stringify(manifest));
    server = createServer({ root });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    server.id = packets[0].id;
  });
  after(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });

  test('serves the console and shared modules with a strict CSP', async () => {
    const r = await req('GET', '/ui/');
    assert.equal(r.status, 200);
    assert.match(r.body, /app\.js/);
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.equal((await req('GET', '/src/unpacker.mjs')).headers['content-type'], 'text/javascript; charset=utf-8');
  });
  test('static files outside ui/src/docs/examples are not served', async () => {
    for (const p of ['/package.json', '/ui/../package.json', '/%2e%2e/%2e%2e/etc/passwd', '/test/core.test.mjs']) assert.equal((await req('GET', p)).status, 404, p);
  });
  test('rejects foreign Host headers (DNS rebinding)', async () => assert.equal((await req('GET', '/api/state', undefined, { host: 'evil.example:80' })).status, 403));
  test('rejects cross-origin and non-JSON POSTs (CSRF)', async () => {
    assert.equal((await req('POST', '/api/commit', { text: '' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await req('POST', '/api/commit', 'text=x', { 'content-type': 'text/plain' })).status, 415);
  });
  test('preview returns plan with diffs and never the full before/after', async () => {
    const text = wrap(server.id, '=== FILE: leads/a.md ===\nhi\n=== END FILE ===');
    const r = await req('POST', '/api/preview', { text });
    assert.equal(r.status, 200);
    assert.equal(r.json.items[0].action, 'create');
    assert.match(r.json.items[0].diff, /\+hi/);
    assert.ok(!('after' in r.json.items[0]));
  });
  test('commit re-parses server-side and writes only ready items', async () => {
    const text = wrap(server.id, '=== FILE: leads/a.md ===\nhi\n=== END FILE ===\n=== FILE: ../../x.md ===\nno\n=== END FILE ===');
    const r = await req('POST', '/api/commit', { text });
    assert.deepEqual(r.json.written.map(w => [w.path, w.ok]), [['leads/a.md', true]]);
    assert.equal(fs.readFileSync(path.join(root, 'leads/a.md'), 'utf8'), 'hi\n');
  });
  test('pack endpoint resolves source files inside the root only and can save the manifest', async () => {
    fs.writeFileSync(path.join(root, 'page.html'), '<p>Hello there</p><p>x</p>');
    const ok = await req('POST', '/api/pack', { spec: { task: 'T', sources: [{ file: 'page.html', url: 'https://x.org' }] }, save: true });
    assert.equal(ok.status, 200);
    assert.match(ok.json.packets[0].text, /L1 Hello there/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.wbp/manifest.json'), 'utf8')).batch, ok.json.batch);
    assert.equal((await req('POST', '/api/pack', { spec: { task: 'T', sources: [{ file: '../../etc/passwd' }] } })).status, 400);
  });
  test('malformed JSON body is a 400', async () => assert.equal((await req('POST', '/api/preview', '{bad')).status, 400));
});
