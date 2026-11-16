// Append-only, hash-chained ledger. Every consent, withdrawal, access request, vote, decision, release,
// downstream notice and benefit report is one entry. Each entry stores the hash of the entry before it,
// so changing, deleting or reordering any past entry breaks every hash after it, and `verifyChain` finds it.
// Adapted from DisputeDesk's audit log (github.com/Quantumwoof/disputedesk), with canonical JSON hashing,
// explicit sequence numbers and a typed vocabulary added.
import { clone } from './canonical.js';
import { digestOf } from './hash.js';

export const GENESIS_PREV = '0'.repeat(64);
export const ENTRY_TYPES = Object.freeze([
  'GENESIS',                    // commons identity + governance rules (panel, quorum, k-minimum)
  'CONSENT_GRANTED',            // a person's consent terms (pseudonymous)
  'CONSENT_WITHDRAWN',          // the person took their yes back
  'ACCESS_REQUESTED',           // a researcher's request (or an amended version) + automatic check results
  'REVIEW_VOTE',                // one panel member's vote, bound to the exact request digest
  'ACCESS_DECIDED',             // quorum reached: approved or rejected
  'DATA_RELEASED',              // what was released, to whom, under which terms (the release manifest)
  'WITHDRAWAL_NOTICE_ISSUED',   // a recipient told to delete a withdrawn person's record
  'BENEFIT_DELIVERED',          // a benefit-sharing obligation reported as met
]);

export async function hashEntry(entry) {
  const { hash, ...body } = entry; // eslint-disable-line no-unused-vars
  return digestOf(body);
}

export class Ledger {
  #entries = [];
  #queue = Promise.resolve();
  constructor(entries = []) { this.#entries = entries.map(clone); }

  get entries() { return this.#entries.map(clone); }
  get length() { return this.#entries.length; }
  get head() { return this.#entries.at(-1) ? clone(this.#entries.at(-1)) : null; }
  at(seq) { return this.#entries[seq] ? clone(this.#entries[seq]) : null; }

  /** Build the next entry (with its hash) WITHOUT adding it, so callers can check rules first. */
  async prepare(type, actor, data = {}, { ts } = {}) {
    if (!ENTRY_TYPES.includes(type)) throw new Error(`unknown entry type ${type}`);
    const prev = this.#entries.at(-1);
    const time = ts ?? new Date().toISOString();
    if (prev && time < prev.ts) throw new Error('timestamps must not go backwards');
    const entry = { v: 1, seq: this.#entries.length, ts: time, type, actor: String(actor), data: clone(data), prev: prev?.hash ?? GENESIS_PREV };
    entry.hash = await hashEntry(entry);
    return entry;
  }
  /** Add a prepared entry. Refuses if anything was appended in between (no forks). */
  push(entry) {
    const prev = this.#entries.at(-1);
    if (entry.seq !== this.#entries.length || entry.prev !== (prev?.hash ?? GENESIS_PREV)) throw new Error('ledger moved on; prepare the entry again');
    this.#entries.push(clone(entry));
    return clone(entry);
  }
  /** Append one entry. Appends are serialised so two async callers can never fork the chain. */
  append(type, actor, data = {}, opts = {}) {
    const p = this.#queue.then(async () => this.push(await this.prepare(type, actor, data, opts)));
    this.#queue = p.catch(() => {});
    return p;
  }

  toJSONL() { return this.#entries.map((e) => JSON.stringify(e)).join('\n') + (this.#entries.length ? '\n' : ''); }
  static parseJSONL(text) {
    return String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`line ${i + 1} is not valid JSON`); }
    });
  }
  static fromJSONL(text) { return new Ledger(Ledger.parseJSONL(text)); }
}

/**
 * Check integrity of a whole chain. Returns { ok, entries, head } or { ok:false, brokenAt, reason }.
 * `brokenAt` is the first sequence number that fails, which is where someone tampered.
 */
export async function verifyChain(entries) {
  let prev = GENESIS_PREV, lastTs = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const fail = (reason) => ({ ok: false, entries: entries.length, brokenAt: i, reason });
    if (!e || typeof e !== 'object') return fail('entry is not an object');
    if (e.seq !== i) return fail(`sequence number is ${e.seq}, expected ${i} (an entry was removed, added or reordered)`);
    if (e.prev !== prev) return fail('prev does not match the hash of the entry before it');
    if (!ENTRY_TYPES.includes(e.type)) return fail(`unknown entry type ${e.type}`);
    if (i === 0 && e.type !== 'GENESIS') return fail('first entry must be GENESIS');
    if (i > 0 && e.type === 'GENESIS') return fail('only the first entry may be GENESIS');
    if (typeof e.ts !== 'string' || e.ts < lastTs) return fail('timestamp goes backwards');
    if ((await hashEntry(e)) !== e.hash) return fail('entry content does not match its hash (it was edited)');
    prev = e.hash; lastTs = e.ts;
  }
  return { ok: true, entries: entries.length, head: entries.length ? prev : null };
}
