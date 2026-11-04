# webchat-batch-packer

Zero-dependency Node.js (`>=20`) CLI, library and browser console for running research and verification tasks through **web-chat LLMs** (Claude.ai, ChatGPT, Gemini) without an API.

- **Pack**: compile a task, schema, exclusion list and source pages into deterministic, checksummed, token-budgeted packets you paste into chats, one packet per chat.
- **Unpack**: paste every reply back at once. Replies are split by packet, repaired where markdown mangled them, checked for path escapes, citations and gate rules, diffed against disk, and written only on your say-so.

Formatting and validation all run locally and deterministically, so **0 model tokens go to formatting**. The model only reads clean source text and writes file content.

```mermaid
flowchart LR
  S["task.json<br/>task · schema · exclude · outputs · sources"] --> P["wbp pack<br/>strip-noise → L-numbered text<br/>budget split · sha256"]
  P --> K1["packet pk-…a"] & K2["packet pk-…b"]
  K1 --> C1["chat 1"]
  K2 --> C2["chat 2"]
  C1 & C2 --> R["one paste of all replies"]
  R --> U["wbp unpack<br/>split by packet · repair · path guard<br/>citations vs sources · gate rules"]
  P -. manifest.json .-> U
  U --> D["preview: diff + held diagnostics"]
  D -->|"--commit / Ctrl+Enter"| F["files on disk"]
```

## Quick start

```bash
cd packages/webchat-batch-packer/examples/grant-check
```

```bash
node ../../src/cli.mjs pack task.json
```

```bash
node ../../src/cli.mjs unpack reply.txt
```

```bash
node ../../src/cli.mjs unpack reply.txt --commit
```

The example [`reply.txt`](examples/grant-check/reply.txt) is a realistically mangled reply: wrapped in a code fence, a body in a ```` ```markdown ```` fence, a bold marker, a fabricated quote, and an `../../.ssh/authorized_keys` write. Unpack recovers the two real files, holds the other two, and says why.

Console: `node src/cli.mjs serve --root <project>` opens `http://127.0.0.1:4490/`. Static demo (no disk access): serve this package's folder with `python3 -m http.server`, then open `/docs/`.

| Command | Does |
|---|---|
| `wbp pack <task.json> [--out .wbp]` | Writes `.wbp/packets/<batch>-<n>of<N>-<id>.txt` and `.wbp/manifest.json` |
| `wbp unpack [file\|-] [--root .] [--manifest f] [--strict] [--require-sourced] [--commit] [--json]` | Preview (default) or write. Exit `2` when anything is held |
| `wbp strip <page.html\|-> [--links] [--json]` | Numbered clean text on stdout, size stats on stderr |
| `wbp verify <packet.txt>` | Re-checks a packet's sha256 before you paste it |
| `wbp serve [--root .] [--port 4490]` | Local console |

`--assay <module>` adds an extra `assay(text, opts)` rule set. Inside this repo the canonical Assayer, [`docs/demo/demo-app.js`](../../docs/demo/demo-app.js), loads automatically, so dossiers also get its status and tier rules. `--no-assay` turns it off.

## Task spec

| Field | Meaning |
|---|---|
| `task` / `taskFile` | Instructions. `{{var}}` placeholders come from `vars`, and an unknown placeholder is an error |
| `schema` / `schemaFile` | Output shape, given as text or as an object (rendered as JSON) |
| `exclude` | Items already known. They go into the packet, and replies that mention them get `EXCLUDED_HIT` |
| `outputs` | Paths a reply may write: `dir/` prefix, `*`/`**`/`?` glob, or an exact path. Empty allows any safe path |
| `sources[]` | `{ path, text \| file, url?, html?, strip?, number?, links? }`. `.html` sources are stripped automatically |
| `budget` | Estimated tokens per packet (default `24000`). Larger sources split on line boundaries and keep their global `L` numbers |
| `cite` | Default `true`: tells the model to back claims with `[verified: <url> "<quote>"]` |

## Packet and reply protocol

```text
=== BEGIN_BUNDLE packet=pk-702b278b303a kind=request batch=bt-a0cbb701a924 part=1/1 est_tokens=750 ===
=== TASK === … === SCHEMA === … === EXCLUDE (1) === …
=== SOURCE: raw/program-page.html url=https://grants.example.org/programs/open-science lines=L1-L10 of=10 sha=… ===
L1 # Open Science Fund
L2 The Open Science Fund supports independent research teams …
=== END SOURCE ===
=== REPLY FORMAT === …
=== END_BUNDLE packet=pk-702b278b303a kind=request sha256=<64 hex> ===
```

The packet id is a hash of the content, so identical specs give byte-identical packets. A reply must look like this:

