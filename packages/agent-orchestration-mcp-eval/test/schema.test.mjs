import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSupportedSchema, validate } from '../src/schema.mjs';

test('validate reports type, enum, range, length, items and object-shape errors', () => {
  const schema = {
    type: 'object',
    required: ['a'],
    properties: {
      a: { type: 'number', minimum: 0, exclusiveMinimum: 0 },
      b: { type: 'string', enum: ['x', 'y'], minLength: 1 },
      c: { type: 'array', items: { type: 'integer' } },
    },
    additionalProperties: false,
  };
  assert.deepEqual(validate(schema, { a: 1, b: 'x', c: [1, 2] }), []);
  assert.equal(validate(schema, { a: 0 }).length, 1);
  assert.equal(validate(schema, { b: 'z', c: [1.5], extra: true }).length, 4);
});

test('number type rejects NaN and Infinity', () => {
  assert.equal(validate({ type: 'number' }, NaN).length, 1);
  assert.equal(validate({ type: 'number' }, Infinity).length, 1);
});

test('unsupported keywords are rejected at registration, including nested ones', () => {
  assert.throws(() => assertSupportedSchema({ type: 'object', oneOf: [] }), /unsupported keyword "oneOf"/);
  assert.throws(() => assertSupportedSchema({ type: 'object', properties: { a: { format: 'uri' } } }), /unsupported keyword "format"/);
});

test('malformed keyword values are rejected at registration', () => {
  const bad = [
    [{ type: 'strnig' }, /"type" must name known types/],
    [{ type: [] }, /"type" must name known types/],
    [{ required: 'abc' }, /"required" must be an array of strings/],
    [{ required: [1] }, /"required" must be an array of strings/],
    [{ enum: [] }, /"enum" must be a non-empty array/],
    [{ minimum: '5' }, /"minimum" must be a finite number/],
    [{ maximum: Infinity }, /"maximum" must be a finite number/],
    [{ minLength: -1 }, /"minLength" must be a non-negative integer/],
    [{ properties: ['x'] }, /"properties" must be an object/],
    [{ additionalProperties: 'no' }, /"additionalProperties" must be a boolean or a schema/],
    [{ items: [] }, /"items" must be a schema object/],
    [{ properties: { a: { type: 'nope' } } }, /properties\.a: keyword "type"/],
  ];
  for (const [schema, re] of bad) assert.throws(() => assertSupportedSchema(schema), re, JSON.stringify(schema));
  assert.doesNotThrow(() => assertSupportedSchema({ type: ['string', 'null'], required: [], properties: {}, additionalProperties: false }));
});

test('required does not see inherited properties', () => {
  assert.deepEqual(validate({ type: 'object', required: ['constructor', 'toString'] }, {}), [
    '$: missing required property "constructor"',
    '$: missing required property "toString"',
  ]);
});
