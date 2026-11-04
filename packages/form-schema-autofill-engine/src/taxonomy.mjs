// Canonical field taxonomy. Each definition is matched against normalised text channels
// (see classifier.mjs); `value` resolves a profile into a "want" (see profile.mjs).
//
//   re        positive pattern            not     veto pattern (a matching channel scores negative)
//   ac        autocomplete tokens         types   input types with affinity
//   kinds     allowed control kinds       opt     pattern over the control's option texts
//   group     repeater family (work|education), indexed per entry
//   ctx       true: only eligible inside its repeater context (section headings, ancestor ids, own name)
//   solo      penalised inside a repeater context (the non-repeating twin of a group field)
//   sensitive EEO / protected data       human   never auto-filled (consent, signatures, credentials)

import { want, boolWant, choiceWant, countryWant, dialWant, dateWant } from './profile.mjs';

export const KINDS = {
  TEXT: ['text', 'email', 'tel', 'url', 'number', 'search', 'textarea', 'contenteditable', 'date', 'month'],
  CHOICE: ['select', 'select-multiple', 'combobox', 'listbox-button', 'radio-group', 'yesno', 'checkbox-group'],
  BOOL: ['checkbox'],
  FILE: ['file'],
};
const { TEXT, CHOICE, BOOL, FILE } = KINDS;
const ANY = [...TEXT, ...CHOICE];
const SHORT = ['text', 'search', 'select', 'combobox', 'listbox-button'];
const YESNO = [...CHOICE, ...BOOL, 'text'];

export const GROUP_CTX = {
  work: /\b(work|employment|professional|job|career) (experience|history)\b|\bemployments\b|\bexperiences?\b|\bprevious (jobs?|employers?|roles?|positions?)\b|\b(job|position|employer) \d\b/,
  education: /\beducations?\b|\bacademic\b|\b(school|university|college)\b|\bdegrees?\b|\bgraduat|\bqualifications?\b/,
};

const COMPANY = /\b(company|employer|organi[sz]ation|org)\b/;
const COMPANY_NOT = /\b(hear|find|learn|source|referr\w*|why|interest\w*|join|about (us|our)|school|university|size|website|url)\b/;
const TITLE = /\b(job )?title\b|\bposition\b|\brole\b|\bdesignation\b|\boccupation\b/;
const TITLE_NOT = /\b(desired|applying|apply|seeking|interested|which|preferred|title ix|pronouns?|why|what|how|describe|tell us|excite\w*)\b/;
const START = /^from$|\bstart\b|\bfrom date\b|\bdate from\b|\bbegin|\bfirst year\b/;
const END = /^to$|\bend\b|\bto date\b|\bdate to\b|\buntil\b|\bdate left\b|\blast year\b/;

const cur = (p) => p.work?.find((w) => w.current) ?? null;
const at = (arr, i) => (Array.isArray(arr) ? arr[i ?? 0] : null);
const D = (key, re, o = {}) => ({ key, re, kinds: ANY, ...o });

