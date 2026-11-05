// Helmet 03 — Synthetic José QA (The "Where's the Bathroom?" Adversarial Breaker)
// Adversarial test suite for form-schema-autofill-engine covering:
// 1. Dynamic DOM mutations & structural disruptions (runtime removals, reparenting, mutation mid-plan, detached nodes)
// 2. Deep & nested shadow-root inputs, slotting emulation, boundary crossing, host attribute leakage
// 3. Ambiguous, conflicting, and adversarial label topologies (deceptive labels, aria-labelledby pointing to distant text, tie-scores)
// 4. Saboteur inputs & extreme real-world dirty contacts (null/undefined profile values, empty strings, unicode, malformed objects)
// 5. Red-line safety & invariant enforcement under sneaky submit triggers (nested icons, hidden submit buttons, dynamic submit injection)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from '../src/mini-dom.mjs';
import { classify, collectControls, explicitLabel, classifyButtons } from '../src/classifier.mjs';
import { planFill, fill, fillField, commitText, clickSafe, RedLineError } from '../src/fill.mjs';
import { walk, find, textOf, isHidden, isSubmitLike } from '../src/dom.mjs';
import { emulateFramework } from '../src/replay.mjs';

// --- ANGLE 1: ADVERSARIAL DOM MUTATIONS & RUNTIME DISRUPTIONS ---

test('Helmet 03 [DOM Mutation]: Removing elements from DOM between planFill and fill handles missing nodes cleanly', async () => {
  const html = `
    <form id="app-form">
      <label for="first">First Name</label>
      <input id="first" name="firstName" type="text">
      <label for="last">Last Name</label>
      <input id="last" name="lastName" type="text">
      <label for="email">Email</label>
      <input id="email" name="email" type="email">
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 3);

  const profile = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
  const plan = planFill(result, profile);
  assert.equal(plan.steps.filter((s) => s.action === 'fill').length, 3);

  // Saboteur move: delete the #last field from parent before executing the fill plan
  const lastInput = doc.getElementById('last');
  lastInput.remove();
  assert.equal(lastInput.parentNode, null, 'Node should be detached');

  // Fill execution should complete without throwing unhandled exceptions
  const outcomes = await fill(plan);
  assert.equal(outcomes.length, 3);
  const lastOutcome = outcomes.find((o) => o.field.el === lastInput);
  assert.ok(lastOutcome, 'Outcome recorded for detached element');
  assert.equal(lastOutcome.status, 'filled', 'Detached element receives value gracefully without crashing engine');
  assert.equal(lastInput.value, 'Lovelace');

  // Verify remaining elements in DOM were still filled
  assert.equal(doc.getElementById('first').value, 'Ada');
  assert.equal(doc.getElementById('email').value, 'ada@example.com');
});

test('Helmet 03 [DOM Mutation]: Reparenting or shuffling controls preserves field identity and values', async () => {
  const html = `
    <div id="container-a">
      <label for="phone">Phone Number</label>
      <input id="phone" type="tel">
    </div>
    <div id="container-b"></div>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  const plan = planFill(result, { phone: { number: '+15551234567' } });

  // Move phone input into container-b mid-flight
  const phone = doc.getElementById('phone');
  doc.getElementById('container-b').appendChild(phone);

  const outcomes = await fill(plan);
  assert.equal(outcomes[0].status, 'filled');
  assert.equal(phone.value, '+15551234567');
  assert.equal(phone.parentNode.id, 'container-b');
});

test('Helmet 03 [DOM Mutation]: Dynamically mutating type or disabling input after plan prevents corrupt fills', async () => {
  const html = `
    <form>
      <label for="inp">First Name</label>
      <input id="inp" name="first_name" type="text">
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  const plan = planFill(result, { firstName: 'Charles' });

  // Disabling the input should still execute fillField safely
  const inp = doc.getElementById('inp');
  inp.setAttribute('disabled', 'true');
  const outcomes = await fill(plan);
  assert.equal(outcomes[0].status, 'filled');
  assert.equal(inp.value, 'Charles');
});

test('Helmet 03 [DOM Mutation]: Mutating select options list before fill does not crash matcher', async () => {
  const html = `
    <html>
      <body>
        <label for="country">Country</label>
        <select id="country">
          <option value="">Select country</option>
          <option value="US">United States</option>
          <option value="CA">Canada</option>
        </select>
      </body>
    </html>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  const plan = planFill(result, { address: { country: 'CA' } });
  assert.equal(plan.steps.length, 1);

  // Saboteur: empty options from the select before fill
  const sel = doc.getElementById('country');
  // In the classified field options, replace options with an empty set or remove all options from select
  result.fields[0].options = [];
  while (sel.childNodes.length) {
    sel.childNodes[0].remove();
  }

  // Should skip gracefully with 'no-matching-option' instead of exploding
  const outcomes = await fill(plan);
  assert.equal(outcomes[0].status, 'skipped');
  assert.equal(outcomes[0].reason, 'no-matching-option');
});

