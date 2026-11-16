// Governance rules + the automatic checks every access request goes through before any human sees it.
import { conflicts, consentStatus } from './terms.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION } from './vocab.js';

/** Default rules. They are written into the GENESIS entry, so the rules themselves are on the record. */
export const DEFAULT_POLICY = Object.freeze({
  k_minimum: 10,               // never release from fewer than k compatible people (re-identification risk)
  max_duration_days: 730,      // no open-ended access
  min_reason_chars: 15,        // every vote needs a real reason, approvals included
  approvals_required: 3,       // of 5 panel seats
  community_approvals_required: 2, // ...and at least 2 approvals must come from community seats
  recipient_deletion_days: 30, // how long a recipient has to delete a withdrawn person's record
  panel: [
    { id: 'rev_youth', seat: 'youth', community: true, label: 'Youth representative' },
    { id: 'rev_lived', seat: 'lived_experience', community: true, label: 'Lived-experience representative' },
    { id: 'rev_chw', seat: 'community_health_worker', community: true, label: 'Community health worker' },
    { id: 'rev_steward', seat: 'data_steward', community: false, label: 'Data steward' },
    { id: 'rev_ethics', seat: 'ethics', community: false, label: 'Research-ethics reviewer' },
  ],
});

export const CONFLICT_LABELS = {
  purpose_not_allowed: 'did not allow this purpose',
  user_type_not_permitted: 'did not allow this kind of organisation',
  data_category_not_allowed: 'did not share one or more requested data types',
  cross_border_not_allowed: 'did not allow data to leave Nigeria',
  less_protection_than_required: 'asked for totals only, but the request wants records',
  benefit_terms_not_met: 'require a benefit the request does not promise',
  consent_expires_during_access: 'consent ends before the access period would end',
  withdrawn: 'withdrew consent',
  expired: 'consent has expired',
};

/** Shape and vocabulary checks on the request itself. */
export function requestProblems(r, policy = DEFAULT_POLICY) {
  const p = [];
  const need = (c, code, msg) => { if (!c) p.push({ code, message: msg }); };
  need(r?.requester?.name?.trim() && r?.requester?.organisation?.trim(), 'REQUESTER_MISSING', 'Requester name and organisation are required.');
  need(r?.requester?.type in PERMITTED_USERS, 'REQUESTER_TYPE_UNKNOWN', 'Requester type must be one of the commons vocabulary.');
  need(r?.purpose?.code in PURPOSES, 'PURPOSE_UNKNOWN', 'Purpose must be one of the commons vocabulary.');
  need((r?.purpose?.description ?? '').trim().length >= 40, 'PURPOSE_TOO_VAGUE', 'Describe the purpose in at least 40 characters, in plain words.');
  need(Array.isArray(r?.data_categories) && r.data_categories.length > 0 && r.data_categories.every((c) => c in DATA_CATEGORIES), 'CATEGORIES_INVALID', 'Pick at least one known data category.');
  need(r?.deidentification in DEIDENTIFICATION, 'DEID_UNKNOWN', 'Pick a de-identification level.');
  const d = Number(r?.duration_days);
  need(Number.isInteger(d) && d > 0, 'DURATION_INVALID', 'Duration must be a whole number of days.');
  need(!(d > policy.max_duration_days), 'DURATION_TOO_LONG', `Access may not exceed ${policy.max_duration_days} days.`);
  need(Array.isArray(r?.benefit_commitments) && r.benefit_commitments.length > 0 && r.benefit_commitments.every((b) => b in BENEFITS), 'NO_BENEFIT_PLAN', 'Commit to at least one benefit for the community.');
  need((r?.benefit_description ?? '').trim().length >= 30, 'BENEFIT_TOO_VAGUE', 'Explain in at least 30 characters how the community benefits.');
  return p;
}

/**
 * Run every automatic check against the consent pool. Pure function: same inputs, same answer.
 * Returns which people's data could be included, how many were excluded and why, hard blocks and warnings.
 */
