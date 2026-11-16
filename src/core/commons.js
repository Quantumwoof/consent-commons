// The commons engine. ONE rulebook (`applyEntry`) is used twice:
//   1. live, before anything is appended, so a rule-breaking entry can never be written;
//   2. on replay, so anyone holding a copy of the ledger can re-check that every rule was followed
//      (not just that the bytes are intact). The ledger is the database; everything else is a view of it.
import { clone } from './canonical.js';
import { digestOf, newId } from './hash.js';
import { codeDigest, recordIdFor } from './ids.js';
import { Ledger, verifyChain } from './ledger.js';
import { validateTerms, consentStatus, effectiveTerms } from './terms.js';
import { DEFAULT_POLICY, runChecks, tally } from './policy.js';
import { verifySignature } from './signer.js';
import { BENEFITS, SCHEMA_VERSION, SCHEMA_BASE } from './vocab.js';
import { syntheticDataset } from './synthetic-records.js';

const DAY = 86400000;
class RuleError extends Error { constructor(rule, message) { super(message); this.rule = rule; } }
const rule = (cond, name, message) => { if (!cond) throw new RuleError(name, message); };

export { codeDigest, recordIdFor };
const blockCodes = (c) => c.blocks.map((b) => b.code).sort().join(',');

export function emptyState() {
  return { commons: null, policy: null, signing_key: null, consents: new Map(), requests: new Map(), releases: new Map(), notices: [], violations: [], length: 0, head: null };
}

