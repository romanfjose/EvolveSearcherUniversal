# form-schema-autofill-engine

A pure-JavaScript form-field classifier, ATS adapter registry, dry-run preview overlay and deterministic replay harness, with no dependencies. It needs no LLM and makes no network calls. The same DOM always produces the same field map.

**Safety contract:** the engine has no submit API. Every click goes through `clickSafe()`. It refuses any element that could submit a form (explicit `submit`/`image`, or a type-less `<button>` inside a `<form>`) and every button the classifier flagged as `redline` (submit, apply, pay, bid, sign up, sign in, create account) or `advance` (next/continue). It never sends Enter. Consent boxes, signatures, credentials, dates of birth and national IDs are classified as `human` and are never filled. EEO fields are filled only from explicit `profile.eeo` choices.

## Use

```js
import { classify, planFill, fill, renderOverlay } from './src/index.mjs';

const result = classify(document, { url: location.href });   // auto-detects greenhouse | lever | ashby | workday | generic
renderOverlay(result);                                        // outlines mapped / ambiguous / unmapped / sensitive / red-line
const plan = planFill(result, profile);                       // pure: what would be filled, and why the rest is skipped
const outcomes = await fill(plan, { waitMs: 1500 });          // optional; never submits
```

Node replay (uses the bundled mini-DOM):

```js
import { replay, transcript } from './src/replay.mjs';
console.log(transcript(await replay(html, { url, profile })));
```

The profile shape is defined by the resolvers in [`src/taxonomy.mjs`](src/taxonomy.mjs). [`test/fixtures/profile.json`](test/fixtures/profile.json) is a complete synthetic example.

## How classification works

[`src/classifier.mjs`](src/classifier.mjs) runs this pipeline:

