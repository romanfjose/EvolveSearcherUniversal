import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pack, verifyPacket, estimateTokens } from '../src/packer.mjs';
import { makePage } from './fixtures/pages.mjs';

const base = (over = {}) => ({ task: 'Verify {{what}}.', vars: { what: 'leads' }, outputs: ['leads/'], ...over });
const longSource = n => ({ path: 'notes/big.md', text: Array.from({ length: n }, (_, i) => `line ${i + 1} with some words to cost tokens`).join('\n') });

describe('packet format', () => {
  test('one packet: BEGIN/END markers, sections in order, ids well-formed', () => {
    const { packets, batch } = pack(base({ schema: { type: 'object' }, exclude: ['old'], sources: [{ path: 'a.md', text: 'x' }] }));
    assert.equal(packets.length, 1);
    const t = packets[0].text;
    assert.match(batch, /^bt-[0-9a-f]{12}$/);
    assert.match(packets[0].id, /^pk-[0-9a-f]{12}$/);
    assert.ok(t.startsWith(`=== BEGIN_BUNDLE packet=${packets[0].id} kind=request batch=${batch} part=1/1 est_tokens=`));
    assert.match(t, new RegExp(`\\n=== END_BUNDLE packet=${packets[0].id} kind=request sha256=[0-9a-f]{64} ===\\n$`));
    const order = ['=== TASK ===', '=== SCHEMA ===', '=== EXCLUDE (1) ===', '=== SOURCE: a.md', '=== REPLY FORMAT ==='].map(s => t.indexOf(s));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every(i => i > 0));
  });
  test('template is rendered; reply contract names allowed paths and the exact reply markers', () => {
    const { packets: [p] } = pack(base());
    assert.match(p.text, /Verify leads\./);
    assert.match(p.text, /Allowed paths: leads\/\./);
    assert.match(p.text, new RegExp(`exactly: === BEGIN_BUNDLE packet=${p.id} ===`));
    assert.match(p.text, new RegExp(`exactly: === END_BUNDLE packet=${p.id} ===`));
  });
  test('reply markers in the contract are inline prose, so a pasted request never parses as a reply', () => {
    const { packets: [p] } = pack(base());
    assert.ok(!p.text.split('\n').some(l => l === `=== BEGIN_BUNDLE packet=${p.id} ===`));
  });
  test('sources are L-numbered with url, range and sha; number:false leaves text as-is', () => {
    const { packets: [p] } = pack(base({ sources: [{ path: 'a.md', url: 'https://x.org/a', text: 'one\ntwo' }, { path: 'b.txt', text: 'raw', number: false }] }));
    assert.match(p.text, /=== SOURCE: a\.md url=https:\/\/x\.org\/a lines=L1-L2 of=2 sha=[0-9a-f]{12} ===\nL1 one\nL2 two\n=== END SOURCE ===/);
    assert.match(p.text, /=== SOURCE: b\.txt lines=L1-L1 of=1 sha=[0-9a-f]{12} ===\nraw\n/);
  });
  test('HTML sources are stripped before packing', () => {
    const page = makePage('article', 1);
    const { packets: [p], manifest } = pack(base({ budget: 100000, sources: [{ path: 'raw/a.html', url: 'https://x.org', text: page.html }] }));
    assert.ok(!p.text.includes('<div'));
    assert.ok(p.text.includes('L2 ' + page.content[1]));
    assert.equal(manifest.sources[0].text.split('\n').length, page.content.length);
  });
  test('cite:false omits the citation instruction', () => {
    assert.ok(pack(base()).packets[0].text.includes('[verified:'));
    assert.ok(!pack(base({ cite: false })).packets[0].text.includes('[verified:'));
  });
});

