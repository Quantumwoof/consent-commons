import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { audit, verifyManifest, Commons } from '../src/core/commons.js';
import { hashEntry } from '../src/core/ledger.js';
import { seedCommons, DEMO_SAMPLE_CODE } from '../src/core/seed.js';
import { createSigner } from '../src/core/signer.js';
import { validateTerms, buildTerms } from '../src/core/terms.js';
import { UssdSession, USSD_CODE, USSD_MAX_CHARS, ussdDate } from '../src/core/ussd.js';
import { LOCALES, tu, noticeFor } from '../src/i18n/index.js';
import { freshCommons, baseChoices, T } from './helpers.js';

const RELEASE = 'rel_demo_ibadan_mood';
async function seeded() {
  const { commons } = await seedCommons({ signer: await createSigner() });
  let saved = null;
  const session = (lang) => new UssdSession({ load: async () => Commons.load((saved ?? commons).entries, { signer: commons.signer }), persist: (c) => { saved = c; }, lang });
  return { commons, session, saved: () => saved };
}
/** Rewrite every hash from `from` on, as a tamperer who controls the whole file would. */
async function rehash(entries, from = 0) {
  for (let i = from; i < entries.length; i++) { entries[i].seq = i; entries[i].prev = i ? entries[i - 1].hash : entries[i].prev; entries[i].hash = await hashEntry(entries[i]); }
  return entries;
}

test('demo sample code belongs to an active synthetic person who is in the released study', async () => {
  const { commons } = await seeded();
  const c = await commons.findByCode(DEMO_SAMPLE_CODE);
  assert.ok(c); assert.equal(c.status, 'active');
  const s = await commons.state();
  assert.ok([...s.releases.get(RELEASE).subjects.values()].includes(c.terms.subject_ref));
});

test('USSD: unknown service code ends the session; menu, language and back work', async () => {
  const { session } = await seeded();
  const a = session('en');
  assert.equal(a.dial('*123#').end, true);
  const b = session('en');
  assert.match(b.dial(' *347*22# ').text, /1 Check my consent/);
  assert.equal((await b.reply('9')).invalid, true);
  assert.match((await b.reply('3')).text, /2 Pidgin/);
  const pcm = await b.reply('2');
  assert.equal(pcm.lang, 'pcm'); assert.match(pcm.text, /I wan take my yes back/);
  assert.equal((await b.reply('1')).input, 'code');
  assert.equal((await b.reply('0')).state, 'menu');
  assert.equal((await b.reply('0')).end, true);
});

