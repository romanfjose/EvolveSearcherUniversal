// Realm-agnostic DOM helpers: identical behaviour on a live browser DOM and on ./mini-dom.mjs.

export const lower = (s) => String(s ?? '').toLowerCase();
export const tagOf = (el) => lower(el?.localName || el?.tagName);
export const attr = (el, n) => (el?.getAttribute ? el.getAttribute(n) : null);

/** Normalise free text and identifiers to space-separated lowercase tokens ("job_application[firstName]" -> "job application first name"). */
export const norm = (s) => String(s ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2')
  .toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/** Composed parent: crosses from a shadow root to its host. */
export const parentOf = (n) => {
  const p = n?.parentNode;
  return p && p.nodeType === 11 && p.host ? p.host : p;
};

/** Element children in render order: open shadow tree first (approximating slotting), then light children. */
const kids = (n) => [...(n.shadowRoot ? n.shadowRoot.children : []), ...(n.children ?? [])];

/** Depth-first, document-order walk over elements below root, piercing open shadow roots. */
export function* walk(root) {
  const stack = [...kids(root)].reverse();
  while (stack.length) {
    const el = stack.pop();
    yield el;
    stack.push(...kids(el).reverse());
  }
}

export const find = (root, pred) => { for (const el of walk(root)) if (pred(el)) return el; return null; };
export const findAll = (root, pred) => [...walk(root)].filter(pred);

export function closest(el, pred, stopAt = null) {
  for (let n = el; n && n.nodeType === 1 && n !== stopAt; n = parentOf(n)) if (pred(n)) return n;
  return null;
}

export function byId(scope, id) {
  if (!id) return null;
  const rn = scope.getRootNode ? scope.getRootNode() : scope;
  return rn.getElementById?.(id) ?? scope.ownerDocument?.getElementById?.(id) ?? null;
}

const HIDDEN_STYLE = /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i;

/** Hidden by attribute, inline style or (in a real browser) computed style. */
export function isHidden(el) {
  for (let n = el; n && n.nodeType === 1; n = parentOf(n)) {
    if (n.hasAttribute('hidden') || n.hasAttribute('inert') || HIDDEN_STYLE.test(attr(n, 'style') ?? '')) return true;
    if (tagOf(n) === 'template' || tagOf(n) === 'dialog' && !n.hasAttribute('open')) return true;
  }
  if (typeof el.checkVisibility === 'function' && el.isConnected) return !el.checkVisibility({ visibilityProperty: true });
  return false;
}

const SKIP_TEXT = new Set(['head', 'script', 'style', 'template', 'select', 'option', 'optgroup', 'datalist', 'textarea', 'input', 'button', 'noscript', 'svg']);
const SKIP_ROLE = new Set(['listbox', 'option', 'button', 'menu', 'tooltip', 'alert']);

/** Human-visible text of a node, skipping form-control internals and any element in `skip` (never those in `keep`). */
export function textOf(node, skip = null, limit = 400, keep = null) {
  let out = '';
  const visit = (n, isRoot) => {
    if (out.length > limit) return;
    if (n.nodeType === 3) { out += n.data ?? n.textContent; return; }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.nodeType === 1 && !isRoot && !keep?.has(n)) {
      if (skip?.has(n) || SKIP_TEXT.has(tagOf(n)) || SKIP_ROLE.has(lower(attr(n, 'role')))) return;
      if (n.hasAttribute('hidden') || HIDDEN_STYLE.test(attr(n, 'style') ?? '')) return;
    }
    if (n.shadowRoot) for (const c of n.shadowRoot.childNodes) visit(c, false);
    for (const c of n.childNodes) visit(c, false);
  };
  visit(node, true);
  return out.replace(/\s+/g, ' ').trim().slice(0, limit);
}

export const describe = (el) => {
  if (!el) return '?';
  const id = attr(el, 'id'), name = attr(el, 'name'), da = attr(el, 'data-automation-id');
  return tagOf(el) + (id ? `#${id}` : '') + (name ? `[name="${name}"]` : '') + (da && !id ? `[data-automation-id="${da}"]` : '');
};

/** True when activating `el` would submit its form: explicit submit/image, or a type-less <button> inside a <form>. */
export function isSubmitLike(el) {
  const t = tagOf(el), type = lower(attr(el, 'type'));
  if (t === 'input') return type === 'submit' || type === 'image';
  if (t === 'button') return type === 'submit' || (!type && !!closest(el, (n) => tagOf(n) === 'form'));
  return false;
}

export const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

/** role=option descendants of a listbox as {text, value, el}. */
export const listboxOptions = (lb) => findAll(lb, (n) => lower(attr(n, 'role')) === 'option').map((o) => ({ text: textOf(o), value: attr(o, 'data-value') ?? textOf(o), el: o }));

/** Popup (listbox) a combobox or dropdown button controls, via aria-controls / aria-owns. */
export function popupFor(el) {
  const ids = `${attr(el, 'aria-controls') ?? ''} ${attr(el, 'aria-owns') ?? ''}`.split(/\s+/).filter(Boolean);
  for (const id of ids) { const n = byId(el, id); if (n) return n; }
  return null;
}

