---
name: belongs-to
description: Draw who owns what, and where it goes when something happens, from a household's or founder's own documents. Builds source-cited, self-checking HTML figures of entity and trust structures, cap tables, "what happens when someone dies" transfer maps, and QSBS (§1202) exclusion ledgers. Every box cites the document and page it came from; anything the documents don't show is drawn as a gap, never guessed. Use whenever someone wants to see their estate plan, trust funding, LLCs, holding company, family office structure, beneficiary designations, probate exposure, founder stock, QSBS stacking or cap table as a picture, or asks "what's in my trust", "what happens if I die", "whose name is this in", "draw my structure", even if they never say diagram. The kit makes no network calls and has no server; documents go only to the model the agent already uses.
---

# belongs-to

This skill turns a household's documents into figures that answer one question each: **who owns what, and where does it go when something happens.** A figure is a picture of what the documents say. It is not legal or tax advice, and it never drafts the document that would fix a problem.

Three example households ship with the skill. Open the closest one before you start, and build it once to see the bar:

```
node scripts/build.mjs examples/ellery/household.json   # trust funding + what happens at a death
node scripts/build.mjs examples/okafor/household.json   # founder stock, three trusts, QSBS caps
node scripts/build.mjs examples/park/household.json     # a 401(k), a Roth, a house and no will
```

- `examples/ellery/`: Fig. 2, a structure view with a "held by the trust" zone and a gap arrow for the one LLC never assigned to it. Fig. 3, a transfer view of the same model: each asset's line stays in its mechanism's band (form, title, trust, probate), and only the court band looks like a detour.
- `examples/okafor/`: Fig. 1, taxpayer zones over a cap table, a per-taxpayer QSBS ledger, and an eligibility checklist where each § 1202 condition is cited or marked assumed.
- `examples/park/`: an everyday household with a 401(k), a Roth IRA, a joint house and no will, built by a fresh agent from the ten synthetic documents in `examples/park/documents/` using only this skill. Read it to see how statements and titles become citations, and how "no will" and "beneficiary: none on file" are modeled.

## The one idea that matters

**The documents are the data, and the gaps are part of the picture.** Every fact a figure shows (an ownership share, a value, a beneficiary, a tax status, a trust term) carries a source: a document and a place in it. A fact the documents don't establish is marked `unknown` or `assumed` and drawn as such. The verifier refuses to build a figure with an uncited fact, ownership that doesn't add to 100%, an asset nobody owns, or a finding no note explains.

Three failures this prevents, all seen in review by a trusts-and-estates attorney:

- **Absence stated as fact.** "Never assigned" or "no beneficiary form" when the truth is "not in these documents". Say what the documents show.
- **Conclusions cited to page 1.** Grantor-trust status, disregarded-entity status and C-corporation status are legal conclusions. Cite what establishes them (a counsel memo, a tax return, the operative section), or mark them assumed.
- **Missing context the law turns on.** State of residence, community property and marital or filing status change outcomes. The verifier requires them, or an explicit `unknown`.

## Workflow

1. **Name the question.** Pick the figure from the question, not from the documents:
   - "Whose name is everything in?" or "Is my trust funded?" → `structure` view, with a zone for what the trust holds and `gaps` for what should be in it but isn't.
   - "What happens if X dies?" → `transfer` view on a `death` event.
   - "What does a sale do for QSBS?" → `structure` view with a `qsbs` ledger on a `sale` event.
   Most households want a structure view first and one event view second, both built from the same model.
2. **Read the documents where they are.** Read the user's files with your own tools. The kit's scripts make no network calls and there is no belongs-to server, but what you read goes to the model you run on, so tell the user that plainly the first time: their documents are seen by the same model they are already talking to, and by nothing else. Never upload them anywhere else, never paste them into a web service, and don't keep copies outside the folder the user chose. Offer a redacted first pass (names and account numbers removed) to anyone who wants to check the citations before trusting it with the real set. If a document is a scan you can't read, say so and mark the facts it would hold as `unknown`.
3. **Write the model** (`household.json`, see `references/model.md`). Record documents first, then parties, assets and holdings, each with `source: { doc, at }`. Use the exact page, article, section or schedule. Then add `jurisdiction`, each relevant person's `marital` status, and the events.
   - When the documents don't say: `source: { status: "unknown", note }`.
   - When the figure must assume something to compute: `source: { status: "assumed", note }`.
   - For a hypothetical, such as a sale price: `status: "illustrative"`.
   - Ask the user for state and marital status if no document shows them. Don't infer them from an address alone unless a document states residence.