/** Validate an entry against everything before it, then apply it. Throws RuleError and changes nothing if a rule is broken. */
export async function applyEntry(s, e) {
  const d = e.data ?? {};
  const at = new Date(e.ts);
  if (e.type !== 'GENESIS') rule(s.commons, 'genesis_first', 'the ledger must start with GENESIS');
  switch (e.type) {
    case 'GENESIS': {
      rule(!s.commons, 'single_genesis', 'GENESIS may appear only once');
      rule(d.commons?.id && d.commons?.name && d.policy?.panel?.length, 'genesis_complete', 'GENESIS needs commons id, name and governance policy');
      s.commons = d.commons; s.policy = d.policy; s.signing_key = d.signing_key ?? null;
      break;
    }
    case 'CONSENT_GRANTED': {
      const t = d.terms;
      const problems = validateTerms(t);
      rule(!problems.length, 'valid_terms', 'invalid consent terms: ' + problems.join('; '));
      rule(t.commons.id === s.commons.id, 'same_commons', 'terms belong to a different commons');
      rule(!s.consents.has(t.subject_ref), 'one_consent_per_person', 'this pseudonym already has a consent record');
      rule((await digestOf(t)) === d.terms_digest, 'terms_digest', 'terms_digest does not match the terms');
      rule(/^[0-9a-f]{64}$/.test(d.withdrawal_code_digest ?? ''), 'withdrawal_code', 'a withdrawal-code digest is required, so the person can always withdraw');
      rule(e.actor === `person:${t.subject_ref}`, 'actor', 'consent can only be given by the person (pseudonym) themselves');
      s.consents.set(t.subject_ref, { terms: t, terms_digest: d.terms_digest, code_digest: d.withdrawal_code_digest, status: 'active', granted_seq: e.seq, granted_hash: e.hash, withdrawn_at: null });
      break;
    }
    case 'CONSENT_WITHDRAWN': {
      const c = s.consents.get(d.subject_ref);
      rule(c, 'known_person', 'no consent record for this pseudonym');
      rule(c.status !== 'withdrawn', 'not_already_withdrawn', 'consent was already withdrawn');
      rule(d.withdrawal_code_digest === c.code_digest, 'withdrawal_proof', 'withdrawal must be proven with the person\'s withdrawal code');
      c.status = 'withdrawn'; c.withdrawn_at = e.ts; c.withdrawn_seq = e.seq;
      break;
    }
    case 'ACCESS_REQUESTED': {
      const r = d.request;
      rule(r?.request_id && Number.isInteger(r.version), 'request_ids', 'request needs request_id and version');
      const existing = s.requests.get(r.request_id);
      if (existing) {
        rule(['in_review', 'blocked'].includes(existing.status), 'amend_open_only', `cannot amend a request that is ${existing.status}`);
        rule(r.version === existing.request.version + 1 && d.amends === existing.digest, 'amend_chain', 'an amendment must name the digest it replaces');
      } else rule(r.version === 1, 'first_version', 'a new request starts at version 1');
      rule((await digestOf(r)) === d.request_digest, 'request_digest', 'request_digest does not match the request');
      const checks = runChecks(r, s.consents, s.policy, at, s.releases);
      rule(checks.passed === d.checks.passed && checks.eligible_count === d.checks.eligible_count && blockCodes(checks) === blockCodes(d.checks),
        'honest_checks', 'recorded automatic-check results do not match a re-run of the checks');
      const rec = existing ?? { history: [] };
      if (existing) rec.history.push({ digest: existing.digest, version: existing.request.version, votes: existing.votes.length });
      Object.assign(rec, { request: r, digest: d.request_digest, checks: d.checks, status: checks.passed ? 'in_review' : 'blocked', votes: [], decision: null, submitted_seq: rec.submitted_seq ?? e.seq, updated_seq: e.seq, submitted_at: rec.submitted_at ?? e.ts });
      s.requests.set(r.request_id, rec);
      break;
    }
    case 'REVIEW_VOTE': {
      const r = s.requests.get(d.request_id);
      rule(r, 'known_request', 'unknown request');
      rule(r.status === 'in_review', 'open_for_review', `request is ${r.status}, not open for votes`);
      rule(d.request_digest === r.digest, 'digest_bound_vote', 'vote is bound to a different version of the request (it was changed after this reviewer read it)');
      const seat = s.policy.panel.find((m) => m.id === d.reviewer_id);
      rule(seat, 'panel_member', 'only panel members can vote');
      rule(e.actor === `reviewer:${d.reviewer_id}`, 'actor', 'a vote must be cast by the reviewer themselves');
      rule(['approve', 'reject'].includes(d.vote), 'vote_value', 'vote must be approve or reject');
      rule((d.reason ?? '').trim().length >= s.policy.min_reason_chars, 'reasoned_vote', `every vote needs a reason of at least ${s.policy.min_reason_chars} characters`);
      rule(!r.votes.some((v) => v.reviewer_id === d.reviewer_id), 'one_vote_each', 'this reviewer already voted on this version');
      r.votes.push({ ...clone(d), seat: seat.seat, community: seat.community, ts: e.ts, seq: e.seq, hash: e.hash });
      break;
    }
    case 'ACCESS_DECIDED': {
      const r = s.requests.get(d.request_id);
      rule(r && r.status === 'in_review', 'decide_open', 'only a request under review can be decided');
      rule(d.request_digest === r.digest, 'digest_bound_decision', 'decision is bound to a different version of the request');
      const t = tally(r.votes, r.digest, s.policy);
      rule(t.outcome !== 'pending' && t.outcome === d.outcome, 'quorum', `the votes give "${t.outcome}", not "${d.outcome}"`);
      r.status = d.outcome; r.decision = { outcome: d.outcome, tally: t, ts: e.ts, seq: e.seq, hash: e.hash };
      break;
    }
    case 'DATA_RELEASED': {
      const m = d.manifest;
      const r = s.requests.get(m?.request?.request_id);
      rule(r, 'known_request', 'release for an unknown request');
      rule(r.status === 'approved', 'approved_only', `request is ${r.status}; only approved requests can be released`);
      rule(m.request.request_digest === r.digest && r.decision?.hash === m.approval.decision_entry, 'approval_bound', 'release does not match the approved version of the request');
      const checks = runChecks(r.request, s.consents, s.policy, at, s.releases);
      rule(checks.passed, 'recheck_at_release', 'automatic checks fail at release time: ' + checks.blocks.map((b) => b.code).join(', '));
      const expected = (await Promise.all(checks.eligible.map((ref) => recordIdFor(m.release_id, ref)))).sort();
      const got = m.records.map((x) => x.record_id).slice().sort();
      rule(expected.length === got.length && expected.every((x, i) => x === got[i]), 'exact_cohort', 'released records are not exactly the people whose consent covers the request right now');
      if (s.signing_key) {
        const { signature, ...body } = m;
        const v = await verifySignature(body, signature, { trustedKeyId: s.signing_key.key_id });
        rule(v.ok, 'signed_manifest', 'release manifest signature invalid: ' + v.reason);
      }
      const refs = new Map(await Promise.all(checks.eligible.map(async (ref) => [await recordIdFor(m.release_id, ref), ref])));
      s.releases.set(m.release_id, { manifest: m, seq: e.seq, hash: e.hash, ts: e.ts, subjects: refs, delivered: {}, notices: [] });
      r.status = 'released'; r.release_id = m.release_id;
      break;
    }
    case 'WITHDRAWAL_NOTICE_ISSUED': {
      const rel = s.releases.get(d.release_id);
      rule(rel, 'known_release', 'notice for an unknown release');
      rule(rel.subjects.get(d.record_id) === d.subject_ref, 'record_in_release', 'this person is not in that release');
      rule(s.consents.get(d.subject_ref)?.status === 'withdrawn', 'withdrawn_first', 'notices are only issued after a withdrawal');
      const n = { ...clone(d), ts: e.ts, seq: e.seq };
      rel.notices.push(n); s.notices.push(n);
      break;
    }
    case 'BENEFIT_DELIVERED': {
      const rel = s.releases.get(d.release_id);
      rule(rel, 'known_release', 'benefit report for an unknown release');
      rule(rel.manifest.obligations.some((o) => o.code === d.code), 'known_obligation', 'that benefit was not an obligation of this release');
      rule(!rel.delivered[d.code], 'report_once', 'already reported as delivered');
      rule((d.evidence ?? '').trim().length >= 20, 'evidence', 'describe what was delivered (at least 20 characters)');
      rel.delivered[d.code] = { ...clone(d), ts: e.ts, seq: e.seq, actor: e.actor };
      break;
    }
    default: throw new RuleError('known_type', `unknown entry type ${e.type}`);
  }
  s.length = e.seq + 1; s.head = e.hash;
}

