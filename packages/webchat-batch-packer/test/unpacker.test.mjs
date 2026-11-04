import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from '../src/packer.mjs';
import { unpack, plan, readMarker, checkPath, pathAllowed, unwrapFence, splitBundles } from '../src/unpacker.mjs';
import { rng } from './fixtures/pages.mjs';

const URL1 = 'https://grants.example.org/p';
const SPEC = { task: 'Verify', outputs: ['leads/', 'notes/*.md'], exclude: ['https://grants.example.org/legacy'],
  sources: [{ path: 'raw/p.html', url: URL1, text: '<main><p>Open to independent teams.</p><p>Awards up to $50,000.</p></main>' }] };
const { manifest, packets } = pack(SPEC);
const ID = packets[0].id;
const two = pack({ ...SPEC, budget: 700, sources: [...SPEC.sources, { path: 'big.md', text: 'filler words here\n'.repeat(200) }] });
const wrap = (body, id = ID) => `=== BEGIN_BUNDLE packet=${id} ===\n${body}\n=== END_BUNDLE packet=${id} ===`;
const file = (p, body) => `=== FILE: ${p} ===\n${body}\n=== END FILE ===`;
const U = (text, o = {}) => unpack(text, { manifest, ...o });
const codes = it => it.diagnostics.map(d => d.code);
const fixes = it => it.repairs.map(r => r.code);
const one = (text, o) => { const r = U(text, o); assert.equal(r.items.length, 1, JSON.stringify(r.bundles)); return r.items[0]; };

describe('envelopes', () => {
  test('clean reply: FILE and APPEND become ready items with exact bodies', () => {
    const r = U(wrap(`${file('leads/a.md', '# A\nbody')}\n=== APPEND: notes/log.md ===\n- entry\n=== END APPEND ===`));
    assert.deepEqual(r.items.map(i => [i.op, i.path, i.status, i.body]), [['file', 'leads/a.md', 'ready', '# A\nbody\n'], ['append', 'notes/log.md', 'ready', '- entry']]);
    assert.equal(r.summary.repairs, 0);
    assert.deepEqual(r.missing, []);
  });
  test('chatter before, between and after bundles is ignored', () => {
    const r = U(`Sure! Here it is:\n\n${wrap(`Some intro\n${file('leads/a.md', 'x')}\nHope that helps`)}\nLet me know!`);
    assert.equal(r.summary.ready, 1);
    assert.ok(r.bundles[0].diagnostics.some(d => d.code === 'STRAY_TEXT' && d.severity === 'info'));
  });
  test('body lines that merely contain === or marker words are content', () => {
    const body = 'a === b\n==== not a marker ====\nFILE: x\n=== FILE header in prose? no';
    assert.equal(one(wrap(file('leads/a.md', body))).body, body + '\n');
  });
  test('blank lines inside bodies are preserved, trailing blanks trimmed', () => assert.equal(one(wrap(file('leads/a.md', 'a\n\n\nb\n\n'))).body, 'a\n\n\nb\n'));
  test('CRLF and BOM input are normalised and reported once', () => {
    const r = U('\ufeff' + wrap(file('leads/a.md', 'x\ny')).replace(/\n/g, '\r\n'));
    assert.equal(r.items[0].body, 'x\ny\n');
    assert.deepEqual(r.diagnostics.map(d => d.code), ['BOM', 'CRLF']);
  });
  test('empty FILE is a warning, not an error', () => {
    const it = one(wrap(file('leads/a.md', '')));
    assert.equal(it.status, 'ready');
    assert.ok(codes(it).includes('FILE_EMPTY'));
  });
  test('oversized body is held', () => assert.ok(codes(one(wrap(file('leads/a.md', 'x'.repeat(50))), { maxBytes: 10 })).includes('FILE_TOO_LARGE')));
});

