import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sha256 } from '../src/hash.mjs';
import { diffLines, unifiedDiff, applyOps } from '../src/diff.mjs';
import { estimateTokens, renderTemplate } from '../src/packer.mjs';
import { rng } from './fixtures/pages.mjs';

const nodeSha = s => crypto.createHash('sha256').update(s).digest('hex');

describe('sha256', () => {
  test('matches node:crypto on block-boundary lengths', () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) assert.equal(sha256('x'.repeat(n)), nodeSha('x'.repeat(n)), `len ${n}`);
  });
  test('matches node:crypto on multi-byte UTF-8 (BMP, astral, combining)', () => {
    for (const s of ['é', '🚀🚀', 'é', '中文テキスト', '\u0000￿', '“quote”']) assert.equal(sha256(s), nodeSha(s));
  });
  test('fuzz: 300 random strings agree with node:crypto', () => {
    const r = rng(42);
    for (let i = 0; i < 300; i++) {
      const s = Array.from({ length: Math.floor(r() * 300) }, () => String.fromCodePoint(Math.floor(r() * (r() < 0.9 ? 0x7f : 0xd7ff)) + 1)).join('');
      assert.equal(sha256(s), nodeSha(s));
    }
  });
  test('accepts Uint8Array input', () => assert.equal(sha256(new Uint8Array([1, 2, 3])), crypto.createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex')));
});

describe('diff', () => {
  test('identical text gives no diff', () => assert.equal(unifiedDiff('a\nb\n', 'a\nb\n'), ''));
  test('creation diff against null', () => {
    assert.equal(unifiedDiff(null, 'x\ny\n', { path: 'f.md' }), '--- /dev/null\n+++ b/f.md\n@@ -0,0 +1,2 @@\n+x\n+y\n');
  });
  test('single-line change keeps 3 lines of context and correct hunk header', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n'), b = a.replace('l10', 'L10');
    const d = unifiedDiff(a, b, { path: 'f' }).split('\n');
    assert.equal(d[2], '@@ -7,7 +7,7 @@');
    assert.deepEqual(d.filter(l => /^[-+]l|^[-+]L/.test(l)), ['-l10', '+L10']);
  });
  test('distant changes produce separate hunks', () => {
    const a = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n');
    const b = a.replace('l2\n', 'X\n').replace('l35', 'Y');
    assert.equal(unifiedDiff(a, b).match(/^@@/gm).length, 2);
  });
  test('fuzz: edit script reconstructs the new text and is minimal-length bounded', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const a = Array.from({ length: Math.floor(r() * 30) }, () => 'abcde'[Math.floor(r() * 5)]);
      const b = a.filter(() => r() > 0.2).flatMap(x => (r() < 0.15 ? [x, 'z'] : [x]));
      const ops = diffLines(a.join('\n'), b.join('\n'));
      assert.equal(applyOps(ops), b.join('\n'));
      assert.equal(ops.filter(o => o.op !== '+').map(o => o.line).join('\n'), a.join('\n'));
      assert.ok(ops.filter(o => o.op !== ' ').length <= a.length + b.length);
    }
  });
});

describe('estimateTokens', () => {
  test('empty is zero, short English is ~1 token/word', () => {
    assert.equal(estimateTokens(''), 0);
    const n = estimateTokens('The quick brown fox jumps over the lazy dog.');
    assert.ok(n >= 9 && n <= 13, String(n));
  });
  test('digits split every 3, long words every 6', () => {
    assert.equal(estimateTokens('123456789'), 3);
    assert.equal(estimateTokens('internationalization'), 4);
  });
  test('stays within a sane band of the chars/4 rule on prose and markup', () => {
    for (const s of ['lorem ipsum dolor sit amet '.repeat(200), '<div class="a b c">x</div>'.repeat(100), JSON.stringify({ a: [1, 2, 3], b: 'text' }).repeat(50)]) {
      const ratio = estimateTokens(s) / (s.length / 4);
      assert.ok(ratio > 0.5 && ratio < 2.5, String(ratio));
    }
  });
  test('monotonic under concatenation', () => assert.ok(estimateTokens('abc def') + estimateTokens(' ghi') >= estimateTokens('abc def ghi')));
});

describe('renderTemplate', () => {
  test('substitutes nested vars and serialises non-strings', () => assert.equal(renderTemplate('{{a}} {{b.c}} {{ n }}', { a: 'x', b: { c: 'y' }, n: [1] }), 'x y [1]'));
  test('unknown placeholder throws instead of rendering blank', () => assert.throws(() => renderTemplate('{{missing}}', {}), /missing/));
});