/** Rebuild the full state from a ledger, collecting (not stopping at) rule violations. */
export async function replay(entries) {
  const s = emptyState();
  for (const e of entries) {
    try { await applyEntry(s, e); } catch (err) { s.violations.push({ seq: e.seq, type: e.type, rule: err.rule ?? 'error', message: err.message }); s.length = e.seq + 1; s.head = e.hash; }
  }
  return s;
}

/** Full audit: are the bytes intact (hash chain) AND were the rules followed (replay)? */
export async function audit(entries) {
  const chain = await verifyChain(entries);
  const s = await replay(entries);
  return { ok: chain.ok && s.violations.length === 0, chain, violations: s.violations, head: chain.head ?? null, entries: entries.length };
}

export class Commons {
  #state;
  constructor(ledger, { signer = null } = {}) { this.ledger = ledger; this.signer = signer; }

  static async create({ id = 'commons-demo', name = 'Consent Commons (demo)', policy = DEFAULT_POLICY, signer = null, ts, steward = 'steward' } = {}) {
    const c = new Commons(new Ledger(), { signer });
    await c.#commit('GENESIS', steward, {
      commons: { id, name, synthetic_data_only: true },
      policy: clone(policy),
      signing_key: signer ? { alg: 'Ed25519', key_id: signer.keyId, public_key: signer.publicJwk } : null,
      schema_version: SCHEMA_VERSION,
      schema_base: SCHEMA_BASE,
    }, ts);
    return c;
  }
  static async load(entries, opts) {
    const c = new Commons(new Ledger(entries), opts);
    c.#state = await replay(c.ledger.entries);
    return c;
  }

  async state() { if (!this.#state) this.#state = await replay(this.ledger.entries); return this.#state; }
  get entries() { return this.ledger.entries; }

  /** Validate against the rulebook, then append. If the rulebook says no, nothing is written.
   *  Commits are serialised so two callers can never interleave. */
  #queue = Promise.resolve();
  #commit(type, actor, data, ts) {
    const run = async () => {
      const s = await this.state();
      // If the caller gives no time and this device's clock is behind the last entry, use the last entry's
      // time rather than fail: order matters more than a few minutes of clock skew on a phone.
      const head = this.ledger.head;
      const time = ts ?? (head && new Date().toISOString() < head.ts ? head.ts : undefined);
      const entry = await this.ledger.prepare(type, actor, data, { ts: time });
      await applyEntry(s, entry); // throws (and changes nothing) if any rule is broken
      return this.ledger.push(entry);
    };
    const p = this.#queue.then(run);
    this.#queue = p.catch(() => {});
    return p;
  }

  // ---------- consent ----------
  async grantConsent(terms, { withdrawalCode, ts } = {}) {
    if (!withdrawalCode) throw new Error('a withdrawal code is required');
    const entry = await this.#commit('CONSENT_GRANTED', `person:${terms.subject_ref}`, {
      terms, terms_digest: await digestOf(terms), withdrawal_code_digest: await codeDigest(withdrawalCode),
    }, ts);
    return { entry, receipt: await this.#receipt('consent_receipt', entry, { terms, terms_digest: entry.data.terms_digest }) };
  }

  /** Re-issue the signed receipt for an existing consent entry (e.g. a person lost theirs). */
  async reissueReceipt(seq) {
    const e = this.ledger.at(seq);
    if (!e || e.type !== 'CONSENT_GRANTED') throw new Error('not a consent entry');
    return this.#receipt('consent_receipt', e, { terms: e.data.terms, terms_digest: e.data.terms_digest });
  }

  async findByCode(code) {
    const dg = await codeDigest(code);
    const s = await this.state();
    for (const c of s.consents.values()) if (c.code_digest === dg) return { ...c, status: consentStatus(c, new Date()) };
    return null;
  }

  async withdraw(code, { ts } = {}) {
    const c = await this.findByCode(code);
    if (!c) throw new Error('No consent matches that code. Check the code and try again.');
    if (c.status === 'withdrawn') throw new Error('This consent was already withdrawn.');
    const entry = await this.#commit('CONSENT_WITHDRAWN', `person:${c.terms.subject_ref}`, {
      subject_ref: c.terms.subject_ref, terms_id: c.terms.terms_id, terms_digest: c.terms_digest, withdrawal_code_digest: c.code_digest,
    }, ts);
    // Tell every recipient that already holds this person's record to delete it.
    const s = await this.state();
    const notices = [];
    for (const rel of s.releases.values()) {
      for (const [recordId, ref] of rel.subjects) {
        if (ref !== c.terms.subject_ref) continue;
        const deleteBy = new Date(Date.parse(entry.ts) + s.policy.recipient_deletion_days * DAY).toISOString();
        notices.push(await this.#commit('WITHDRAWAL_NOTICE_ISSUED', 'system', {
          release_id: rel.manifest.release_id, record_id: recordId, subject_ref: ref, recipient: rel.manifest.recipient.organisation, delete_by: deleteBy,
        }, entry.ts));
      }
    }
    const receipt = await this.#receipt('withdrawal_receipt', entry, { terms_id: c.terms.terms_id, terms_digest: c.terms_digest, downstream_notices: notices.length });
    return { entry, receipt, notices };
  }

  async #receipt(kind, entry, body) {
    const s = await this.state();
    const doc = {
      receipt_version: SCHEMA_VERSION, kind, commons: { id: s.commons.id, name: s.commons.name },
      ...body,
      ledger_entry: { seq: entry.seq, ts: entry.ts, type: entry.type, hash: entry.hash, prev: entry.prev },
      issued_at: entry.ts,
      synthetic: true,
    };
    return this.signer ? { ...doc, signature: await this.signer.sign(doc) } : doc;
  }

  // ---------- access requests ----------
  async submitRequest(input, { ts } = {}) {
    const s = await this.state();
    const time = ts ?? new Date().toISOString();
    const request = { ...clone(input), request_id: input.request_id ?? newId('ar'), version: 1, submitted_at: time };
    return this.#recordRequest(request, null, s, time);
  }
  async amendRequest(requestId, changes, { ts } = {}) {
    const s = await this.state();
    const cur = s.requests.get(requestId);
    if (!cur) throw new Error('unknown request');
    const time = ts ?? new Date().toISOString();
    const request = { ...clone(cur.request), ...clone(changes), request_id: requestId, version: cur.request.version + 1, submitted_at: time };
    return this.#recordRequest(request, cur.digest, s, time);
  }
  async #recordRequest(request, amends, s, time) {
    const checks = runChecks(request, s.consents, s.policy, new Date(time), s.releases);
    const { eligible, ...summary } = checks;
    const data = { request, request_digest: await digestOf(request), checks: { ...summary, eligible_digest: await digestOf(eligible.slice().sort()) } };
    if (amends) data.amends = amends;
    const entry = await this.#commit('ACCESS_REQUESTED', `requester:${request.requester.organisation}`, data, time);
    return { entry, request, digest: data.request_digest, checks };
  }

  async vote(requestId, reviewerId, vote, reason, { ts, digest } = {}) {
    const s = await this.state();
    const r = s.requests.get(requestId);
    if (!r) throw new Error('unknown request');
    // The reviewer's client sends the digest of the version they actually read. If the request was
    // amended in between, the rulebook rejects the vote instead of silently applying it to new terms.
    const entry = await this.#commit('REVIEW_VOTE', `reviewer:${reviewerId}`, { request_id: requestId, request_digest: digest ?? r.digest, reviewer_id: reviewerId, vote, reason: String(reason ?? '').trim() }, ts);
    const t = tally(r.votes, r.digest, s.policy);
    let decision = null;
    if (t.outcome !== 'pending') decision = await this.#commit('ACCESS_DECIDED', 'panel', { request_id: requestId, request_digest: r.digest, outcome: t.outcome, tally: t }, entry.ts);
    return { entry, tally: t, decision };
  }

  async release(requestId, { ts, releaseId: rid } = {}) {
    const s = await this.state();
    const r = s.requests.get(requestId);
    if (!r) throw new Error('unknown request');
    if (r.status !== 'approved') throw new Error(`request is ${r.status}; only approved requests can be released`);
    const time = ts ?? new Date().toISOString();
    const checks = runChecks(r.request, s.consents, s.policy, new Date(time), s.releases);
    if (!checks.passed) throw new Error('Release blocked at release time: ' + checks.blocks.map((b) => b.message).join(' '));
    const releaseId = rid ?? newId('rel');
    const records = [];
    for (const ref of checks.eligible) records.push({ record_id: await recordIdFor(releaseId, ref), terms_digest: s.consents.get(ref).terms_digest });
    records.sort((a, b) => (a.record_id < b.record_id ? -1 : 1));
    const req = r.request;
    const accessEnds = new Date(Date.parse(time) + req.duration_days * DAY).toISOString();
    const dataset = await syntheticDataset(releaseId, checks.eligible, req, s.consents);
    const eff = effectiveTerms(checks.eligible.map((ref) => s.consents.get(ref).terms));
    const manifest = {
      $schema: `${SCHEMA_BASE}/release-manifest.v1.json`,
      manifest_version: SCHEMA_VERSION,
      release_id: releaseId,
      commons: { id: s.commons.id, name: s.commons.name },
      released_at: time,
      recipient: clone(req.requester),
      request: { request_id: req.request_id, version: req.version, request_digest: r.digest },
      approval: { decision_entry: r.decision.hash, tally: r.decision.tally, vote_entries: r.votes.map((v) => v.hash) },
      // The binding terms: what the recipient may do. These travel with the data.
      terms: {
        purpose: req.purpose.code,
        purpose_description: req.purpose.description,
        data_categories: req.data_categories,
        deidentification: req.deidentification,
        cross_border_transfer: req.cross_border_transfer === true,
        access_ends_at: accessEnds,
        onward_sharing: false,
        reidentification_attempts: 'forbidden',
        on_expiry: 'delete all copies and confirm to the commons',
        on_withdrawal_notice: `delete the named record within ${s.policy.recipient_deletion_days} days and confirm`,
        consent_scope: eff,
      },
      obligations: req.benefit_commitments.map((code) => ({ code, description: BENEFITS[code], due: accessEnds })),
      records,
      record_count: records.length,
      dataset_digest: await digestOf(dataset),
      ledger_head_before_release: s.head,
      synthetic: true,
    };
    const signed = this.signer ? { ...manifest, signature: await this.signer.sign(manifest) } : manifest;
    const entry = await this.#commit('DATA_RELEASED', 'steward', { manifest: signed }, time);
    return { entry, manifest: signed, dataset };
  }

  async recordBenefit(releaseId, code, evidence, { ts, actor = 'steward' } = {}) {
    return this.#commit('BENEFIT_DELIVERED', actor, { release_id: releaseId, code, evidence: String(evidence ?? '').trim() }, ts);
  }
}

