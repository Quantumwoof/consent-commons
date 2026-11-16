import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../src/core/canonical.js';
import { digestOf, normaliseCode, newPersonalCode } from '../src/core/hash.js';

test('canonical JSON ignores key order and whitespace', async () => {
  assert.equal(canonicalize({ b: 2, a: [1, { d: 1, c: 'x' }] }), '{"a":[1,{"c":"x","d":1}],"b":2}');
  assert.equal(await digestOf({ a: 1, b: 2 }), await digestOf({ b: 2, a: 1 }));
  assert.notEqual(await digestOf({ a: 1 }), await digestOf({ a: '1' }));
});
test('canonical JSON drops undefined keys and refuses non-finite numbers', () => {
  assert.equal(canonicalize({ a: undefined, b: null }), '{"b":null}');
  assert.throws(() => canonicalize({ x: NaN }));
  assert.throws(() => canonicalize({ x: Infinity }));
});
test('known SHA-256 vector', async () => {
  const { sha256Hex } = await import('../src/core/hash.js');
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('personal codes: 80 bits, grouped, forgiving to type', () => {
  const c = newPersonalCode();
  assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.notEqual(c, newPersonalCode());
  assert.equal(normaliseCode(' 7kq2 m9xa-t4pb w3hc '), '7KQ2-M9XA-T4PB-W3HC');
  assert.equal(normaliseCode('O0IL'), '0011');
});
