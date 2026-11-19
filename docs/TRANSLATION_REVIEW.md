# Translation review

**Status: every non-English string is an unreviewed draft.** The Pidgin (`pcm`) and Yorùbá (`yo`) text in [`src/i18n/`](../src/i18n) was drafted without native-speaker review, and that includes the Yorùbá tone marks. The English source text also needs a plain-language review with young people and community health workers. None of it should be used with real people until it has been reviewed.

This status is machine-visible: each locale has `meta.status = "draft_unreviewed"`, and every consent stores `notice.translation_status` and a fingerprint of the exact wording shown. When a reviewed version is released, its fingerprint changes, so consents given under the draft can always be told apart.

## Proposed review process

1. **Native-speaker review:** at least two fluent speakers per language, ideally including young people and community health workers from the communities involved (for example in Ibadan and Abuja). Check meaning, tone, tone marks (Yorùbá), and whether it sounds like how people really talk.
2. **Back-translation:** someone who hasn't seen the English translates the reviewed text back into English. Compare it with the source and fix any change in meaning.
3. **Comprehension testing:** run the chat with a few people per language. Note which questions they get wrong first time (the consent record's `comprehension.correct_first_try` gives this without collecting anything extra). Rewrite the explanations that confuse people.
4. **Release:** bump `NOTICE_VERSION`, set `meta.status` to `community_reviewed` (or `professionally_verified`), and record reviewer roles (not names, unless they want credit) in this file.

## Strings that matter most

These carry the legal and ethical weight. Review them first:

| Key | Why it matters |
|---|---|
| `intro_2`, `intro_3` | What a data commons is; "no is fine, your support continues" |
| `q_categories`, `cat_*` | What's being shared |
| `pur_ai_training_commercial`, `pur_ai_training_noncommercial` | The distinction most likely to be misunderstood |
| `deid_*` | Records vs totals |
| `q_benefits`, `ben_*` | What the community gets back |
| `ex_withdraw`, `withdraw_confirm` | What withdrawal can and **cannot** undo (published totals) |
| `code_warning` | Keeping the private code safe |
| `check_failed` | Must not blame the person |

## Review log

| Date | Language | Reviewer role | Changes | New status |
|---|---|---|---|---|
| — | — | — | No reviews yet | draft_unreviewed |

## Hausa

Not yet included. Adding it means a new `src/i18n/ha.js` with every key (the tests check that all keys and placeholders match), plus `ha` in `LANGUAGES` in `src/core/vocab.js` and a regenerated schema.

## UI strings outside the consent wording (`u` in each locale)

The release summary, the USSD simulation and the "assisted" label use a second set of strings, `u`, in each locale file. They are **not** part of the consent notice digest (they are not what a person agrees to), but they are drafts like everything else here and need the same native-speaker review. USSD screens (`ux_*`) must stay at or under 160 characters; the tests check this in every language.
