// Myers O((N+M)·D) line diff → edit script and unified hunks. Pure; shared by the CLI, the server and the browser.

/** Edit script: [{ op: ' ' | '-' | '+', line, a?, b? }] where a/b are 1-based line numbers in old/new. */
export function diffLines(oldText, newText) {
  const a = oldText === '' || oldText == null ? [] : oldText.replace(/\n$/, '').split('\n');
  const b = newText === '' || newText == null ? [] : newText.replace(/\n$/, '').split('\n');
  // Trim common prefix/suffix first: replies usually touch a few lines of a long file.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const N = A.length, M = B.length, max = N + M, off = max + 1;
  const trace = [];
  const v = new Int32Array(2 * max + 3);
  let found = N === 0 && M === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = true; break; }
    }
  }
  const mid = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1]) ? k + 1 : k - 1;
    const px = vd[off + prevK], py = px - prevK;
    while (x > px && y > py) { mid.push({ op: ' ', line: A[x - 1], a: pre + x, b: pre + y }); x--; y--; }
    if (d > 0) {
      if (x === px) mid.push({ op: '+', line: B[y - 1], b: pre + y });
      else mid.push({ op: '-', line: A[x - 1], a: pre + x });
    }
    x = px; y = py;
  }
  mid.reverse();
  const head = a.slice(0, pre).map((line, i) => ({ op: ' ', line, a: i + 1, b: i + 1 }));
  const tail = a.slice(a.length - suf).map((line, i) => ({ op: ' ', line, a: a.length - suf + i + 1, b: b.length - suf + i + 1 }));
  return [...head, ...mid, ...tail];
}

/** Unified diff text (`---/+++/@@`) with `context` lines; '' when identical. */
export function unifiedDiff(oldText, newText, { path = 'file', context = 3 } = {}) {
  const ops = diffLines(oldText, newText);
  const changed = ops.map((o, i) => (o.op !== ' ' ? i : -1)).filter(i => i >= 0);
  if (!changed.length) return '';
  const hunks = [];
  let start = Math.max(0, changed[0] - context), end = Math.min(ops.length, changed[0] + context + 1);
  for (const i of changed.slice(1)) {
    if (i - context <= end) end = Math.min(ops.length, i + context + 1);
    else { hunks.push([start, end]); start = i - context; end = Math.min(ops.length, i + context + 1); }
  }
  hunks.push([start, end]);
  const out = [`--- ${oldText == null ? '/dev/null' : 'a/' + path}`, `+++ b/${path}`];
  for (const [s, e] of hunks) {
    const seg = ops.slice(s, e);
    const aLines = seg.filter(o => o.op !== '+').length, bLines = seg.filter(o => o.op !== '-').length;
    const before = ops.slice(0, s);
    const aStart = before.filter(o => o.op !== '+').length + (aLines ? 1 : 0), bStart = before.filter(o => o.op !== '-').length + (bLines ? 1 : 0);
    out.push(`@@ -${aStart},${aLines} +${bStart},${bLines} @@`, ...seg.map(o => o.op + o.line));
  }
  return out.join('\n') + '\n';
}

/** Apply an edit script back to recover the new text (used to prove diff correctness). */
export const applyOps = ops => ops.filter(o => o.op !== '-').map(o => o.line).join('\n');