describe('malformed envelopes', () => {
  test('FILE without END FILE before the next FILE: first is held, second is fine', () => {
    const r = U(wrap(`=== FILE: leads/a.md ===\npartial\n${file('leads/b.md', 'ok')}`));
    assert.deepEqual(r.items.map(i => [i.path, i.status]), [['leads/a.md', 'held'], ['leads/b.md', 'ready']]);
    assert.ok(codes(r.items[0]).includes('FILE_UNTERMINATED'));
  });
  test('reply cut off mid-file: complete files kept, open one held, bundle warned', () => {
    const r = U(`=== BEGIN_BUNDLE packet=${ID} ===\n${file('leads/a.md', 'done')}\n=== FILE: leads/b.md ===\nhalf a sent`);
    assert.deepEqual(r.items.map(i => i.status), ['ready', 'held']);
    assert.ok(r.bundles[0].diagnostics.some(d => d.code === 'BUNDLE_UNTERMINATED'));
  });
  test('END_BUNDLE inside an open FILE holds that file', () => {
    assert.ok(codes(one(`=== BEGIN_BUNDLE packet=${ID} ===\n=== FILE: leads/a.md ===\nx\n=== END_BUNDLE packet=${ID} ===`)).includes('FILE_UNTERMINATED'));
  });
  test('END_BUNDLE naming a different packet holds every item (spliced replies)', () => {
    const r = U(`=== BEGIN_BUNDLE packet=${ID} ===\n${file('leads/a.md', 'x')}\n=== END_BUNDLE packet=pk-000000000000 ===`);
    assert.ok(codes(r.items[0]).includes('BUNDLE_ID_MISMATCH'));
    assert.equal(r.items[0].status, 'held');
  });
  test('unknown, malformed and missing packet ids are held when a manifest is loaded', () => {
    assert.ok(codes(one(wrap(file('leads/a.md', 'x'), 'pk-ffffffffffff'))).includes('PACKET_UNKNOWN'));
    assert.ok(codes(one(wrap(file('leads/a.md', 'x'), 'pk-XYZ'))).includes('PACKET_ID_MALFORMED'));
    assert.ok(codes(one(`=== BEGIN_BUNDLE ===\n${file('leads/a.md', 'x')}\n=== END_BUNDLE ===`)).includes('PACKET_ID_MISSING'));
  });
  test('without a manifest, a missing packet id is only a warning', () => {
    const r = unpack(`=== BEGIN_BUNDLE ===\n${file('a.md', 'x')}\n=== END_BUNDLE ===`);
    assert.equal(r.items[0].status, 'ready');
  });
  test('second reply for the same packet is held; the first wins', () => {
    const r = U(wrap(file('leads/a.md', 'first')) + '\n' + wrap(file('leads/a.md', 'second')));
    assert.deepEqual(r.items.map(i => [i.body.trim(), i.status]), [['first', 'ready'], ['second', 'held']]);
    assert.ok(codes(r.items[1]).includes('PACKET_DUPLICATE'));
  });
  test('END FILE with no open block and empty bundles are reported', () => {
    const r = U(wrap('=== END FILE ==='));
    assert.ok(r.bundles[0].diagnostics.some(d => d.code === 'END_WITHOUT_START'));
    assert.ok(r.bundles[0].diagnostics.some(d => d.code === 'BUNDLE_EMPTY'));
  });
  test('missing BEGIN_BUNDLE routes to the only packet (repair) but is held when ambiguous', () => {
    const it = one(file('leads/a.md', 'x'));
    assert.equal(it.status, 'ready');
    assert.equal(it.packet, ID);
    const r = unpack(file('leads/a.md', 'x'), { manifest: two.manifest });
    assert.equal(r.items[0].status, 'held');
    assert.ok(codes(r.items[0]).includes('BUNDLE_HEADER_MISSING'));
  });
});