/**
 * Check a receipt a person kept against a copy of the ledger.
 * Detects: an edited receipt, a forged receipt, an edited ledger, and a ledger rewritten from scratch
 * (the receipt's entry hash will no longer be in it), which a hash chain alone cannot catch.
 */
export async function verifyReceipt(receipt, entries) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const genesis = entries[0];
  const key = genesis?.data?.signing_key;
  if (receipt.signature) {
    const { signature, withdrawal_code, ...body } = receipt; // eslint-disable-line no-unused-vars
    const v = await verifySignature(body, signature, { trustedKeyId: key?.key_id });
    add('Signature', v.ok, v.ok ? `Signed by this commons (key ${v.keyId}).` : v.reason);
  } else add('Signature', false, 'Receipt is not signed.');
  if (receipt.kind === 'consent_receipt') {
    const dg = await digestOf(receipt.terms);
    add('Terms fingerprint', dg === receipt.terms_digest, dg === receipt.terms_digest ? 'Terms match their fingerprint.' : 'Terms were changed after the receipt was issued.');
  }
  const chain = await verifyChain(entries);
  add('Ledger integrity', chain.ok, chain.ok ? `All ${chain.entries} entries link correctly.` : `Broken at entry #${chain.brokenAt}: ${chain.reason}`);
  const e = entries[receipt.ledger_entry?.seq];
  const present = e && e.hash === receipt.ledger_entry.hash;
  add('Entry is in the ledger', !!present, present ? `Found at entry #${e.seq}.` : 'The ledger does not contain this entry: it was removed or the history was rewritten.');
  if (present) add('Entry matches receipt', e.data?.terms_digest === receipt.terms_digest, e.data?.terms_digest === receipt.terms_digest ? 'Ledger entry records the same terms.' : 'Ledger entry records different terms.');
  let status = null;
  if (present && receipt.kind === 'consent_receipt') {
    const ref = receipt.terms.subject_ref;
    const w = entries.find((x) => x.type === 'CONSENT_WITHDRAWN' && x.data.subject_ref === ref);
    status = w ? 'withdrawn' : Date.parse(receipt.terms.expires_at) <= Date.now() ? 'expired' : 'active';
  }
  return { ok: checks.every((c) => c.ok), checks, status };
}
