// Helmet 03 ("Where's the Bathroom?" QA Breaker) test suite for webchat-batch-packer.
// Attacks the library with:
//  1. Binary file payloads (arbitrary bytes, null bytes, headers, control chars in markers/paths).
//  2. Giant single-line minified bundles (hundreds of KB without newlines, max byte limits, diffing).
//  3. Unicode surrogate-pair boundaries (astral plane symbols, lone surrogates, ZWJ sequences, HTML entities, citations).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  pack,
  unpack,
  plan,
  commit,
  diskReader,
  stripNoise,
  decodeEntities,
  parseHtml,
  checkPath,
  readMarker,
  unwrapFence,
  unifiedDiff,
  estimateTokens,
  MAX_FILE_BYTES,
} from '../src/index.mjs';

const wrap = (body, id = 'pk-702b278b303a') => `=== BEGIN_BUNDLE packet=${id} ===\n${body}\n=== END_BUNDLE packet=${id} ===`;
const file = (p, body) => `=== FILE: ${p} ===\n${body}\n=== END FILE ===`;
const codes = it => it.diagnostics.map(d => d.code);

describe("Helmet 03 Breaker: Binary Payloads & Control Bytes", () => {
  test('handles arbitrary binary byte payloads in FILE block body without corrupting data', () => {
    // Construct binary buffer with headers (ELF, PNG, null bytes, high bytes 0x80-0xFF)
    const rawBytes = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF header
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]), // PNG magic
      Buffer.from(Array.from({ length: 256 }, (_, i) => (i === 10 || i === 13 ? 32 : i))), // full byte spectrum without line-breaks
      Buffer.alloc(512, 0x00), // null byte block
    ]);
    const binString = rawBytes.toString('binary');

    const reply = wrap(file('leads/binary.dat', binString));
    const result = unpack(reply);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.path, 'leads/binary.dat');
    // Content body must preserve the binary string representation intact (with trailing newline added for FILE)
    assert.ok(item.body.startsWith(binString));
    assert.equal(item.bytes, new TextEncoder().encode(item.body).length);
  });

  test('refuses binary null bytes and control chars in target file path', () => {
    const maliciousPaths = [
      'leads/payload\u0000.bin',
      'leads/app\x07alert.dat',
      'leads/test\x1b[31m.sh',
      'leads/sub\x1f/file.txt',
    ];

    for (const p of maliciousPaths) {
      const checked = checkPath(p);
      assert.equal(checked.ok, false, `Path with control char should fail: ${JSON.stringify(p)}`);
      assert.equal(checked.code, 'PATH_ILLEGAL_CHAR');

      const res = unpack(wrap(file(p, 'binary data')));
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].status, 'held');
      assert.ok(codes(res.items[0]).includes('PATH_ILLEGAL_CHAR'));
    }
  });

  test('packing binary source generates valid checksummed packets', () => {
    const binPayload = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x80, 0x7f]).toString('binary');
    const spec = {
      task: 'Binary verify task',
      sources: [{ path: 'raw/firmware.bin', text: binPayload }],
    };

    const packed = pack(spec);
    assert.ok(packed.batch.startsWith('bt-'));
    assert.equal(packed.packets.length, 1);
    assert.ok(packed.packets[0].tokens > 0);
    assert.ok(packed.manifest.sources[0].sha.length === 12);
  });

  test('disk commit and reader safely handle binary content without throwing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-qa-breaker-bin-'));
    try {
      const binPayload = 'binary\x00data\x01\x02\xff\xfe';
      const planned = [
        {
          id: '1.1',
          path: 'raw/data.bin',
          op: 'file',
          status: 'ready',
          action: 'create',
          body: binPayload + '\n',
          before: null,
          after: binPayload + '\n',
        },
      ];

      const commitRes = commit(planned, tmpDir);
      assert.equal(commitRes.length, 1);
      assert.equal(commitRes[0].ok, true);

      const readBack = diskReader(tmpDir)('raw/data.bin');
      assert.equal(readBack, binPayload + '\n');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("Helmet 03 Breaker: Giant Single-Line Minified Bundles", () => {
  test('processes a 600,000-character single-line JS bundle without newlines', () => {
    // Emulate realistic minified vendor chunk with no newlines
    const bundleHeader = '(()=>{var e={};function t(r){return e[r]||(e[r]={exports:{}})}';
    const bundleBody = 't.d=function(e,r){for(var o in r)e[o]=r[o]};console.log("chunk");'.repeat(10000);
    const bundleFooter = '})();';
    const giantBundle = bundleHeader + bundleBody + bundleFooter;
    assert.ok(giantBundle.length >= 600000, `Expected length >= 600000, got ${giantBundle.length}`);
    assert.ok(!giantBundle.includes('\n'));

    const reply = wrap(file('dist/bundle.min.js', giantBundle));
    const result = unpack(reply);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.path, 'dist/bundle.min.js');
    assert.equal(item.body, giantBundle + '\n');
    assert.equal(item.diagnostics.length, 0);

    // Verify planning and unifiedDiff on giant single line
    const planned = plan(result, () => null);
    assert.equal(planned[0].action, 'create');
    assert.ok(planned[0].diff.includes('+++ b/dist/bundle.min.js'));
  });

  test('holds single-line bundle that exceeds MAX_FILE_BYTES with FILE_TOO_LARGE', () => {
    const oversizedLine = 'a'.repeat(MAX_FILE_BYTES + 1024);
    const reply = wrap(file('dist/huge.min.js', oversizedLine));
    const result = unpack(reply);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.status, 'held');
    assert.ok(codes(item).includes('FILE_TOO_LARGE'));
  });

  test('diffing giant single-line modifications does not crash', () => {
    const before = 'var a=1;' + 'x=x+1;'.repeat(15000) + 'console.log(x);';
    const after = 'var a=2;' + 'x=x+1;'.repeat(15000) + 'console.log(x);';

    const diff = unifiedDiff(before, after, { path: 'dist/bundle.js' });
    assert.ok(diff.includes('--- a/dist/bundle.js'));
    assert.ok(diff.includes('+++ b/dist/bundle.js'));
    assert.ok(diff.includes('-var a=1;'));
    assert.ok(diff.includes('+var a=2;'));
  });

  test('stripNoise survives giant single-line minified HTML document', () => {
    const minifiedHtml = '<!DOCTYPE html><html><head><title>Minified</title></head><body><header><nav>' +
      '<a href="/">Home</a>'.repeat(500) + '</nav></header><main><h1>Title</h1><p>' +
      'Essential payload line.'.repeat(100) + '</p><script>' +
      'window.__PRELOADED_STATE__=' + JSON.stringify({ huge: 'data'.repeat(25000) }) + ';' +
      '</script></main></body></html>';

    assert.ok(!minifiedHtml.includes('\n'));
    assert.ok(minifiedHtml.length >= 100000, `Expected length >= 100000, got ${minifiedHtml.length}`);

    const stripped = stripNoise(minifiedHtml, { html: true });
    assert.ok(stripped.stats.reduction > 0.85);
    assert.ok(stripped.lines.some(l => l.includes('Title')));
    assert.ok(stripped.lines.some(l => l.includes('Essential payload line.')));
    // Script block and header/nav noise should be eradicated
    assert.ok(!stripped.text.includes('__PRELOADED_STATE__'));
  });

  test('token estimator handles large single-line text without stack overflow', () => {
    const giantLine = 'tokenization testing '.repeat(25000);
    const est = estimateTokens(giantLine);
    assert.ok(est > 50000);
  });
});

