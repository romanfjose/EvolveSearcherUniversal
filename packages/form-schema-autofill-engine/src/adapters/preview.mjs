// Dry-run / preview overlay. buildPreview() is pure (works on the replay DOM); renderOverlay() draws
// outlines over a live page inside its own shadow root, pointer-events: none, so it never intercepts
// or triggers anything. Red-line buttons are flagged, never clicked.

export const STATUS = {
  mapped: { color: '#16a34a', note: 'mapped' },
  sensitive: { color: '#7c3aed', note: 'sensitive (EEO) – filled only from explicit profile choice' },
  human: { color: '#0284c7', note: 'needs a human (consent, signature, credential)' },
  ambiguous: { color: '#d97706', note: 'ambiguous – top candidates too close' },
  unmapped: { color: '#64748b', note: 'unmapped' },
  advance: { color: '#d97706', note: 'advances the wizard – never clicked' },
  redline: { color: '#dc2626', note: 'RED LINE – submits / pays / signs up – never clicked' },
};

const fieldStatus = (f) => (f.status !== 'mapped' ? f.status : f.human ? 'human' : f.sensitive ? 'sensitive' : 'mapped');

/** Deterministic preview items + summary counts for a classify() result. */
export function buildPreview(result) {
  const items = [
    ...result.fields.map((f) => ({ el: f.anchor, status: fieldStatus(f), title: f.key ? `${f.key}${f.part ? `:${f.part}` : ''}${f.index != null ? ` #${f.index + 1}` : ''}` : f.status, label: f.label, score: f.score, field: f })),
    ...result.buttons.filter((b) => b.status !== 'neutral').map((b) => ({ el: b.el, status: b.status, title: b.status === 'redline' ? `RED LINE: ${b.text}` : `advance: ${b.text}`, label: b.text, button: b })),
  ];
  const summary = Object.fromEntries(Object.keys(STATUS).map((k) => [k, items.filter((i) => i.status === k).length]));
  return { platform: result.platform, items, summary };
}

/** Draw the preview over a live document. Returns { host, items, redraw, remove }. */
export function renderOverlay(result, { doc = result.root.ownerDocument ?? result.root } = {}) {
  const win = doc.defaultView;
  const { items } = buildPreview(result);
  const host = doc.createElement('div');
  host.setAttribute('data-fsae-overlay', '');
  host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  const sr = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `.b{position:absolute;box-sizing:border-box;border:2px solid var(--c);border-radius:4px;background:color-mix(in srgb,var(--c) 8%,transparent)}
.b.redline{border-width:3px;border-style:dashed;background:color-mix(in srgb,var(--c) 14%,transparent)}
.t{position:absolute;right:-2px;bottom:100%;font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:var(--c);padding:1px 5px;border-radius:3px 3px 0 0;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}`;
  sr.appendChild(style);
  const layer = doc.createElement('div');
  sr.appendChild(layer);
  const redraw = () => {
    layer.textContent = '';
    for (const it of items) {
      const r = it.el.getBoundingClientRect?.();
      if (!r || (!r.width && !r.height)) continue;
      const b = doc.createElement('div');
      b.className = `b ${it.status}`;
      b.style.cssText = `--c:${STATUS[it.status].color};left:${r.left + win.scrollX}px;top:${r.top + win.scrollY}px;width:${r.width}px;height:${r.height}px`;
      b.title = `${it.title} — ${STATUS[it.status].note}`;
      const t = doc.createElement('span');
      t.className = 't';
      t.textContent = it.title;
      b.appendChild(t);
      layer.appendChild(b);
    }
  };
  doc.body.appendChild(host);
  redraw();
  win.addEventListener('resize', redraw);
  win.addEventListener('scroll', redraw, { capture: true, passive: true });
  return {
    host, items, redraw,
    remove() { win.removeEventListener('resize', redraw); win.removeEventListener('scroll', redraw, { capture: true }); host.remove(); },
  };
}
