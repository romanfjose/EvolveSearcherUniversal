// Greenhouse: classic boards (boards.greenhouse.io, `job_application[...]` names, #application_form)
// and the React job-boards app (job-boards.greenhouse.io, React-Select comboboxes, `question_<id>` ids).
// The embeddable #grnhse_app widget is a cross-origin iframe: run the engine inside that frame.
import { find, attr, hostOf } from '../dom.mjs';

export default {
  id: 'greenhouse',
  label: 'Greenhouse',
  detect({ url = '', doc }) {
    if (/(^|\.)greenhouse\.io$/i.test(hostOf(url)) || /[?&]gh_jid=/.test(url)) return 0.95;
    return find(doc, (el) => attr(el, 'id') === 'application_form' || /^job_application\[/.test(attr(el, 'name') ?? '')) ? 0.8 : 0;
  },
  fields: [
    [/^job_application\[(gender)\]$/, 'eeo.gender'], [/^gender$/, 'eeo.gender'],
    [/^job_application\[race\]$|^race$/, 'eeo.race'],
    [/hispanic_ethnicity/, 'eeo.hispanic'],
    [/veteran_status/, 'eeo.veteran'],
    [/disability_status/, 'eeo.disability'],
    [/^candidate-location$|^job_application\[location\]$/, 'location'],
    [/^(school|degree|discipline)--\d+$/, (m) => `education.${m[1]}`],
  ],
};