4. **Place the cards.** Each view's `place` maps ids to `[column, row]`, with fractions allowed. Owners sit above what they own, one row per level. Keep members of a zone contiguous. Leave about 0.9 of a column between a card and a zone that a gap arrow must cross. Read `references/design.md` before composing.
5. **Write the notes.** One note per finding, lettered in order of importance:
   - **The title is the answer**, in plain words ("The documents don't show a beneficiary for Dana's IRA."), never a teaser.
   - **The body says why, what fixes it, and who fixes it** ("the estate attorney can prepare an assignment, after checking the operating agreement and the loan"). Name the fix and the professional; never write the instrument.
   - **Tone:**
     - `flag` is only for real problems, such as a funding gap or a probate route the plan didn't intend.
     - `info` is for things that are by design, such as a grantor trust that shares the grantor's QSBS cap.
     - `ask` is for what the documents don't show.
     - A documented absence that causes a problem (a form that names no one, a title with no co-owner, no will) is `flag`: the documents are clear, and the result is a court.
     - Red reads as "mistake" to a client, so don't use it for a deliberate planning choice.
6. **Build and fix to zero.** Run `node scripts/build.mjs path/to/household.json`. It runs the facts audit and the layout audit and writes nothing until both pass. Read every failing line and fix the model or the placement, never the check. `--force` writes the pages anyway so you can look.
7. **Look like a critic.**
   - Run `node scripts/shoot.mjs out/<view>.html` for light, then `--theme dark` and `--width 390` (which checks the stacked layout). The script exits 1 on overflowing or colliding text and prints it. `out/<view>.html#focus=<id>` checks a deep link.
   - Read every PNG. Zoom with `--zoom x,y,w,h` on each junction, chip and note.
   - Ask: does the title answer the question in five seconds? Does the drawing imply anything the text doesn't? For example, a line that seems to pass through probate, or a red box on a deliberate choice.
8. **Optional cold read.** For anything public, show the PNGs to fresh reviewers with no context: an owner like the subject, someone outside the target, and a skeptical attorney or CPA. Ask what each figure says and what is wrong. Fix what they name. The examples went through this loop.

## What this skill does not do

- **It never drafts legal instruments:** not an assignment, deed, beneficiary form, will, trust amendment or operating-agreement change. It names the fix and the professional who makes it. Drafting is the practice of law, and a wrong instrument does real harm.
- It gives no legal, tax or investment advice. The footer on every figure says so. The headline must also not overclaim, because clients read the headline, not the footer.
- It doesn't decide what a document means when the document is ambiguous. Mark the fact `assumed` and say what was assumed.
- The rules it encodes are general US rules at the level of mechanism. `references/law.md` lists exactly what is modeled and what is not (community property, state probate variations, trust splits at first death, and so on). When the household's situation hits an unmodeled rule, say so in a note.

## Files

| Path | What it is |
|---|---|
| `kit/model.mjs` | Loads a model; look-through values; tax-owner resolution; citation labels. |
| `kit/derive.mjs` | Death routing (form, title, trust, will and probate), QSBS ledger and its eligibility checklist. The rules, with their dates and limits, are in comments. |
| `kit/verify.mjs` | The facts audit: references, citations, ownership closure, loops, events, context, absence phrasing, findings surfaced. |
| `kit/structure.mjs`, `kit/transfer.mjs`, `kit/ledger.mjs` | The wide renderers. Each returns its geometry for the layout audit. |
| `kit/structure-stacked.mjs`, `kit/transfer-stacked.mjs` | The phone layouts, designed at 420 units and shown under 720px. The build audits them too. They also scale cleanly into a vertical video frame. |
| `kit/audit.mjs` | The layout audit: card overlaps, lines through cards, labels on cards, lines or zone borders, and zone intrusions. |
| `kit/page.mjs`, `kit/fonts.mjs`, `kit/fonts/` | The page: tokens, light and dark themes, embedded OFL fonts (Newsreader, IBM Plex), notes, sources and receipt. One offline HTML file. |
| `scripts/build.mjs` | Verify, render, audit, write. |
| `scripts/shoot.mjs` | Headless Chrome screenshots and in-browser text checks (Chrome or Chromium; set `CHROME_PATH`). |
| `scripts/test.mjs` | Proves the audits catch what they claim: each case breaks a good model in one way. |
| `scripts/redteam.mjs` | Attacks the facts audit with plausible wrong models and reports what it cannot see. Run it before claiming anything about verification. |
| `scripts/export.mjs` | PNG at 2×, a standalone SVG with tokens and fonts embedded (light or dark), and a 1080-wide share card. |
| `scripts/measure-fonts.mjs` | Re-measures font metrics after a font change. |

Requirements: Node 22 or newer, no npm install, and Chrome or Chromium for screenshots only.
