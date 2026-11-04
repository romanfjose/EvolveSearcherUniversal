// Workday (*.myworkdayjobs.com, *.myworkdaysite.com): every widget carries a `data-automation-id`;
// newer tenants also use structured ids such as `name--legalName--firstName`. Dropdowns are
// <button aria-haspopup="listbox">, dates split into month/year inputs, repeaters are
// `workExperience-N` / `education-N` sections. The footer "Save and Continue" button advances the
// wizard; the same slot reads "Submit" on the review step, and account creation / sign-in are
// red lines in their own right.
import { find, attr, norm, hostOf } from '../dom.mjs';

export default {
  id: 'workday',
  label: 'Workday',
  detect({ url = '', doc }) {
    if (/myworkday(jobs|site)\.com$|(^|\.)workday\.com$/i.test(hostOf(url))) return 0.95;
    return find(doc, (el) => /^(legalNameSection_|bottom-navigation-|applyFlow|formField-)/.test(attr(el, 'data-automation-id') ?? '')) ? 0.8 : 0;
  },
  fields: [
    [/^legalNameSection_firstName$/, 'first_name'], [/^legalNameSection_lastName$/, 'last_name'], [/^legalNameSection_middleName$/, 'middle_name'],
    [/^preferredNameSection_/, (m, el) => (/last/i.test(attr(el, 'data-automation-id')) ? null : 'preferred_name')],
    [/^addressSection_addressLine1$/, 'address_line1'], [/^addressSection_city$/, 'city'], [/^addressSection_postalCode$/, 'postal_code'],
    [/^addressSection_countryRegion$|^address--countryRegion$/, 'state'], [/^countryDropdown$|^country--country$/, 'country'],
    [/^phone-number$|^phoneNumber--phoneNumber$/, 'phone'], [/^phone-device-type$|^phoneNumber--phoneType$/, 'phone_type'],
    [/^countryPhoneCode$|^phoneNumber--countryPhoneCode$/, 'phone_country_code'],
    [/^(sourceDropdown|sourcePrompt)$|^source--source$/, 'source'],
    [/^currentlyWorkHere$|--currentlyWorkHere$/, 'work.current'], [/^jobTitle$|--jobTitle$/, 'work.title'], [/^company$|--companyName$/, 'work.company'],
    [/^fieldOfStudy$|--fieldOfStudy$/, 'education.discipline'], [/^gpa$|--gradeAverage$/, 'education.gpa'],
    [/^(password|verifyPassword)$|--(password|verifyPassword)$/, 'credential'],
    [/^(createAccountCheckbox|agreementCheckbox)$|termsAndConditions/, 'consent'],
    [/^selfIdentifiedDisabilityData--(name|employeeId|dateSignedOn)/, 'signature'],
  ],
  button(el, text, status) {
    const id = attr(el, 'data-automation-id') ?? '';
    if (/^(createAccountSubmitButton|signInSubmitButton|pageFooterSubmitButton)$/.test(id)) return 'redline';
    if (/^(bottom-navigation-next-button|pageFooterNextButton)$/.test(id)) return /\bsubmit\b/.test(norm(text)) ? 'redline' : 'advance';
    return status;
  },
};