describe('determinism and checksums', () => {
  test('same spec → byte-identical packets, ids and manifest', () => {
    const spec = base({ sources: [longSource(50)] });
    assert.deepEqual(pack(spec), pack(structuredClone(spec)));
  });
  test('any content change changes the packet id and batch', () => {
    const a = pack(base({ sources: [{ path: 'a', text: 'x' }] })), b = pack(base({ sources: [{ path: 'a', text: 'y' }] }));
    assert.notEqual(a.packets[0].id, b.packets[0].id);
    assert.notEqual(a.batch, b.batch);
  });
  test('verifyPacket accepts the packet, including with CRLF and surrounding chat text', () => {
    const { packets: [p] } = pack(base());
    assert.deepEqual(verifyPacket(p.text), { ok: true, id: p.id });
    assert.equal(verifyPacket('You said:\n' + p.text.replace(/\n/g, '\r\n') + '\nthanks').ok, true);
  });
  test('verifyPacket detects tampering, truncation and absence', () => {
    const { packets: [p] } = pack(base());
    assert.equal(verifyPacket(p.text.replace('Verify', 'Ignore')).reason, 'CHECKSUM_MISMATCH');
    assert.equal(verifyPacket(p.text.slice(0, p.text.length - 30)).reason, 'TRUNCATED');
    assert.equal(verifyPacket('hello').reason, 'NO_BEGIN');
  });
});

describe('token budget', () => {
  test('splits a large source across packets with global L-numbers and no gaps', () => {
    const { packets, manifest } = pack(base({ budget: 1500, sources: [longSource(400)] }));
    assert.ok(packets.length > 2);
    let next = 1;
    for (const p of packets) {
      const nums = [...p.text.matchAll(/^L(\d+) /gm)].map(m => +m[1]);
      assert.equal(nums[0], next);
      nums.forEach((n, i) => assert.equal(n, nums[0] + i));
      next = nums.at(-1) + 1;
      assert.equal(p.of, packets.length);
      assert.ok(!p.overBudget, `part ${p.part} ~${p.tokens}`);
    }
    assert.equal(next, 401);
    assert.equal(Object.keys(manifest.packets).length, packets.length);
  });
  test('estimated tokens stay at or below the budget for every part', () => {
    for (const budget of [800, 2000, 5000]) for (const p of pack(base({ budget, sources: [longSource(300), longSource(120)] })).packets) assert.ok(estimateTokens(p.text) <= budget + 50, `${budget}: ${p.tokens}`);
  });
  test('small sources share a packet in input order', () => {
    const { packets } = pack(base({ sources: [{ path: 'a', text: 'A' }, { path: 'b', text: 'B' }] }));
    assert.equal(packets.length, 1);
    assert.ok(packets[0].text.indexOf('SOURCE: a') < packets[0].text.indexOf('SOURCE: b'));
  });
  test('a single line larger than the budget is isolated and flagged overBudget', () => {
    const { packets } = pack(base({ budget: 600, sources: [{ path: 'a', text: 'short' }, { path: 'huge', text: 'word '.repeat(3000) }] }));
    assert.ok(packets.some(p => p.overBudget && p.sources[0].path === 'huge'));
  });
  test('budget below the fixed overhead throws', () => assert.throws(() => pack(base({ budget: 20 })), /overhead/));
  test('empty source still gets a block', () => assert.match(pack(base({ sources: [{ path: 'e', text: '' }] })).packets[0].text, /SOURCE: e lines=L1-L0 of=0/));
});

describe('spec validation', () => {
  test('missing task, bad budget, source without text all throw', () => {
    assert.throws(() => pack({}), /task/);
    assert.throws(() => pack(base({ budget: 1.5 })), /budget/);
    assert.throws(() => pack(base({ sources: [{ path: 'a' }] })), /text/);
    assert.throws(() => pack(base({ sources: [{ text: 'x' }] })), /path/);
  });
  test('manifest carries outputs, exclusions and stripped source text for offline quote checks', () => {
    const { manifest } = pack(base({ exclude: ['https://x.org/old'], sources: [{ path: 'p.html', url: 'https://x.org/p', text: '<p>Hello world</p><p>z</p>' }] }));
    assert.deepEqual(manifest.outputs, ['leads/']);
    assert.deepEqual(manifest.exclude, ['https://x.org/old']);
    assert.equal(manifest.sources[0].text, 'Hello world\nz');
  });
});
