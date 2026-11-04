// Lever hosted forms (jobs.lever.co / jobs.eu.lever.co): flat, stable `name` attributes.
import { find, attr, hostOf } from '../dom.mjs';

export default {
  id: 'lever',
  label: 'Lever',
  detect({ url = '', doc }) {
    if (/(^|\.)lever\.co$/i.test(hostOf(url))) return 0.95;
    return find(doc, (el) => /application-form/.test(attr(el, 'class') ?? '') && find(el, (c) => /^urls\[/.test(attr(c, 'name') ?? ''))) ? 0.8 : 0;
  },
  fields: [
    [/^name$/, 'full_name'], [/^org$/, 'current_company'], [/^location$/, 'location'], [/^comments$/, 'additional_info'],
    [/^urls\[LinkedIn\]$/i, 'linkedin'], [/^urls\[GitHub\]$/i, 'github'], [/^urls\[Twitter\]$/i, 'twitter'], [/^urls\[(Portfolio|Other)\]$/i, 'website'],
    [/^eeo\[gender\]$/, 'eeo.gender'], [/^eeo\[race\]$/, 'eeo.race'], [/^eeo\[veteran\]$/, 'eeo.veteran'], [/^eeo\[disability\]$/, 'eeo.disability'],
    [/^eeo\[disabilitySignature(Date)?\]$/, 'signature'],
  ],
};
