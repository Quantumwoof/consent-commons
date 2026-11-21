# Consent Commons, explained

This guide is for Joshua, and for anyone who wants to understand Consent Commons well enough to explain it and defend it. Each part covers **what it is**, **why it's built that way**, **where the code is**, and **what a reviewer might ask**. No cryptography background needed.

---

## 0. The idea in one minute

When a young person uses a mental-health service, information builds up: what they typed, their wellbeing scores, how often they came. Researchers and AI builders want that information. Right now the usual pattern is that the community gives the data and other people decide what happens to it.

Consent Commons flips that. It's four pieces that work together:

1. **A consent format.** A person's choices become a small, structured record: *what* can be shared, *for what*, *with whom*, *for how long*, *what the community must get back*, and *whether it can leave Nigeria*.
2. **A consent conversation.** A chat in Pidgin, Yorùbá or English explains each choice plainly, checks the person understood, and only then records their consent.
3. **A ledger.** Every action (consent, withdrawal, request, vote, release) is written into a record that can't be secretly edited.
4. **A review panel.** When a researcher asks for data, the computer first removes everyone whose consent doesn't cover the request. Then a panel led by community members votes.

> **One-line pitch:** "The people the data comes from set the terms, and the terms are enforced by code, not just by a policy document."

---

## 1. The consent format (schema)

**What it is.** A JSON document with fixed fields. Here's a shortened real example from the demo:

```json
{
  "subject_ref": "p_3f9a12be44c07d1e",
  "language": "pcm",
  "purposes": { "allowed": ["public_health_research", "policy_statistics"], "denied": ["ai_training_commercial", "..."] },
  "data_categories": ["screening_scores", "demographics"],
  "permitted_users": ["commons_stewards", "nigerian_public_researchers"],
  "deidentification": "aggregated_only",
  "cross_border_transfer": false,
  "benefit_sharing": { "required": ["results_back"] },
  "expires_at": "2028-11-16T...",
  "withdrawal": { "allowed": true, "recipient_deletion_days": 30 },
  "notice": { "digest": "…", "translation_status": "draft_unreviewed" },
  "comprehension": { "questions": 4, "attempts": 1, "passed": true }
}
```

**Why codes instead of sentences?** A sentence like "my data may be used for good research" can't be checked by a computer. A code like `public_health_research` can. Every request uses the same codes, so the computer can compare a request with every person's consent automatically, in any language. The chat translates each code into plain words. *Code:* `src/core/vocab.js` (the codes) and `src/core/terms.js` (building and checking terms).

**Why "deny by default"?** If someone didn't actively say yes, it's a no. The `denied` list is written out in full so nobody has to guess.

**Why a pseudonym (`subject_ref`)?** The record never holds a name, phone number or address. It holds a random ID like `p_3f9a…`. The schema even forbids extra fields, so nobody can add a `name` field by accident.

**Why the `notice` fingerprint?** It's a SHA-256 hash of the exact text the person read, in their language, plus whether that translation was reviewed. If a sentence is later found to be confusing, you can find every consent that was given after reading it, and go back to those people.

**"Terms travel with the data."** When data is released, it goes with a **release manifest**: a signed document with the binding rules (purpose, expiry, no onward sharing, no re-identification, delete on withdrawal) plus, for each record, the fingerprint of the consent it came from. That's the answer to Mozilla's prompt about "a data format that carries a community's terms … wherever it goes".

**Likely questions**
- *"Why JSON Schema?"* It's an open standard that almost every programming language can validate. Other organisations can adopt the format without using our code.
- *"What if you need a new purpose later?"* Add a code, raise the schema version. Old consents stay valid for the old codes and simply don't cover the new purpose, which is the safe direction. People would have to be asked again.
- *"Isn't a fixed list too rigid?"* That's on purpose: a short list people can understand beats a long one they can't. The free-text purpose description in each request is for the human panel, which catches what codes can't (see the state-agency example in section 4).

---

## 2. The consent conversation (chat)

**What it is.** A WhatsApp-style chat (`web/chat.html`, `web/js/chat.js`). Text is in `src/i18n/en.js`, `pcm.js` and `yo.js`.

**The steps.** Choose a language → short explanation → "Continue / No thanks" → choose data types → purposes → who may use it → how it's shared (totals only, or records without names) → whether it may leave Nigeria → what the community must get back → how long → summary → **four comprehension questions** → final "Yes, record it" → receipt and private code.

