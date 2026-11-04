// Node-only writer for planned items. Re-checks everything on disk: no symlink hops, no non-directory parents,
// no writes outside the root, and no file that changed since the preview (stale plan).
import fs from 'node:fs';
import path from 'node:path';

const WRITES = new Set(['create', 'update', 'append']);

/** Resolve `rel` under `root` without following symlinks. Returns { abs } or { error }. */
export function resolveSafe(root, rel) {
  const base = fs.realpathSync(root);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) return { error: 'OUTSIDE_ROOT' };
  let at = base;
  const segs = path.relative(base, abs).split(path.sep);
  for (const [k, s] of segs.entries()) {
    at = path.join(at, s);
    let st;
    try { st = fs.lstatSync(at); } catch (e) { if (e.code === 'ENOENT') break; throw e; }
    if (st.isSymbolicLink()) return { error: 'SYMLINK_REFUSED' };
    if (k < segs.length - 1 && !st.isDirectory()) return { error: 'PARENT_NOT_DIR' };
    if (k === segs.length - 1 && !st.isFile()) return { error: 'NOT_A_FILE' };
  }
  return { abs };
}

/** `read` callback for plan(): file text, or null when absent or unsafe to read. */
export const diskReader = root => rel => {
  const r = resolveSafe(root, rel);
  if (r.error) return null;
  try { return fs.readFileSync(r.abs, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};

/** Write planned items (output of plan()). Returns [{ id, path, action, ok, error? }]; held and unchanged items are not touched. */
export function commit(planned, root) {
  const out = [];
  const written = new Map();
  for (const it of planned) {
    if (!WRITES.has(it.action)) continue;
    const res = { id: it.id, path: it.path, action: it.action, ok: false };
    out.push(res);
    const r = resolveSafe(root, it.path);
    if (r.error) { res.error = r.error; continue; }
    const now = written.has(r.abs) ? written.get(r.abs) : fs.existsSync(r.abs) ? fs.readFileSync(r.abs, 'utf8') : null;
    if (now !== (it.before ?? null)) { res.error = 'STALE_PLAN'; continue; }
    fs.mkdirSync(path.dirname(r.abs), { recursive: true });
    const again = resolveSafe(root, it.path); // mkdir may have raced with a symlink swap
    if (again.error) { res.error = again.error; continue; }
    const tmp = `${r.abs}.wbp-${process.pid}.tmp`;
    fs.writeFileSync(tmp, it.after, { flag: 'wx' });
    fs.renameSync(tmp, r.abs);
    written.set(r.abs, it.after);
    res.ok = true;
  }
  return out;
}
