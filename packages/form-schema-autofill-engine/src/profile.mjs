// Candidate-profile value resolution and deterministic option matching.
// A "want" is { text, match[], bool? }: `text` is typed into free-text controls, `match` is an
// ordered list of phrases (earlier = stronger) used to pick an option in choice controls.

import { norm, attr } from './dom.mjs';

export const YES = ['yes', 'y', 'true', 'i am', 'i do', 'i will', 'i have', 'authorized', 'eligible'];
export const NO = ['no', 'n', 'false', 'i am not', 'i do not', 'i don t', 'i will not', 'i won t', 'not required', 'not'];
export const DECLINE = ['decline to self identify', 'decline to answer', 'decline', 'prefer not', 'don t wish', 'do not wish', 'not wish', 'do not want', 'don t want', 'choose not', 'not to answer', 'not to disclose', 'rather not'];
const NEG = /\b(no|not|don t|do not|won t|will not|never|decline)\b/;

// [iso2, dial code, names...] — enough for matching; extend in place.
export const COUNTRIES = [
  ['US', '+1', 'united states', 'united states of america', 'usa', 'us', 'u s a'], ['GB', '+44', 'united kingdom', 'uk', 'great britain', 'britain', 'england'],
  ['CA', '+1', 'canada'], ['IE', '+353', 'ireland'], ['DE', '+49', 'germany', 'deutschland'], ['FR', '+33', 'france'], ['NL', '+31', 'netherlands', 'the netherlands', 'holland'],
  ['ES', '+34', 'spain'], ['IT', '+39', 'italy'], ['PT', '+351', 'portugal'], ['SE', '+46', 'sweden'], ['CH', '+41', 'switzerland'], ['PL', '+48', 'poland'],
  ['IN', '+91', 'india'], ['AU', '+61', 'australia'], ['NZ', '+64', 'new zealand'], ['SG', '+65', 'singapore'], ['JP', '+81', 'japan'], ['BR', '+55', 'brazil'],
  ['MX', '+52', 'mexico'], ['IL', '+972', 'israel'], ['AE', '+971', 'united arab emirates', 'uae'], ['ZA', '+27', 'south africa'], ['CN', '+86', 'china'],
  ['HK', '+852', 'hong kong'], ['KR', '+82', 'south korea', 'korea republic of', 'republic of korea'],
];
export const country = (v) => {
  const n = norm(v);
  return COUNTRIES.find((c) => c[0].toLowerCase() === n || c.slice(2).includes(n)) ?? null;
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export const want = (text, match = [text]) => (text == null || text === '' ? null : { text: String(text), match: match.filter(Boolean).map(String) });
export const boolWant = (b) => (b == null ? null : { text: b ? 'Yes' : 'No', bool: !!b, match: b ? YES : NO });
export const choiceWant = (v) => {
  if (v == null) return null;
  if (v === 'decline') return { text: 'Decline to self-identify', match: DECLINE, decline: true };
  if (typeof v === 'boolean') return boolWant(v);
  return want(v);
};
export function countryWant(v) {
  const c = country(v);
  return c ? want(c[2].replace(/\b\w/g, (m) => m.toUpperCase()), [...c.slice(2), c[0]]) : want(v);
}
export function dialWant(v) {
  const c = country(v);
  return c ? want(c[1], [c[1], c[1].slice(1), c[2], c[0]]) : null;
}

/** ISO date (YYYY-MM[-DD]) -> want for a whole field or for one part (month/year/day). */
export function dateWant(iso, part, el) {
  if (!iso) return null;
  const [y, m = '01', d = '01'] = String(iso).split('-');
  if (part === 'year') return want(y);
  if (part === 'month') return want(m, [m, String(+m), MONTHS[+m - 1], MONTHS[+m - 1].slice(0, 3)]);
  if (part === 'day') return want(d, [d, String(+d)]);
  const type = attr(el, 'type'), hint = `${attr(el, 'placeholder') ?? ''} ${attr(el, 'pattern') ?? ''}`.toLowerCase();
  if (type === 'date') return want(`${y}-${m}-${d}`);
  if (type === 'month') return want(`${y}-${m}`);
  if (/dd\W*mm\W*yyyy/.test(hint)) return want(`${d}/${m}/${y}`);
  if (/mm\W*dd\W*yyyy/.test(hint)) return want(`${m}/${d}/${y}`);
  if (/yyyy\W*mm/.test(hint)) return want(`${y}-${m}`);
  return want(`${m}/${y}`);
}

const SPACE = (s) => ` ${s} `;
const PLACEHOLDER = /^(select|choose|please select|please choose|select one|select an option|none selected|pick one)\b|^-+$/;

/**
 * Pick the option that best satisfies `w`. Exact text/value equality beats phrase containment;
 * among containments, every matched phrase adds weight (so "+44" and "united kingdom" together beat
 * "+44" alone). Affirmative wants never match negated options. Returns the option or null.
 */
export function matchOption(options, w) {
  if (!w) return null;
  const phrases = w.match.map(norm).filter(Boolean);
  let best = null, bestScore = 0;
  options.forEach((o, i) => {
    const t = norm(o.text), v = norm(o.value);
    if (!t && !v) return;
    if (PLACEHOLDER.test(t) && !v) return;
    let s = 0;
    phrases.forEach((p, k) => {
      if (t === p || v === p) s = Math.max(s, 1000 - k);
      else if (SPACE(t).includes(SPACE(p))) s += 100 - k;
      else if (p.includes(' ') && p.split(' ').every((x) => SPACE(t).includes(SPACE(x)))) s += 50 - k;
    });
    if (w.bool === true && NEG.test(t)) s = 0;
    if (s > bestScore || (s === bestScore && s > 0 && i < best.i)) { best = { ...o, i }; bestScore = s; }
  });
  return best;
}
