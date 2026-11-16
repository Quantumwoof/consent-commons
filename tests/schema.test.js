import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { schemas } from '../scripts/gen-schema.js';
import { seedCommons } from '../src/core/seed.js';
import { createSigner } from '../src/core/signer.js';

const NAMES = ['consent-terms', 'access-request', 'release-manifest', 'ledger-entry', 'consent-receipt'];
function ajv() {
  const a = new Ajv({ allErrors: true, strict: false }); addFormats(a);
  for (const n of NAMES) a.addSchema(JSON.parse(readFileSync(new URL(`../schema/${n}.v1.json`, import.meta.url))), `${n}.v1.json`);
  return a;
}
const check = (a, name, doc) => { const v = a.getSchema(`${name}.v1.json`); const ok = v(doc); assert.ok(ok, `${name}: ${JSON.stringify(v.errors)}`); };

test('committed schemas are exactly what the vocabulary generates (no drift)', () => {
  for (const [file, s] of Object.entries(schemas())) assert.deepEqual(JSON.parse(readFileSync(new URL(`../schema/${file}`, import.meta.url))), s, `${file} is stale: run node scripts/gen-schema.js`);
});
test('every document the system produces validates against the published schemas', async () => {
  const a = ajv();
  const { commons, people } = await seedCommons({ signer: await createSigner() });
  const s = await commons.state();
  for (const e of commons.entries) {
    check(a, 'ledger-entry', e);
    if (e.type === 'CONSENT_GRANTED') check(a, 'consent-terms', e.data.terms);
    if (e.type === 'ACCESS_REQUESTED') check(a, 'access-request', e.data.request);
    if (e.type === 'DATA_RELEASED') check(a, 'release-manifest', e.data.manifest);
  }
  const person = people.find((p) => s.consents.get(p.subject_ref).status === 'active');
  const c = s.consents.get(person.subject_ref);
  check(a, 'consent-receipt', await commons.reissueReceipt(c.granted_seq));
  const { receipt } = await commons.withdraw(person.code);
  check(a, 'consent-receipt', receipt);
});
test('schemas reject what they should', () => {
  const a = ajv();
  const v = a.getSchema('consent-terms.v1.json');
  assert.equal(v({ schema_version: '1.0.0' }), false);
  const ex = JSON.parse(readFileSync(new URL('../examples/consent-terms.example.json', import.meta.url)));
  assert.equal(v(ex), true, JSON.stringify(v.errors));
  assert.equal(v({ ...ex, withdrawal: { ...ex.withdrawal, allowed: false } }), false);
  assert.equal(v({ ...ex, purposes: { allowed: ['sell_to_anyone'], denied: [] } }), false);
  assert.equal(v({ ...ex, name: 'Real Name' }), false, 'no extra fields such as a name');
});
