import { Commons } from '../src/core/commons.js';
import { buildTerms } from '../src/core/terms.js';
import { noticeFor } from '../src/i18n/index.js';
import { createSigner } from '../src/core/signer.js';

export const T = (d, h = 0) => new Date(Date.parse('2026-10-01T08:00:00Z') + d * 86400000 + h * 3600000).toISOString();
let n = 0;
export const hex16 = () => (++n).toString(16).padStart(16, '0');

export async function freshCommons({ signed = true } = {}) {
  return Commons.create({ id: 'test-commons', name: 'Test commons', signer: signed ? await createSigner() : null, ts: T(0) });
}
export const baseChoices = (over = {}) => ({
  language: 'pcm', purposes: ['public_health_research', 'policy_statistics'], data_categories: ['screening_scores', 'demographics'],
  permitted_users: ['commons_stewards', 'nigerian_public_researchers'], deidentification: 'aggregated_only', cross_border_transfer: false,
  benefits: ['results_back'], duration_days: 730, ...over,
});
export async function termsFor(commons, choices = baseChoices(), when = T(1)) {
  const { commons: info } = await commons.state();
  return buildTerms(choices, { commons: info, now: when, subjectRef: 'p_' + hex16(), termsId: 'ct_' + hex16(), notice: await noticeFor(choices.language), comprehension: { questions: 4, correct_first_try: 4, attempts: 1, passed: true } });
}
/** Add `count` people with the same choices; returns their withdrawal codes. */
export async function addPeople(commons, count, choices, when = T(1)) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = `TEST-CODE-${String(i).padStart(4, '0')}-${hex16().slice(-4)}`;
    await commons.grantConsent(await termsFor(commons, choices, when), { withdrawalCode: code, ts: when });
    codes.push(code);
  }
  return codes;
}
export const goodRequest = (over = {}) => ({
  requester: { name: 'Test Researcher', organisation: 'Test Lab', type: 'nigerian_public_researchers', country: 'NG' },
  purpose: { code: 'public_health_research', description: 'Compare wellbeing scores across age bands to plan where facilitators are needed.' },
  data_categories: ['screening_scores'], deidentification: 'aggregated_only', duration_days: 180, cross_border_transfer: false,
  benefit_commitments: ['results_back', 'open_access'], benefit_description: 'Plain-language results session with the community panel.', ...over,
});
