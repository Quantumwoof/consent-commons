// Generates the JSON Schemas in /schema from the vocabulary in src/core/vocab.js, so the code and the
// published schemas can never drift apart. `npm test` fails if the committed schemas are out of date.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, LANGUAGES, TRANSLATION_STATUS, COLLECTION_CHANNELS, SCHEMA_VERSION, SCHEMA_BASE, WITHDRAWAL_EFFECT } from '../src/core/vocab.js';
import { ENTRY_TYPES } from '../src/core/ledger.js';

const K = Object.keys;
const desc = (o) => K(o).map((k) => `${k}: ${typeof o[k] === 'string' ? o[k] : o[k].label}`).join(' | ');
const hex64 = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const dt = { type: 'string', format: 'date-time' };
const set = (o, min = 1) => ({ type: 'array', items: { enum: K(o) }, uniqueItems: true, minItems: min, description: desc(o) });
const sig = {
  type: 'object', required: ['alg', 'key_id', 'public_key', 'value'], additionalProperties: false,
  description: 'Ed25519 signature over the canonical JSON (sorted keys, no whitespace) of the document without this field.',
  properties: { alg: { const: 'Ed25519' }, key_id: { type: 'string', pattern: '^[0-9a-f]{16}$' }, public_key: { type: 'object', required: ['kty', 'crv', 'x'], properties: { kty: { const: 'OKP' }, crv: { const: 'Ed25519' }, x: { type: 'string' } } }, value: { type: 'string' } },
};

