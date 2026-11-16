# Threat model

**Scope:** the prototype as built (static web demo plus Node core and CLI), and what a real deployment would need. **Assets:** people's consent choices and their right to withdraw; the integrity of the record; the mental-health data the commons governs (in this repo, only *synthetic* stand-ins); the community's share of benefits.

## Who might attack, and why

| Actor | Possible goal |
|---|---|
| Operator or steward (insider) | Hide a withdrawal, widen a consent, release data that wasn't allowed, rewrite history after a mistake |
| Requester or researcher | Get approval for a narrow request and then widen it; get more data than consented; skip benefit obligations |
| Captured panel member | Approve requests the community wouldn't |
| Recipient of a release | Keep data after expiry or withdrawal; share it onward; re-identify people |
| Someone near a participant | Withdraw (or view) another person's consent |
| Outside attacker | Tamper with the demo or ledger copies; inject script |

## Threats, defences and what's left

| # | Threat | Defence in this prototype | Residual risk / what's needed |
|---|---|---|---|
| T1 | Edit, delete or reorder past entries | SHA-256 hash chain with sequence numbers; `verifyChain` reports the first broken entry | None for partial edits |
| T2 | Rewrite all history and recompute every hash | Signed receipts held by people name the exact entry hash; `verifyReceipt` detects it. Manifests embed decision-entry hashes, so naive rewrites also break the rule replay | Needs head hashes published regularly and copies held by independent parties. An operator with the signing key who rebuilds everything is caught only by outside witnesses |
| T3 | Truncate the ledger (drop the latest entries) | Receipts for later entries no longer match; published head hashes | Same as T2 |
| T4 | Write an entry that breaks governance rules (vote from a non-member, dishonest check results, release including a withdrawn person) | One rulebook (`applyEntry`) refuses it at write time **and** flags it on replay audit, even if hashes are recomputed | Rules are only as good as what they encode |
| T5 | Widen a request after approval | Votes and decisions are bound to the request's SHA-256 digest; amendments void prior votes; release must match the approved digest | — |
| T6 | Release data not covered by consent | Per-person `conflicts()` check at submission and again at release; exact-cohort rule on replay | Codes can't capture intent. Free-text purpose goes to human review |
| T7 | Withdrawal ignored after release | Withdrawal immediately excludes the person from future releases; deletion notices are logged with a deadline | Software can't force deletion on someone else's computer: needs data-use agreements and enforcement |
| T8 | Re-identification from released data | k ≥ 10 minimum; small-cell suppression (< 5) on totals; no names, numbers or addresses in the schema; per-release pseudonyms stop linking across releases | Not formal anonymisation. Free text and voice are high-risk; real de-identification is a separate, hard problem |
| T9 | Panel capture | 3-of-5 quorum with ≥ 2 community seats (two community rejections = rejected); a reason on every vote; votes public in the ledger | **Demo has no real identity**: anyone can act as any seat. Needs per-reviewer sign-in and keys, and community-run seat selection |
| T10 | Someone withdraws my consent | Requires my 80-bit private code; only its hash is stored | Code theft allows unwanted withdrawal. That fails safe (data stops being used) but is still a harm to agency. Needs a recovery and appeal path |
| T11 | Someone reads my consent | "Check my consent" needs the private code | The ledger itself holds pseudonymous choices; treat full copies as sensitive |
| T12 | Forged receipt or manifest | Ed25519 signatures; key declared in GENESIS | **Demo key lives in browser storage.** Needs keys on stewards' devices or hardware, a published key and rotation |
| T13 | Coerced or uninformed consent | Plain-language chat; "no" stated as safe and checked; comprehension questions from the person's own choices; stops after two misses | Can't detect coercion in the room. Facilitator training and private settings matter |
| T14 | Misleading translation | Notice fingerprint plus translation status stored in every consent, so affected consents can be found later | Translations are unreviewed drafts: **must** be reviewed before real use |
| T15 | Script injection or third-party tracking on the demo | No third-party scripts, fonts or analytics; strict Content-Security-Policy (`script-src 'self'`); DOM built with text nodes, not HTML strings | — |
| T16 | Clock manipulation | Entries must not go backwards in time; replay re-checks rules at each entry's own time | A wrong clock moving forwards isn't detected. Needs trusted time or witnesses for disputes |

## Out of scope for the prototype

Real identity and authentication; storing real health data; network sync between ledger copies; legal enforceability of data-use terms; formal privacy guarantees such as differential privacy; availability and denial-of-service.

## Privacy notes

- The demo sends nothing to any server: each browser has its own synthetic commons in `localStorage`.
- Consent records are pseudonymous, but choices combined with timestamps could still hint at identity in a small community. Full ledger copies should go only to the panel and auditors, with the head hash public.
- Withdrawal does **not** erase the consent entry, because history can't be edited. It adds a withdrawal entry. If a law or the community requires erasing even pseudonymous choices, a future version could store terms off-ledger and keep only their digest on the ledger, so erasing the stored terms leaves an unreadable fingerprint behind.