export const FIELDS = [
  D('first_name', /\b(first|given|fore) ?names?\b|\bfname\b|\bgiven\b/, { not: /\b(preferred|nick|last|family|surname|middle)\b|\b(emergency|reference|referee|referr\w*|manager|supervisor|recruiter|hiring|parent|guardian)\b/, ac: ['given-name'], kinds: TEXT, value: (p) => want(p.firstName) }),
  D('last_name', /\b(last|family|sur) ?names?\b|\blname\b|\bsurname\b/, { not: /\b(first|given|preferred)\b|\b(emergency|reference|referee|referr\w*|manager|supervisor|recruiter|hiring|parent|guardian)\b/, ac: ['family-name'], kinds: TEXT, value: (p) => want(p.lastName) }),
  D('middle_name', /\bmiddle (name|initial)s?\b/, { ac: ['additional-name'], kinds: TEXT, value: (p) => want(p.middleName) }),
  D('preferred_name', /\b(preferred|nick|known as|goes by) ?(first )?names?\b|\bnickname\b|\bgoes by\b/, { not: /\bpronouns?\b/, ac: ['nickname'], kinds: TEXT, value: (p) => want(p.preferredName) }),
  D('full_name', /\b(full|legal|complete|your) name\b|^name$|\bfirst (and|&) last name\b|^(candidate|applicant) name$/, { not: /\b(first|last|given|family|middle|preferred|company|school|user|file)\b|\b(emergency|reference|referee|referr\w*|manager|supervisor|recruiter|hiring|parent|guardian)\b/, ac: ['name'], kinds: TEXT, value: (p) => want([p.firstName, p.lastName].filter(Boolean).join(' ')) }),
  D('email', /\be ?mail\b/, { not: /\b(confirm|verify|verification|re ?enter|retype|repeat|again)\b|\b(emergency|reference|referee|referr\w*|manager|supervisor|recruiter|hiring|parent|guardian)\b/, ac: ['email'], types: ['email'], kinds: TEXT, value: (p) => want(p.email) }),
  D('email_confirm', /\b(confirm|verify|re ?enter|retype|repeat)\w* (your )?e ?mail\b|\be ?mail\b.*\b(again|confirm(ation)?)\b/, { types: ['email'], kinds: TEXT, value: (p) => want(p.email) }),
  D('phone', /\b(phone|mobile|cell|telephone|tel|contact number)\b/, { not: /\b(?<!(include|including|incl|with) )country (phone )?code\b|\bdial|\bcalling code\b|\bext(ension)?\b|\b(phone|device) type\b|\btype of phone\b|\bconsent\b|\b(emergency|reference|referee|referr\w*|manager|supervisor|recruiter|hiring|parent|guardian)\b/, ac: ['tel', 'tel-national', 'tel-local'], types: ['tel'], kinds: TEXT, value: (p) => want(p.phone?.number) }),
  D('phone_country_code', /\bcountry (phone )?code\b|\bdial(l?ing)? code\b|\bcalling code\b|\bphone (country|prefix)\b/, { not: /\b(include|including|incl|with) country code\b/, ac: ['tel-country-code'], opt: /\+\d{1,4}\b.*\+\d{1,4}\b.*\+\d{1,4}\b/, value: (p) => dialWant(p.phone?.country) }),
  D('phone_type', /\b(phone|device) type\b|\btype of phone\b/, { kinds: CHOICE, value: (p) => want(p.phone?.type) }),
  D('address_line1', /\baddress( line)? ?1?\b|\bstreet\b/, { not: /\b(e ?mail|line 2|web|ip|url|2)\b/, ac: ['address-line1', 'street-address'], kinds: TEXT, value: (p) => want(p.address?.line1) }),
  D('address_line2', /\baddress line 2\b|\baddress 2\b|\bapt\b|\bapartment\b|\bsuite\b/, { ac: ['address-line2'], kinds: TEXT, value: (p) => want(p.address?.line2) }),
  D('city', /\bcity\b|\btown\b|\blocality\b/, { not: /\b(state|country|location)\b/, ac: ['address-level2'], solo: true, value: (p) => want(p.address?.city) }),
  D('state', /\b(state|province|region|county|prefecture)\b/, { not: /\b(country|statement|united states|city|status)\b/, ac: ['address-level1'], value: (p) => want(p.address?.region) }),
  D('postal_code', /\b(zip|postal|post) ?code\b|\bzip\b|\bpostcode\b|\bpin ?code\b/, { ac: ['postal-code'], kinds: TEXT, value: (p) => want(p.address?.postalCode) }),
  D('country', /\bcountry\b/, { not: /\b(code|phone|dial|calling|region|citizenship|origin|birth|nationality|work|authori[sz]\w*|sponsor\w*|applying|reside|which)\b/, ac: ['country', 'country-name'], opt: /\b(united states|united kingdom|canada|germany|india|france)\b.*\b(united states|united kingdom|canada|germany|india|france)\b/, value: (p) => countryWant(p.address?.country) }),
  D('location', /\blocation\b|\bwhere (are you|do you) (currently )?(live|located|based|reside)\b|\bcurrent (city|address)\b|\bcity,? (state|country)\b|\bwhere are you based\b/, { not: /\b(relocat\w*|prefer\w*|office|open to|willing|remote|which locations?|hub|work location)\b/, solo: true, value: (p) => want(p.location, [p.location, p.address?.city]) }),
  D('linkedin', /\blinked ?in\b/, { types: ['url'], kinds: TEXT, value: (p) => want(p.links?.linkedin) }),
  D('github', /\bgit ?hub\b/, { types: ['url'], kinds: TEXT, value: (p) => want(p.links?.github) }),
  D('twitter', /\btwitter\b|\bx (handle|profile)\b/, { types: ['url'], kinds: TEXT, value: (p) => want(p.links?.twitter) }),
  D('website', /\b(portfolio|personal (web ?site|site|url|page)|web ?site|homepage|blog)\b|\burls? (portfolio|other)\b/, { not: /\b(linked ?in|git ?hub|twitter|company)\b/, ac: ['url'], types: ['url'], kinds: TEXT, value: (p) => want(p.links?.website) }),
  D('resume', /\b(resume|cv|curriculum vitae)\b/, { not: /\bcover\b/, kinds: [...FILE, 'textarea', 'contenteditable'], value: (p, f) => (f.kind === 'file' ? p.files?.resume ?? null : want(p.resumeText)) }),
  D('cover_letter', /\bcover ?letter\b|\bmotivation(al)? letter\b/, { kinds: [...FILE, 'textarea', 'contenteditable'], value: (p, f) => (f.kind === 'file' ? p.files?.coverLetter ?? null : want(p.coverLetter)) }),
  D('additional_info', /\badditional (info(rmation)?|comments|details)\b|\banything else\b|^comments?$|\bcomments\b/, { kinds: ['textarea', 'contenteditable', 'text'], value: (p) => want(p.additionalInfo) }),
  D('current_company', COMPANY, { not: COMPANY_NOT, ac: ['organization'], solo: true, kinds: SHORT, value: (p) => want(cur(p)?.company) }),
  D('current_title', TITLE, { not: TITLE_NOT, ac: ['organization-title'], solo: true, kinds: SHORT, value: (p) => want(cur(p)?.title) }),
  D('work.company', COMPANY, { not: COMPANY_NOT, group: 'work', ctx: true, kinds: SHORT, value: (p, f) => want(at(p.work, f.index)?.company) }),
  D('work.title', TITLE, { not: TITLE_NOT, group: 'work', ctx: true, kinds: SHORT, value: (p, f) => want(at(p.work, f.index)?.title) }),
  D('work.location', /\blocation\b|\bcity\b/, { group: 'work', ctx: true, value: (p, f) => want(at(p.work, f.index)?.location) }),
  D('work.start', START, { group: 'work', ctx: true, date: true, value: (p, f) => dateWant(at(p.work, f.index)?.start, f.part, f.el) }),
  D('work.end', END, { not: /\bcurrent(ly)?\b/, group: 'work', ctx: true, date: true, value: (p, f) => dateWant(at(p.work, f.index)?.end, f.part, f.el) }),
  D('work.current', /\bcurrent(ly)?\b.*\b(work|employ\w*|role|job|position)\b|\bi currently\b|\bpresent\b|\bstill work/, { group: 'work', ctx: true, kinds: [...BOOL, ...CHOICE], value: (p, f) => boolWant(at(p.work, f.index) ? !!at(p.work, f.index).current : null) }),
  D('work.description', /\bdescription\b|\bresponsibilit\w*|\bsummary\b|\bachievements?\b|\bduties\b|\brole description\b/, { group: 'work', ctx: true, kinds: TEXT, value: (p, f) => want(at(p.work, f.index)?.description) }),
  D('education.school', /\b(school|university|college|institution|alma mater)\b/, { not: /\bhigh school diploma\b/, group: 'education', value: (p, f) => want(at(p.education, f.index)?.school) }),
  D('education.degree', /\bdegree\b|\bqualification\b|\bdiploma\b/, { not: /\b(discipline|field|major|subject|school|university)\b/, group: 'education', value: (p, f) => want(at(p.education, f.index)?.degree, degreeSyn(at(p.education, f.index)?.degree)) }),
  D('education.discipline', /\b(discipline|major|field of study|area of study|concentration|speciali[sz]ation|course of study|subject)\b/, { group: 'education', value: (p, f) => want(at(p.education, f.index)?.discipline) }),
  D('education.gpa', /\bgpa\b|\bcgpa\b|\bgrade point\b|\bgrades?\b|\boverall result\b/, { group: 'education', kinds: TEXT, value: (p, f) => want(at(p.education, f.index)?.gpa) }),
  D('education.start', START, { group: 'education', ctx: true, date: true, value: (p, f) => dateWant(at(p.education, f.index)?.start, f.part, f.el) }),
  D('education.end', /^to$|\bend\b|\bto date\b|\buntil\b|\blast year\b|\bgraduat\w*|\bcompletion\b|\bclass of\b/, { group: 'education', ctx: true, date: true, value: (p, f) => dateWant(at(p.education, f.index)?.end, f.part, f.el) }),
  D('start_date', /\b(earliest|available|possible) (start|starting)\b|\bearliest\b.*\bstart\b|\bstart date\b|\bwhen can you start\b|\bdate available\b|\bavailability\b|\bavailable to start\b/, { solo: true, date: true, value: (p, f) => dateWant(p.startDate, f.part, f.el) }),
  D('salary', /\bsalary\b|\bcompensation\b|\b(pay|wage|ctc|rate) (expectation|requirement|range)s?\b|\bdesired (pay|salary)\b|\bexpected (ctc|pay|salary)\b/, { not: /\bcurrent\b/, value: (p) => want(p.salaryExpectation) }),
  D('notice_period', /\bnotice( period)?\b/, { not: /\bprivacy notice\b|\bnotice of\b/, value: (p) => want(p.noticePeriod) }),
  D('work_authorization', /\b(legally )?(authori[sz]ed|eligible|entitled|permitted|right) to work\b|\bwork (authori[sz]ation|permit|eligibility)\b|\bauthori[sz]ation to work\b/, { not: /\bsponsor\w*/, kinds: YESNO, value: (p) => boolWant(p.workAuthorized) }),
  D('sponsorship', /\bsponsor(ship)?\b|\bvisa (support|sponsorship)\b|\bh ?1 ?b\b/, { kinds: YESNO, value: (p) => boolWant(p.requiresSponsorship) }),
  D('relocation', /\brelocat\w*/, { kinds: YESNO, value: (p) => boolWant(p.willingToRelocate) }),
  D('age_18', /\b(18|eighteen) (years|or older|years of age)\b|\bover (the age of )?18\b|\bat least 18\b|\blegal (working )?age\b/, { kinds: YESNO, value: (p) => boolWant(p.over18) }),
  D('source', /\bhow did you (hear|find|learn|discover)\b|\bwhere did you (hear|find|see)\b|\b(referral|application|candidate|job|lead) source\b|\bsource\b/, { not: /\bopen source\b|\bsource code\b/, value: (p) => want(p.source) }),
  D('referral', /\breferr(ed|al|er)\b|\bwho referred\b/, { not: /\bsource\b|\bhow did\b/, kinds: TEXT, value: (p) => want(p.referral) }),
  D('pronouns', /\bpronouns?\b/, { value: (p) => want(p.pronouns, [p.pronouns, p.pronouns?.replace('/', ' ')]) }),
  D('eeo.gender', /\bgender\b|\bsex\b/, { not: /\b(orientation|transgender|trans)\b/, ac: ['sex'], opt: /\b(male|female|man|woman|non ?binary)\b/, sensitive: true, value: (p) => choiceWant(p.eeo?.gender) }),
  D('eeo.race', /\brace\b|\bethnic(ity)?\b|\bracial\b/, { not: /\bhispanic\b/, opt: /\b(asian|white|black|african american|pacific islander|american indian)\b/, sensitive: true, value: (p) => choiceWant(p.eeo?.race) }),
  D('eeo.hispanic', /\bhispanic\b|\blatin[oax]\b/, { sensitive: true, value: (p) => choiceWant(p.eeo?.hispanic) }),
  D('eeo.veteran', /\bveterans?\b|\bmilitary\b|\barmed forces\b/, { sensitive: true, value: (p) => choiceWant(p.eeo?.veteran) }),
  D('eeo.disability', /\bdisabilit(y|ies)\b|\bhandicap\w*/, { not: /\bsignature\b|\bsign\b/, sensitive: true, kinds: [...CHOICE, ...BOOL], value: (p) => choiceWant(p.eeo?.disability) }),
  D('eeo.orientation', /\bsexual orientation\b|\blgbt\w*/, { sensitive: true, kinds: CHOICE, value: (p) => choiceWant(p.eeo?.orientation) }),
  D('dob', /\bdate of birth\b|\bbirth ?date\b|\bdob\b|\bbirthday\b|\bbday\b/, { ac: ['bday', 'bday-day', 'bday-month', 'bday-year'], date: true, sensitive: true, human: true }),
  D('national_id', /\bsocial security\b|\bssn\b|\bsocial insurance\b|\bnational (id|identity|insurance)\b|\btax (id|file number)\b|\bpassport number\b/, { kinds: TEXT, sensitive: true, human: true }),
  D('consent', /\bi (hereby )?(agree|consent|acknowledge|certify|attest|confirm|understand|accept|authori[sz]e)\b|\bprivacy (policy|notice)\b|\bterms (and|&) conditions\b|\bterms of (use|service)\b|\bgdpr\b|\bdata (processing|retention|protection)\b|\btrue and (correct|complete)\b|\baccurate and complete\b/, { not: /\b(18|eighteen) (years|or older)|\bover (the age of )?18\b|\bat least 18\b/, kinds: [...BOOL, ...CHOICE], human: true }),
  D('signature', /\bsignature\b|\bsign (here|your name)\b|\btype your (full )?name to sign\b|\belectronic(ally)? sign/, { kinds: [...TEXT, ...CHOICE], human: true }),
  D('credential', /\bpassword\b|\bpasscode\b|\bsecurity (question|answer)\b|\buser ?name\b|\bone time code\b/, { ac: ['username', 'new-password', 'current-password', 'one-time-code'], types: ['password'], kinds: [...TEXT, 'password'], human: true }),
];

export const FIELD = Object.fromEntries(FIELDS.map((d) => [d.key, d]));

function degreeSyn(d) {
  const n = String(d ?? '').toLowerCase();
  if (/master/.test(n)) return [d, "master's degree", 'masters', 'master', 'msc', 'ms', 'ma', 'm s'];
  if (/bachelor/.test(n)) return [d, "bachelor's degree", 'bachelors', 'bachelor', 'bsc', 'bs', 'ba', 'b s'];
  if (/doctor|phd/.test(n)) return [d, 'doctorate', 'phd', 'ph d', 'doctor of philosophy'];
  return [d];
}