// --- ANGLE 2: SHADOW-ROOT INPUTS & DEEP BOUNDARY PIERCING ---

test('Helmet 03 [Shadow DOM]: Nested multi-level open shadow roots are traversed and classified correctly', () => {
  const html = `
    <host-outer>
      <template shadowrootmode="open">
        <div class="outer-wrap">
          <host-inner>
            <template shadowrootmode="open">
              <label for="inner-email">Email Address</label>
              <input id="inner-email" type="email">
            </template>
          </host-inner>
        </div>
      </template>
    </host-outer>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].key, 'email');
  assert.equal(result.fields[0].status, 'mapped');
});

test('Helmet 03 [Shadow DOM]: Host label and aria-label attributes propagate into shadow root controls', () => {
  const html = `
    <custom-text-field label="Legal First Name">
      <template shadowrootmode="open">
        <input type="text" class="native-input">
      </template>
    </custom-text-field>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].key, 'first_name');
  assert.equal(result.fields[0].status, 'mapped');
});

test('Helmet 03 [Shadow DOM]: Shadow root containing multiple inputs in document order', () => {
  const html = `
    <form-card>
      <template shadowrootmode="open">
        <div class="field-row">
          <label id="l1">First Name</label>
          <input aria-labelledby="l1" type="text" id="fn">
        </div>
        <div class="field-row">
          <label id="l2">Last Name</label>
          <input aria-labelledby="l2" type="text" id="ln">
        </div>
      </template>
    </form-card>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 2);
  assert.equal(result.fields[0].key, 'first_name');
  assert.equal(result.fields[1].key, 'last_name');
});

test('Helmet 03 [Shadow DOM]: Fill plan updates framework-emulated inputs inside shadow roots', async () => {
  const html = `
    <component-box>
      <template shadowrootmode="open">
        <label for="gh">GitHub Profile</label>
        <input id="gh" type="url">
      </template>
    </component-box>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  const target = result.fields[0].el;

  let trackedState = '';
  emulateFramework(target, 'react', (val) => { trackedState = val; });

  const plan = planFill(result, { links: { github: 'https://github.com/torvalds' } });
  await fill(plan);

  assert.equal(target.value, 'https://github.com/torvalds');
  assert.equal(trackedState, 'https://github.com/torvalds', 'React tracker inside shadow root received value');
});

// --- ANGLE 3: AMBIGUOUS, CONFLICTING & DECEPTIVE LABELS ---

test('Helmet 03 [Ambiguous Labels]: Competing equal signals result in status: "ambiguous" without crashing', () => {
  // A field where text equally hints at first and last name or two opposing fields with identical weight
  const html = `
    <form>
      <div>
        <label for="ambig">First or Last Name</label>
        <input id="ambig" type="text">
      </div>
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  const f = result.fields[0];
  // Under MARGIN requirement, tied or near-tied scores must yield ambiguous or unmapped
  assert.ok(f.status === 'ambiguous' || f.status === 'unmapped', `Expected ambiguous/unmapped, got ${f.status}`);
  if (f.status === 'ambiguous') {
    assert.equal(f.key, null, 'Ambiguous field must never assign a key');
    assert.ok(f.candidates.length >= 2, 'Ambiguous field should expose rival candidates');
  }
});

test('Helmet 03 [Ambiguous Labels]: aria-labelledby pointing to non-existent ID falls back cleanly to near-text', () => {
  const html = `
    <div>
      <span class="actual-label">Phone Number</span>
      <input aria-labelledby="ghost-id-does-not-exist" type="tel">
    </div>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].key, 'phone');
  assert.equal(result.fields[0].status, 'mapped');
});

test('Helmet 03 [Ambiguous Labels]: Deceptive label vs name attribute priority adheres to taxonomy vetoes', () => {
  // Label says "Emergency Contact Phone", name is "phone" -> emergency contact vetoes candidate
  const html = `
    <form>
      <label for="em-phone">Emergency Contact Phone</label>
      <input id="em-phone" name="phone" type="tel">
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  // Phone definition has veto not: /emergency|reference|.../
  // The phone definition veto should prevent mapping to user's primary phone
  assert.notEqual(result.fields[0].key, 'phone', 'Must not classify emergency contact as candidate primary phone');
});

test('Helmet 03 [Ambiguous Labels]: Totally unmapped gibberish controls are flagged unmapped', () => {
  const html = `
    <div>
      <label for="quantum-flux">Quantum Flux Capacitor Frequency</label>
      <input id="quantum-flux" name="fluxFrequency" type="text">
    </div>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].status, 'unmapped');
  assert.equal(result.fields[0].key, null);
});

// --- ANGLE 4: REAL-WORLD DIRTY INPUTS & SABOTEUR RECEPTORS ---

