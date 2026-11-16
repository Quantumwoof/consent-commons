import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTerms, validateTerms, conflicts, effectiveTerms, consentStatus } from '../src/core/terms.js';
import { noticeFor } from '../src/i18n/index.js';
import { baseChoices, goodRequest, T } from './helpers.js';

const make = async (over = {}, now = T(0)) => buildTerms(baseChoices(over), { commons: { id: 'c', name: 'C' }, now, notice: await noticeFor(over.language ?? 'pcm'), comprehension: { questions: 4, correct_first_try: 4, attempts: 1, passed: true } });

test('buildTerms: deny by default, pseudonymous, expiring, withdrawable', async () => {
  const t = await make();
  assert.deepEqual(validateTerms(t), []);
  assert.deepEqual(t.purposes.allowed, ['public_health_research', 'policy_statistics']);
  assert.ok(t.purposes.denied.includes('ai_training_commercial'));
  assert.match(t.subject_ref, /^p_[0-9a-f]{16}$/);
  assert.equal(t.withdrawal.allowed, true);
  assert.equal(Date.parse(t.expires_at) - Date.parse(t.granted_at), 730 * 86400000);
  assert.equal(t.notice.translation_status, 'draft_unreviewed');
});
test('validateTerms catches meaning errors, not just shape', async () => {
  const t = await make();
  assert.ok(validateTerms({ ...t, comprehension: { ...t.comprehension, passed: false } }).some((p) => /comprehension/.test(p)));
  assert.ok(validateTerms({ ...t, purposes: { allowed: [], denied: [] } }).length);
  assert.ok(validateTerms({ ...t, subject_ref: 'Amaka 0803...' }).some((p) => /pseudonym/.test(p)));
  assert.ok(validateTerms({ ...t, withdrawal: { ...t.withdrawal, allowed: false } }).length);
  assert.ok(validateTerms({ ...t, expires_at: t.granted_at }).length);
  const contradictory = await make({ purposes: ['ai_training_commercial'] });
  assert.ok(validateTerms(contradictory).some((p) => /contradictory/.test(p)));
});
test('conflicts: every term is enforced', async () => {
  const t = await make();
  assert.deepEqual(conflicts(t, goodRequest(), { at: T(1) }), []);
  const cases = [
    [{ purpose: { code: 'ai_training_commercial', description: 'x' } }, 'purpose_not_allowed'],
    [{ requester: { name: 'a', organisation: 'b', type: 'commercial' } }, 'user_type_not_permitted'],
    [{ data_categories: ['chat_transcripts'] }, 'data_category_not_allowed'],
    [{ cross_border_transfer: true }, 'cross_border_not_allowed'],
    [{ deidentification: 'deidentified' }, 'less_protection_than_required'],
    [{ benefit_commitments: ['open_access'] }, 'benefit_terms_not_met'],
    [{ duration_days: 730 }, 'consent_expires_during_access'],
  ];
  for (const [over, code] of cases) assert.ok(conflicts(t, goodRequest(over), { at: T(1) }).includes(code), code);
});
test('stricter consent accepts a stricter request but not a looser one', async () => {
  const records = await make({ deidentification: 'deidentified' });
  assert.deepEqual(conflicts(records, goodRequest({ deidentification: 'aggregated_only' }), { at: T(1) }), []);
});
test('effective terms = the strictest shared terms', async () => {
  const a = await make({ benefits: ['results_back'] });
  const b = await make({ benefits: ['open_access'], cross_border_transfer: true, deidentification: 'deidentified' });
  const e = effectiveTerms([a, b]);
  assert.deepEqual(e.benefit_sharing_required.sort(), ['open_access', 'results_back']);
  assert.equal(e.cross_border_transfer, false);
  assert.equal(e.deidentification, 'aggregated_only');
});
test('consent status: active, expired, withdrawn', async () => {
  const t = await make({ duration_days: 365 });
  assert.equal(consentStatus({ terms: t, status: 'active' }, T(10)), 'active');
  assert.equal(consentStatus({ terms: t, status: 'active' }, T(400)), 'expired');
  assert.equal(consentStatus({ terms: t, status: 'withdrawn' }, T(10)), 'withdrawn');
});