export function schemas() {
  const id = (n) => `${SCHEMA_BASE}/${n}`;
  const terms = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id('consent-terms.v1.json'),
    title: 'Consent terms v1',
    description: 'One person\'s consent to a data commons, in machine-readable form. Designed to travel with the data: any recipient can check a request or a use against it. Pseudonymous: contains no name, phone number or address.',
    type: 'object', additionalProperties: false,
    required: ['schema_version', 'terms_id', 'commons', 'subject_ref', 'language', 'notice', 'granted_at', 'expires_at', 'purposes', 'data_categories', 'permitted_users', 'deidentification', 'cross_border_transfer', 'benefit_sharing', 'withdrawal', 'comprehension', 'synthetic'],
    properties: {
      $schema: { type: 'string' },
      schema_version: { const: SCHEMA_VERSION },
      terms_id: { type: 'string', pattern: '^ct_[0-9a-f]{16}$' },
      commons: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string', minLength: 1 }, name: { type: 'string', minLength: 1 } } },
      subject_ref: { type: 'string', pattern: '^p_[0-9a-f]{16}$', description: 'Random pseudonym. Never a name, phone number or ID number.' },
      language: { enum: K(LANGUAGES), description: 'BCP-47 code of the language the person read: ' + desc(LANGUAGES) },
      notice: { type: 'object', additionalProperties: false, required: ['version', 'digest', 'translation_status'], description: 'Which exact wording was shown: SHA-256 of the canonical notice text, and whether its translation was reviewed.', properties: { version: { type: 'string' }, digest: hex64, translation_status: { enum: TRANSLATION_STATUS } } },
      granted_at: dt, expires_at: dt,
      purposes: { type: 'object', additionalProperties: false, required: ['allowed', 'denied'], description: 'Deny by default: anything not in allowed is denied. ' + desc(PURPOSES), properties: { allowed: set(PURPOSES), denied: set(PURPOSES, 0) } },
      data_categories: set(DATA_CATEGORIES),
      permitted_users: set(PERMITTED_USERS),
      deidentification: { enum: K(DEIDENTIFICATION), description: 'Minimum protection required. ' + desc(DEIDENTIFICATION) },
      cross_border_transfer: { type: 'boolean', description: 'May the data be stored or used outside Nigeria?' },
      benefit_sharing: { type: 'object', additionalProperties: false, required: ['required'], properties: { required: { ...set(BENEFITS, 0), description: 'A request must commit to ALL of these to include this person. ' + desc(BENEFITS) } } },
      withdrawal: { type: 'object', additionalProperties: false, required: ['allowed', 'effect', 'recipient_deletion_days'], properties: { allowed: { const: true }, effect: { const: WITHDRAWAL_EFFECT }, recipient_deletion_days: { type: 'integer', minimum: 1, maximum: 90 } } },
      recontact_allowed: { type: 'boolean' },
      comprehension: { type: 'object', additionalProperties: false, required: ['questions', 'correct_first_try', 'attempts', 'passed'], properties: { questions: { type: 'integer', minimum: 1 }, correct_first_try: { type: 'integer', minimum: 0 }, attempts: { type: 'integer', minimum: 1 }, passed: { const: true } } },
      collected_via: { type: 'string', description: 'How the consent was collected. Informational only; changes no rule. Known values: ' + desc(COLLECTION_CHANNELS) },
      synthetic: { type: 'boolean', description: 'True for demo data. Real deployments set false.' },
    },
  };
  const request = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id('access-request.v1.json'),
    title: 'Access request v1', description: 'A researcher\'s request to use data from the commons. Its SHA-256 digest (canonical JSON) is what reviewers vote on.',
    type: 'object', additionalProperties: false,
    required: ['request_id', 'version', 'submitted_at', 'requester', 'purpose', 'data_categories', 'deidentification', 'duration_days', 'cross_border_transfer', 'benefit_commitments', 'benefit_description'],
    properties: {
      request_id: { type: 'string', pattern: '^ar_[0-9a-z_]+$' }, version: { type: 'integer', minimum: 1 }, submitted_at: dt,
      requester: { type: 'object', additionalProperties: false, required: ['name', 'organisation', 'type'], properties: { name: { type: 'string', minLength: 1 }, organisation: { type: 'string', minLength: 1 }, type: { enum: K(PERMITTED_USERS) }, country: { type: 'string', pattern: '^[A-Z]{2}$' }, contact: { type: 'string' } } },
      purpose: { type: 'object', additionalProperties: false, required: ['code', 'description'], properties: { code: { enum: K(PURPOSES) }, description: { type: 'string', minLength: 40 } } },
      data_categories: set(DATA_CATEGORIES),
      deidentification: { enum: K(DEIDENTIFICATION) },
      duration_days: { type: 'integer', minimum: 1 },
      cross_border_transfer: { type: 'boolean' },
      cohort: { type: 'object', additionalProperties: false, required: ['release_id', 'record_ids'], description: 'Optional: a follow-up on named records from an earlier release.', properties: { release_id: { type: 'string' }, record_ids: { type: 'array', items: { type: 'string', pattern: '^r_[0-9a-f]{16}$' }, minItems: 1 } } },
      benefit_commitments: set(BENEFITS),
      benefit_description: { type: 'string', minLength: 30 },
    },
  };
  const manifest = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id('release-manifest.v1.json'),
    title: 'Release manifest v1', description: 'Travels with every released dataset: who received it, under which binding terms, which approval allowed it, and which consent terms each record came from.',
    type: 'object', additionalProperties: false,
    required: ['manifest_version', 'release_id', 'commons', 'released_at', 'recipient', 'request', 'approval', 'terms', 'obligations', 'records', 'record_count', 'dataset_digest', 'ledger_head_before_release', 'synthetic'],
    properties: {
      $schema: { type: 'string' }, manifest_version: { const: SCHEMA_VERSION }, release_id: { type: 'string' }, commons: terms.properties.commons, released_at: dt,
      recipient: request.properties.requester,
      request: { type: 'object', required: ['request_id', 'version', 'request_digest'], properties: { request_id: { type: 'string' }, version: { type: 'integer' }, request_digest: hex64 } },
      approval: { type: 'object', required: ['decision_entry', 'tally', 'vote_entries'], properties: { decision_entry: hex64, tally: { type: 'object' }, vote_entries: { type: 'array', items: hex64 } } },
      terms: { type: 'object', required: ['purpose', 'data_categories', 'deidentification', 'cross_border_transfer', 'access_ends_at', 'onward_sharing', 'reidentification_attempts', 'on_expiry', 'on_withdrawal_notice', 'consent_scope'], properties: { purpose: { enum: K(PURPOSES) }, data_categories: set(DATA_CATEGORIES), deidentification: { enum: K(DEIDENTIFICATION) }, cross_border_transfer: { type: 'boolean' }, access_ends_at: dt, onward_sharing: { const: false }, reidentification_attempts: { const: 'forbidden' } } },
      obligations: { type: 'array', items: { type: 'object', required: ['code', 'description', 'due'], properties: { code: { enum: K(BENEFITS) }, description: { type: 'string' }, due: dt } } },
      records: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['record_id', 'terms_digest'], properties: { record_id: { type: 'string', pattern: '^r_[0-9a-f]{16}$' }, terms_digest: hex64 } } },
      record_count: { type: 'integer', minimum: 0 }, dataset_digest: hex64, ledger_head_before_release: hex64, synthetic: { type: 'boolean' }, signature: sig,
    },
  };
  const entry = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id('ledger-entry.v1.json'),
    title: 'Ledger entry v1', description: 'One line of the append-only ledger (JSON Lines). hash = SHA-256 of the canonical JSON of every other field; prev = hash of the entry before (64 zeros for the first).',
    type: 'object', additionalProperties: false, required: ['v', 'seq', 'ts', 'type', 'actor', 'data', 'prev', 'hash'],
    properties: { v: { const: 1 }, seq: { type: 'integer', minimum: 0 }, ts: dt, type: { enum: ENTRY_TYPES }, actor: { type: 'string' }, data: { type: 'object' }, prev: hex64, hash: hex64 },
  };
  const receipt = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: id('consent-receipt.v1.json'),
    title: 'Consent or withdrawal receipt v1', description: 'What a person keeps. Proves what they agreed to (or withdrew), when, and where it sits in the ledger. Signed by the commons.',
    type: 'object', required: ['receipt_version', 'kind', 'commons', 'ledger_entry', 'issued_at', 'terms_digest'],
    properties: {
      receipt_version: { const: SCHEMA_VERSION }, kind: { enum: ['consent_receipt', 'withdrawal_receipt'] }, commons: terms.properties.commons,
      terms: { $ref: 'consent-terms.v1.json' }, terms_id: { type: 'string' }, terms_digest: hex64, downstream_notices: { type: 'integer', minimum: 0 },
      ledger_entry: { type: 'object', required: ['seq', 'ts', 'type', 'hash', 'prev'], properties: { seq: { type: 'integer' }, ts: dt, type: { enum: ENTRY_TYPES }, hash: hex64, prev: hex64 } },
      issued_at: dt, synthetic: { type: 'boolean' }, signature: sig,
      withdrawal_code: { type: 'string', description: 'Private. Only in the copy the person downloads; never stored by the commons.' },
    },
  };
  return { 'consent-terms.v1.json': terms, 'access-request.v1.json': request, 'release-manifest.v1.json': manifest, 'ledger-entry.v1.json': entry, 'consent-receipt.v1.json': receipt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../schema/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, s] of Object.entries(schemas())) writeFileSync(new URL(name, dir), JSON.stringify(s, null, 2) + '\n');
  console.log('wrote', Object.keys(schemas()).join(', '));
}