describe('markdown mangling recovery', () => {
  const cases = [
    ['bold markers', '**=== FILE: leads/a.md ===**', 'MARKER_DECORATED'],
    ['heading markers', '### === FILE: leads/a.md ===', 'MARKER_DECORATED'],
    ['blockquoted markers', '> === FILE: leads/a.md ===', 'MARKER_DECORATED'],
    ['inline-code markers', '`=== FILE: leads/a.md ===`', 'MARKER_DECORATED'],
    ['escaped markers', '\\=\\=\\= FILE: leads/a.md \\=\\=\\=', 'MARKER_DECORATED'],
    ['four equals', '==== FILE: leads/a.md ====', 'MARKER_EQUALS'],
    ['missing closing ===', '=== FILE: leads/a.md', 'MARKER_UNTERMINATED'],
    ['lowercase keyword', '=== file: leads/a.md ===', 'MARKER_KEYWORD'],
    ['backticked path', '=== FILE: `leads/a.md` ===', 'PATH_QUOTED'],
    ['quoted path', '=== FILE: "leads/a.md" ===', 'PATH_QUOTED'],
    ['zero-width chars around marker', '\u200b=== FILE: leads/a.md ===\u200d', null],
    ['leading ./', '=== FILE: ./leads/a.md ===', 'PATH_NORMALIZED'],
    ['backslash separators', '=== FILE: leads\\a.md ===', 'PATH_BACKSLASH'],
  ];
  for (const [name, marker, fix] of cases) {
    test(`recovers ${name}`, () => {
      const it = one(wrap(`${marker}\nbody\n=== END FILE ===`));
      assert.equal(it.status, 'ready', JSON.stringify(it.diagnostics));
      assert.equal(it.path, 'leads/a.md');
      assert.equal(it.body, 'body\n');
      if (fix) assert.ok(fixes(it).includes(fix), fixes(it).join());
    });
  }
  test('END_FILE / ENDFILE spellings close the block', () => {
    for (const end of ['=== END_FILE ===', '=== ENDFILE ===', '=== end file ===']) assert.equal(one(wrap(`=== FILE: leads/a.md ===\nx\n${end}`)).status, 'ready');
  });
  test('END APPEND closing a FILE is accepted as a reported mismatch', () => assert.ok(fixes(one(wrap('=== FILE: leads/a.md ===\nx\n=== END APPEND ==='))).includes('MARKER_MISMATCH')));
  test('end marker glued to the last content line is split off', () => {
    const it = one(wrap('=== FILE: leads/a.md ===\nlast line=== END FILE ==='));
    assert.equal(it.body, 'last line\n');
    assert.ok(fixes(it).includes('MARKER_INLINE'));
  });
  test('whole reply wrapped in a code fence', () => assert.equal(U('```text\n' + wrap(file('leads/a.md', 'x')) + '\n```').summary.ready, 1));
  test('each block wrapped in its own fence outside the markers', () => {
    const r = U(wrap('```\n' + file('leads/a.md', 'x') + '\n```\n```\n' + file('leads/b.md', 'y') + '\n```'));
    assert.deepEqual(r.items.map(i => i.body), ['x\n', 'y\n']);
  });
  test('body wrapped in ```markdown fence is unwrapped', () => {
    const it = one(wrap(file('leads/a.md', '```markdown\n# A\n- x\n```')));
    assert.equal(it.body, '# A\n- x\n');
    assert.ok(fixes(it).includes('FENCE_UNWRAPPED'));
  });
  test('4-backtick wrapper around a body containing ``` code blocks is unwrapped intact', () => {
    const inner = '# Doc\n```js\nx()\n```\nend';
    assert.equal(one(wrap(file('leads/a.md', '````md\n' + inner + '\n````'))).body, inner + '\n');
  });
  test('fence opened after FILE marker and closed after END FILE (dangling) is stripped', () => {
    const it = one(wrap('=== FILE: leads/a.md ===\n```markdown\n# A\n=== END FILE ===\n```'));
    assert.equal(it.body, '# A\n');
    assert.ok(fixes(it).includes('FENCE_DANGLING'));
  });
  test('body that starts and ends with separate code blocks is held as ambiguous, not mangled', () => {
    const it = one(wrap(file('leads/a.md', '```js\na()\n```\ntext\n```py\nb()\n```')));
    assert.equal(it.status, 'held');
    assert.ok(codes(it).includes('FENCE_AMBIGUOUS'));
  });
  test('a body that legitimately contains a balanced inner code block is untouched', () => {
    const body = '# A\n```js\nx\n```\ntail';
    const it = one(wrap(file('leads/a.md', body)));
    assert.equal(it.body, body + '\n');
    assert.deepEqual(fixes(it), []);
  });
  test('strict mode holds every repaired item but keeps clean ones', () => {
    const r = U(wrap(`**=== FILE: leads/a.md ===**\nx\n=== END FILE ===\n${file('leads/b.md', 'y')}`), { strict: true });
    assert.deepEqual(r.items.map(i => i.status), ['held', 'ready']);
    assert.ok(codes(r.items[0]).includes('STRICT_REPAIR'));
  });
  test('prose that mentions markers mid-line is not a marker', () => {
    assert.equal(readMarker('Write each file as === FILE: path === then content'), null);
    assert.equal(readMarker('The very first line must be exactly: === BEGIN_BUNDLE packet=pk-aaaaaaaaaaaa ==='), null);
    assert.equal(readMarker('=== END FILE === trailing'), null);
  });
});

