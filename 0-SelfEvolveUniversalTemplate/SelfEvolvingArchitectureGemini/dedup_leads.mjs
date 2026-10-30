import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LEADS = path.join(ROOT, 'leads'), REJECTED = path.join(LEADS, 'rejected');
fs.mkdirSync(REJECTED, { recursive: true });
const field = (text, name) => text.match(new RegExp(`^- \\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'im'))?.[1]?.trim() || '';
function cleanUrl(raw) {
  try {
    const u = new URL(raw.replace(/[.,;:'"`]+$/, ''));
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$|gh_src$)/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort(); return u.toString().replace(/\/$/, '');
  } catch { return raw; }
}
function key(text, name) {
  const explicit = field(text, 'Opportunity ID');
  if (explicit) return explicit;
  const url = (field(text, 'Canonical URL') || field(text, 'Official URL')).match(/https?:\/\/[^\s)>\]`]+/)?.[0];
  if (!url) return 'file:' + name; // Never collapse unrelated dossiers by a shared evidence link.
  const canonical = cleanUrl(url), u = new URL(canonical);
  return u.pathname === '/' && !u.search && !u.hash
    ? canonical + '#' + name.replace(/\.md$/i, '').replace(/-\d{4}-\d{2}-\d{2}$/, '') : canonical;
}
function record(name, dir) {
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  return { name, text, id: key(text, name), file: path.relative(ROOT, path.join(dir, name)).replaceAll('\\', '/'),
    assessed: field(text, 'Fit assessed'), reviewAfter: field(text, 'Review after'), reason: field(text, 'Rejection Reason') };
}
const active = fs.readdirSync(LEADS).filter(n => n.endsWith('.md') && n !== 'screened.md').map(n => record(n, LEADS)); // screened.md is the ledger
// Prefer explicitly dated assessments; filesystem copy times do not establish evidence freshness.
active.sort((a, b) => b.assessed.localeCompare(a.assessed) || a.name.localeCompare(b.name));
const indexed = new Map(), rows = [];
for (const entry of active) {
  if (indexed.has(entry.id)) {
    const reason = `Exact opportunity duplicate superseded by ${indexed.get(entry.id)} (${entry.id})`;
    const stamped = entry.text.replace(/^- \*\*Rejection Reason:\*\*.*\r?\n?/gim, '').replace(/^(# .*)$/m, `$1\n- **Rejection Reason:** ${reason}`);
    const dest = path.join(REJECTED, entry.name);
    fs.writeFileSync(dest, stamped, { encoding: 'utf8', flag: 'wx' }); // Collision aborts before source removal.
    fs.unlinkSync(path.join(LEADS, entry.name));
  } else {
    indexed.set(entry.id, entry.file); rows.push(entry.id);
  }
}
// Rejections are dated observations, not permanent URL bans. Scouts read metadata before skipping.
for (const name of fs.readdirSync(REJECTED).filter(n => n.endsWith('.md')).sort()) {
  const e = record(name, REJECTED);
  if (/Exact (URL|opportunity) duplicate/i.test(e.reason)) continue;
  rows.push('# rejected ' + JSON.stringify({ id: e.id, file: e.file, assessed: e.assessed || null,
    review_after: e.reviewAfter || null, reason: e.reason, reconsider: 'on new evidence; missing/due review date is eligible for refresh' }));
}
fs.writeFileSync(path.join(LEADS, 'seen_urls.txt'), rows.length ? rows.join('\n') + '\n' : '', 'utf8');
console.log(`Indexed ${indexed.size} active opportunities; rejection history retained with review metadata.`);
