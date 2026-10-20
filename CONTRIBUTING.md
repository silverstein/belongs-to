# How belongs-to checks itself

This is the engineering side of the README. The README is for the people the figures are for; this is for anyone changing the kit.

## The facts audit

`scripts/build.mjs` runs `kit/verify.mjs` before drawing and writes nothing if it fails (`--force` writes anyway so you can look). The checks, in order:

- **References resolve.** Every holder, held thing, beneficiary, grantor and cited document exists.
- **Intake recorded.** Every document carries a read status (`read`, `partial` with pages, `unreadable`, `not-provided`). A citation into an unreadable or unprovided document fails. Any fact marked `unknown` needs an `intake.lookedFor` entry behind it. A hand-written `notInDocuments` list is refused; the page's "What's missing" list is derived from the intake record.
- **Every fact cited or marked.** Holdings, values, designations, tax status, wills and trust terms either cite a document or carry `status: unknown | assumed | illustrative`.
- **Ownership adds to 100%.** Per entity and asset; cap tables add to shares outstanding; beneficiary tiers add to 100%.
- **No loops**, in ownership or tax-owner resolution.
- **Context the law turns on.** State (and community-property status), marital and filing status for everyone an event touches, and every QSBS condition cited or marked assumed.
- **Absence said as absence.** A note about an unknown fact must say it is missing from the documents. "Never" and "everything they own" are refused.
- **Numbers in the text match the model.** Every dollar figure in a title, subtitle or note must equal a value the model or its derivations produce.
- **Zones and trust terms agree with the facts.** A taxpayer zone contains exactly that taxpayer's holders; a revocable trust whose grantor dies has cited `onDeath` terms.
- **Events derive.** Death routes and QSBS ledgers compute; mixed-regime lots are refused rather than guessed.
- **Findings surfaced.** Every high-severity finding (a probate route, an unknown designation, an assumed condition) has a note in some view.

## The layout audit

`kit/audit.mjs` runs on the geometry each renderer returns: no card overlaps a card, no line passes through a card it doesn't belong to, no label sits on a card, a line or a zone border, and no card sits inside a zone it isn't a member of. It runs on the wide layouts and the stacked phone layouts.

## Tests and the red-team

`node scripts/test.mjs` breaks good models on purpose (43 cases) and checks that the right audit fails with the right message. `node scripts/redteam.mjs` attacks the facts audit with plausible wrong models and prints two lists: what it caught, and what it cannot see. The second list matters more. As of this version it cannot see a document marked read that was only skimmed, a citation to the right document but the wrong page, a value typed wrong from a statement, a beneficiary swapped for another real person, an asset left out of the model entirely, or a trust labelled with the wrong tax status while citing a memo that says otherwise. The audit proves the figure agrees with the model; a reader with the documents open proves the model agrees with the documents.

## Who has reviewed it

No human attorney has reviewed a real family's output yet. The reviews below were AI persona reads, and they are listed as such. One real household (the maintainer's own, 38 documents) has been through the full loop three times, scoring 4, 6 and 7 out of 10; see the review history.

## Review history

The examples went through three rounds of blind reads by persona agents (a trusts-and-estates attorney, a founder, an operator household, a reader outside the audience) and an independent check of the § 1202 rules against the statute. The attorney persona's legal-accuracy scores went from 5/7/5 (three figures, round one) to 8/8.5/7 (round three). Each objection became one of the checks above. A fourth round read for voice (a household member on a figure, a product designer on the README, an engineer on `SKILL.md`), twice. Round one scored the voice 5, 4 and 6 out of 10 and named the tells: the tool describing its own effort ("not modeled," "this figure does not compute," a self-check footer), machinery words in the README, and a skill that told the agent what to produce but not what to say. Round two, after the rewrite, scored 6, 7 and 7 and named what was left: the missing list mixing the family's news with the reviewer's gaps, findings with no fix line, and the conversation's opening and handoff sentences. Those became the "What to do" list, a `todo` field in the intake record, and the bookend sentences in `SKILL.md`.

