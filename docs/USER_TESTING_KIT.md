# User-testing kit (draft)

A short, low-risk way to get honest feedback on the consent chat from 5–10 people before the Letter of Intent. **This is usability feedback on a demo, not research on people.** If you plan to publish the results as research, get ethics review first.

## Ground rules

- **Synthetic only.** Testers use the public demo (https://consent-commons.vercel.app). It stores nothing outside their own browser, and they should **not** type anything real about themselves.
- **Adults only (18+).** Even though the commons is aimed at young people, test with adults for now: young adults 18–24 are the closest safe group.
- **Nobody shares their own mental-health story.** Ask about the *tool*, not about their life. If someone starts to share something personal, gently stop and offer support information.
- **Voluntary.** They can stop at any time, without giving a reason.
- **Anonymous notes.** Record a code (T1, T2 …), age band and preferred language. No names or phone numbers in your notes. Ask before quoting anyone, and quote them anonymously.
- **No promises.** Say clearly it's a prototype and you aren't offering a service.

## Who to ask (aim for a mix)

| Group | Why | Target |
|---|---|---|
| Young adults 18–24 | Closest to the intended users | 3–4 |
| Community health workers or facilitators | They would run consent in practice | 2–3 |
| Fluent Pidgin speakers | Translation check | at least 2 |
| Fluent Yorùbá speakers | Translation check, including tone marks | at least 2 |

One person can count in more than one group.

## Session (about 15 minutes, on the tester's phone)

**Opening (say in your own words):** "I'm building a prototype tool that lets communities decide how health data can be used. Everything in it is made up. I'm testing whether the explanations are clear, not testing you. You can stop any time. Can I take anonymous notes?"

**Tasks (don't help unless they're stuck for 30 seconds; note where they hesitate):**
1. Open the chat link and choose the language you're most comfortable reading.
2. Go through it and make the choices *you think you'd make* if it were real.
3. Answer the four check questions.
4. Save your private code somewhere, then use **Check my consent**.
5. Use **Withdraw my consent**.

**Debrief questions:**
1. In your own words, what did you just agree to? *(compare with their choices: this is the key measure)*
2. Was anything confusing? Which screen?
3. (Pidgin or Yorùbá readers) Which words or sentences sounded wrong, stiff, or like a machine wrote them? How would you say it?
4. Did you feel you could say no? Why or why not?
5. Would you trust this with real information? What would change your mind?
6. What should a community get back when its data is used?
7. Anything you'd remove, add or change?

## Observation sheet (one row per tester)

| Tester | Age band | Group | Language | Finished? | Check questions right first time (of 4) | Could explain their choices? (yes / partly / no) | Confusing parts | Translation fixes | Trust (1–5) | Top suggestion |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | | | | | | | | | | |

## Turning feedback into honest traction

- Fix what you learn, and keep a **change log**: "Changed X because testers said Y" is strong evidence of co-design.
- Report exactly what happened, for example: "7 adults (4 young adults, 3 CHWs) tested the consent flow in Pidgin, Yorùbá and English; 5 of 7 explained their choices correctly; we rewrote 6 strings after their feedback." Use your real numbers, never rounded up.
- Translation fixes go into `src/i18n/*` and the review log in [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md). Keep the status as `draft_unreviewed` unless a proper review was done.
