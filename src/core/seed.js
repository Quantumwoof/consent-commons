// Builds the demo commons: 60 SYNTHETIC people with varied consent choices, and five example access
// requests that exercise every path (approved + released, blocked by k-minimum, amended mid-review,
// rejected by the panel, and a follow-up blocked because it touches a withdrawn person).
// Every person, organisation and reviewer here is fictional. Seeded RNG, so the story is the same every time.
import { Commons } from './commons.js';
import { buildTerms } from './terms.js';
import { mulberry32, chance, pick, hexFrom } from './random.js';
import { base32 } from './hash.js';
import { noticeFor } from '../i18n/index.js';

const T0 = Date.parse('2026-10-01T08:00:00.000Z');
const at = (days, hours = 0) => new Date(T0 + days * 86400000 + hours * 3600000).toISOString();

export const SEED_PEOPLE = 60;
/** Withdrawal code of one SYNTHETIC seeded person (active, and in the released Ibadan study), published so
 *  anyone can try check/withdraw (e.g. over the USSD simulation). The seed is deterministic; a test pins it. */
export const DEMO_SAMPLE_CODE = 'SKFC-PY7G-0W5M-WDT0';

export async function seedCommons({ signer = null, seed = 20261201 } = {}) {
  const rng = mulberry32(seed);
  const commons = await Commons.create({ id: 'commons-demo-ng', name: 'Consent Commons demo (synthetic)', signer, ts: at(0) });
  const { commons: info } = await commons.state();
  const notices = { en: await noticeFor('en'), pcm: await noticeFor('pcm'), yo: await noticeFor('yo') };
  const people = [];
  for (let i = 0; i < SEED_PEOPLE; i++) {
    const language = rng() < 0.45 ? 'pcm' : rng() < 0.55 ? 'yo' : 'en';
    const purposes = ['service_improvement', 'public_health_research', 'policy_statistics', 'ai_training_noncommercial', 'ai_training_commercial']
      .filter((p, j) => chance(rng, [0.9, 0.8, 0.85, 0.5, 0.12][j]));
    if (!purposes.length) purposes.push('service_improvement');
    const data_categories = ['usage_metadata', 'demographics', 'screening_scores', 'chat_transcripts', 'voice_audio']
      .filter((c, j) => chance(rng, [0.9, 0.85, 0.7, 0.2, 0.08][j]));
    if (!data_categories.length) data_categories.push('usage_metadata');
    const permitted_users = ['commons_stewards', 'nigerian_public_researchers', 'international_academic', 'nonprofits', 'government_health', 'commercial']
      .filter((u, j) => j === 0 || chance(rng, [1, 0.85, 0.35, 0.6, 0.55, 0.1][j]));
    if (purposes.includes('ai_training_commercial') && !permitted_users.includes('commercial')) permitted_users.push('commercial');
    const benefits = ['results_back', 'open_access', 'community_credit', 'community_fund', 'local_capacity']
      .filter((b, j) => chance(rng, [0.8, 0.5, 0.4, 0.25, 0.35][j]));
    const choices = {
      language, purposes, data_categories, permitted_users, benefits,
      deidentification: chance(rng, 0.45) ? 'aggregated_only' : 'deidentified',
      cross_border_transfer: chance(rng, 0.3),
      duration_days: pick(rng, [365, 730, 730, 1825]),
    };
    const firstTry = chance(rng, 0.8);
    const terms = buildTerms(choices, {
      commons: info, now: at(1 + Math.floor(i / 4), i % 4 + 1), subjectRef: 'p_' + hexFrom(rng, 16), termsId: 'ct_' + hexFrom(rng, 16),
      notice: notices[language], comprehension: { questions: 4, correct_first_try: firstTry ? 4 : 3, attempts: firstTry ? 1 : 2, passed: true },
      channel: 'synthetic_seed',
    });
    const code = base32(Uint8Array.from({ length: 10 }, () => Math.floor(rng() * 256))).match(/.{4}/g).join('-');
    await commons.grantConsent(terms, { withdrawalCode: code, ts: terms.granted_at });
    people.push({ subject_ref: terms.subject_ref, code });
  }

  // 1. A non-commercial public-health study: passes checks, approved, released.
  const r1 = await commons.submitRequest({
    request_id: 'ar_demo_ibadan_mood',
    requester: { name: 'Dr. A. Example (fictional)', organisation: 'Fictional Public Health Lab, Ibadan', type: 'nigerian_public_researchers', country: 'NG' },
    purpose: { code: 'public_health_research', description: 'Understand how mood and worry scores differ by age band and state among young people using community support, to plan where more trained facilitators are needed.' },
    data_categories: ['screening_scores', 'demographics'], deidentification: 'aggregated_only', duration_days: 365, cross_border_transfer: false,
    benefit_commitments: ['results_back', 'open_access', 'community_credit', 'local_capacity'],
    benefit_description: 'Plain-language results session with the youth panel in Ibadan and Abuja; open-access paper; two paid research-assistant roles for local CHWs.',
  }, { ts: at(21) });
  await commons.vote(r1.request.request_id, 'rev_ethics', 'approve', 'Aggregated only, clear protocol and the benefits match what participants asked for.', { ts: at(22, 1) });
  await commons.vote(r1.request.request_id, 'rev_youth', 'approve', 'Results come back to us in plain language and the roles are paid. Approve.', { ts: at(22, 3) });
  await commons.vote(r1.request.request_id, 'rev_chw', 'approve', 'Useful for planning facilitators where we work. Two paid roles for CHWs is real benefit.', { ts: at(23, 2) });
  const rel1 = await commons.release(r1.request.request_id, { ts: at(27), releaseId: 'rel_demo_ibadan_mood' });
  await commons.recordBenefit(rel1.manifest.release_id, 'community_credit', 'Acknowledgement text agreed with the youth panel and added to the draft paper (synthetic example).', { ts: at(30) });

  // 2. Commercial AI training on chat transcripts, sent abroad: blocked automatically (too few consents).
  await commons.submitRequest({
    request_id: 'ar_demo_startup_chat',
    requester: { name: 'B. Sample (fictional)', organisation: 'Fictional AI Startup Ltd', type: 'commercial', country: 'US' },
    purpose: { code: 'ai_training_commercial', description: 'Fine-tune a commercial mental-health chatbot on real conversations from young Nigerians to improve local language handling.' },
    data_categories: ['chat_transcripts', 'demographics'], deidentification: 'deidentified', duration_days: 730, cross_border_transfer: true,
    benefit_commitments: ['community_credit'], benefit_description: 'We will thank the community in our product launch blog post.',
  }, { ts: at(30, 2) });

  // 3. An NGO request amended mid-review: the early vote no longer counts, because it was cast on old terms.
  const r3 = await commons.submitRequest({
    request_id: 'ar_demo_ngo_usage',
    requester: { name: 'C. Placeholder (fictional)', organisation: 'Fictional Youth Wellbeing NGO', type: 'nonprofits', country: 'NG' },
    purpose: { code: 'policy_statistics', description: 'Count how often young people use support services by state, to make the case to state governments for funding youth mental-health facilitators.' },
    data_categories: ['usage_metadata', 'demographics'], deidentification: 'aggregated_only', duration_days: 365, cross_border_transfer: false,
    benefit_commitments: ['results_back', 'open_access', 'community_credit', 'local_capacity'],
    benefit_description: 'Share the advocacy brief with the community panel before it is published; credit the panel; fund one paid youth advocate.',
  }, { ts: at(30, 4) });
  await commons.vote(r3.request.request_id, 'rev_steward', 'approve', 'Aggregated usage counts only, low risk. Fine as written.', { ts: at(30, 6) });
  await commons.amendRequest(r3.request.request_id, {
    duration_days: 180,
    benefit_description: 'Share the brief with the community panel before publication; publish it openly; credit the panel; fund one paid youth advocate.',
  }, { ts: at(31) });
  await commons.vote(r3.request.request_id, 'rev_youth', 'approve', 'Access cut to 6 months after our feedback, and the brief comes back to us first. Approve.', { ts: at(32) });

  // 4. Withdrawals. One withdrawn person is in release 1, so the recipient is told to delete their record.
  const rel = (await commons.state()).releases.get(rel1.manifest.release_id);
  const inRelease = new Set(rel.subjects.values());
  const leaver = people.find((p) => inRelease.has(p.subject_ref));
  const other = people.find((p) => !inRelease.has(p.subject_ref));
  await commons.withdraw(leaver.code, { ts: at(33) });
  await commons.withdraw(other.code, { ts: at(34) });

  // 5. A follow-up that names release 1's whole cohort, including the person who withdrew: blocked.
  await commons.submitRequest({
    request_id: 'ar_demo_followup',
    requester: { name: 'Dr. A. Example (fictional)', organisation: 'Fictional Public Health Lab, Ibadan', type: 'nigerian_public_researchers', country: 'NG' },
    purpose: { code: 'public_health_research', description: 'Six-month follow-up on the same group to see whether mood scores changed after more facilitators were placed.' },
    data_categories: ['screening_scores'], deidentification: 'aggregated_only', duration_days: 180, cross_border_transfer: false,
    cohort: { release_id: rel1.manifest.release_id, record_ids: rel1.manifest.records.map((r) => r.record_id) },
    benefit_commitments: ['results_back', 'open_access', 'community_credit', 'local_capacity'],
    benefit_description: 'Same commitments as the first study: results session, open paper, paid local roles.',
  }, { ts: at(36) });

  // 6. Passes the automatic checks, but the panel says no: rules cannot judge everything.
  const r6 = await commons.submitRequest({
    request_id: 'ar_demo_gov_targeting',
    requester: { name: 'D. Instance (fictional)', organisation: 'Fictional State Agency', type: 'government_health', country: 'NG' },
    purpose: { code: 'policy_statistics', description: 'Identify neighbourhoods with high distress scores so that enforcement and outreach teams can be sent there.' },
    data_categories: ['usage_metadata'], deidentification: 'aggregated_only', duration_days: 365, cross_border_transfer: false,
    benefit_commitments: ['results_back', 'open_access', 'community_credit', 'local_capacity'], benefit_description: 'Brief community leaders on the findings after deployment and hire local outreach staff.',
  }, { ts: at(38) });
  await commons.vote(r6.request.request_id, 'rev_lived', 'reject', '"Enforcement" teams in distressed areas could expose people to policing. Not what we consented to.', { ts: at(39) });
  await commons.vote(r6.request.request_id, 'rev_chw', 'reject', 'Would damage trust in community health workers. Outreach plan is not described.', { ts: at(39, 2) });
  // Two of three community seats said no, so the request can no longer reach 2 community approvals: rejected.

  return { commons, people, releaseId: rel1.manifest.release_id };
}
