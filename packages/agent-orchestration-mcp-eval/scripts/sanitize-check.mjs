#!/usr/bin/env node
// Sanitization gate for the public repo. Scans every file in the tree (this script included) and every commit reachable
// from any ref for personal contact details, credentials and private local paths. Exit 1 on any hit.
//
// Private project names and personal identifiers are NOT stored here. They come from a denylist file outside the
// repo, named by the SANITIZE_PRIVATE_TERMS environment variable: one term per line, matched as whole words, case-insensitive,
// with `#` comments allowed. Without it only the generic rules run and the report says so.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.promptfoo']);
const TEXT_EXT = /\.(mjs|js|json|md|yaml|yml|txt|cmd|gitignore|html|css)$|^LICENSE$|^\.gitignore$/i;

const RULES = [
  ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['phone number', /(?<!\d)(?:\+?\d{1,3}[ .-])?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/],
  ['API key', /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['local user path', /[A-Za-z]:\\?Users\\?|\/c\/Users\/|\/home\/[a-z]+\//i],
];

// Co-Authored-By trailers name a public attribution address by design, so those lines are not scanned.
const ATTRIBUTION_TRAILER = /^Co-Authored-By:\s|^noreply@anthropic\.com$/i;

function loadPrivateRules() {
  const file = process.env.SANITIZE_PRIVATE_TERMS;
  if (!file) return { rules: [], note: 'private denylist not set (SANITIZE_PRIVATE_TERMS); generic rules only' };
  const terms = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  const rules = terms.map(term => [
    'private term',
    new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i'),
  ]);
  return { rules, note: `private denylist loaded: ${terms.length} term(s) from outside the repo` };
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else {
      yield path.join(dir, entry.name);
    }
  }
}

const { rules, note } = loadPrivateRules();
const allRules = [...RULES, ...rules];
const hits = [];

const scanLine = (where, line) => {
  if (ATTRIBUTION_TRAILER.test(line)) return;
  for (const [label, re] of allRules) {
    if (re.test(line)) hits.push(`${where} [${label}]`);
  }
};

let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (!TEXT_EXT.test(path.basename(file))) continue;
  scanned++;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => scanLine(`${rel}:${i + 1}`, line));
}

// Commit metadata: author and committer identities plus full message text, for every commit reachable from any ref.
let commits = 0;
let gitNote = 'no git repository; commit metadata not scanned';
if (fs.existsSync(path.join(ROOT, '.git'))) {
  const FIELD = '%x1f';
  const out = execFileSync('git', ['log', '--all', `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%cn${FIELD}%ce${FIELD}%B%x1e`], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  for (const record of out.split('\x1e').map(r => r.trim()).filter(Boolean)) {
    const [sha, an, ae, cn, ce, body] = record.split('\x1f');
    commits++;
    const short = sha.slice(0, 7);
    [['author name', an], ['author email', ae], ['committer name', cn], ['committer email', ce]]
      .forEach(([field, value]) => scanLine(`commit ${short} ${field}`, value));
    body.split(/\r?\n/).forEach((line, i) => scanLine(`commit ${short} message:${i + 1}`, line));
  }
  gitNote = `${commits} reachable commit(s) scanned (author, committer, message)`;
}

if (hits.length) {
  console.log(hits.join('\n'));
  console.log(`\nsanitize: ${hits.length} hit(s) in ${scanned} file(s), ${gitNote}. ${note}. FAIL`);
  process.exit(1);
}
console.log(`sanitize: 0 hits in ${scanned} file(s), ${gitNote}. ${note}. PASS`);