**First real-document trial (2026-10-19).** A fresh agent built the maintainer's own household from 38 real documents (a revocable trust and its schedule, a pour-over will, two operating-agreement copies, a conversion to a Delaware corporation, K-1s, policies, a closing statement) using only the skill, in about 13 minutes. Three blind AI reviewers read the result against the documents (a California trusts-and-estates attorney persona, a corporate attorney persona, and a citation auditor with no persona), and a judge adjudicated every finding. The private output stays with the family; the lessons are here. Score: 4/10. Of 26 merged findings, 24 were confirmed; 103 cited facts were checked and 86 landed. The two critical findings: the transfer view printed "X's alone, and no one is named to get it" over six routes the documents never settled, two of them half shares (a kit defect; fixed, four tests); and both headlines sent a scheduled-but-untitled LLC to probate and intestacy, when a signed declaration of trust with that schedule most likely already made it trust property under California's Heggstad line (a rule gap; now a `trustSchedule` state, a `declared` band, a `signed` state on the trust document, and three tests). Also fixed: the footer claimed every listed document was "read in full" over ten read in part, and listed only documents a card cited (now `kit/receipt.mjs`); a prose citation could name a document the footer didn't list (now a check); an LLC with no operating agreement in the documents went to probate instead of being a gap. The builder's own errors, which no check can catch: it called two copies of an operating agreement identical without diffing them, misread a will's guardian and executor order, stated a SAFE as signed when its audit trail said pending, and headlined the unsigned-copy question as a note instead of leading with it. Those became sentences in `SKILL.md`. **Round two (same day).** A fresh builder rebuilt the household from the judge's list with the changed kit, and the same three reviewer roles and the judge read it blind again. Score: 6/10. Of 33 merged findings, 29 confirmed, 0 critical, 10 major; 147 cited facts checked, 129 landed; round one's 21 findings fixed, 4 partial, 3 unchanged, 1 regressed (a QSBS sentence that argued against the page's own first fix). What the round surfaced for the kit: a headline could still say "there is no will" over a will the model marks unknown (now a check); the trust's-list rows said "by title" over a title the documents don't show (fixed); a survivorship deed was described as beating the trust when the trust's own clause says the opposite, which is a rule-order gap (open: a cited trust term should override the survivorship route); a disclaimer trust was drawn without its nine-month clock (open); an intestacy branch ran a house as community property by default (open: a caption when the state is a community-property state). The judge's list of what a third pass should fix, and what belongs to a human attorney, is in the private trial folder, not here. The lesson that generalizes: the builder adopts the judge's own phrasing, so a judge's proposed sentence gets the same absence check as the page. **Round three (same day).** The judge's kit list landed first (`trust.survivorship`, `form: "unknown"` on a holding, the headline title check, the disclaimer clock, the community-property branches, page coverage for partial reads, `claims`, the label fixes; fourteen tests), then a fresh builder did the judge's third pass and the same three roles and the judge read it blind. Score: 7/10 (accuracy 8, citation fidelity 9, completeness 8, gaps honesty 7, voice 8). Of 34 merged findings, 30 confirmed, 0 critical, 5 major, 24 minor; 221 cited facts checked, 203 landed, 0 wrong pages; round two's 29 findings fixed, 6 partial, 1 unchanged, none regressed. The five major findings are all rule gaps or builder reading, none a wrong fact: the death page has no "if this has already happened" sequence (the trustee's notice, lodging a will, the disclaimer and estate-tax windows, the single-member LLC continuation window), which is now the first item on the kit list; the first action line said "sign them" about a three-year-old set with a stale schedule; the separate-property branch was applied to the house but not to the company that holds most of the family's value; the corporate action list pointed at a timestamp instead of a confirmatory consent, a stock ledger and a second director; and a note understated what the other copy of an operating agreement would mean. The round also found three checks refusing honest sentences (a qualifier before "no will", "without a signed trust, the deed decides", and "never qualifies" as a rule rather than an absence), fixed the same day, and that a band title asserted what its subtitle withdrew. What stays private: the pages, the model, the reviews and the judge's lists. The verdict the judge gave, which the README repeats: a document map a careful attorney can work from, with every citation landing; not yet the page a spouse acts on alone, until it carries the first-week sequence.

## Layout of the kit

| Path | What it is |
|---|---|
| `kit/model.mjs` | Loads a model; look-through values; tax-owner resolution; citation labels; the derived missing list. |
| `kit/derive.mjs` | Death routing and the QSBS ledger, with the rules and their dates in comments. |
| `kit/verify.mjs` | The facts audit. |
| `kit/structure.mjs`, `kit/transfer.mjs`, `kit/ledger.mjs` | The wide renderers. |
| `kit/structure-stacked.mjs`, `kit/transfer-stacked.mjs` | The phone layouts (420 units wide, shown under 720px). |
| `kit/audit.mjs` | The layout audit. |
| `kit/page.mjs`, `kit/fonts.mjs`, `kit/fonts/` | The page shell, tokens, themes and embedded fonts. |
| `scripts/build.mjs` | Verify, render, audit, write. |
| `scripts/shoot.mjs` | Headless Chrome screenshots with in-browser text-overflow checks. |
| `scripts/export.mjs` | PNG, standalone SVG, share card. |
| `scripts/test.mjs`, `scripts/redteam.mjs` | The audits' own tests and the attack list. |
| `scripts/measure-fonts.mjs` | Re-measures glyph widths after a font change. |

Node 22 or newer, no npm install, Chrome or Chromium for screenshots and exports.

## Voice

Everything on a page is read by a family member, so it is written the way a careful person would say it, not the way the kit names things. "Entity," "designation," "verifier," "model," "audit" and "intake" stay in this file and the code. On the page it is "whose name it is in," "who is named to get it," "what we looked at," "what's missing," "how we double-checked." If you add a string the reader sees, read it aloud as the spouse of the person it is about.
