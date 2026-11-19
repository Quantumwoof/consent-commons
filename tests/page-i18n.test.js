// The site pages (home, chat notes, access review, ledger, release summary) take all their text from the
// locale files. These tests make sure every machine code the core can produce has a plain-language
// explanation in every language, and every key the HTML and page scripts ask for exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LOCALES, tu, tmsg } from '../src/i18n/index.js';
import { CONFLICT_LABELS, DEFAULT_POLICY, requestProblems } from '../src/core/policy.js';
import { verifyManifest, verifyReceipt, audit } from '../src/core/commons.js';
import { verifyChain } from '../src/core/ledger.js';
import { seedCommons } from '../src/core/seed.js';

const LANGS = Object.keys(LOCALES);
const has = (k) => LANGS.every((l) => typeof LOCALES[l].u[k] === 'string' && LOCALES[l].u[k].trim());
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('every check code, warning, conflict and seat has an explanation in every language', () => {
  const policyJs = src('../src/core/policy.js');
  const codes = new Set([...policyJs.matchAll(/code: '([A-Z_]+)'/g), ...policyJs.matchAll(/'([A-Z][A-Z_]+)', '/g)].map((m) => m[1]));
  const warns = new Set([...policyJs.matchAll(/warnings\.push\(\{ code: '([A-Z_]+)'/g)].map((m) => m[1]));
  assert.ok(codes.has('BELOW_K_MINIMUM') && codes.has('PURPOSE_TOO_VAGUE') && warns.has('LOW_COVERAGE'));
  for (const c of codes) if (!warns.has(c)) assert.ok(has('bk_' + c), `bk_${c}`);
  for (const w of warns) assert.ok(has('wn_' + w), `wn_${w}`);
  for (const k of Object.keys(CONFLICT_LABELS)) assert.ok(has('cf_' + k), `cf_${k}`);
  for (const m of DEFAULT_POLICY.panel) assert.ok(has('seat_' + m.seat), `seat_${m.seat}`);
  for (const st of ['in_review', 'blocked', 'approved', 'released', 'rejected']) assert.ok(has('st_' + st), `st_${st}`);
  // the numbers in the explanation match the recorded message
  const blocks = requestProblems({ requester: {}, purpose: {}, duration_days: 9999 });
  assert.ok(blocks.find((b) => b.code === 'DURATION_TOO_LONG'));
  assert.match(tu('pcm', 'bk_BELOW_K_MINIMUM', { n: 7, k: 20 }), /7.*20/);
});

test('every ledger rule and chain failure has an explanation in every language', () => {
  const rules = new Set([...src('../src/core/commons.js').matchAll(/rule\([^;]*?, '([a-z_]+)', /g)].map((m) => m[1]));
  rules.add('known_type'); rules.add('error');
  assert.ok(rules.size > 20, `found ${rules.size} rules`);
  for (const r of rules) assert.ok(has('rl_' + r), `rl_${r}`);
  for (const c of [...src('../src/core/ledger.js').matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1])) assert.ok(has('chain_' + c), `chain_${c}`);
});

test('verification checks render in Pidgin and Yoruba with no untranslated keys', async () => {
  const { commons } = await seedCommons();
  const S = await commons.state();
  const m = [...S.releases.values()][0].manifest;
  const bad = structuredClone(m); bad.approval.tally.community_approvals += 1;
  const edited = structuredClone(commons.entries); edited[3].data.note = 'x';
  const receipt = await commons.reissueReceipt(commons.entries.findIndex((e) => e.type === 'CONSENT_GRANTED'));
  const runs = [await verifyManifest(m, commons.entries), await verifyManifest(bad, commons.entries), await verifyManifest(m, edited),
    await verifyReceipt(receipt, commons.entries), await verifyReceipt(receipt, edited)];
  for (const r of runs) for (const c of r.checks) {
    assert.ok(Array.isArray(c.msg), JSON.stringify(c));
    for (const l of ['pcm', 'yo']) {
      const text = tmsg(l, c.msg);
      assert.doesNotMatch(text, /\{\w+\}|\b(d|chain|rl)_[a-z_]+/, `${l}: ${text}`);
      assert.notEqual(text, tmsg('en', c.msg), `${l} ${c.msg[0]}`);
    }
  }
  const chain = await verifyChain(edited);
  assert.equal(chain.ok, false); assert.equal(chain.code, 'hash');
  assert.equal((await audit(commons.entries)).ok, true);
});

test('every key used by the page HTML and page scripts exists in every language', () => {
  const used = new Set();
  const web = new URL('../web/', import.meta.url);
  for (const f of readdirSync(web).filter((f) => f.endsWith('.html'))) for (const m of readFileSync(new URL(f, web), 'utf8').matchAll(/data-i18n(?:-html)?="(\w+)"|data-i18n-attr="([^"]+)"|name="cc-title" content="(\w+)"/g)) {
    if (m[2]) for (const pair of m[2].split(';')) used.add(pair.split(':')[1]); else used.add(m[1] ?? m[3]);
  }
  for (const m of src('../scripts/build.js').matchAll(/data-i18n(?:-html|-attr)?="(?:aria-label:)?(\w+)"/g)) used.add(m[1]);
  ['home', 'chat', 'review', 'ledger', 'ussd'].forEach((k) => used.add('nav_' + k));
  const js = new URL('../web/js/', import.meta.url);
  for (const f of ['review.js', 'ledger.js', 'chat.js', 'summary.js', 'explain.js']) for (const m of readFileSync(new URL(f, js), 'utf8').matchAll(/\b(?:T|u|tu\([^,]+,)\s*\(?\s*'([a-z][a-z0-9_]*)'/g)) used.add(m[1]);
  for (const k of [...used]) if (!k || k.endsWith('_')) used.delete(k); // prefixes like 'seat_' + code are covered above
  assert.ok(used.size > 150, `found ${used.size} keys`);
  for (const k of used) assert.ok(has(k) || ['lang', 'title'].includes(k), `missing UI key ${k}`);
});
