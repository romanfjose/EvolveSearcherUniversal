#!/usr/bin/env node
// Reproducible benchmarks (seeded fixtures, no network). Prints Markdown; README.md quotes one run.
import { performance } from 'node:perf_hooks';
import { stripNoise } from '../src/strip-noise.mjs';
import { pack, estimateTokens } from '../src/packer.mjs';
import { unpack, plan } from '../src/unpacker.mjs';
import { CORPUS, makePage } from '../test/fixtures/pages.mjs';

const time = (fn, reps = 5) => { fn(); const t0 = performance.now(); for (let i = 0; i < reps; i++) fn(); return (performance.now() - t0) / reps; };
const kb = n => (n / 1024).toFixed(1);
const out = [];

// 1. Noise stripping
out.push('### HTML noise stripping', '', '| Page type | Input KB | Output KB | Reduction | Content kept | Noise lines left | ms/page |', '|---|--:|--:|--:|--:|--:|--:|');
for (const kind of ['article', 'docs', 'listing', 'program', 'plain']) {
  const pages = CORPUS.filter(p => p.kind === kind);
  let inB = 0, outB = 0, kept = 0, total = 0, extra = 0, ms = 0;
  for (const p of pages) {
    const r = stripNoise(p.html);
    inB += r.stats.inBytes; outB += r.stats.outBytes;
    kept += p.content.filter(c => r.lines.includes(c)).length; total += p.content.length;
    extra += r.lines.length - p.content.filter(c => r.lines.includes(c)).length;
    ms += time(() => stripNoise(p.html));
  }
  out.push(`| ${kind} | ${kb(inB / pages.length)} | ${kb(outB / pages.length)} | ${((1 - outB / inB) * 100).toFixed(1)}% | ${((kept / total) * 100).toFixed(1)}% | ${extra} | ${(ms / pages.length).toFixed(2)} |`);
}

// 2. Packing
const pages = Array.from({ length: 40 }, (_, i) => makePage(['article', 'docs', 'program'][i % 3], 100 + i));
const spec = { task: 'Verify each program page and write one dossier per program.', outputs: ['leads/'],
  sources: pages.map((p, i) => ({ path: `raw/p${i}.html`, url: `https://example.org/p/${i}`, text: p.html })) };
const rawBytes = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
let packed;
const packMs = time(() => { packed = pack(spec); }, 3);
const rawTokens = pages.reduce((n, p) => n + estimateTokens(p.html), 0);
const packTokens = packed.packets.reduce((n, p) => n + p.tokens, 0);
out.push('', '### Packing', '', '| Raw pages | Raw size | Raw est. tokens | Packets (24k budget) | Packed est. tokens | Token saving | Time |', '|--:|--:|--:|--:|--:|--:|--:|',
  `| ${pages.length} | ${kb(rawBytes)} KB | ${rawTokens.toLocaleString('en')} | ${packed.packets.length} | ${packTokens.toLocaleString('en')} | ${((1 - packTokens / rawTokens) * 100).toFixed(1)}% | ${packMs.toFixed(0)} ms |`);

// 3. Unpacking throughput
const id = packed.packets[0].id;
const files = Array.from({ length: 300 }, (_, i) => `=== FILE: leads/p${i}.md ===\n# Lead ${i}\n- **Gates:** G1 pass; G2 unknown\n- G1 [verified: https://example.org/p/${i % 40} "${pages[i % 40].content[1].slice(0, 40)}"]\n${'Notes line with ordinary prose. '.repeat(40)}\n=== END FILE ===`).join('\n');
const reply = `=== BEGIN_BUNDLE packet=${id} ===\n${files}\n=== END_BUNDLE packet=${id} ===`;
let res;
const unMs = time(() => { res = unpack(reply, { manifest: packed.manifest }); plan(res, () => null); }, 3);
out.push('', '### Unpacking + lint + plan', '', '| Reply size | Files | Citations checked | Ready | Time | Throughput |', '|--:|--:|--:|--:|--:|--:|',
  `| ${kb(Buffer.byteLength(reply))} KB | ${res.items.length} | ${res.items.reduce((n, i) => n + i.citations, 0)} | ${res.summary.ready} | ${unMs.toFixed(0)} ms | ${(Buffer.byteLength(reply) / 1048576 / (unMs / 1000)).toFixed(1)} MB/s |`);

// 4. Mangling recovery: each transform applied to a clean 3-file reply; "recovered" = same paths and byte-identical bodies.
const { manifest: m1, packets: [p1] } = pack({ task: 'T', outputs: ['leads/'] });
const bodies = ['# A\n- x\n', '# B\n```js\ncode()\n```\ntail\n', '# C\n'];
const clean = bodies.map((b, i) => `=== FILE: leads/${'abc'[i]}.md ===\n${b}=== END FILE ===`);
const W = (body, hdr = true) => (hdr ? `=== BEGIN_BUNDLE packet=${p1.id} ===\n` : '') + body + (hdr ? `\n=== END_BUNDLE packet=${p1.id} ===` : '');
const deco = f => clean.map(c => c.split('\n').map(l => (l.startsWith('===') ? f(l) : l)).join('\n')).join('\n');
const MANGLES = {
  'whole reply in ```text fence': () => '```text\n' + W(clean.join('\n')) + '\n```',
  'each file in its own fence': () => W(clean.map(c => '```\n' + c + '\n```').join('\n')),
  'bodies wrapped in ````markdown': () => W(bodies.map((b, i) => `=== FILE: leads/${'abc'[i]}.md ===\n\`\`\`\`markdown\n${b}\`\`\`\`\n=== END FILE ===`).join('\n')),
  'bold markers **=== … ===**': () => W(deco(l => `**${l}**`)),
  'heading markers ### ===': () => W(deco(l => `### ${l}`)),
  'escaped \\=\\=\\=': () => W(deco(l => l.replace(/=/g, '\\='))),
  'backticked paths': () => W(clean.join('\n').replace(/FILE: (\S+) ===/g, 'FILE: `$1` ===')),
  'CRLF + BOM': () => '﻿' + W(clean.join('\n')).replace(/\n/g, '\r\n'),
  'chatter before/after': () => 'Sure, here you go!\n\n' + W(clean.join('\n')) + '\n\nAnything else?',
  'missing BEGIN/END_BUNDLE': () => W(clean.join('\n'), false),
  'END marker glued to last line': () => W(bodies.map((b, i) => `=== FILE: leads/${'abc'[i]}.md ===\n${b.replace(/\n$/, '')}=== END FILE ===`).join('\n')),
};
out.push('', '### Mangling recovery (byte-identical bodies, every repair reported)', '', '| Mangling | Recovered | Repairs reported |', '|---|:-:|--:|');
for (const [name, make] of Object.entries(MANGLES)) {
  const r = unpack(make(), { manifest: m1 });
  const ok = r.items.length === 3 && r.items.every((it, i) => it.status === 'ready' && it.path === `leads/${'abc'[i]}.md` && it.body === bodies[i]);
  out.push(`| ${name} | ${ok ? 'yes' : 'NO'} | ${r.summary.repairs + r.diagnostics.length} |`);
}

console.log(out.join('\n'));
console.log(`\n_Node ${process.version}, ${process.platform}/${process.arch}. Token counts use the offline estimator in src/packer.mjs._`);
