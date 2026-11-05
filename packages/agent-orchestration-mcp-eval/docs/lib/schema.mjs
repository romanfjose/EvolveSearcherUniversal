// Minimal JSON Schema subset, shared by MCP tool-input validation and agent-response contracts.
// Unsupported keywords are rejected when a schema is registered, so a constraint is never silently ignored.

const SUPPORTED = new Set([
  'type', 'enum', 'required', 'properties', 'additionalProperties', 'items',
  'minimum', 'maximum', 'exclusiveMinimum', 'minLength', 'maxLength', 'description', 'title',
]);

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const TYPES = new Set(['number', 'integer', 'object', 'array', 'string', 'boolean', 'null']);
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);
const isCount = v => Number.isInteger(v) && v >= 0;

// Each supported keyword must also carry a value of the right shape. A malformed value (required: "abc",
// type: "strnig", minimum: "5") would otherwise be misread or ignored, so it throws at registration too.
function keywordProblem(key, value) {
  switch (key) {
    case 'type': {
      const list = [].concat(value);
      if (list.length === 0 || !list.every(t => typeof t === 'string' && TYPES.has(t))) return 'must name known types';
      return null;
    }
    case 'enum': return Array.isArray(value) && value.length > 0 ? null : 'must be a non-empty array';
    case 'required': return Array.isArray(value) && value.every(k => typeof k === 'string') ? null : 'must be an array of strings';
    case 'properties': return isObject(value) ? null : 'must be an object';
    case 'additionalProperties': return typeof value === 'boolean' || isObject(value) ? null : 'must be a boolean or a schema';
    case 'items': return isObject(value) ? null : 'must be a schema object';
    case 'minimum': case 'maximum': case 'exclusiveMinimum': return isFiniteNumber(value) ? null : 'must be a finite number';
    case 'minLength': case 'maxLength': return isCount(value) ? null : 'must be a non-negative integer';
    case 'description': case 'title': return typeof value === 'string' ? null : 'must be a string';
    default: return 'is not supported';
  }
}

export function assertSupportedSchema(schema, where = 'schema') {
  if (!isObject(schema)) throw new Error(`${where}: schema must be an object`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`${where}: unsupported keyword "${key}" (fail closed)`);
    const problem = keywordProblem(key, schema[key]);
    if (problem) throw new Error(`${where}: keyword "${key}" ${problem} (fail closed)`);
  }
  for (const [name, sub] of Object.entries(schema.properties ?? {})) {
    assertSupportedSchema(sub, `${where}.properties.${name}`);
  }
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${where}.items`);
  if (isObject(schema.additionalProperties)) {
    assertSupportedSchema(schema.additionalProperties, `${where}.additionalProperties`);
  }
}

function matchesType(value, type) {
  switch (type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}

// Returns a list of human-readable errors with JSON-pointer-like paths. Empty list means valid.
export function validate(schema, value, path = '$', errors = []) {
  const types = schema.type === undefined ? null : [].concat(schema.type);
  if (types && !types.some(t => matchesType(value, t))) {
    errors.push(`${path}: expected ${types.join(' or ')}`);
    return errors;
  }
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: must be > ${schema.exclusiveMinimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`, errors));
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}: missing required property "${key}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(value)) {
      if (Object.hasOwn(props, key)) {
        validate(props[key], sub, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property "${key}"`);
      } else if (isObject(schema.additionalProperties)) {
        validate(schema.additionalProperties, sub, `${path}.${key}`, errors);
      }
    }
  }
  return errors;
}
