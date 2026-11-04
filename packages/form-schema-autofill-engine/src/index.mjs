// Public API. See ../README.md.
export { classify, collectControls, classifyButtons, explicitLabel, WEIGHTS, ACCEPT, MARGIN, REDLINE, ADVANCE } from './classifier.mjs';
export { planFill, fill, fillField, commitText, setNativeValue, nativeSetter, clickSafe, RedLineError } from './fill.mjs';
export { FIELDS, FIELD } from './taxonomy.mjs';
export { matchOption, COUNTRIES } from './profile.mjs';
export { ADAPTERS, detectPlatform } from './adapters/index.mjs';
export { buildPreview, renderOverlay, STATUS } from './adapters/preview.mjs';
