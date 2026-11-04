// Adapter registry. An adapter is a plain object:
//   id, label           identity
//   detect({url, doc})  0..1 confidence; the highest wins, generic is the 0.01 floor
//   fields              [[RegExp tested on raw name/id/data-automation-id/data-qa, key | (match, el) => key]]
//                       — platform ground truth, scored above every generic signal
//   button?(el, text, status)  override red-line / advance / neutral for platform buttons
import greenhouse from './greenhouse.mjs';
import lever from './lever.mjs';
import ashby from './ashby.mjs';
import workday from './workday.mjs';
import generic from './generic.mjs';

export const ADAPTERS = { greenhouse, lever, ashby, workday, generic };

export function detectPlatform(doc, url = '') {
  let best = generic, bestScore = 0;
  for (const a of Object.values(ADAPTERS)) {
    const s = a.detect({ url, doc });
    if (s > bestScore) { best = a; bestScore = s; }
  }
  return best;
}