```text
=== BEGIN_BUNDLE packet=pk-702b278b303a ===
=== FILE: leads/open-science-fund.md ===
<full content>
=== END FILE ===
=== APPEND: notes/log.md ===
<lines>
=== END APPEND ===
=== END_BUNDLE packet=pk-702b278b303a ===
```

You can paste whole transcripts. Request packets are recognised and skipped (the reply markers in their contract are inline prose, so they never parse as a reply). A partially pasted request does not swallow the reply that follows it.

### Repaired and reported, or held

A repair is applied only where the intent is unambiguous, and every repair is listed. `--strict` holds any item that needed one.

| Repaired (reported) | Held (error) |
|---|---|
| Fences around the whole reply or around each block; a fence wrapping a whole body (including 4-backtick wrappers around inner code blocks); a dangling half-fence | `FENCE_AMBIGUOUS`: the body starts and ends with fences that do not pair with each other |
| Markers in bold, heading, quote or inline code; `\=` escapes; 2–5 `=`; a missing closing `===`; keyword case and `END_FILE` spellings | `FILE_UNTERMINATED`: a new block, or the end of the bundle, came before `END FILE` (the reply was cut off) |
| An `END FILE` glued to the last content line; a block closed with the other END marker | `BUNDLE_ID_MISMATCH`, `PACKET_UNKNOWN`, `PACKET_ID_MALFORMED`, `PACKET_DUPLICATE` |
| A path in backticks or quotes; `./` and `//`; `\` separators; CRLF; BOM; zero-width characters | `BUNDLE_HEADER_MISSING` when the manifest has more than one packet. With exactly one packet the reply is routed to it, and the repair is reported |
| | `PATH_CONFLICT`: two replies write different content to one path (compared case-insensitively). Identical duplicates are skipped |

### Path guard

Unpack refuses a path, with a code, when it has any of these:

- `..` in any spelling, including `%2e%2e`, full-width `．．` and `...`
- an absolute, UNC, drive (`C:`), home (`~`) or URL form
- control characters, or the Windows-invalid `<>:"|?*`
- percent-encoded separators, or NFKC-unstable look-alikes such as `ﬁ`
- a protected segment: `.git`, `.wbp`, `.hg`, `.svn`, `node_modules`
- a Windows device name such as `CON` or `nul.txt`
- a segment that ends in a dot or a space
- a directory target, or a path over 240 characters
- a path outside `outputs`

At write time, [`src/commit.mjs`](src/commit.mjs) checks the disk again:

- it never follows a symlink, on read (so a diff cannot leak an outside file) or on write
- it refuses a parent that is not a directory
- it refuses any file that changed after the preview (`STALE_PLAN`)
- it writes through a temp file and a rename

Re-committing the same APPEND does nothing.

### Citations and gates

[`src/citations.mjs`](src/citations.mjs) uses the canonical grammar `[verified: <url> "<quote>"]`. [`test/citations.test.mjs`](test/citations.test.mjs) proves code-for-code parity with the repo's Assayer:

- **Grammar errors**: `CITATION_CASE`, `CITATION_UNCLOSED`, `CITATION_NO_URL`, `CITATION_UNSAFE_SCHEME`, `CITATION_MISSING_QUOTE`, `CITATION_EMPTY_QUOTE`, `CITATION_MALFORMED`, `URL_INVALID`
- **Quote check**: `QUOTE_NOT_IN_SOURCE`. When the cited URL is one of the batch's sources, compared by canonical URL, the quote must occur in the stripped source text. The comparison ignores case, curly versus straight quotes, whitespace and line breaks. The manifest stores the stripped text, so the check still works after the raw page is gone. `--require-sourced` also holds citations to URLs that were not in the packet (`SOURCE_NOT_IN_PACKET`).
- **Gate rule**: `GATE_UNSOURCED`. Each `Gn pass` on a `- **Gates:**` line needs a well-formed citation on a line that names `Gn`, which is the RecallCharter §7 rule.

## Console

| Key | Action |
|---|---|
| `Ctrl/⌘ + Enter` | Preview. Pressing it again on unchanged input commits the ready items (Pack tab: pack; Strip tab: strip) |
| `Alt + 1/2/3` | Unpack, Pack or Strip tab |
| `j` / `k`, `Alt + ↓/↑` | Next or previous item |
| `e` | Select the current item's first problem in the pasted text |
| `c` | Copy the next packet (Pack tab) |
| `Esc`, `?` | Back to the editor; shortcut sheet |

The batch view groups items by reply and packet, shows bundle-level problems, and lists packets still awaiting replies. Each item shows its diff, or for held items the diagnostics, which you can click to jump to the line. The server binds only to `127.0.0.1` and rejects foreign `Host` headers. It also rejects cross-origin and non-JSON POSTs, and it sends a strict CSP. Every commit re-parses the paste on the server, so the browser's preview is never trusted.

