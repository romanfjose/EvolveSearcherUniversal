#!/usr/bin/env node
// wbp: pack | unpack | strip | verify | serve. Exit codes: 0 ok, 1 usage/IO error, 2 something held or failed verification.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pack, verifyPacket } from './packer.mjs';
import { stripNoise } from './strip-noise.mjs';
import { unpack, plan } from './unpacker.mjs';
import { commit, diskReader } from './commit.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Inside EvolveSearcherUniversal the canonical Assayer adds the full gate/status rule set.
export const CANONICAL_ASSAY = path.resolve(PKG, '../../docs/demo/demo-app.js');

const USAGE = `wbp <command> [options]

  pack <task.json> [--out .wbp]           Compile a task spec into packets + manifest.json
  unpack [replies.txt|-] [--root .] [--manifest .wbp/manifest.json]
         [--commit] [--strict] [--require-sourced] [--assay <module>|--no-assay] [--json]
                                          Preview (default) or write pasted replies
  strip <page.html|-> [--links] [--json]  HTML/DOM dump -> numbered clean text
  verify <packet.txt>                     Re-check a request packet's checksum
  serve [--root .] [--port 4490]          Local web console`;

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) args[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && ['out', 'root', 'manifest', 'assay', 'port'].includes(k)) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

const readInput = f => (!f || f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8'));

/** Load a task spec; `sources[].file` is read relative to the spec. */
export function loadSpec(file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(path.resolve(file));
  if (typeof spec.taskFile === 'string') spec.task = fs.readFileSync(path.resolve(dir, spec.taskFile), 'utf8');
  if (typeof spec.schemaFile === 'string') spec.schema = fs.readFileSync(path.resolve(dir, spec.schemaFile), 'utf8');
  spec.sources = (spec.sources || []).map(s => (s.file ? { path: s.path || s.file, ...s, text: fs.readFileSync(path.resolve(dir, s.file), 'utf8') } : s));
  return spec;
}

export async function loadAssay(opt) {
  if (opt === false) return null;
  const file = typeof opt === 'string' ? path.resolve(opt) : CANONICAL_ASSAY;
  if (!fs.existsSync(file)) { if (typeof opt === 'string') throw new Error(`--assay module not found: ${file}`); return null; }
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.assay !== 'function') throw new Error(`${file} does not export assay()`);
  return mod.assay;
}

export function readManifest(root, file) {
  const f = file ? path.resolve(file) : path.join(root, '.wbp', 'manifest.json');
  if (!fs.existsSync(f)) { if (file) throw new Error(`Manifest not found: ${f}`); return null; }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function report(planned, result, out) {
  const icon = { create: '+', update: '~', append: '>', unchanged: '=', hold: '!', skip: '-' };
  for (const b of result.bundles) {
    out(`bundle ${b.index + 1} ${b.packet ?? '(no packet)'} lines ${b.startLine}-${b.endLine}${b.terminated ? '' : ' UNTERMINATED'}`);
    for (const d of b.diagnostics) out(`  ${d.severity.padEnd(5)} ${d.code} L${d.line}: ${d.message}`);
    for (const r of b.repairs) out(`  fixed ${r.code} L${r.line}`);
  }
  for (const it of planned) {
    out(`${icon[it.action]} ${it.action.padEnd(9)} ${it.path}  [${it.id}${it.packet ? ' ' + it.packet : ''}] ${it.citations} citation(s)`);
    for (const d of it.diagnostics) out(`    ${d.severity.padEnd(5)} ${d.code} L${d.line}${d.col ? ':' + d.col : ''}: ${d.message}`);
    for (const r of it.repairs) out(`    fixed ${r.code} L${r.line}: ${r.message}`);
    if (it.diff) out(it.diff.replace(/^/gm, '    ').trimEnd());
  }
  if (result.missing.length) out(`awaiting replies for ${result.missing.length} packet(s): ${result.missing.join(', ')}`);
  const s = result.summary;
  out(`${s.ready} ready, ${s.held} held, ${s.skipped} skipped, ${s.repairs} repair(s), ${result.requestsSkipped} request packet(s) ignored`);
}

export async function main(argv, io = { out: s => process.stdout.write(s + '\n'), err: s => process.stderr.write(s + '\n') }) {
  const args = parseArgs(argv);
  const [cmd, file] = args._;
  try {
    if (cmd === 'pack') {
      if (!file) throw new Error('pack needs <task.json>');
      const r = pack(loadSpec(file));
      const out = path.resolve(args.out || '.wbp');
      fs.mkdirSync(path.join(out, 'packets'), { recursive: true });
      for (const p of r.packets) fs.writeFileSync(path.join(out, 'packets', `${r.batch}-${p.part}of${p.of}-${p.id}.txt`), p.text);
      fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(r.manifest, null, 2) + '\n');
      for (const p of r.packets) io.out(`${p.id}  part ${p.part}/${p.of}  ~${p.tokens} tokens${p.overBudget ? '  OVER BUDGET (single oversized line)' : ''}`);
      io.out(`batch ${r.batch}: ${r.packets.length} packet(s) -> ${path.relative(process.cwd(), out) || '.'}/packets`);
      return 0;
    }
    if (cmd === 'unpack') {
      const root = path.resolve(args.root || '.');
      const manifest = readManifest(root, args.manifest);
      const assay = await loadAssay(args['no-assay'] ? false : args.assay);
      const result = unpack(readInput(file), { manifest, strict: !!args.strict, requireSourced: !!args['require-sourced'], assay });
      const planned = plan(result, diskReader(root));
      const written = args.commit ? commit(planned, root) : null;
      if (args.json) io.out(JSON.stringify({ summary: result.summary, missing: result.missing, bundles: result.bundles,
        items: planned.map(({ before, after, body, ...rest }) => rest), written }, null, 2));
      else {
        report(planned, result, io.out);
        if (written) for (const w of written) io.out(`${w.ok ? 'wrote' : 'FAILED'} ${w.path}${w.error ? ' (' + w.error + ')' : ''}`);
        else if (result.summary.ready) io.out('preview only: re-run with --commit to write');
      }
      return result.summary.held || written?.some(w => !w.ok) ? 2 : 0;
    }
    if (cmd === 'strip') {
      const r = stripNoise(readInput(file), { links: !!args.links });
      if (args.json) io.out(JSON.stringify(r, null, 2));
      else { io.out(r.numbered); io.err(`${r.stats.inBytes} -> ${r.stats.outBytes} bytes (-${(r.stats.reduction * 100).toFixed(1)}%), ${r.stats.outLines} lines`); }
      return 0;
    }
    if (cmd === 'verify') {
      const v = verifyPacket(readInput(file));
      io.out(v.ok ? `ok ${v.id}` : `FAIL ${v.id ?? ''} ${v.reason}`);
      return v.ok ? 0 : 2;
    }
    if (cmd === 'serve') {
      const { startServer } = await import('../ui/serve.mjs');
      await startServer({ root: path.resolve(args.root || '.'), port: args.port ? +args.port : undefined, manifest: args.manifest });
      return 0;
    }
    io.out(USAGE);
    return cmd && cmd !== 'help' && !args.help ? 1 : 0;
  } catch (e) {
    io.err(`wbp: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => { if (process.argv[2] !== 'serve') process.exitCode = code; });
}
