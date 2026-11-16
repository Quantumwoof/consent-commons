// Consent terms: build them from a person's choices, check them, and compare them with an access request.
import { canonicalize } from './canonical.js';
import { digestOf, newId } from './hash.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, LANGUAGES, TRANSLATION_STATUS,
  SCHEMA_VERSION, SCHEMA_BASE, WITHDRAWAL_EFFECT } from './vocab.js';

const DAY = 86400000;
const keys = (o) => Object.keys(o);
const uniq = (a) => [...new Set(a)];

/**
 * Turn the answers from the consent conversation into a portable consent-terms document (schema v1).
 * Anything not explicitly said yes to is recorded as a no ("deny by default").
 */
export function buildTerms(choices, { commons, now = new Date(), subjectRef, termsId, notice, comprehension, channel = 'web_chat_demo', synthetic = true }) {
  const allowed = uniq(choices.purposes ?? []).filter((p) => p in PURPOSES);
  const days = Number(choices.duration_days);
  return {
    $schema: `${SCHEMA_BASE}/consent-terms.v1.json`,
    schema_version: SCHEMA_VERSION,
    terms_id: termsId ?? newId('ct'),
    commons: { id: commons.id, name: commons.name },
    subject_ref: subjectRef ?? newId('p'),
    language: choices.language,
    notice,
    granted_at: new Date(now).toISOString(),
    expires_at: new Date(new Date(now).getTime() + days * DAY).toISOString(),
    purposes: { allowed, denied: keys(PURPOSES).filter((p) => !allowed.includes(p)) },
    data_categories: uniq(choices.data_categories ?? []).filter((c) => c in DATA_CATEGORIES),
    permitted_users: uniq(choices.permitted_users ?? []).filter((u) => u in PERMITTED_USERS),
    deidentification: choices.deidentification in DEIDENTIFICATION ? choices.deidentification : 'aggregated_only',
    cross_border_transfer: choices.cross_border_transfer === true,
    benefit_sharing: { required: uniq(choices.benefits ?? []).filter((b) => b in BENEFITS) },
    withdrawal: { allowed: true, effect: WITHDRAWAL_EFFECT, recipient_deletion_days: 30 },
    recontact_allowed: choices.recontact_allowed === true,
    comprehension,
    collected_via: channel,
    synthetic,
  };
}

/** Semantic validation (the JSON Schema in /schema covers shape; this also covers meaning). Returns a list of problems. */
export function validateTerms(t) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  need(t && typeof t === 'object', 'terms must be an object');
  if (!t || typeof t !== 'object') return p;
  need(t.schema_version === SCHEMA_VERSION, `schema_version must be ${SCHEMA_VERSION}`);
  need(/^ct_[0-9a-f]{16}$/.test(t.terms_id ?? ''), 'terms_id must look like ct_ + 16 hex characters');
  need(/^p_[0-9a-f]{16}$/.test(t.subject_ref ?? ''), 'subject_ref must be a pseudonym (p_ + 16 hex), never a name or phone number');
  need(t.language in LANGUAGES, 'language must be one of ' + keys(LANGUAGES).join(', '));
  need(t.notice && /^[0-9a-f]{64}$/.test(t.notice.digest ?? '') && TRANSLATION_STATUS.includes(t.notice.translation_status),
    'notice must record the digest of the exact wording shown and its translation status');
  need(!Number.isNaN(Date.parse(t.granted_at)) && !Number.isNaN(Date.parse(t.expires_at)), 'granted_at and expires_at must be dates');
  need(Date.parse(t.expires_at) > Date.parse(t.granted_at), 'consent must expire after it was granted');
  need(Array.isArray(t.purposes?.allowed) && t.purposes.allowed.length > 0, 'at least one purpose must be allowed (otherwise nothing should be recorded)');
  for (const x of t.purposes?.allowed ?? []) need(x in PURPOSES, `unknown purpose ${x}`);
  need(Array.isArray(t.data_categories) && t.data_categories.length > 0, 'at least one data category is required');
  for (const x of t.data_categories ?? []) need(x in DATA_CATEGORIES, `unknown data category ${x}`);
  need(Array.isArray(t.permitted_users) && t.permitted_users.length > 0, 'at least one permitted user type is required');
  for (const x of t.permitted_users ?? []) need(x in PERMITTED_USERS, `unknown user type ${x}`);
  need(t.deidentification in DEIDENTIFICATION, 'unknown deidentification level');
  for (const x of t.benefit_sharing?.required ?? []) need(x in BENEFITS, `unknown benefit ${x}`);
  need(t.withdrawal?.allowed === true, 'withdrawal must always be allowed');
  need(t.comprehension?.passed === true, 'consent may only be recorded after the comprehension check is passed');
  if ((t.purposes?.allowed ?? []).includes('ai_training_commercial')) need((t.permitted_users ?? []).includes('commercial'), 'commercial AI training allowed but commercial users are not: contradictory');
  return p;
}

export const termsDigest = (t) => digestOf(t);

/** Status of a consent at a moment in time. */
export function consentStatus(c, at = new Date()) {
  if (c.status === 'withdrawn') return 'withdrawn';
  if (Date.parse(c.terms.expires_at) <= new Date(at).getTime()) return 'expired';
  return 'active';
}

/**
 * Why a single person's consent does NOT cover a request. Empty list = compatible.
 * This is the heart of "the terms travel with the data": the same function runs at review time,
 * again at release time, and can be run by anyone holding a release manifest.
 */
export function conflicts(terms, request, { at = new Date() } = {}) {
  const out = [];
  const accessEnd = new Date(new Date(at).getTime() + Number(request.duration_days) * DAY);
  if (!terms.purposes.allowed.includes(request.purpose.code)) out.push('purpose_not_allowed');
  if (!terms.permitted_users.includes(request.requester.type)) out.push('user_type_not_permitted');
  if (!request.data_categories.every((c) => terms.data_categories.includes(c))) out.push('data_category_not_allowed');
  if (request.cross_border_transfer && !terms.cross_border_transfer) out.push('cross_border_not_allowed');
  if (DEIDENTIFICATION[request.deidentification].rank < DEIDENTIFICATION[terms.deidentification].rank) out.push('less_protection_than_required');
  if (!terms.benefit_sharing.required.every((b) => request.benefit_commitments.includes(b))) out.push('benefit_terms_not_met');
  if (Date.parse(terms.expires_at) < accessEnd.getTime()) out.push('consent_expires_during_access');
  return out;
}

/** The strictest terms shared by a set of consents: what a recipient is bound by. */
export function effectiveTerms(termsList) {
  const inter = (arrs) => arrs.reduce((a, b) => a.filter((x) => b.includes(x)));
  const union = (arrs) => uniq(arrs.flat());
  if (!termsList.length) return null;
  return {
    purposes_allowed: inter(termsList.map((t) => t.purposes.allowed)),
    data_categories: inter(termsList.map((t) => t.data_categories)),
    permitted_users: inter(termsList.map((t) => t.permitted_users)),
    deidentification: termsList.map((t) => t.deidentification).sort((a, b) => DEIDENTIFICATION[b].rank - DEIDENTIFICATION[a].rank)[0],
    cross_border_transfer: termsList.every((t) => t.cross_border_transfer),
    benefit_sharing_required: union(termsList.map((t) => t.benefit_sharing.required)),
    earliest_expiry: termsList.map((t) => t.expires_at).sort()[0],
    withdrawal: { allowed: true, recipient_deletion_days: Math.min(...termsList.map((t) => t.withdrawal.recipient_deletion_days)) },
  };
}

export { canonicalize };