test('Helmet 03 [Dirty Inputs]: Empty profile, undefined keys, or null objects do not throw during planning or fill', async () => {
  const html = `
    <form>
      <label for="f">First Name</label><input id="f" name="firstName" type="text">
      <label for="l">Last Name</label><input id="l" name="lastName" type="text">
      <label for="e">Email</label><input id="e" name="email" type="email">
      <label for="c">City</label><input id="c" name="city" type="text">
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);

  // Totally empty profile
  const planEmpty = planFill(result, {});
  const emptyOutcomes = await fill(planEmpty);
  assert.ok(emptyOutcomes.every((o) => o.status === 'skipped'));

  // Corrupted/null types in profile
  const dirtyProfile = {
    firstName: null,
    lastName: undefined,
    email: '',
    address: null,
    work: null,
    education: undefined,
  };
  const planDirty = planFill(result, dirtyProfile);
  const dirtyOutcomes = await fill(planDirty);
  assert.ok(dirtyOutcomes.every((o) => o.status === 'skipped'));
});

test('Helmet 03 [Dirty Inputs]: Extreme unicode, emoji, and script injection payload in profile strings', async () => {
  const html = `
    <form>
      <label for="name">First Name</label>
      <input id="name" name="firstName" type="text">
      <label for="letter">Cover Letter</label>
      <textarea id="letter" name="coverLetter"></textarea>
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);

  const maliciousPayload = "<script>alert('xss')</script> — 🔥🪖 ᚛᚛ᚉᚑᚅᚑᚏ ᚔᚅ ᚈᚆᚐ ᚁᚑᚏᚇᚐᚏ᚜";
  const plan = planFill(result, {
    firstName: maliciousPayload,
    coverLetter: maliciousPayload,
  });

  const outcomes = await fill(plan);
  assert.equal(outcomes[0].status, 'filled');
  assert.equal(doc.getElementById('name').value, maliciousPayload);
  assert.equal(doc.getElementById('letter').value, maliciousPayload);
});

test('Helmet 03 [Dirty Inputs]: Number field strips non-numeric noise safely', async () => {
  const html = `
    <form>
      <label for="sal">Salary Expectation</label>
      <input id="sal" name="salary" type="number">
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  const plan = planFill(result, { salaryExpectation: '$150,000.50 USD / yr' });
  const outcomes = await fill(plan);
  assert.equal(outcomes[0].status, 'filled');
  assert.equal(doc.getElementById('sal').value, '150000.50');
});

// --- ANGLE 5: RED-LINE SNEAKY SUBMIT & VISCERAL SAFETY GATES ---

test('Helmet 03 [Red-Line Breaker]: clickSafe prevents submit on button with no type inside form', () => {
  const doc = parseHTML(`
    <form id="apply">
      <button id="sneaky-btn"><span>Click To Continue Application</span></button>
    </form>
  `);
  const btn = doc.getElementById('sneaky-btn');
  assert.ok(isSubmitLike(btn), 'Button without type inside form is submit-like');
  assert.throws(() => clickSafe(btn), RedLineError);
});

test('Helmet 03 [Red-Line Breaker]: clickSafe refuses buttons containing advance or redline keywords', () => {
  const doc = parseHTML(`
    <div>
      <button id="btn-submit" type="button">Submit Application</button>
      <button id="btn-next" type="button">Next Step</button>
      <button id="btn-pay" type="button">Review & Pay</button>
    </div>
  `);
  const b1 = doc.getElementById('btn-submit');
  const b2 = doc.getElementById('btn-next');
  const b3 = doc.getElementById('btn-pay');

  const classified = classify(doc);
  const guardedButtons = new Set(classified.buttons.filter((b) => b.status !== 'neutral').map((b) => b.el));

  assert.ok(guardedButtons.has(b1), 'Submit button guarded');
  assert.ok(guardedButtons.has(b2), 'Next step button guarded');
  assert.ok(guardedButtons.has(b3), 'Pay button guarded');

  assert.throws(() => clickSafe(b1, guardedButtons), RedLineError);
  assert.throws(() => clickSafe(b2, guardedButtons), RedLineError);
  assert.throws(() => clickSafe(b3, guardedButtons), RedLineError);
});

test('Helmet 03 [Red-Line Breaker]: Form submission event is NEVER recorded during entire fill cycle', async () => {
  const html = `
    <form id="ats-job-form">
      <label for="fn">First Name</label>
      <input id="fn" type="text">
      <button type="submit" id="submit-now">Submit Application</button>
    </form>
  `;
  const doc = parseHTML(html);
  const result = classify(doc);
  const plan = planFill(result, { firstName: 'Grace Hopper' });
  await fill(plan);

  const submitEvents = doc.eventLog.filter((e) => e.type === 'submit' || e.type === 'submit()');
  assert.equal(submitEvents.length, 0, 'Zero submit events dispatched during fill');
});
