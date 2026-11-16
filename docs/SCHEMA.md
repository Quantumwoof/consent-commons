# Consent Commons schemas (v1.0.0)

Five JSON Schemas (draft 2020-12), published in [`/schema`](../schema) and served by the demo at `/schema/<name>.v1.json`. They're **generated** from [`src/core/vocab.js`](../src/core/vocab.js) by `node scripts/gen-schema.js`, and the tests fail if the committed files drift from the code.

| Schema | What it describes |
|---|---|
| [`consent-terms.v1.json`](../schema/consent-terms.v1.json) | One person's consent: the portable terms |
| [`access-request.v1.json`](../schema/access-request.v1.json) | A researcher's request; its digest is what reviewers vote on |
| [`release-manifest.v1.json`](../schema/release-manifest.v1.json) | Travels with every released dataset: binding terms, obligations, provenance |
| [`consent-receipt.v1.json`](../schema/consent-receipt.v1.json) | What the person keeps (consent or withdrawal), signed |
| [`ledger-entry.v1.json`](../schema/ledger-entry.v1.json) | One line of the hash-chained ledger |

Examples are in [`/examples`](../examples), regenerated with `node bin/commons.js seed`.

## Design rules

1. **Deny by default.** `purposes.denied` lists every purpose not allowed. A consumer must treat any code it doesn't recognise as denied.
2. **Pseudonymous only.** `subject_ref` is a random `p_` + 16 hex characters. `additionalProperties: false` means a document with a `name`, `phone` or similar field is invalid.
3. **A request must satisfy *every* term.** A person's data is included only if the request's purpose is allowed, the requester type is permitted, **every** requested data category is shared, cross-border is allowed (if requested), the requested form is at least as protective, **every** required benefit is promised, and the consent lasts until the access period ends. Reference implementation: `conflicts()` in [`src/core/terms.js`](../src/core/terms.js).
4. **Withdrawal is always allowed.** `withdrawal.allowed` is the constant `true`. Withdrawal stops all future releases. Recipients holding record-level copies must delete them within `recipient_deletion_days`. Totals that were already published can't be pulled back, and the chat says so.
5. **Proof of wording.** `notice.digest` is the SHA-256 of the canonical JSON `{version, lang, strings}` of the exact text shown. `notice.translation_status` is one of `draft_unreviewed`, `community_reviewed` or `professionally_verified`.
6. **Recorded only after understanding.** `comprehension.passed` is the constant `true`. Consent that wasn't understood isn't recorded at all.

## Fingerprints (digests)

Every digest is **SHA-256 over canonical JSON**: object keys sorted by UTF-16 code unit, no whitespace, `undefined` dropped, non-finite numbers rejected (the RFC 8785 approach, for the value types used here). To check a `terms_digest` yourself:

```js
import { digestOf } from './src/core/hash.js';
await digestOf(terms) === receipt.terms_digest;
```

A ledger entry's `hash` is the digest of the entry without its `hash` field. `prev` is the previous entry's `hash` (64 zeros for the first entry).

## Signatures

Receipts and manifests carry `signature = { alg: "Ed25519", key_id, public_key (JWK), value (base64url) }` over the canonical JSON of the document **without** `signature` (and without the person-only `withdrawal_code` on a downloaded receipt). `key_id` is the first 16 hex characters of the digest of the public JWK. The commons's key is declared in the ledger's GENESIS entry.

## Vocabulary

### Purposes (`purposes.allowed` / request `purpose.code`)

| Code | Meaning |
|---|---|
| `service_improvement` | Improving the community mental-health service the person uses |
| `public_health_research` | Non-commercial public-health research on youth mental health |
| `policy_statistics` | Anonymous totals for policy, planning and advocacy |
| `ai_training_noncommercial` | Training or testing open, non-commercial AI tools for mental-health support |
| `ai_training_commercial` | Training or testing AI products sold for profit |

### Data categories (least to most sensitive)

| Code | Meaning |
|---|---|
| `usage_metadata` | When and how often the service was used (no message content) |
| `demographics` | Age range, gender and state (no name, phone number or address) |
| `screening_scores` | Answers to wellbeing check questions, such as mood scores |
| `chat_transcripts` | What the person typed in chats, with names and numbers removed |
| `voice_audio` | Voice notes |

### Permitted users (`permitted_users` / request `requester.type`)

| Code | Meaning |
|---|---|
| `commons_stewards` | The commons team itself |
| `nigerian_public_researchers` | Universities and public-health researchers in Nigeria |
| `international_academic` | Universities outside Nigeria |
| `nonprofits` | Non-profit organisations |
| `government_health` | Government health agencies |
| `commercial` | Companies that make money from products |

### Benefits (`benefit_sharing.required` / request `benefit_commitments`)

| Code | Meaning |
|---|---|
| `results_back` | Results returned to the community in plain language |
| `open_access` | Findings published free for anyone to read |
| `community_credit` | The community is credited (acknowledgement or co-authorship) |
| `community_fund` | A share of funding or revenue goes to a community fund |
| `local_capacity` | Paid training or jobs for local researchers or health workers |

### De-identification (higher = stricter)

| Code | Meaning |
|---|---|
| `deidentified` | Record-level, with names, numbers and addresses removed |
| `aggregated_only` | Only totals and averages, never individual records |

## How a recipient uses a release manifest

1. Verify `signature` against the commons key published in the ledger's GENESIS entry.
2. Check `dataset_digest` equals the digest of the dataset received.
3. Treat `terms` as binding: use only for `terms.purpose`, only the listed `data_categories`, never share onward, never attempt re-identification, and delete everything at `access_ends_at`.
4. Deliver every item in `obligations` by its `due` date. Delivery is recorded in the ledger as `BENEFIT_DELIVERED` with evidence.
5. On a withdrawal notice naming a `record_id`, delete that record within the stated number of days and confirm.

## Versioning

`schema_version` follows semantic versioning. Adding an optional field or a new code is a **minor** change. Existing consents don't cover a new purpose code, which is the safe default, so people must be asked again. Removing or redefining a code, or changing a required field, is a **major** change and needs a new schema file (`*.v2.json`). The `$id` of each schema is its permanent URL in this repository.
