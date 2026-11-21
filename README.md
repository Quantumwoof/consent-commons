# Consent Commons

**Community-owned consent, access review and benefit-sharing for a mental-health data commons.**
Portable consent terms · a plain-language consent chat in Nigerian Pidgin, Yorùbá and English · a community review panel with quorum · a tamper-evident ledger anyone can audit.

**Live demo:** https://consent-commons.vercel.app · **Explainer:** [docs/EXPLAINER.md](docs/EXPLAINER.md) · **Schema:** [docs/SCHEMA.md](docs/SCHEMA.md) · **Threat model:** [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)

> [!IMPORTANT]
> **Synthetic data only.** Every person, organisation, reviewer and record in this repository and demo is made up. There is no real health data anywhere in this project.
> **Independent prototype.** Built by Joshua Jubelo in response to a brief published by the Slum & Rural Health Initiative (SRHIN) in the Mozilla Foundation 2027–2028 Fellowship call. It is **not** an SRHIN product or tool, and it is not endorsed by SRHIN or Mozilla.
> **Not yet tested with people.** The Pidgin and Yorùbá text is an **unreviewed draft** and must be reviewed by native speakers, and co-designed with young people, people with lived experience and community health workers, before any real use.

---

## The problem

In the 2027–2028 Mozilla Fellowship call, SRHIN describes the challenge like this:

> "Mental health data from African communities is increasingly used to build AI, often without meaningful consent, community control, or any share of the benefits. This repeats an extractive pattern in which communities supply the data while others decide how it's used and who profits."

They ask for **community-owned tools for governance, consent, privacy and benefit-sharing**, piloted with **young people, people with lived experience and community health workers**, towards a **mental-health data commons**.