**Why the comprehension check?** A tick-box proves someone clicked, not that they understood. The four questions are:
1. Can you take back your yes later? (Yes)
2. If you say no, does your support stop? (No)
3. Will researchers see your name or phone number? (No)
4. Can a company use your data to build AI it sells? **The right answer depends on what they chose**, so it tests *their* consent, not a script.

A wrong answer shows the explanation and asks again. Two misses on the same question stops the flow with "this part seems unclear, and that's on us, not you", and nothing is recorded. The code is in `comprehensionQuestions()` in `src/i18n/index.js`.

**Why say "No is fine" so many times?** In health settings, people may feel their care depends on agreeing. That pressure makes consent meaningless. The chat says it up front, and question 2 checks it.

**Why a private withdrawal code?** It's how a person proves "this consent is mine" without an account or a phone number. The commons stores only a *hash* of the code, so it can check a code but never knows it. *Code:* `codeDigest()` in `src/core/ids.js`.

**WhatsApp habits.** You can reply with option numbers ("1", "2") and type MENU, START or WITHDRAW (also COMOT in Pidgin).

**Likely questions**
- *"Are the translations good?"* "They're drafts, and they're marked as unreviewed everywhere: on screen, in the code, and inside every consent record. The first step of the fellowship is review with native speakers and the community." **Don't** claim they're verified.
- *"What about people who can't read?"* "Text isn't enough. The roadmap has voice prompts and facilitator-led consent on an offline Android phone, which matches how SRHIN's facilitators already work."
- *"Is this actually WhatsApp?"* "No. It's a web demo that looks and works like WhatsApp, so it's familiar. Connecting to real WhatsApp would need the WhatsApp Business API, and that's on the roadmap."

---

## 3. The ledger

**What it is.** An append-only list of entries in JSON Lines format. Each entry has a type (`CONSENT_GRANTED`, `REVIEW_VOTE`, `DATA_RELEASED` and so on), a time, who did it, the data, the **hash of the previous entry**, and its own hash. *Code:* `src/core/ledger.js`.

**The chain in plain words.** A hash is a fingerprint: change one letter of the input and the fingerprint changes completely. Every entry includes the previous entry's fingerprint. So if someone edits entry #5, its fingerprint changes, entry #6 no longer matches, and verification fails at #5. Delete an entry and the numbering and links break. Reorder and the links break. This is the same idea as DisputeDesk's audit log, improved: keys are sorted before hashing ("canonical JSON", `src/core/canonical.js`), so the same data always gives the same fingerprint, and every entry has a sequence number.

**The rulebook replay (this is the strong part).** The chain only proves that nobody edited the bytes. It doesn't prove the rules were followed. So there's one function, `applyEntry()` in `src/core/commons.js`, that holds every rule. For example:
- a vote must come from a panel member, have a reason, and match the current request fingerprint;
- a decision must match the actual votes;
- a release may only contain people whose consent covers the request *at that moment*;
- the check results written into a request must match a fresh re-run of the checks.

That function runs **before** anything is written (so a bad action is refused), and **again** when anyone audits (`commons verify`), replaying every entry from the start. An audit therefore answers two questions: *was anything edited?* and *was any rule broken?*

**The weakness, and how receipts cover it.** If the operator controls the whole ledger, they could edit history and **recompute every hash**, and the chain would look perfect. A chain on its own can't stop that. Two things can:
1. **Receipts.** Each person gets a signed receipt that names the exact entry and its hash. If history is rewritten, their receipt no longer matches. Thousands of receipts in thousands of pockets are thousands of witnesses.
2. **Published head hash.** The fingerprint of the latest entry, published regularly (on a website, in community meetings), pins down the whole history up to that point.

The Tamper lab on the Ledger page shows all three attacks (edit, delete, rewrite and re-hash) and which defence catches each one.

**Signatures.** Receipts and release manifests are signed with Ed25519, a standard digital-signature method built into browsers. A signature proves *who issued* a document. A person can show their receipt to anyone, and the commons can't later deny issuing it. In the demo the key is stored in the browser. That's fine for a demo but not for real use (see the threat model).

