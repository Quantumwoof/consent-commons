// Locales for the consent conversation. EVERY non-English string is an unreviewed draft (see meta.status)
// and must be reviewed by native speakers before any real use. The status travels into each consent record.
import { digestOf } from '../core/hash.js';
import en from './en.js';
import pcm from './pcm.js';
import yo from './yo.js';

export const NOTICE_VERSION = 'notice-1.0.0';
export const LOCALES = { en, pcm, yo };

export function t(lang, key, vars = {}) {
  const s = LOCALES[lang]?.s[key] ?? LOCALES.en.s[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/**
 * Fingerprint of the exact wording shown. Stored in every consent record, so it is always possible to
 * prove WHICH text a person agreed to, and to find everyone who saw a version later found to be unclear.
 */
export async function noticeFor(lang) {
  const loc = LOCALES[lang];
  return { version: NOTICE_VERSION, digest: await digestOf({ version: NOTICE_VERSION, lang, strings: loc.s }), translation_status: loc.meta.status };
}

/**
 * Comprehension questions generated from the person's own choices. Answers are 'yes'/'no'.
 * The commercial-AI question flips depending on what they chose, so it checks THEIR terms, not a script.
 */
export function comprehensionQuestions(choices) {
  const commercial = (choices.purposes ?? []).includes('ai_training_commercial');
  return [
    { id: 'withdraw', q: 'cq_withdraw', answer: 'yes', explain: 'ex_withdraw' },
    { id: 'care', q: 'cq_care', answer: 'no', explain: 'ex_care' },
    { id: 'name', q: 'cq_name', answer: 'no', explain: 'ex_name' },
    { id: 'commercial', q: 'cq_commercial', answer: commercial ? 'yes' : 'no', explain: commercial ? 'ex_commercial_yes' : 'ex_commercial_no' },
  ];
}