SRHIN already runs AI mental-health tools (its BraveHeart WhatsApp companion and offline clinical assistant, in English, Yorùbá and Pidgin; see [srhin.org](https://srhin.org/braveheart-innovation-tools/)). Consent Commons is **not another chatbot**. It is the governance layer that would sit *around* tools like those, so that any later use of the data happens only on terms the community set.

## What it does

| Part | What a person sees | What it guarantees |
|---|---|---|
| **1. Consent schema** ([schema/](schema/), [docs/SCHEMA.md](docs/SCHEMA.md)) | Nothing: it's the format | Consent is machine-readable: purposes, data types, who may use it, protection level, whether it can leave Nigeria, required benefits, expiry, withdrawal. Deny by default. Pseudonymous. Versioned JSON Schema. |
| **2. Consent chat** ([web/chat.html](web/chat.html)) | A WhatsApp-style conversation in Pidgin, Yorùbá or English | Plain words, one choice at a time. Four comprehension questions *generated from the person's own choices*; nothing is recorded until they're answered correctly and the person says yes. "No" never affects their support. They get a signed receipt and a private withdrawal code. |
| **3. Ledger** ([web/ledger.html](web/ledger.html), `commons verify`) | A public record and a tamper lab | Every consent, withdrawal, request, vote, decision, release, deletion notice and benefit report is one hash-chained entry. Anyone can verify the bytes **and replay every governance rule** from the start. |
| **4. Access review** ([web/review.html](web/review.html)) | Researchers submit requests; a 5-seat community panel votes | Automatic checks drop everyone whose consent doesn't cover the request, and block it if fewer than 10 remain or it touches withdrawn consent. Approval needs 3 of 5 votes including 2 of 3 community seats. Each vote is bound to the request's SHA-256 digest, so changing the request voids the votes. Release re-checks at that moment and ships with a signed manifest of binding terms and benefit obligations. |
| **5. Plain-words release summary** ([web/summary.html](web/summary.html)) | One release explained for a community meeting, in English, Pidgin or Yorùbá; printable | Who got the data, for what, the vote tally, the rules, benefits owed and withdrawal notices. A badge re-checks the manifest against the ledger (signature, chain, release and approval on the ledger, vote recount, rule replay) and shows a clear failure on a changed copy. |
| **6. USSD simulation** ([web/ussd.html](web/ussd.html)) | A keypad-phone screen: dial `*347*22#` (example code), check consent or take your yes back with no data | **Simulation only, no phone network.** The session logic ([src/core/ussd.js](src/core/ussd.js)) uses the same lookup and the same `withdraw` as the chat, so the ledger events, deletion notices and audit are identical. Every screen is ≤ 160 characters (tested). |

## Try it

- **Online:** open the [live demo](https://consent-commons.vercel.app). Each browser gets its own synthetic commons in `localStorage`; nothing is sent to a server. "Reset demo" on the Ledger page starts over.
- **Locally** (Node ≥ 20, no dependencies needed to run):
  ```bash
  git clone https://github.com/Quantumwoof/consent-commons && cd consent-commons
  npm start            # builds dist/ and serves http://localhost:5173
  npm install && npm test   # 66 tests (Ajv is the only dev dependency, for schema tests)
  ```
- **Audit a ledger from the command line:**
  ```bash
  node bin/commons.js seed --out examples/demo-ledger.jsonl   # build the synthetic demo ledger
  node bin/commons.js verify examples/demo-ledger.jsonl       # hash chain + rule replay
  node bin/commons.js tamper-demo examples/demo-ledger.jsonl  # edit/delete an entry in memory, watch it get caught
  node bin/commons.js check examples/access-request.example.json examples/demo-ledger.jsonl
  node bin/commons.js validate examples/consent-terms.example.json --schema consent-terms
  ```

**Who are you?** The app opens on a launch screen with three roles, each with its own colour, shape and home screen, and a strip on every page saying whose view it is:

| Role | Marked by | Home screen | What they do |
|---|---|---|---|
| Community member | green circle | [community.html](web/community.html) | Give, change or withdraw consent (chat or USSD), see what was shared, check a receipt |
| Researcher | blue square | [researcher.html](web/researcher.html) | Write or change a data request and follow it through the checks and the panel vote (`review.html?as=researcher`) |
| Review panel | purple diamond | [panel.html](web/panel.html) | Vote on requests (3 of 5, incl. 2 of 3 community seats), release data, track benefits |
| Anyone | grey ring | [ledger.html](web/ledger.html) | Audit the public ledger |

The longer explanation lives on [about.html](web/about.html).

### A 2-minute walkthrough of the demo

1. **Consent chat:** pick Pidgin. Choose what to share and with whom. Get one comprehension question wrong on purpose: it re-explains and asks again. Say yes; keep the code.
2. **Review panel → Requests to review:** the seeded story shows every path. A public-health study **released**; a commercial chatbot company **blocked** automatically (0 people consented to that); an NGO request **amended** mid-review, so the earlier vote no longer counts; a follow-up **blocked** because it names someone who withdrew; and a state agency request that passed every automatic check but was **rejected by the community seats** because "enforcement teams" were not what people agreed to.
3. **Researcher → New data request:** type a request and watch the live preview tell you how many people's consent covers it, and why the others are excluded.
4. **Back in the chat:** type `WITHDRAW` and your code. If you were in a release, the recipient gets a deletion notice (see *Releases & benefits*).
5. **No data? USSD:** open *USSD*, dial `*347*22#`, press 2 and use the sample code (a synthetic person in the released study). Then open the release's **plain-words summary**: a new withdrawal notice appears and the badge is still green. Press "Try a changed copy" to see it fail.
6. **Ledger → Tamper lab:** edit a consent, delete a withdrawal, or rewrite history and re-hash everything, then see which defence catches each one.

## How it works

```
 person ──chat──▶ consent terms (JSON) ──▶ CONSENT_GRANTED ─┐       receipt (signed) ──▶ person keeps it
                                                            │
 researcher ──▶ access request ──▶ automatic checks ──▶ ACCESS_REQUESTED (digest D, results)
                                       │ blocked? stop here  │
                     panel votes on D ─┴──▶ REVIEW_VOTE ×n ──▶ ACCESS_DECIDED (quorum)
                                                            │
                     re-check now ──▶ DATA_RELEASED (signed manifest: binding terms, obligations, records)
                                                            │
 person ──WITHDRAW──▶ CONSENT_WITHDRAWN ──▶ WITHDRAWAL_NOTICE_ISSUED (recipient must delete in 30 days)
 steward ──▶ BENEFIT_DELIVERED (evidence)        every arrow = one hash-chained ledger entry
```

The ledger *is* the database. Every screen is computed by replaying it (`replay()` in [src/core/commons.js](src/core/commons.js)).

## Design choices, in plain words

- **Codes, not paragraphs.** A consent says `ai_training_commercial: denied`, not a page of legal text. That's what lets a computer check every request against every person's terms, in any language. Text in the chat explains each code in plain words. (See [src/core/vocab.js](src/core/vocab.js).)
- **Deny by default.** Anything a person didn't actively say yes to is a no.
- **The terms travel with the data.** Every release carries a signed manifest with the binding terms (purpose, data types, expiry, "no onward sharing", "no re-identification"), the benefit obligations, and for each record the fingerprint of the exact consent it came from. A recipient can't claim they didn't know the terms.
- **Proof of what was shown.** Each consent stores a SHA-256 fingerprint of the exact wording the person read and whether that translation was reviewed. If a sentence is later found to be confusing, you can find everyone who saw it.
- **Check understanding, not just a tick-box.** Four short yes/no questions, built from the person's own choices (for example, "Can a company use your data to build AI it sells?" has a different right answer depending on what they chose). A wrong answer re-explains; two misses on the same question stops and suggests talking it through with a health worker. Nothing is recorded.
- **"No" is safe.** The chat says it, and a comprehension question checks it: support never depends on saying yes.
- **The withdrawal code stays with the person.** Only its hash is stored, so the commons can check a withdrawal is genuine but can't withdraw on someone's behalf. (Losing the code is a real problem in practice; see [Limitations](#limitations).)
- **One rulebook, used twice.** The same function (`applyEntry`) refuses rule-breaking actions *before* they are written, and re-checks every past entry when anyone audits the ledger. So an audit proves more than "the bytes weren't edited": it proves "no one released data from someone who'd withdrawn", "every vote came from a panel member", "the recorded check results are honest", and so on.
- **Votes are bound to a fingerprint.** A vote approves one exact version of a request (its SHA-256 digest). If the requester changes anything, the digest changes and the old votes stop counting. Nobody can get approval for a mild request and then quietly widen it. (Reused from DisputeDesk's digest-bound approvals.)
- **The community holds the majority, and effectively a veto.** 3 of 5 approvals, and at least 2 must come from the youth, lived-experience and community-health-worker seats. If two community seats reject, the request can't pass.
- **Every vote needs a reason**, approvals included, and reasons go on the record.
- **A minimum group size (k = 10).** Small groups are easier to re-identify, so no release ever comes from fewer than 10 compatible people. Aggregated releases also hide any count below 5.
- **Re-check at release time.** Approval isn't the last word: anyone who withdrew after the vote is dropped, and if that takes the group below 10 the release is blocked.
- **A new pseudonym per release.** The same person has a different record ID in every release, so two recipients can't join their datasets on a shared ID.
- **Receipts are witnesses.** A hash chain alone can't stop the operator rewriting all of history and re-hashing it. A signed receipt in the person's hands names the exact entry hash, so a rewritten ledger no longer matches it. The Tamper lab shows this.
- **No server, no accounts, no tracking.** The demo is static files. Hashing (SHA-256) and signatures (Ed25519) use the browser's built-in Web Crypto. The same core code runs in Node for the CLI and tests. There are zero runtime dependencies.

## Threat model (summary)

Full version: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

| Threat | Defence | Limit |
|---|---|---|
| Operator quietly edits or deletes a past consent or withdrawal | Hash chain breaks at that entry; `verify` shows where | A full rewrite with re-hashing passes the chain alone… |
| …operator rewrites all history and re-hashes | Signed receipts held by people and published head hashes no longer match | Only if someone checks; the head hash must actually be published |
| Request approved, then widened | Votes are bound to the request digest; amendments void them | |
| Data released from people who didn't agree | Automatic checks per person; re-check at release; rule replay on audit | Only as good as the vocabulary: free-text purposes still need human judgement (hence the panel) |
| Panel captured by staff or a requester | Community-majority quorum; reasons on the record | Demo has no real identity: anyone can "act as" a seat |
| Re-identification from a release | k ≥ 10, small-cell suppression, no names or numbers, per-release pseudonyms | Not formal anonymisation; free-text or voice data stays high-risk |
| Someone else withdraws my consent | Needs my private code | Code theft = unwanted withdrawal (fails safe: data stops being used) |
| Recipient ignores the terms | Signed manifest makes the terms provable; deletion notices on the record | Code can't force deletion on someone else's computer: needs contracts and enforcement |

## Limitations

Honest list. Most are the reason the 12-month fellowship exists.

- **No real-world testing yet.** No real participants, reviewers or researchers have used this. There are no user numbers.
- **Draft translations.** Pidgin and Yorùbá were drafted without native-speaker review. Hausa isn't there yet. See [docs/TRANSLATION_REVIEW.md](docs/TRANSLATION_REVIEW.md).
- **Demo identity and keys.** You can act as any panel seat, and the signing key lives in your browser. A real deployment needs per-reviewer sign-in, keys on reviewers' own devices, and key rotation.
- **One ledger in one place.** A real commons needs replicated copies held by independent parties and a regularly published head hash.
- **Fixed rules.** The governance rules (panel seats, quorum, k-minimum) are set in the ledger's first entry and can't yet be changed. Changing them should itself be a community vote recorded in the ledger. That's planned, not built.
- **Lost codes.** If a person loses their withdrawal code, they need a human-verified recovery path (for example, through a known community health worker). That's not built.
- **Literacy and access.** Text chat excludes people who can't read comfortably. Voice consent is needed. The chat's "assisted by a health worker" option is only a **label** (`collected_via: assisted_offline_demo`); offline storage on a worker's device and later sync are not built.
- **USSD is simulated.** No telecom short code, no network, no SMS. Real withdrawal codes contain letters, which are slow to type on a keypad; a real rollout needs a digits-only code and a lookup that resists guessing. Yorùbá tone marks would need UCS-2 on real networks, which shortens the screen budget.
- **Not legal advice.** Built with ideas like explicit consent, purpose limitation and withdrawal in mind, but not reviewed against Nigeria's Data Protection Act 2023 or any ethics framework by a lawyer or an ethics committee.
- **Not a dataset tool.** The released "dataset" is synthetic. Real de-identification of free text and audio is a hard, separate problem.

## Roadmap for a 12-month fellowship

A starting point only. In the Embedded track, the project is co-defined with the host after selection.

1. **Months 1–3, co-design.** Workshops with young people, people with lived experience and community health workers to rewrite the consent conversation, the vocabulary and the panel rules in their words. Native-speaker review and back-translation of Pidgin and Yorùbá; add Hausa. Independent ethics and legal review.
2. **Months 4–6, fit the real channels.** Offline-first consent on low-cost Android for facilitator-led sessions (sync the ledger when back online), WhatsApp delivery of the same flow, voice prompts for low literacy, and a human-verified recovery path for lost codes.
3. **Months 7–9, pilot the panel.** Real panel seats with their own sign-in and keys, replicated ledger copies held by more than one party, a published head hash, and benefit-sharing tracking on a first real (non-sensitive or consented) data request.
4. **Months 10–12, make it reusable.** Publish the consent vocabulary and schemas as an open specification other African data commons can adopt; documentation, an evaluation of what people understood and trusted, and a hand-over plan so the community, not one developer, maintains it.

## Project layout

```
src/core/       consent terms, policy checks, ledger, rulebook + engine, signatures, synthetic data
src/i18n/       en, pcm (Pidgin), yo (Yorùbá) strings; notice fingerprints; comprehension questions
web/            static demo: launch screen + role home screens (community, researcher, panel), chat, review dashboard, release summary, USSD simulation, ledger explorer (no framework, no build step beyond copying)
schema/         JSON Schemas (generated from src/core/vocab.js; tests fail if they drift)
bin/commons.js  CLI: seed, verify, verify-receipt, check, tamper-demo, validate
tests/          66 tests (node:test)
docs/           EXPLAINER, SCHEMA, THREAT_MODEL, TRANSLATION_REVIEW, USER_TESTING_KIT (draft)
```

## Credits and disclosure

- Built by Joshua Jubelo (Independent), Nigeria. The hash-chained log and digest-bound approval come from his earlier project [DisputeDesk](https://github.com/Quantumwoof/disputedesk).
- Built with the help of AI coding tools, directed and reviewed by the author.
- The brief quoted above is from the Mozilla Foundation 2027–2028 Fellowship call. SRHIN and Mozilla are named only to explain what this prototype responds to. Neither has reviewed or endorsed it.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 Joshua Jubelo.