describe("Helmet 03 Breaker: Unicode Surrogate-Pair Boundaries", () => {
  const astralSymbols = '𠮷 𩸽 𠀋 𢡄 𣛧 𤭢 𤰝 𨝍 𩣆 𪚥 🧬 🦾 𦉫 🪐 🪂'; // Supplementary Ideographs & astral symbols (U+20000+)
  const flagSequences = '🇺🇸 🇬🇧 🇯🇵 🇩🇪 🇫🇷'; // Regional Indicator surrogate pairs
  const complexZwj = '👨‍👩‍👧‍👦 👩‍💻 🧑‍🚀'; // Family & occupation sequences with ZWJ (\u200d)

  test('preserves astral symbols and multi-codepoint surrogate sequences in file bodies', () => {
    const content = `# Unicode Astral & Emoji Report\n- Astral: ${astralSymbols}\n- Flags: ${flagSequences}\n- ZWJ: ${complexZwj}\n`;
    const reply = wrap(file('leads/unicode.md', content));
    const result = unpack(reply);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.body, content);
  });

  test('handles isolated / unpaired surrogates gracefully without crashing', () => {
    const loneHigh = 'prefix \uD83D suffix';
    const loneLow = 'prefix \uDE00 suffix';
    const reversed = 'prefix \uDE00\uD83D suffix';

    const content = `${loneHigh}\n${loneLow}\n${reversed}\n`;
    const reply = wrap(file('notes/surrogates.txt', content));
    const result = unpack(reply);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.body, content);
  });

  test('verifies citation quote matching across surrogate-pair boundaries', () => {
    const citedUrl = 'https://example.org/surrogate-source';
    const sourceText = `<article><h1>Grants</h1><p>Award given by 𠮷野家 to independent 🧬 research groups worldwide.</p></article>`;

    const spec = {
      task: 'Unicode citation verification',
      sources: [{ path: 'sources/grant.html', url: citedUrl, text: sourceText, html: true }],
    };
    const { manifest, packets } = pack(spec);

    // Exact quote containing astral character (𠮷) and emoji surrogate pair (🧬)
    const exactQuote = 'Award given by 𠮷野家 to independent 🧬 research groups worldwide.';
    const validReply = wrap(
      file(
        'leads/grant.md',
        `# Grant\n- **Gates:** G1 pass\n\n- G1 [verified: ${citedUrl} "${exactQuote}"]\n`
      ),
      packets[0].id
    );

    const validRes = unpack(validReply, { manifest });
    assert.equal(validRes.items.length, 1);
    assert.equal(validRes.items[0].status, 'ready');
    assert.equal(validRes.items[0].citations, 1);

    // Fabricated quote with mutated astral character
    const badQuote = 'Award given by 𠮷野家 to independent 🦾 research groups worldwide.';
    const invalidReply = wrap(
      file(
        'leads/grant.md',
        `# Grant\n- **Gates:** G1 pass\n\n- G1 [verified: ${citedUrl} "${badQuote}"]\n`
      ),
      packets[0].id
    );

    const invalidRes = unpack(invalidReply, { manifest });
    assert.equal(invalidRes.items.length, 1);
    assert.equal(invalidRes.items[0].status, 'held');
    assert.ok(codes(invalidRes.items[0]).includes('QUOTE_NOT_IN_SOURCE'));
  });

  test('decodeEntities correctly converts decimal and hex astral entities and sanitizes surrogate ranges', () => {
    // U+20BB7 = decimal 134071, hex 20bb7 (𠮷)
    assert.equal(decodeEntities('&#134071;'), '𠮷');
    assert.equal(decodeEntities('&#x20bb7;'), '𠮷');
    assert.equal(decodeEntities('&#X20BB7;'), '𠮷');

    // U+1F600 = decimal 128512 (😀)
    assert.equal(decodeEntities('&#128512;'), '😀');
    assert.equal(decodeEntities('&#x1f600;'), '😀');

    // Lone surrogate entity codes (0xD800 to 0xDFFF) must be sanitized to unicode replacement char (U+FFFD )
    assert.equal(decodeEntities('&#55296;'), '\uFFFD');
    assert.equal(decodeEntities('&#xd800;'), '\uFFFD');
    assert.equal(decodeEntities('&#57343;'), '\uFFFD');
    assert.equal(decodeEntities('&#xdfff;'), '\uFFFD');
  });

  test('packet token estimation splits surrogate characters correctly', () => {
    const textWithAstrals = 'Astral run: ' + '𠮷'.repeat(100) + ' and ' + '🧬'.repeat(50);
    const tokens = estimateTokens(textWithAstrals);
    assert.ok(tokens >= 150);
  });

  test('safe paths with valid unicode astral symbols succeed while illegal characters fail', () => {
    const astralPath = 'leads/dossier-𠮷野家.md';
    const checked = checkPath(astralPath);
    assert.equal(checked.ok, true);
    assert.equal(checked.path, astralPath);

    const emojiPath = 'leads/audit-🚀.md';
    const checkedEmoji = checkPath(emojiPath);
    assert.equal(checkedEmoji.ok, true);
    assert.equal(checkedEmoji.path, emojiPath);
  });
});