## Library

```js
import { pack, unpack, plan, commit, diskReader, stripNoise } from 'webchat-batch-packer';

const { packets, manifest } = pack(spec);
const result = unpack(pastedReplies, { manifest, strict: false });
const planned = plan(result, diskReader(root));   // actions + unified diffs
commit(planned, root);                            // ready items only
```

Everything except `commit.mjs` and `cli.mjs` is pure and runs unchanged in the browser. [`src/hash.mjs`](src/hash.mjs) is a synchronous SHA-256, fuzz-tested against `node:crypto`.

## Benchmarks

Reproduce with `node bench/run.mjs`. The fixtures in [`test/fixtures/pages.mjs`](test/fixtures/pages.mjs) are seeded, synthetic DOM dumps: utility-class markup, inline analytics, SVG icons, hydration JSON, mega-menus and cookie banners. Each page lists the sentences that must survive.

### HTML noise stripping

| Page type | Input KB | Output KB | Reduction | Content kept | Noise lines left | ms/page |
|---|--:|--:|--:|--:|--:|--:|
| article | 57.6 | 2.1 | 96.4% | 100.0% | 0 | 5.49 |
| docs | 45.4 | 4.4 | 90.2% | 100.0% | 0 | 5.96 |
| listing | 78.4 | 1.2 | 98.5% | 100.0% | 0 | 20.79 |
| program | 61.5 | 1.5 | 97.6% | 100.0% | 0 | 10.46 |
| plain | 20.1 | 5.8 | 70.9% | 100.0% | 0 | 1.46 |

Reduction depends on how much of the page is chrome. Pages built on typical frameworks land at 90–98.5%. The content-dense `plain` page reaches only 70.9% because almost all of its remaining bytes are content. Its output stays within the `L<n> ` prefixes of the bare content, which the tests assert.

### Packing

| Raw pages | Raw size | Raw est. tokens | Packets (24k budget) | Packed est. tokens | Token saving | Time |
|--:|--:|--:|--:|--:|--:|--:|
| 40 | 2198.8 KB | 837,650 | 2 | 26,964 | 96.8% | 439 ms |

### Unpacking + lint + plan

| Reply size | Files | Citations checked | Ready | Time | Throughput |
|--:|--:|--:|--:|--:|--:|
| 426.1 KB | 300 | 300 | 300 | 16 ms | 26.6 MB/s |

### Mangling recovery

A case counts as recovered when every path is correct and every body is byte-identical to the clean reply.

| Mangling | Recovered | Repairs reported |
|---|:-:|--:|
| whole reply in ```` ```text ```` fence | yes | 0 |
| each file in its own fence | yes | 0 |
| bodies wrapped in ```` ````markdown ```` | yes | 3 |
| bold markers `**=== … ===**` | yes | 6 |
| heading markers `### ===` | yes | 6 |
| escaped `\=\=\=` | yes | 6 |
| backticked paths | yes | 3 |
| CRLF + BOM | yes | 2 |
| chatter before/after | yes | 0 |
| missing BEGIN/END_BUNDLE (single-packet manifest) | yes | 1 |
| END marker glued to last line | yes | 3 |

_Node v22.23.4, linux/x64. Token counts come from the offline estimator in [`src/packer.mjs`](src/packer.mjs), which is tuned to cl100k/o200k-style BPE and biased slightly high._

### Test suite

`node --test` runs **219 tests, all passing** in about 0.7 s:

| File | Tests | Covers |
|---|--:|---|
| [`unpacker.test.mjs`](test/unpacker.test.mjs) | 97 | Envelopes, malformed envelopes, 13 marker manglings, fences, 34 path-traversal vectors, conflicts, batch routing, plan, 800-case mutation fuzz |
| [`strip-noise.test.mjs`](test/strip-noise.test.mjs) | 35 | Reduction ratios, content recall and precision, structure, entities, tag-soup fuzz, 1 MB timing |
| [`citations.test.mjs`](test/citations.test.mjs) | 31 | Grammar table, quote checks against sources, gate rule, parity with the canonical Assayer |
| [`integration.test.mjs`](test/integration.test.mjs) | 22 | Disk commit, symlink escapes, stale plans, CLI exit codes, server CSRF, Host, CSP and static-path guards |
| [`packer.test.mjs`](test/packer.test.mjs) | 18 | Format, determinism, checksum tamper and truncation, budget splitting with global L-numbers |
| [`core.test.mjs`](test/core.test.mjs) | 15 | SHA-256 versus `node:crypto` (fuzz), Myers diff (fuzz), token estimator, templates |