**Likely questions**
- *"Why not a blockchain?"* "We need tamper-evidence and public auditability, not a currency or a global consensus. A hash chain plus copies held by independent parties gives that for free. It runs offline, costs nothing, and doesn't put health-related records on a public chain forever, which would clash with the right to withdraw."
- *"Is the ledger public? Doesn't it leak data?"* "It holds pseudonyms and consent choices, not health data. In a real deployment, the full ledger would go to the panel and auditors, and the head hash would be public. Even the ledger should be treated as sensitive, because choices plus timing could hint at who someone is."
- *"What happens to the ledger when someone withdraws?"* "The consent entry stays, because you can't edit history. A withdrawal entry is added, and from then on the system treats that consent as gone. The record of the withdrawal is itself the person's protection."

---

## 4. The access-review panel

**What it is.** `web/review.html` and `web/js/review.js`, with the rules in `src/core/policy.js` (`runChecks`, `tally`) and enforcement in `src/core/commons.js`.

**Step 1: automatic checks (before any human sees it).** For every active consent, the code asks whether it covers this request: the purpose, the type of organisation, every data type, outside Nigeria or not, records or totals, every benefit the person insisted on, and whether the consent lasts until the access period ends (`conflicts()` in `src/core/terms.js`). People who don't match are left out, and the screen shows why. Then the request is **blocked** if:
- fewer than **10** people's consent covers it (small groups are easier to re-identify);
- it's vague (purpose under 40 characters) or promises no benefit;
- it asks for more than 730 days;
- it's a follow-up on named records and **any** of them has withdrawn or doesn't match ("touches withdrawn consent").

**Step 2: the panel votes.** There are five seats: youth, lived experience, community health worker (the three community seats), data steward and ethics reviewer. Approval needs **3 of 5, including at least 2 community seats**. If two community seats reject, it can't pass, so the community effectively holds a veto. Every vote needs a written reason.

**Why votes are bound to the digest.** The request's fingerprint (SHA-256 of its canonical JSON) goes into every vote. If the requester amends anything, the fingerprint changes and earlier votes stop counting. The demo shows this with the NGO request: a steward approved version 1; the youth rep asked for a shorter time; version 2 started from zero votes. This is exactly DisputeDesk's "approval bound to the payload digest", applied to people's data.

**Step 3: release.** Release re-runs the checks *at that moment*. Anyone who withdrew after the vote is dropped, and if that takes the group below 10, the release is blocked. The manifest is signed and lists the binding terms, the benefit obligations with due dates, and the records. Each record gets a **new pseudonym for every release**, so two recipients can't link their data.

**Step 4: after release.** If someone in a release withdraws, a **withdrawal notice** is automatically logged: that recipient must delete that record within 30 days. Benefit obligations show as open, overdue or delivered, and "delivered" needs written evidence in the ledger.

**The five demo stories (all fictional):**
| Request | Result | Shows |
|---|---|---|
| Public-health lab: mood scores by age and state, totals only | Released | the happy path, and benefits being tracked |
| AI startup: chat transcripts for a commercial chatbot, sent abroad | Blocked (0 people) | consent enforced automatically |
| NGO: usage counts for advocacy | Amended, in review | digest binding: old votes void |
| Follow-up on the first study's group | Blocked | touches someone who withdrew |
| State agency: "find distressed neighbourhoods for enforcement teams" | Passed the checks, **rejected** by community seats | why humans are still needed |

**Likely questions**
- *"Who chooses the panel?"* "The community, in co-design. The demo's seats are a proposal, written into the ledger's first entry so the rules are on the record. Changing them should be a visible, voted decision."
- *"Why 10 and not 5 or 50?"* "It's a starting number to discuss with the community and an ethics reviewer. The point is that there *is* a floor, it's public, and code enforces it."
- *"Can't a researcher just lie in the description?"* "Yes, and no software fixes that. The panel reads the description, the manifest makes the agreed terms provable, and benefit delivery is tracked in public. Misuse becomes visible and attributable, which is what contracts and enforcement need."
- *"Isn't excluding people bias?"* "The screen shows how many people are left out and why, and warns when a request covers under half of active consents, so researchers know their sample may not represent the community. Respecting a 'no' is the point."

### Plain-words summary and USSD (low connectivity)