export function runChecks(request, consents, policy = DEFAULT_POLICY, at = new Date(), releases = new Map()) {
  const blocks = requestProblems(request, policy);
  const warnings = [];
  const eligible = [];
  const excluded = {};
  const bump = (k) => { excluded[k] = (excluded[k] ?? 0) + 1; };
  const all = [...consents.values()];
  if (!blocks.length) {
    const cohort = request.cohort?.record_ids?.length ? request.cohort : null;
    if (cohort) {
      // A follow-up on an earlier release names that release's record IDs. It must not touch anyone whose
      // consent is gone or does not cover the new request: one bad record blocks the whole request.
      const rel = releases.get(cohort.release_id);
      const bad = { withdrawn: 0, expired: 0, conflict: 0, unknown: 0 };
      for (const rid of cohort.record_ids) {
        const ref = rel?.subjects.get(rid);
        const c = ref && consents.get(ref);
        if (!c) { bad.unknown++; continue; }
        const st = consentStatus(c, at);
        if (st !== 'active') { bad[st]++; continue; }
        if (conflicts(c.terms, request, { at }).length) bad.conflict++; else eligible.push(ref);
      }
      if (!rel) blocks.push({ code: 'COHORT_UNKNOWN_RELEASE', message: 'The cohort refers to a release this commons never made.' });
      if (bad.withdrawn) blocks.push({ code: 'COHORT_TOUCHES_WITHDRAWN', message: `${bad.withdrawn} person(s) in the requested cohort have withdrawn consent.` });
      if (bad.expired) blocks.push({ code: 'COHORT_TOUCHES_EXPIRED', message: `${bad.expired} person(s) in the requested cohort have expired consent.` });
      if (bad.conflict) blocks.push({ code: 'COHORT_CONFLICTS_TERMS', message: `${bad.conflict} person(s) in the requested cohort did not consent to these terms.` });
      if (rel && bad.unknown) blocks.push({ code: 'COHORT_UNKNOWN_RECORD', message: `${bad.unknown} record ID(s) are not part of that release.` });
    } else {
      for (const c of all) {
        const st = consentStatus(c, at);
        if (st !== 'active') { bump(st); continue; }
        const why = conflicts(c.terms, request, { at });
        if (why.length) why.forEach(bump); else eligible.push(c.terms.subject_ref);
      }
    }
    if (eligible.length < policy.k_minimum) {
      blocks.push({ code: 'BELOW_K_MINIMUM', message: `Only ${eligible.length} people's consent covers this request. The minimum is ${policy.k_minimum}, because smaller groups are easier to re-identify.` });
    }
    if (request.data_categories.includes('chat_transcripts') || request.data_categories.includes('voice_audio')) {
      warnings.push({ code: 'HIGH_SENSITIVITY', message: 'Asks for chat text or voice: the most sensitive data. Panel should check the de-identification plan.' });
    }
    if (request.cross_border_transfer) warnings.push({ code: 'CROSS_BORDER', message: 'Data would leave Nigeria. Check legal basis and where it will be stored.' });
    if (request.purpose.code === 'ai_training_commercial') warnings.push({ code: 'COMMERCIAL_AI', message: 'Commercial AI training: check the community-fund commitment is concrete.' });
    const active = all.filter((c) => consentStatus(c, at) === 'active').length;
    if (!cohort && active && eligible.length / active < 0.5) warnings.push({ code: 'LOW_COVERAGE', message: `Only ${Math.round(100 * eligible.length / active)}% of active consents cover this request; results may not represent the community.` });
  }
  const activeCount = all.filter((c) => consentStatus(c, at) === 'active').length;
  return { passed: blocks.length === 0, eligible_count: eligible.length, eligible, excluded, active_consents: activeCount, blocks, warnings, checked_at: new Date(at).toISOString() };
}

/** Count votes for the CURRENT request digest only, and apply the quorum rule. */
export function tally(votes, digest, policy = DEFAULT_POLICY) {
  const seat = Object.fromEntries(policy.panel.map((m) => [m.id, m]));
  const valid = votes.filter((v) => v.request_digest === digest && seat[v.reviewer_id]);
  const latest = new Map(valid.map((v) => [v.reviewer_id, v])); // one vote per seat
  const list = [...latest.values()];
  const approvals = list.filter((v) => v.vote === 'approve');
  const rejections = list.filter((v) => v.vote === 'reject');
  const communityApprovals = approvals.filter((v) => seat[v.reviewer_id].community).length;
  const communitySeats = policy.panel.filter((m) => m.community).length;
  const remaining = policy.panel.length - list.length;
  const communityRemaining = policy.panel.filter((m) => m.community && !latest.has(m.id)).length;
  let outcome = 'pending';
  if (approvals.length >= policy.approvals_required && communityApprovals >= policy.community_approvals_required) outcome = 'approved';
  else if (approvals.length + remaining < policy.approvals_required || communityApprovals + communityRemaining < policy.community_approvals_required) outcome = 'rejected';
  return { outcome, approvals: approvals.length, rejections: rejections.length, community_approvals: communityApprovals, community_seats: communitySeats, voted: list.length, seats: policy.panel.length };
}
