import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, replay, verifyReceipt } from '../src/core/commons.js';
import { hashEntry, GENESIS_PREV } from '../src/core/ledger.js';
import { digestOf } from '../src/core/hash.js';
import { freshCommons, termsFor, addPeople, baseChoices, goodRequest, T } from './helpers.js';

async function readyCommons(n = 12) {
  const c = await freshCommons();
  const codes = await addPeople(c, n, baseChoices(), T(1));
  return { c, codes };
}
async function approve(c, id, ts = T(3)) {
  await c.vote(id, 'rev_youth', 'approve', 'Results come back to us in plain words.', { ts });
  await c.vote(id, 'rev_chw', 'approve', 'Useful for planning where we work.', { ts });
  return c.vote(id, 'rev_ethics', 'approve', 'Aggregated only, proportionate request.', { ts });
}

test('consent: recorded with a signed receipt; withdrawal code is never stored', async () => {
  const c = await freshCommons();
  const t = await termsFor(c);
  const { entry, receipt } = await c.grantConsent(t, { withdrawalCode: 'AAAA-BBBB-CCCC-DDDD', ts: T(1) });
  assert.equal(entry.type, 'CONSENT_GRANTED');
  assert.ok(!JSON.stringify(c.entries).includes('AAAA-BBBB'));
  assert.equal(receipt.terms_digest, await digestOf(t));
  const v = await verifyReceipt(receipt, c.entries);
  assert.equal(v.ok, true, JSON.stringify(v.checks)); assert.equal(v.status, 'active');
});
test('consent: rulebook refuses bad consent and writes nothing', async () => {
  const c = await freshCommons();
  const t = await termsFor(c);
  await assert.rejects(c.grantConsent({ ...t, comprehension: { ...t.comprehension, passed: false } }, { withdrawalCode: 'X', ts: T(1) }), /comprehension/);
  await assert.rejects(c.grantConsent(t, { ts: T(1) }), /withdrawal code/);
  assert.equal(c.entries.length, 1);
  await c.grantConsent(t, { withdrawalCode: 'X1', ts: T(1) });
  await assert.rejects(c.grantConsent(t, { withdrawalCode: 'X2', ts: T(1) }), /already has a consent/);
});
test('withdrawal needs the private code, is final, and updates status', async () => {
  const { c, codes } = await readyCommons(2);
  await assert.rejects(c.withdraw('WRONG-CODE', { ts: T(2) }), /No consent matches/);
  const { receipt } = await c.withdraw(codes[0].toLowerCase(), { ts: T(2) });
  assert.equal(receipt.kind, 'withdrawal_receipt');
  assert.equal((await c.findByCode(codes[0])).status, 'withdrawn');
  await assert.rejects(c.withdraw(codes[0], { ts: T(2) }), /already withdrawn/);
});
test('requests: checks run automatically; blocked requests never reach the panel', async () => {
  const { c } = await readyCommons(12);
  const ok = await c.submitRequest(goodRequest(), { ts: T(2) });
  assert.equal(ok.checks.passed, true); assert.equal(ok.checks.eligible_count, 12);
  const bad = await c.submitRequest(goodRequest({ purpose: { code: 'ai_training_commercial', description: 'Train a commercial chatbot on community data for profit.' }, requester: { name: 'x', organisation: 'Co', type: 'commercial' } }), { ts: T(2) });
  assert.equal(bad.checks.passed, false);
  assert.ok(bad.checks.blocks.some((b) => b.code === 'BELOW_K_MINIMUM'));
  await assert.rejects(c.vote(bad.request.request_id, 'rev_youth', 'approve', 'Looks fine to me honestly.', { ts: T(3) }), /blocked/);
  const vague = await c.submitRequest(goodRequest({ purpose: { code: 'public_health_research', description: 'research' }, benefit_commitments: [] }), { ts: T(2) });
  assert.deepEqual(vague.checks.blocks.map((b) => b.code).sort(), ['NO_BENEFIT_PLAN', 'PURPOSE_TOO_VAGUE']);
  const long = await c.submitRequest(goodRequest({ duration_days: 5000 }), { ts: T(2) });
  assert.ok(long.checks.blocks.some((b) => b.code === 'DURATION_TOO_LONG'));
});
test('k-minimum: 9 compatible people is not enough, 10 is', async () => {
  const c = await freshCommons();
  await addPeople(c, 9, baseChoices(), T(1));
  assert.equal((await c.submitRequest(goodRequest(), { ts: T(2) })).checks.passed, false);
  await addPeople(c, 1, baseChoices(), T(2));
  assert.equal((await c.submitRequest(goodRequest(), { ts: T(2) })).checks.passed, true);
});
test('quorum: 3 approvals incl. 2 community seats; staff-only approvals are not enough', async () => {
  const { c } = await readyCommons();
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  const id = request.request_id;
  await c.vote(id, 'rev_steward', 'approve', 'Technically sound and proportionate.', { ts: T(3) });
  await c.vote(id, 'rev_ethics', 'approve', 'Ethics fine, aggregated only.', { ts: T(3) });
  const r = await c.vote(id, 'rev_youth', 'approve', 'Results come back to us, approve.', { ts: T(3) });
  assert.equal(r.tally.approvals, 3); assert.equal(r.tally.community_approvals, 1); assert.equal(r.decision, null);
  const r2 = await c.vote(id, 'rev_lived', 'approve', 'Agree, low risk and useful.', { ts: T(3) });
  assert.equal(r2.decision.data.outcome, 'approved');
});
test('community veto: 2 of 3 community rejections reject the request', async () => {
  const { c } = await readyCommons();
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await c.vote(request.request_id, 'rev_lived', 'reject', 'Could expose people, not what we agreed.', { ts: T(3) });
  const r = await c.vote(request.request_id, 'rev_chw', 'reject', 'Would damage trust in health workers.', { ts: T(3) });
  assert.equal(r.decision.data.outcome, 'rejected');
  assert.equal((await c.state()).requests.get(request.request_id).status, 'rejected');
});
test('votes: panel members only, one each, with a real reason', async () => {
  const { c } = await readyCommons();
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  const id = request.request_id;
  await assert.rejects(c.vote(id, 'rev_mallory', 'approve', 'I am not on the panel at all.', { ts: T(3) }), /panel members/);
  await assert.rejects(c.vote(id, 'rev_youth', 'approve', 'ok', { ts: T(3) }), /reason/);
  await assert.rejects(c.vote(id, 'rev_youth', 'maybe', 'Not sure about this one yet.', { ts: T(3) }), /approve or reject/);
  await c.vote(id, 'rev_youth', 'approve', 'Results come back to us, approve.', { ts: T(3) });
  await assert.rejects(c.vote(id, 'rev_youth', 'approve', 'Voting twice to push it over.', { ts: T(3) }), /already voted/);
});
test('digest binding: amending resets votes, and a vote for the old version is refused', async () => {
  const { c } = await readyCommons();
  const { request, digest: d1 } = await c.submitRequest(goodRequest(), { ts: T(2) });
  const id = request.request_id;
  await c.vote(id, 'rev_youth', 'approve', 'Results come back to us, approve.', { ts: T(3) });
  await c.vote(id, 'rev_chw', 'approve', 'Useful for planning where we work.', { ts: T(3) });
  const am = await c.amendRequest(id, { data_categories: ['screening_scores', 'demographics'] }, { ts: T(4) });
  assert.notEqual(am.digest, d1);
  const s = await c.state();
  assert.equal(s.requests.get(id).votes.length, 0);
  assert.equal(s.requests.get(id).history[0].votes, 2);
  await assert.rejects(c.vote(id, 'rev_ethics', 'approve', 'I read the earlier version and liked it.', { ts: T(4), digest: d1 }), /different version/);
  await approve(c, id, T(5));
  assert.equal((await c.state()).requests.get(id).status, 'approved');
});
test('release: re-checks at release time and leaves out anyone who withdrew after approval', async () => {
  const { c, codes } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  await c.withdraw(codes[0], { ts: T(4) });
  const { manifest, dataset } = await c.release(request.request_id, { ts: T(5) });
  assert.equal(manifest.record_count, 11);
  assert.equal(dataset.form, 'aggregated'); assert.equal(dataset.people, 11);
  assert.ok(manifest.signature);
  assert.equal(manifest.request.request_digest, (await c.state()).requests.get(request.request_id).digest);
  assert.ok(manifest.obligations.every((o) => o.due === manifest.terms.access_ends_at));
});
test('release: blocked if withdrawals drop the group below k after approval', async () => {
  const { c, codes } = await readyCommons(10);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  await c.withdraw(codes[0], { ts: T(4) });
  await assert.rejects(c.release(request.request_id, { ts: T(5) }), /BELOW|minimum/i);
});
test('only approved requests can be released', async () => {
  const { c } = await readyCommons();
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await assert.rejects(c.release(request.request_id, { ts: T(3) }), /in_review/);
});
test('withdrawal after release issues a deletion notice to the recipient', async () => {
  const { c, codes } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest({ deidentification: 'aggregated_only' }), { ts: T(2) });
  await approve(c, request.request_id);
  const { manifest } = await c.release(request.request_id, { ts: T(4) });
  const { notices } = await c.withdraw(codes[3], { ts: T(6) });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].data.release_id, manifest.release_id);
  assert.ok(manifest.records.some((r) => r.record_id === notices[0].data.record_id));
  assert.equal(Date.parse(notices[0].data.delete_by) - Date.parse(notices[0].ts), 30 * 86400000);
});
test('follow-up cohort that touches a withdrawn person is blocked outright', async () => {
  const { c, codes } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  const { manifest } = await c.release(request.request_id, { ts: T(4) });
  await c.withdraw(codes[0], { ts: T(5) });
  const cohort = { release_id: manifest.release_id, record_ids: manifest.records.map((r) => r.record_id) };
  const f = await c.submitRequest(goodRequest({ cohort }), { ts: T(6) });
  assert.ok(f.checks.blocks.some((b) => b.code === 'COHORT_TOUCHES_WITHDRAWN'));
  const fake = await c.submitRequest(goodRequest({ cohort: { release_id: 'rel_nope', record_ids: ['r_0000000000000000'] } }), { ts: T(6) });
  assert.ok(fake.checks.blocks.some((b) => b.code === 'COHORT_UNKNOWN_RELEASE'));
});
test('per-release pseudonyms: the same person gets different record IDs in different releases', async () => {
  const { c } = await readyCommons(12);
  const a = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, a.request.request_id);
  const b = await c.submitRequest(goodRequest({ data_categories: ['demographics'] }), { ts: T(3) });
  await approve(c, b.request.request_id, T(3));
  const m1 = (await c.release(a.request.request_id, { ts: T(4) })).manifest;
  const m2 = (await c.release(b.request.request_id, { ts: T(4) })).manifest;
  const ids1 = new Set(m1.records.map((r) => r.record_id));
  assert.equal(m2.records.filter((r) => ids1.has(r.record_id)).length, 0);
});
test('benefits: only real obligations, once, with evidence', async () => {
  const { c } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  const { manifest } = await c.release(request.request_id, { ts: T(4) });
  await assert.rejects(c.recordBenefit(manifest.release_id, 'community_fund', 'Paid into the fund, receipt attached.', { ts: T(5) }), /not an obligation/);
  await assert.rejects(c.recordBenefit(manifest.release_id, 'results_back', 'done', { ts: T(5) }), /at least 20/);
  await c.recordBenefit(manifest.release_id, 'results_back', 'Results session held with 14 panel members.', { ts: T(5) });
  await assert.rejects(c.recordBenefit(manifest.release_id, 'results_back', 'Results session held again for show.', { ts: T(5) }), /already/);
});
test('deleting a withdrawal and re-hashing fools the chain, but not the person\'s withdrawal receipt', async () => {
  const { c, codes } = await readyCommons(12);
  const { receipt } = await c.withdraw(codes[0], { ts: T(4) });
  assert.equal((await audit(c.entries)).ok, true);
  const forged = c.entries.filter((e) => e.type !== 'CONSENT_WITHDRAWN').map((e, i) => ({ ...e, seq: i }));
  for (let k = 0; k < forged.length; k++) { forged[k].prev = k ? forged[k - 1].hash : GENESIS_PREV; forged[k].hash = await hashEntry(forged[k]); }
  assert.equal((await audit(forged)).chain.ok, true);
  const r = await verifyReceipt(receipt, forged);
  assert.equal(r.ok, false);
  assert.equal(r.checks.find((x) => x.name === 'Entry is in the ledger').ok, false);
});
test('rule replay catches a forged, re-hashed entry that breaks governance rules', async () => {
  const { c } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  const e = c.entries;
  const i = e.findIndex((x) => x.type === 'REVIEW_VOTE');
  e[i].data.reviewer_id = 'rev_outsider'; e[i].actor = 'reviewer:rev_outsider';
  for (let k = i; k < e.length; k++) { e[k].prev = e[k - 1].hash; e[k].hash = await hashEntry(e[k]); }
  const r = await audit(e);
  assert.equal(r.chain.ok, true);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.rule === 'panel_member'));
});
test('receipts catch a rewritten history that the chain cannot', async () => {
  const c = await freshCommons();
  const { receipt } = await c.grantConsent(await termsFor(c), { withdrawalCode: 'KEEP-THIS-SAFE-0001', ts: T(1) });
  await addPeople(c, 3, baseChoices(), T(2));
  const e = c.entries;
  e[1].data.terms.cross_border_transfer = true;
  e[1].data.terms_digest = await digestOf(e[1].data.terms);
  for (let k = 1; k < e.length; k++) { e[k].prev = e[k - 1].hash; e[k].hash = await hashEntry(e[k]); }
  const r = await verifyReceipt(receipt, e);
  assert.equal(r.checks.find((x) => x.name === 'Ledger integrity').ok, true);
  assert.equal(r.checks.find((x) => x.name === 'Entry is in the ledger').ok, false);
  assert.equal(r.ok, false);
});
test('receipts: an edited or forged receipt fails its signature', async () => {
  const c = await freshCommons();
  const { receipt } = await c.grantConsent(await termsFor(c), { withdrawalCode: 'KEEP-THIS-SAFE-0002', ts: T(1) });
  const edited = structuredClone(receipt); edited.terms.purposes.allowed.push('ai_training_commercial');
  const r = await verifyReceipt(edited, c.entries);
  assert.equal(r.checks.find((x) => x.name === 'Signature').ok, false);
  assert.equal(r.checks.find((x) => x.name === 'Terms fingerprint').ok, false);
  // The private code in the person's download copy does not break the signature.
  assert.equal((await verifyReceipt({ ...receipt, withdrawal_code: 'KEEP-THIS-SAFE-0002' }, c.entries)).ok, true);
  const other = await freshCommons();
  const foreign = (await other.grantConsent(await termsFor(other), { withdrawalCode: 'Z', ts: T(1) })).receipt;
  assert.equal((await verifyReceipt(foreign, c.entries)).checks.find((x) => x.name === 'Signature').ok, false);
});
test('honest checks: a request entry that lies about its check results is a violation', async () => {
  const { c } = await readyCommons(3);
  const bad = await c.submitRequest(goodRequest(), { ts: T(2) });
  assert.equal(bad.checks.passed, false);
  const e = c.entries;
  const i = e.findIndex((x) => x.type === 'ACCESS_REQUESTED');
  e[i].data.checks.passed = true; e[i].data.checks.blocks = [];
  for (let k = i; k < e.length; k++) { e[k].prev = e[k - 1].hash; e[k].hash = await hashEntry(e[k]); }
  const r = await audit(e);
  assert.ok(r.violations.some((v) => v.rule === 'honest_checks'));
});
test('state is a pure function of the ledger: reload gives the same state', async () => {
  const { c } = await readyCommons(12);
  const { request } = await c.submitRequest(goodRequest(), { ts: T(2) });
  await approve(c, request.request_id);
  const s1 = await c.state();
  const s2 = await replay(c.entries);
  assert.equal(s2.violations.length, 0);
  assert.equal(s2.requests.get(request.request_id).status, s1.requests.get(request.request_id).status);
  assert.equal(s2.head, s1.head);
});
