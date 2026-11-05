// Deterministic checks on one agent response against its contract.
// Contract (all fields besides anchor are optional; an absent check is reported as "skipped"):
//   anchor           string. The first non-empty line of the response must be exactly `ANCHOR: <anchor>`.
//   schema           JSON schema subset. Applied to the first ```json fenced block in the response.
//   forbiddenClaims  string[]. Case-insensitive literal phrases; any hit is a violation.
//   source           string[]. Lines of the cited source. Each citation `slice: L<a>-L<b> "<text>"` must match exactly.
import { assertSupportedSchema, validate } from './schema.mjs';

const SLICE_RE = /^\s*slice:\s*L(\d+)-L?(\d+)\s+("(?:[^"\\]|\\.)*")\s*$/;
// Any line that starts like a citation but does not parse as one is flagged, so a citation cannot dodge
// verification by using a near-miss format (non-ASCII digits, missing quotes, a typo in the range).
const SLICE_PREFIX_RE = /^\s*slice\s*:/i;
const JSON_BLOCK_RE = /```json[ \t]*\r?\n([\s\S]*?)\r?\n```/;

export const CONTRACT_SCHEMA = {
  type: 'object',
  required: ['anchor'],
  properties: {
    anchor: { type: 'string', minLength: 1, maxLength: 120 },
    schema: { type: 'object' },
    forbiddenClaims: { type: 'array', items: { type: 'string', minLength: 1 } },
    source: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
};

function checkAnchor(lines, anchor) {
  const first = lines.find(l => l.trim() !== '');
  if (first !== `ANCHOR: ${anchor}`) {
    return [`first line must be "ANCHOR: ${anchor}", found ${JSON.stringify(first ?? '')}`];
  }
  return [];
}

function checkSchema(response, schema) {
  const match = JSON_BLOCK_RE.exec(response);
  if (!match) return ['no ```json payload found in response'];
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch (e) {
    return [`json payload does not parse: ${e.message}`];
  }
  return validate(schema, payload);
}

// Forbidden-claim matching runs on a folded form of both texts: NFKD (fullwidth letters and ligatures map to ASCII),
// lowercased, combining marks and invisible format characters removed (zero-width space and joiners, soft hyphen, BOM,
// bidi controls), whitespace runs collapsed. "ｇｕａｒａｎｔｅｅｄ", "guar\u200Banteed" and "İMPOSSIBLE" all still match.
// Folding only ever widens what counts as a hit, so it can cause extra rejections but never a missed claim that exact
// matching would have caught.
export function foldForMatch(text) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}\u00AD]/gu, '')
    .replace(/\s+/gu, ' ');
}

function checkForbidden(response, phrases) {
  const haystack = foldForMatch(response);
  return phrases
    .filter(p => {
      const needle = foldForMatch(p);
      return needle.trim() !== '' && haystack.includes(needle);
    })
    .map(p => `forbidden claim present: "${p}"`);
}

function checkCoordinates(lines, source) {
  const violations = [];
  let citations = 0;
  lines.forEach((line, i) => {
    const m = SLICE_RE.exec(line);
    if (!m) {
      if (SLICE_PREFIX_RE.test(line)) violations.push(`line ${i + 1}: malformed slice citation (expected slice: L<a>-L<b> "<text>")`);
      return;
    }
    citations++;
    const start = Number(m[1]);
    const end = Number(m[2]);
    const where = `line ${i + 1}`;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      violations.push(`${where}: slice coordinates out of range`);
      return;
    }
    if (start < 1 || end < start) {
      violations.push(`${where}: invalid slice range L${start}-L${end}`);
      return;
    }
    if (end > source.length) {
      violations.push(`${where}: slice L${start}-L${end} is past the end of the source (${source.length} lines)`);
      return;
    }
    let quoted;
    try {
      quoted = JSON.parse(m[3]);
    } catch {
      violations.push(`${where}: quoted slice text is not a valid JSON string`);
      return;
    }
    const actual = source.slice(start - 1, end).join('\n');
    if (quoted !== actual) {
      violations.push(`${where}: quoted text does not match source L${start}-L${end}`);
    }
  });
  return { violations, citations };
}

export function evaluateAgentResponse({ response, contract }) {
  const contractErrors = validate(CONTRACT_SCHEMA, contract, '$.contract');
  if (contractErrors.length) return { ok: false, reason: 'invalid contract', violations: [], errors: contractErrors };
  if (contract.schema) assertSupportedSchema(contract.schema, '$.contract.schema');

  const lines = response.split(/\r?\n/);
  const checks = {};
  const add = (name, violations, extra = {}) => {
    checks[name] = { status: violations.length ? 'fail' : 'pass', violations, ...extra };
  };

  add('anchor', checkAnchor(lines, contract.anchor));
  if (contract.schema) add('schema', checkSchema(response, contract.schema));
  else checks.schema = { status: 'skipped', violations: [] };
  if (contract.forbiddenClaims) add('forbiddenClaims', checkForbidden(response, contract.forbiddenClaims));
  else checks.forbiddenClaims = { status: 'skipped', violations: [] };
  if (contract.source) {
    const coords = checkCoordinates(lines, contract.source);
    add('coordinates', coords.violations, { citations: coords.citations });
  } else {
    checks.coordinates = { status: 'skipped', violations: [] };
  }

  const violations = Object.entries(checks).flatMap(([check, c]) => c.violations.map(message => ({ check, message })));
  return { ok: violations.length === 0, checks, violations };
}
