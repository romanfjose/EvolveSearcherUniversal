// Ashby (jobs.ashbyhq.com): React app; system fields carry `_systemfield_*` ids, custom questions use
// UUID ids with <label for>. Boolean questions render as Yes/No <button> pairs, which the generic
// collector already models as kind "yesno".
import { find, attr, hostOf } from '../dom.mjs';

export default {
  id: 'ashby',
  label: 'Ashby',
  detect({ url = '', doc }) {
    if (/(^|\.)ashbyhq\.com$/i.test(hostOf(url))) return 0.95;
    return find(doc, (el) => /^_systemfield_/.test(attr(el, 'id') ?? attr(el, 'name') ?? '') || /ashby-application-form/.test(attr(el, 'class') ?? '')) ? 0.8 : 0;
  },
  fields: [
    [/^_systemfield_name$/, 'full_name'], [/^_systemfield_email$/, 'email'], [/^_systemfield_phone$/, 'phone'],
    [/^_systemfield_resume$/, 'resume'], [/^_systemfield_location$/, 'location'], [/^_systemfield_preferred_name$/, 'preferred_name'],
  ],
};