describe('path traversal and unsafe paths', () => {
  const refused = [
    ['../etc/passwd', 'PATH_TRAVERSAL'], ['leads/../../x', 'PATH_TRAVERSAL'], ['leads/..', 'PATH_TRAVERSAL'], ['..\\..\\win.ini', 'PATH_TRAVERSAL'],
    ['leads/ .. /x', 'PATH_TRAVERSAL'], ['leads/.../x', 'PATH_TRAVERSAL'], ['%2e%2e/x', 'PATH_TRAVERSAL'], ['leads%2f..%2fx', 'PATH_TRAVERSAL'],
    ['．．/x', 'PATH_TRAVERSAL'], ['/etc/passwd', 'PATH_ABSOLUTE'], ['\\\\server\\share\\x', 'PATH_ABSOLUTE'], ['C:\\Windows\\x', 'PATH_ABSOLUTE'],
    ['c:x', 'PATH_ABSOLUTE'], ['~/.ssh/authorized_keys', 'PATH_ABSOLUTE'], ['file:///etc/passwd', 'PATH_ABSOLUTE'], ['https://x.org/a', 'PATH_ABSOLUTE'],
    ['leads/a\u0000.md', 'PATH_ILLEGAL_CHAR'], ['leads/a\n.md', 'PATH_ILLEGAL_CHAR'], ['leads/a?.md', 'PATH_ILLEGAL_CHAR'], ['leads/a|b', 'PATH_ILLEGAL_CHAR'],
    ['leads/%2Fetc', 'PATH_ENCODED'], ['leads/ﬁle.md', 'PATH_ENCODED'], ['.git/hooks/pre-commit', 'PATH_RESERVED'], ['leads/.git/config', 'PATH_RESERVED'],
    ['.wbp/manifest.json', 'PATH_RESERVED'], ['leads/node_modules/x.js', 'PATH_RESERVED'], ['leads/CON', 'PATH_RESERVED'], ['leads/nul.txt', 'PATH_RESERVED'],
    ['leads/a.md.', 'PATH_TRAILING'], ['leads/a.md ', null], ['leads/', 'PATH_IS_DIR'], ['', 'PATH_EMPTY'], ['   ', 'PATH_EMPTY'], ['x'.repeat(241), 'PATH_TOO_LONG'],
  ];
  for (const [p, code] of refused) {
    test(`refuses ${JSON.stringify(p).slice(0, 40)}${code ? ' → ' + code : ''}`, () => {
      const r = checkPath(p, []);
      if (code) { assert.equal(r.ok, false); assert.equal(r.code, code); }
      else assert.equal(r.path, 'leads/a.md'); // trailing space is trimmed, then fine
    });
  }
  test('refused paths are held end-to-end and never reach plan()', () => {
    const r = U(wrap(refused.filter(([, c]) => c && !/\n/.test(refused)).map(([p]) => `=== FILE: ${p.replace(/\n/g, '')} ===\nx\n=== END FILE ===`).join('\n')));
    const planned = plan(r, () => { throw new Error('must not read'); });
    assert.ok(planned.every(i => i.action === 'hold' || /^leads\//.test(i.path)), planned.filter(i => i.action !== 'hold').map(i => i.path).join());
  });
  test('allow list: dir prefix, glob and exact entries', () => {
    assert.ok(pathAllowed('leads/x.md', ['leads/']));
    assert.ok(pathAllowed('notes/a.md', ['notes/*.md']));
    assert.ok(!pathAllowed('notes/sub/a.md', ['notes/*.md']));
    assert.ok(pathAllowed('notes/sub/a.md', ['notes/**/*.md']));
    assert.ok(pathAllowed('notes/a.md', ['notes/**/*.md']));
    assert.ok(pathAllowed('README.md', ['README.md']));
    assert.ok(!pathAllowed('leadsX/a.md', ['leads/']));
    assert.ok(pathAllowed('anything/at/all', []));
  });
  test('path outside the packet outputs is held with PATH_NOT_ALLOWED', () => assert.ok(codes(one(wrap(file('src/evil.mjs', 'x')))).includes('PATH_NOT_ALLOWED')));
  test('fuzz: 500 random path strings never produce an ok path with .. , absolute root or reserved segment', () => {
    const r = rng(1234), parts = ['..', '.', 'a', 'leads', '/', '\\', '%2e', '%2f', '．', '~', 'C:', '.git', ' ', '\u0000', 'b.md', '//'];
    for (let i = 0; i < 500; i++) {
      const p = Array.from({ length: 1 + Math.floor(r() * 8) }, () => parts[Math.floor(r() * parts.length)]).join('');
      const c = checkPath(p);
      if (!c.ok) continue;
      assert.ok(!c.path.split('/').includes('..') && !c.path.startsWith('/') && !/(^|\/)\.git(\/|$)/i.test(c.path) && !/^[a-z]:/i.test(c.path), `${JSON.stringify(p)} → ${c.path}`);
    }
  });
});

describe('conflicts and routing', () => {
  test('two replies writing different content to one path are both held', () => {
    const r = unpack(wrap(file('leads/a.md', 'one'), two.packets[0].id) + '\n' + wrap(file('leads/a.md', 'two'), two.packets[1].id), { manifest: two.manifest });
    assert.deepEqual(r.items.map(i => i.status), ['held', 'held']);
    assert.ok(r.items.every(i => codes(i).includes('PATH_CONFLICT')));
  });
  test('case-only path collisions conflict (case-insensitive filesystems)', () => {
    const r = U(wrap(`${file('leads/A.md', 'one')}\n${file('leads/a.md', 'two')}`));
    assert.deepEqual(r.items.map(i => i.status), ['held', 'held']);
  });
  test('identical duplicates are kept once', () => {
    const r = U(wrap(`${file('leads/a.md', 'same')}\n${file('leads/a.md', 'same')}`));
    assert.deepEqual(r.items.map(i => i.status), ['ready', 'skipped']);
  });
  test('batch paste across packets: routes by id, reports packets still awaiting replies', () => {
    const [p1, p2, ...rest] = two.packets;
    const r = unpack(`chat 1:\n${wrap(file('leads/a.md', 'x'), p1.id)}\n\nchat 2:\n${wrap(file('leads/b.md', 'y'), p2.id)}`, { manifest: two.manifest });
    assert.deepEqual(r.items.map(i => i.packet), [p1.id, p2.id]);
    assert.deepEqual(r.missing, rest.map(p => p.id));
  });
  test('pasted request packets in a transcript are skipped, replies after them parsed', () => {
    const transcript = `${packets[0].text}\nAssistant:\n${wrap(file('leads/a.md', 'x'))}`;
    const r = U(transcript);
    assert.equal(r.requestsSkipped, 1);
    assert.deepEqual(r.items.map(i => i.path), ['leads/a.md']);
  });
  test('a truncated request packet does not swallow the reply that follows', () => {
    const cut = packets[0].text.slice(0, packets[0].text.indexOf('=== REPLY FORMAT'));
    assert.equal(U(`${cut}\n${wrap(file('leads/a.md', 'x'))}`).summary.ready, 1);
  });
  test('excluded items in a reply are flagged', () => assert.ok(codes(one(wrap(file('leads/a.md', 'see https://grants.example.org/legacy/')))).includes('EXCLUDED_HIT')));
});

describe('citations and gates on reply files', () => {
  const lead = (gates, evidence) => `# Lead: X\n- **Status:** Verify\n- **Gates:** ${gates}\n\n## Gate evidence\n${evidence}`;
  test('quote found in packet source → ready', () => {
    const it = one(wrap(file('leads/a.md', lead('G1 pass; G2 unknown', `- G1 [verified: ${URL1} "open to independent teams"]`))));
    assert.equal(it.status, 'ready', JSON.stringify(it.diagnostics));
    assert.equal(it.citations, 1);
  });
  test('fabricated quote → QUOTE_NOT_IN_SOURCE, held, located on the reply line', () => {
    const text = wrap(file('leads/a.md', lead('G1 unknown', `- G1 [verified: ${URL1} "open to everyone worldwide"]`)));
    const it = one(text);
    const d = it.diagnostics.find(x => x.code === 'QUOTE_NOT_IN_SOURCE');
    assert.equal(it.status, 'held');
    assert.ok(text.split('\n')[d.line - 1].includes('open to everyone'));
  });
  test('gate pass without a citation on its line → GATE_UNSOURCED', () => assert.ok(codes(one(wrap(file('leads/a.md', lead('G1 pass', '- G1 looks fine'))))).includes('GATE_UNSOURCED')));
  test('malformed citation is an error even off-gate', () => assert.ok(codes(one(wrap(file('notes/a.md', `fact [verified: ${URL1}]`)))).includes('CITATION_MISSING_QUOTE')));
  test('requireSourced holds citations to URLs the packet never supplied', () => {
    const body = file('notes/a.md', 'fact [verified: https://elsewhere.org/x "q"]');
    assert.equal(one(wrap(body)).status, 'ready');
    assert.ok(codes(one(wrap(body), { requireSourced: true })).includes('SOURCE_NOT_IN_PACKET'));
  });
  test('injected assay() errors are merged once; warnings ignored', () => {
    const assay = () => ({ diagnostics: [{ code: 'STATUS_SMUGGLING', severity: 'error', message: 'm', line: 2, col: 1 }, { code: 'X', severity: 'warn', message: 'w', line: 1 }] });
    const it = one(wrap(file('leads/a.md', lead('G1 unknown', '-'))), { assay });
    assert.deepEqual(codes(it).filter(c => c === 'STATUS_SMUGGLING' || c === 'X'), ['STATUS_SMUGGLING']);
    assert.equal(it.diagnostics.find(d => d.code === 'STATUS_SMUGGLING').fileLine, 2);
  });
});

describe('plan', () => {
  const read = files => p => files[p] ?? null;
  test('create, update, unchanged, append and hold actions with diffs', () => {
    const r = U(wrap([file('leads/new.md', 'n'), file('leads/upd.md', 'v2'), file('leads/same.md', 's'), '=== APPEND: notes/log.md ===\n- e\n=== END APPEND ===', file('../x', 'x')].join('\n')));
    const p = plan(r, read({ 'leads/upd.md': 'v1\n', 'leads/same.md': 's\n', 'notes/log.md': '# Log' }));
    assert.deepEqual(p.map(i => i.action), ['create', 'update', 'unchanged', 'append', 'hold']);
    assert.equal(p[3].after, '# Log\n- e\n');
    assert.match(p[1].diff, /^-v1$/m);
    assert.equal(p[2].diff, '');
  });
  test('appends to one path chain in order; a repeated append is idempotent', () => {
    const app = b => `=== APPEND: notes/log.md ===\n${b}\n=== END APPEND ===`;
    const p = plan(U(wrap([app('- a'), app('- b')].join('\n'))), read({}));
    assert.equal(p[1].after, '- a\n- b\n');
    const again = plan(U(wrap(app('- b'))), read({ 'notes/log.md': p[1].after }));
    assert.equal(again[0].action, 'unchanged');
  });
});

describe('fuzz', () => {
  test('800 random mutations of a valid reply never throw, and every ready item has a safe allowed path', () => {
    const r = rng(2026);
    const good = wrap([file('leads/a.md', `- G1 [verified: ${URL1} "open to independent teams"]`), '=== APPEND: notes/log.md ===\n- x\n=== END APPEND ===', file('leads/b.md', '```md\n# B\n```')].join('\n')).split('\n');
    const noise = ['```', '**', '=== END FILE ===', '=== FILE: ../../x ===', '=== END_BUNDLE packet=pk-000000000000 ===', '\u200b', '\r', '>', '#', '=== BEGIN_BUNDLE packet=' + ID + ' kind=request ===', ''];
    for (let i = 0; i < 800; i++) {
      const lines = [...good];
      for (let k = 0; k < 1 + Math.floor(r() * 4); k++) {
        const at = Math.floor(r() * lines.length), op = r();
        if (op < 0.3) lines.splice(at, 1);
        else if (op < 0.6) lines.splice(at, 0, noise[Math.floor(r() * noise.length)]);
        else if (op < 0.8) lines[at] = noise[Math.floor(r() * noise.length)] + lines[at];
        else lines.splice(at, 0, lines[Math.floor(r() * lines.length)]);
      }
      const res = U(lines.join('\n'));
      for (const it of res.items.filter(x => x.status === 'ready')) {
        assert.ok(checkPath(it.path, manifest.outputs).ok, it.path);
        assert.ok(!it.diagnostics.some(d => d.severity === 'error'));
      }
      plan(res, () => null);
    }
  });
  test('splitBundles on random binary-ish input returns structured output', () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const s = Array.from({ length: 200 }, () => String.fromCharCode(Math.floor(r() * 128))).join('');
      const out = splitBundles(s);
      assert.ok(Array.isArray(out.bundles));
    }
  });
  test('unwrapFence leaves fence-free bodies byte-identical', () => {
    for (const b of ['', 'a', 'a\nb', '\n\nx\n', '~~~ not a fence']) assert.equal(unwrapFence(b).body, b);
  });
});