1. **Collect** controls in document order, including those inside open shadow roots: `input`, `textarea`, `select`, ARIA comboboxes, `aria-haspopup="listbox"` dropdown buttons, `contenteditable`/`role=textbox`, radio groups, same-name checkbox groups, Yes/No button pairs and file inputs (including hidden inputs inside dropzones). It skips hidden steps. It drops select2/chosen chrome and fills the native `<select>` underneath instead.
2. **Extract text channels** for each control:
   - the accessible name (`aria-labelledby`, then `aria-label`, then `<label for>`, then a wrapping `<label>`, then the custom-element host's `label`)
   - proximity text: the largest ancestor that owns only this control, or failing that the nearest preceding sibling text
   - the label of a small (≤ 4 controls) fieldset or group, for split dates and phones
   - `name`/`id`/`data-automation-id`/`data-qa` tokens (`job_application[firstName]` → `job application first name`)
   - ancestor ids, `autocomplete`, input `type`, option texts and the nearest section heading
3. **Score** every entry in [`src/taxonomy.mjs`](src/taxonomy.mjs) with the weights in `WEIGHTS`:

   | Signal | Weight |
   | --- | --- |
   | adapter hint | 12 |
   | `autocomplete` | 10 |
   | attributes, explicit label, compound label | 6 |
   | proximity | 5 |
   | aria, ancestors, section, options, type | 3 |
   | repeater context | +4 |

   A `not` pattern turns a channel's positive match negative. Fields that only make sense inside a repeater (`work.start`, `work.company`, …) are ineligible outside a work or education context. Their non-repeating twins (`current_company`, `start_date`, …) lose 4 points inside one.
4. **Accept** the winner only if it scores at least `ACCEPT` (5) and leads the runner-up by at least `MARGIN` (2). Otherwise the field is reported as `ambiguous` (with its candidates) or `unmapped`. A guess is never written.
5. **Index repeaters.** Explicit numbers (`[0]`, `workExperience-2`, `school--1`) are dense-ranked per group. Without numbers, entries are indexed in document order. Date parts (`month`/`year`/`day`) are detected from tokens or option shapes.

## Filling framework-controlled inputs

[`src/fill.mjs`](src/fill.mjs) commits values with the `nativeInputValueSetter` pattern. It calls the prototype `value` setter, so React's per-instance value tracker never sees the write. It then dispatches `focus → input → change → blur`, which React, Vue `v-model` and Angular all observe. How each kind of control is filled:

- **Selects, radio groups and Yes/No pairs:** the engine picks the option with `matchOption()` (exact match first, then phrase containment, then all-token matches) and refuses affirmative answers on negated options.
- **Checkboxes:** toggled through `click()` only when the current state differs from the wanted one.
- **Comboboxes and listbox buttons:** the engine opens the popup, waits up to `waitMs` for `role=option`, and then clicks the best option.
- **Files:** attached through `DataTransfer` only when the profile supplies a real `File`.

The replay harness in [`src/replay.mjs`](src/replay.mjs) emulates React's tracker (`data-framework="react"`) and Vue `v-model` (`data-framework="vue"`). This lets the tests prove that a value reaches application state. One test also checks that a plain `el.value =` assignment does *not* reach that state.

## Adapters

Each adapter in [`src/adapters/`](src/adapters/) contributes detection (by host, or by a DOM signature when the form is embedded), attribute hints that outscore every generic signal, and button overrides. The contract is documented in [`src/adapters/index.mjs`](src/adapters/index.mjs).

| Adapter | Knows |
| --- | --- |
| `greenhouse` | classic `job_application[...]` boards plus the React job-boards app (React-Select, `question_<id>`), EEO names |
| `lever` | flat `name`s (`org`, `urls[LinkedIn]`, `eeo[...]`, disability signature as `human`) |
| `ashby` | `_systemfield_*` ids; Yes/No pairs come from the generic collector |
| `workday` | `data-automation-id` and `name--legalName--firstName` ids, listbox buttons, month/year dates, `workExperience-N`. On the footer button, "Save and Continue" is `advance` and "Submit" is `redline`. Create Account and Sign In are always `redline`. |
| `generic` | none: the generic signals do all the work |

[`src/adapters/preview.mjs`](src/adapters/preview.mjs) provides `buildPreview()` (pure: items and counts) and `renderOverlay()`. The overlay is drawn in its own shadow root with `pointer-events: none`, so it never intercepts input.

## Tests

```bash
npm test
```

There are 54 fixtures in [`test/fixtures/`](test/fixtures/), and each one is a complete oracle: every collected field and every red-line or advance button carries an expectation. The annotation grammar is documented at the top of [`test/adapters.test.mjs`](test/adapters.test.mjs). On every fixture the suite also checks that no form was submitted, that no guarded button received any event, and that the replay is byte-for-byte deterministic. The edge cases covered include nested and declarative shadow DOM, Greenhouse and Workday repeaters, EEO and CC-305 disability forms, split country/phone and date fields, React-Select, Headless UI and Workday dropdowns, select2/chosen, dropzones, multi-step wizards, and placeholder-only, table and `aria-labelledby` layouts.

The fixtures reconstruct publicly observable markup patterns as of 2026; they are not captured pages. ATS markup drifts, so when a platform changes, add a fixture before you change a weight.

## Playground

```bash
npm run playground
```

Then open <http://localhost:8137/docs/>. The playground lists every fixture, classifies it live in a sandboxed frame (no scripts, no form submission), draws the overlay, scores the `data-expect` annotations, and shows the exact event sequence a dry-run fill dispatches. You can also paste your own HTML.

## Limits

- **Frames and closed shadow roots:** cross-origin iframes (the Greenhouse `#grnhse_app` embed, for example) need the engine to run inside that frame, and closed shadow roots are invisible to it.
- **Popups that appear late:** popups that render after a network round-trip need a larger `waitMs`. Until an option appears, the fill reports `pending`.
- **The mini-DOM:** [`src/mini-dom.mjs`](src/mini-dom.mjs) implements only what the engine and its tests touch. It is not a general-purpose DOM.