- **Plain-words summary** (Releases & benefits → *View plain-words summary*): the release manifest in plain words for a community meeting, in English, Pidgin or Yorùbá, printable. The green badge means code checked six things: the signature is from the commons key, the ledger chain is unbroken, this exact manifest is on the ledger, the approval it names is on the ledger for the same request version, recounting the votes gives the same tally, and every rule still holds on replay. "Try a changed copy" edits one number in a copy and the badge turns red. Say: *"It proves the record is genuine. It can't prove the lab obeys the rules in real life; that's what benefit tracking and the panel are for."*
- **USSD simulation** (`/ussd.html`): a keypad-phone screen. Dial `*347*22#` (an example, not a real code), press 1 to check or 2 to take your yes back, enter a withdrawal code. It calls the same `withdraw` as the chat, so the ledger and the deletion notices are identical. Say: *"This is a simulation of how someone with no data would withdraw. A real USSD needs a telecom partner and digits-only codes."*
- **Assisted label** (chat, under the phone): tick it when a community health worker is helping. The consent records `collected_via: assisted_offline_demo`. Say: *"It's a label in the demo. Saving offline on the worker's device and syncing later is planned, not built."*

---

## 5. How to talk about what's real

Say:
- "Working prototype, open source, on synthetic data."
- "66 automated tests, including tamper-detection tests."
- "Translations are drafts awaiting native-speaker review."
- "Designed for SRHIN's published brief; not an SRHIN tool."

Don't say:
- that anyone uses it, or quote user numbers (until testers really have used it);
- that SRHIN or Mozilla has seen, liked or endorsed it;
- that it's legally compliant or "anonymised" in a formal sense;
- that the translations are verified.

---

## 6. Harder reviewer questions

**"What did *you* build, and what did AI build?"** Answer honestly. The design reuses your DisputeDesk ideas (hash-chained log, digest-bound approvals). AI coding tools helped write the code, and you directed and reviewed it. Then show you understand it by walking through sections 1–4.

**"Why should Mozilla fund this, not a bigger organisation?"** It's built in Nigeria, for a Nigerian host's exact brief, in the languages of the people involved. It's small, open and free to run, so a community organisation can own it, not rent it.

**"What's the biggest risk?"** "That it's built *for* the community and not *with* them. That's why months 1–3 are co-design, and why nothing here is called final."

**"What does success look like after 12 months?"** "Young people, people with lived experience and health workers can explain in their own words what they agreed to. A real panel has reviewed at least one real request. The consent format has been published as an open spec, and someone outside the project has implemented it." Don't promise numbers you can't back.

**"How does this survive after the fellowship?"** No paid services and no server. Static files and a ledger file anyone can verify. Documentation written for non-experts. A hand-over plan to community maintainers.

**"What if the ledger file is lost?"** Copies should be held by more than one party (the host, the panel, an independent auditor). Receipts and published head hashes let a restored copy be checked.

**"How does it fit Mozilla's three questions?"** *Agency:* people set and can withdraw their own terms. *Commons:* open schema and open code that anyone can adopt. *Economic conditions:* benefit-sharing is a condition of access, written into every release, so data stops flowing one way for free.

---

## 7. Map of the code

| File | What's in it |
|---|---|
| `src/core/canonical.js` | sorted-key JSON so hashes are stable |
| `src/core/hash.js` | SHA-256, personal codes, IDs (Web Crypto) |
| `src/core/ledger.js` | the hash chain: prepare, push, append, verifyChain |
| `src/core/vocab.js` | the codes: purposes, data types, users, benefits |
| `src/core/terms.js` | build and check consent terms; `conflicts()` compares terms with a request |
| `src/core/policy.js` | governance rules, automatic checks, quorum `tally()` |
| `src/core/commons.js` | the rulebook (`applyEntry`), replay, audit, the `Commons` engine, `verifyReceipt`, `verifyManifest` |
| `src/core/signer.js` | Ed25519 signatures |
| `src/core/synthetic-records.js`, `seed.js` | fake data and the demo story |
| `src/i18n/*` | the three languages, notice fingerprints, comprehension questions |
| `src/core/ussd.js` | the USSD session: menus, ≤ 160-character screens, check and withdraw through the same engine as the chat |
| `web/*` | the pages (chat, review, summary, USSD, ledger); `store.js` keeps the demo in your browser |
| `bin/commons.js` | the command-line auditor |
| `tests/*` | 66 tests; read `tests/commons.test.js` for the rules in action |

**Practise:** run `npm test`, then `node bin/commons.js tamper-demo examples/demo-ledger.jsonl`, and explain out loud what each line of output means. If you can do that, you can defend this project.
