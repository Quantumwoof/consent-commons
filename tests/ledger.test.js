import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, verifyChain, hashEntry, GENESIS_PREV } from '../src/core/ledger.js';

async function sample() {
  const l = new Ledger();
  await l.append('GENESIS', 'steward', { commons: { id: 'x', name: 'x' }, policy: { panel: [1] } }, { ts: '2026-01-01T00:00:00Z' });
  for (let i = 0; i < 5; i++) await l.append('CONSENT_GRANTED', `person:${i}`, { i }, { ts: `2026-01-0${i + 2}T00:00:00Z` });
  return l;
}

test('a fresh chain verifies and links each entry to the previous hash', async () => {
  const l = await sample();
  const r = await verifyChain(l.entries);
  assert.equal(r.ok, true); assert.equal(r.entries, 6);
  assert.equal(l.entries[0].prev, GENESIS_PREV);
  for (let i = 1; i < 6; i++) assert.equal(l.entries[i].prev, l.entries[i - 1].hash);
});
test('editing any field of any entry is detected at that entry', async () => {
  const l = await sample();
  for (const field of ['data', 'actor', 'ts', 'type']) {
    const e = l.entries;
    if (field === 'data') e[3].data.i = 99;
    if (field === 'actor') e[3].actor = 'someone-else';
    if (field === 'ts') e[3].ts = '2026-01-04T00:00:01Z';
    if (field === 'type') e[3].type = 'CONSENT_WITHDRAWN';
    const r = await verifyChain(e);
    assert.equal(r.ok, false, field); assert.equal(r.brokenAt, 3, field);
  }
});
test('deleting, inserting, reordering and truncating', async () => {
  const l = await sample();
  const del = l.entries; del.splice(2, 1);
  assert.equal((await verifyChain(del)).brokenAt, 2);
  const swap = l.entries; [swap[2], swap[3]] = [swap[3], swap[2]];
  assert.equal((await verifyChain(swap)).ok, false);
  const ins = l.entries; ins.splice(2, 0, { ...ins[2] });
  assert.equal((await verifyChain(ins)).ok, false);
  // Truncation keeps a valid chain: only an outside copy of the head hash (or a receipt) reveals it.
  const cut = l.entries.slice(0, 4);
  const r = await verifyChain(cut);
  assert.equal(r.ok, true); assert.notEqual(r.head, l.head.hash);
});
test('re-hashing after an edit fools the chain alone (why receipts exist)', async () => {
  const e = (await sample()).entries;
  e[2].data.i = 42;
  for (let k = 0; k < e.length; k++) { e[k].prev = k ? e[k - 1].hash : GENESIS_PREV; e[k].hash = await hashEntry(e[k]); }
  assert.equal((await verifyChain(e)).ok, true);
});
test('appends are serialised: concurrent writers cannot fork the chain', async () => {
  const l = await sample();
  await Promise.all(Array.from({ length: 20 }, (_, i) => l.append('REVIEW_VOTE', 'r', { i }, { ts: '2026-02-01T00:00:00Z' })));
  assert.equal((await verifyChain(l.entries)).ok, true); assert.equal(l.length, 26);
});
test('rules on structure: GENESIS first, unknown types, backwards time, JSONL round trip', async () => {
  const l = await sample();
  await assert.rejects(l.append('NOT_A_TYPE', 'x', {}));
  await assert.rejects(l.append('REVIEW_VOTE', 'x', {}, { ts: '2025-01-01T00:00:00Z' }));
  const bad = l.entries.slice(1);
  assert.equal((await verifyChain(bad)).ok, false);
  const round = Ledger.fromJSONL(l.toJSONL());
  assert.deepEqual(round.entries, l.entries);
  assert.throws(() => Ledger.parseJSONL('{"ok":1}\nnot json'), /line 2/);
});
