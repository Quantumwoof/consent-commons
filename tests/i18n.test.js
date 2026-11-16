import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, t, noticeFor, comprehensionQuestions } from '../src/i18n/index.js';
import { PURPOSES, DATA_CATEGORIES, PERMITTED_USERS, BENEFITS, DEIDENTIFICATION, DURATIONS_DAYS } from '../src/core/vocab.js';

const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();

test('every locale has every key, non-empty, with the same placeholders', () => {
  const keys = Object.keys(LOCALES.en.s);
  for (const [code, loc] of Object.entries(LOCALES)) {
    assert.deepEqual(Object.keys(loc.s).sort(), keys.slice().sort(), code);
    for (const k of keys) {
      assert.ok(loc.s[k].trim().length, `${code}.${k} empty`);
      assert.equal(placeholders(loc.s[k]), placeholders(LOCALES.en.s[k]), `${code}.${k} placeholders`);
    }
  }
});
test('every vocabulary code has a label in every language', () => {
  const need = [...Object.keys(DATA_CATEGORIES).map((k) => 'cat_' + k), ...Object.keys(PURPOSES).map((k) => 'pur_' + k), ...Object.keys(PERMITTED_USERS).map((k) => 'usr_' + k),
    ...Object.keys(BENEFITS).map((k) => 'ben_' + k), ...Object.keys(DEIDENTIFICATION).map((k) => 'deid_' + k), ...Object.keys(DURATIONS_DAYS).map((k) => 'dur_' + k)];
  for (const loc of Object.values(LOCALES)) for (const k of need) assert.ok(loc.s[k], `${loc.meta.code}.${k}`);
});
test('translations are honestly marked as unreviewed drafts', () => {
  for (const loc of Object.values(LOCALES)) assert.equal(loc.meta.status, 'draft_unreviewed');
  assert.match(LOCALES.pcm.meta.note, /native/); assert.match(LOCALES.yo.meta.note, /native/);
});
test('notice digest identifies the exact wording per language', async () => {
  const [en, pcm, yo] = await Promise.all(['en', 'pcm', 'yo'].map(noticeFor));
  assert.equal(new Set([en.digest, pcm.digest, yo.digest]).size, 3);
  assert.equal((await noticeFor('pcm')).digest, pcm.digest);
});
test('comprehension questions follow the person\'s own choices', () => {
  const no = comprehensionQuestions({ purposes: ['public_health_research'] });
  const yes = comprehensionQuestions({ purposes: ['ai_training_commercial'] });
  assert.equal(no.length, 4);
  assert.equal(no.find((q) => q.id === 'commercial').answer, 'no');
  assert.equal(yes.find((q) => q.id === 'commercial').answer, 'yes');
  assert.equal(no.find((q) => q.id === 'care').answer, 'no', 'support never depends on saying yes');
  assert.equal(t('pcm', 'withdrawn_done', { n: 2 }).includes('2'), true);
});