test('USSD: check shows status; withdraw appends the same ledger events as the chat, and audit stays green', async () => {
  const { commons, session, saved } = await seeded();
  const before = commons.entries.length;
  const s = session('en');
  s.dial(USSD_CODE);
  await s.reply('1');
  assert.match((await s.reply('WRONG-CODE-0000')).text, /not found/);
  const st = await s.reply(DEMO_SAMPLE_CODE.toLowerCase()); // codes are normalised, like in the chat
  assert.match(st.text, /ACTIVE until .* in 1 release/);
  await s.reply('0'); await s.reply('2');
  const conf = await s.reply(DEMO_SAMPLE_CODE);
  assert.equal(conf.state, 'confirm'); assert.match(conf.text, /1 group\(s\).*30 days/s);
  const done = await s.reply('1');
  assert.match(done.text, /Ledger entry #\d+/);
  const after = saved().entries;
  const added = after.slice(before);
  assert.deepEqual(added.map((e) => e.type), ['CONSENT_WITHDRAWN', 'WITHDRAWAL_NOTICE_ISSUED']);
  assert.match(added[0].actor, /^person:p_/);
  assert.deepEqual(Object.keys(added[0].data).sort(), ['subject_ref', 'terms_digest', 'terms_id', 'withdrawal_code_digest']);
  assert.ok(!JSON.stringify(after).includes(DEMO_SAMPLE_CODE), 'the code itself is never written');
  const r = await audit(after);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  const state = await saved().state();
  const rel = state.releases.get(RELEASE);
  assert.equal(rel.notices.at(-1).subject_ref, added[0].data.subject_ref, 'release withdrawal notices pick it up');
  // the release summary still verifies after a USSD withdrawal
  assert.equal((await verifyManifest(rel.manifest, after)).complete, true);
  // and a second attempt says it is already withdrawn
  const again = session('en'); again.dial(USSD_CODE); await again.reply('2');
  assert.match((await again.reply(DEMO_SAMPLE_CODE)).text, /took your yes back on/);
});

test('USSD: saying No changes nothing; tampering with a USSD withdrawal is still caught', async () => {
  const { commons, session, saved } = await seeded();
  const s = session('pcm'); s.dial(USSD_CODE); await s.reply('2'); await s.reply(DEMO_SAMPLE_CODE);
  assert.match((await s.reply('2')).text, /nothing change/);
  assert.equal(saved(), null);
  const w = session('en'); w.dial(USSD_CODE); await w.reply('2'); await w.reply(DEMO_SAMPLE_CODE); await w.reply('1');
  const entries = saved().entries;
  const i = entries.findLastIndex((e) => e.type === 'CONSENT_WITHDRAWN');
  const edited = structuredClone(entries); edited[i].data.subject_ref = 'p_0000000000000000';
  const e1 = await audit(edited);
  assert.equal(e1.ok, false); assert.equal(e1.chain.brokenAt, i);
  // remove the withdrawal and re-hash everything: the chain looks fine, but the rules catch it
  const cut = await rehash(structuredClone(entries).filter((_, k) => k !== i), i);
  const e2 = await audit(cut);
  assert.equal(e2.chain.ok, true); assert.equal(e2.ok, false);
  assert.ok(e2.violations.some((v) => v.rule === 'withdrawn_first'));
  assert.ok(commons.entries.length < entries.length);
});

test('USSD: every screen fits in 160 characters in every language', () => {
  const worst = { date: ussdDate('2031-12-30T12:00:00Z'), n: 99, d: 30, seq: 99999 };
  for (const lang of Object.keys(LOCALES)) {
    for (const k of Object.keys(LOCALES.en.u).filter((x) => x.startsWith('ux_'))) {
      const text = tu(lang, k, worst);
      assert.ok([...text.normalize('NFC')].length <= USSD_MAX_CHARS, `${lang}.${k} is ${[...text].length} chars`);
    }
  }
});

test('release summary: verification passes on the real manifest and fails clearly on a changed copy or ledger', async () => {
  const { commons } = await seeded();
  const m = (await commons.state()).releases.get(RELEASE).manifest;
  const ok = await verifyManifest(m, commons.entries);
  assert.equal(ok.complete, true, JSON.stringify(ok.checks));
  assert.deepEqual(ok.checks.map((c) => c.id), ['signature', 'chain', 'in_ledger', 'approval', 'votes', 'rules']);
  // a copy with an inflated tally
  const bad = structuredClone(m); bad.approval.tally.community_approvals = 3;
  const r1 = await verifyManifest(bad, commons.entries);
  assert.equal(r1.ok, false);
  for (const id of ['signature', 'in_ledger', 'approval', 'votes']) assert.equal(r1.checks.find((c) => c.id === id).status, 'fail', id);
  // an edited ledger
  const entries = commons.entries; entries[3].data.terms.cross_border_transfer = !entries[3].data.terms.cross_border_transfer;
  const r2 = await verifyManifest(m, entries);
  assert.equal(r2.checks.find((c) => c.id === 'chain').status, 'fail');
  // the decision entry removed and the chain rebuilt
  const fresh = commons.entries;
  const cut = await rehash(fresh.filter((e) => e.hash !== m.approval.decision_entry), 1);
  const r3 = await verifyManifest(m, cut);
  assert.equal(r3.ok, false);
  assert.equal(r3.checks.find((c) => c.id === 'approval').status, 'fail');
  assert.equal(r3.checks.find((c) => c.id === 'rules').status, 'fail');
});

test('release summary: an unsigned commons is reported as not checked, never as verified', async () => {
  const { commons } = await seedCommons({ signer: null });
  const m = (await commons.state()).releases.get(RELEASE).manifest;
  const r = await verifyManifest(m, commons.entries);
  assert.equal(r.ok, true); assert.equal(r.complete, false);
  assert.equal(r.checks.find((c) => c.id === 'signature').status, 'skip');
});

test('UI strings: every locale has every key with the same placeholders; Pidgin and Yoruba are not English copies', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  const keys = Object.keys(LOCALES.en.u);
  for (const [code, loc] of Object.entries(LOCALES)) {
    assert.deepEqual(Object.keys(loc.u).sort(), keys.slice().sort(), code);
    for (const k of keys) { assert.ok(loc.u[k].trim(), `${code}.${k}`); assert.equal(ph(loc.u[k]), ph(LOCALES.en.u[k]), `${code}.${k}`); }
  }
  // Words Pidgin shares with English, language names and file/brand words. Everything else must differ.
  const SAME = { pcm: new Set(['lang_en', 'lang_yo', 'rv_yes', 'rv_no', 'rv_days', 'rv_community', 'rv_f_name', 'rv_records', 'rv_th_record', 'rv_s_records', 'rv_r_vote', 'rv_community_tag', 'lg_file', 'lg_th_time', 'ent_genesis_key',
    // app shell: role and tab names Nigerian Pidgin speakers use as-is
    'role_researcher', 'title_researcher', 'rv_from_researcher', 'rv_seat_community', 'rv_seat_other', 'hub_res_demo', 'tab_home', 'tab_consent', 'tab_ussd', 'tab_myreq', 'tab_newreq', 'tab_rules_short', 'tab_requests_short', 'tab_releases_short']), yo: new Set(['lang_yo', 'tab_ussd']) };
  for (const code of ['pcm', 'yo']) for (const k of keys) if (!SAME[code].has(k)) assert.notEqual(LOCALES[code].u[k], LOCALES.en.u[k], `${code}.${k} is still English`);
  // common English-only words that real Pidgin replaces (dey, don, wey, dem ...)
  const english = /\b(is|are|was|were|has|have|isn't|don't|doesn't|please|will|would|cannot|must not)\b/i;
  for (const [k, v] of Object.entries(LOCALES.pcm.u)) {
    const prose = v.replace(/\*347\*22#|Consent Commons|USSD|DEMO|SMS|ID|manifest|ledger/g, '');
    assert.doesNotMatch(prose, english, `pcm.${k}: "${v}"`);
  }
});

test('assisted consent: recorded as collected_via assisted_offline_demo, valid against the schema, changes no rule', async () => {
  const c = await freshCommons();
  const { commons: info } = await c.state();
  const terms = buildTerms(baseChoices(), { commons: info, now: T(1), subjectRef: 'p_aaaaaaaaaaaaaaaa', termsId: 'ct_aaaaaaaaaaaaaaaa', notice: await noticeFor('pcm'), comprehension: { questions: 4, correct_first_try: 4, attempts: 1, passed: true }, channel: 'assisted_offline_demo' });
  assert.deepEqual(validateTerms(terms), []);
  const a = new Ajv({ allErrors: true, strict: false }); addFormats(a);
  const v = a.compile(JSON.parse(readFileSync(new URL('../schema/consent-terms.v1.json', import.meta.url))));
  assert.ok(v(terms), JSON.stringify(v.errors));
  const { entry } = await c.grantConsent(terms, { withdrawalCode: 'ASST-0000-0000-0001', ts: T(1) });
  assert.equal(entry.data.terms.collected_via, 'assisted_offline_demo');
  assert.equal((await audit(c.entries)).ok, true);
});
