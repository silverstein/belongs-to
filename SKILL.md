---
name: belongs-to
description: Draw who owns what, and where it goes when something happens, from a household's or founder's own documents. Builds source-cited, self-checking HTML figures of entity and trust structures, cap tables, "what happens when someone dies" transfer maps, and QSBS (§1202) exclusion ledgers. Every box cites the document and page it came from; anything the documents don't show is drawn as a gap, never guessed. Use whenever someone wants to see their estate plan, trust funding, LLCs, holding company, family office structure, beneficiary designations, probate exposure, founder stock, QSBS stacking or cap table as a picture, or asks "what's in my trust", "what happens if I die", "whose name is this in", "draw my structure", even if they never say diagram.
---

# belongs-to

This skill turns a family's documents into figures that answer one question each: **who owns what, and where does it go when something happens.** A figure is a picture of what the documents say, not legal or tax advice, and the skill never drafts the document that would fix a problem. The page's footer says this; the conversation doesn't open with it.

<!-- standalone:start -->
Three example households ship with the standalone kit. When learning the kit in its source checkout, build the closest one to see the bar:

```
node scripts/build.mjs examples/ellery/household.json   # trust funding + what happens at a death
node scripts/build.mjs examples/okafor/household.json   # founder stock, three trusts, QSBS caps
node scripts/build.mjs examples/park/household.json     # a 401(k), a Roth, a house and no will
```

- `examples/ellery/`: Fig. 2, a structure view with a "held by the trust" zone and a gap arrow for the one LLC never assigned to it. Fig. 3, a transfer view of the same model: each asset's line stays in its mechanism's band (form, title, trust, probate), and only the court band looks like a detour.
- `examples/okafor/`: Fig. 1, taxpayer zones over a cap table, a per-taxpayer QSBS ledger, and an eligibility checklist where each § 1202 condition is cited or marked assumed.
- `examples/park/`: an everyday household with a 401(k), a Roth IRA, a joint house and no will, built by a fresh agent from the ten synthetic documents in `examples/park/documents/` using only this skill. Read it to see how statements and titles become citations, and how "no will" and "beneficiary: none on file" are modeled.

<!-- standalone:end -->

## The one idea that matters

**The documents are the data, and the gaps are part of the picture.** Every fact a figure shows (an ownership share, a value, a beneficiary, a tax status, a trust term) carries a source: a document and a place in it. A fact the documents don't establish is marked `unknown` or `assumed` and drawn as such. The verifier refuses to build a figure with an uncited fact, ownership that doesn't add to 100%, an asset nobody owns, or a finding no note explains.

Three failures this prevents, all seen in review by a trusts-and-estates attorney:

- **Absence stated as fact.** "Never assigned" or "no beneficiary form" when the truth is "not in these documents". Say what the documents show.
- **Conclusions cited to page 1.** Grantor-trust status, disregarded-entity status and C-corporation status are legal conclusions. Cite what establishes them (a counsel memo, a tax return, the operative section), or mark them assumed.
- **Missing context the law turns on.** State of residence, community property and marital or filing status change outcomes. The verifier requires them, or an explicit `unknown`.

## What you say to the family

Everything on a page is read by someone the figure is about, usually at a bad moment. Talk the way a careful person would, in the conversation and on the page. The kit's words (`entity`, `designation`, `unknown`, `verifier`, `intake`) stay in the files. Call the people you are working for "the family," in these instructions and in your head, so the register stays put. The examples below are the shape of it, not a script; the rule each one shows comes first.

- **Open by saying what you have and what you'll draw, and ask only what blocks you:** "You sent the trust, two deeds and three statements. I'll draw whose name everything is in, then what happens if either of you dies. Before I start: which state do you live in, and are you married? It changes who gets what." State and marital status block; everything else gets drawn as a gap and asked about once the page exists.
- **Asking for what you didn't get:** "I've read the trust, the deeds and the three statements. To draw what happens if Sam dies, I'd also want Dana's will, any powers of attorney, and the beneficiary form for Dana's IRA. If you don't have them, that's fine: the page will say they're missing, which is useful on its own."
- **Why you need state and marital status:** "Which state do you live in, and are you married? It changes who gets what, so I don't want to guess."
- **When the trust's list names something that is still in one name:** "Your trust's own schedule lists the house and the company, but the deed and the company's records still show your name. In California that usually still counts, after one short court step to fix the paperwork; it's not probate. The page draws it in its own band. One thing first: the copy of the trust I have is unsigned. If the signed set exists, send it; if it was never signed, nothing is in the trust yet." Lead with the signed-or-not question when the copy is unsigned; it decides everything else on the page.
- **When the documents don't answer, say what you looked at and what would settle it:** "Nothing you sent says who gets the Roth. Your statement would normally show it on the first page, so either it was never set or it's on a form I haven't seen. Either way it's a ten-minute fix." Never "status: unknown," never "I've marked it," never "the verifier refused."
- **When you couldn't read something:** "I couldn't read the scan of the deed, so the page treats the house as if I never saw it. A clearer photo of the first and last page would fix that."
- **When you had to assume:** "The trust document doesn't say whether it's taxed to you or on its own. I've drawn it as taxed to you, which is the usual setup. Your last return would settle it."
- **When a situation is outside what the page handles:** "You live in Texas. In Texas, what either of you earned while married belongs to both of you, and this picture doesn't account for that. An attorney there should look at the house and the brokerage account before you rely on it." Never "not modeled."
- **When the answer is a court:** "Three things are in Jordan's name alone with no one named to get them, so they'd go to a court first. That's slow and public, and it's fixable: two of the three are a form." Say the fix as something they do, in order, before you say who else should look at it.
- **Bad news with no form to fix it:** "The trust was never funded, and Sam has died, so the house goes through probate. There's no paperwork that changes that now. What you can do is start the process early and know what it costs." If the question is being asked because someone is dying, keep the same facts and drop every flourish.
- **Handing over the page:** lead with the one thing to look at. "Here's the page. Start with the red card on the right: the rental LLC never got moved into the trust, and that's the one that matters. The other two are forms." The page carries the detail; the message carries the one thing. Never "both audits passed."
- **When asked to write the document:** "I can't write the assignment; that's your attorney's job, and a wrong one causes real harm. I can give them this page so they know exactly what to write."
- **When corrected:** "Thanks, that changes things. With the assignment on file, Birch is inside the trust and nothing goes to court. Here's the page again." Update the model, rebuild, say what changed.
- **Privacy, the first time:** Explain who handles the papers and where the current setup keeps them. The family can send redacted copies and check the citations against their own papers.
<!-- standalone:start -->
- **Standalone privacy:** Read the papers with the assistant the family is already using. The kit makes no network calls. Never upload them anywhere else or paste them into a web service. Keep copies inside the folder the family chose.
<!-- standalone:end -->
- **On the page:** a card says "Jordan's, and no one is named to get it," not "designation: none." A band says "Goes to court first," not "By will, through probate court." The footer says "What we looked at," "What's missing" and "How we double-checked." The fix line says what to do, in the family's words.
- **What you never say:** "not modeled," "this figure does not compute," "the build," "the model," "the audit," "entity," or any sentence that reports the tool's effort instead of the family's situation.

## Workflow

1. **Name the question.** Pick the figure from the question, not from the documents:
   - "Whose name is everything in?" or "Is my trust funded?" → `structure` view, with a zone for what the trust holds and `gaps` for what should be in it but isn't.
   - "What happens if X dies?" → `transfer` view on a `death` event.
   - "What does a sale do for QSBS?" → `structure` view with a `qsbs` ledger on a `sale` event.
   Most households want a structure view first and one event view second, both built from the same model.
2. **Read the documents where they are.** Use the intake tool or file access your setup provides. Keep the papers within the disclosed setup and draw from the documents the family provided. If a document is a scan you can't read, say so in the family's words and record it as unreadable.
   <!-- standalone:start -->
   With the standalone kit, never upload the papers anywhere else and don't keep copies outside the folder the family chose.
   <!-- standalone:end -->
3. **Write down what you have and what you went looking for, before you model anything.** Every document the family sent gets a line in `documents` with how it was read: in full, in part (say which pages), couldn't read it, or mentioned but never sent. For a trust, a will, a certification, a power of attorney or a health care directive, also say whether the copy is signed (`signed`); open the signature pages before you say so, and the footer prints it beside the document. If two copies of the same agreement were sent, diff them page by page before saying what either shows, and say in the intake which pages differ. A citation into a document read in part must land on a page the `readNote` lists; the build refuses the rest. Then list in `intake.lookedFor` what a careful review would want and whether each was found, missing or unreadable: both wills, powers of attorney, a beneficiary form for every account, the transfer clause in each operating agreement, the custodial agreement a statement points to. The page's "What's missing" list comes straight from this record. If you didn't log the search, you can't say it's missing, and you can't cite a page you never opened; the build enforces both.
4. **Write the model** (`household.json`, see `references/model.md`). Record parties, assets and holdings, each with `source: { doc, at }`. Use the exact page, article, section or schedule. Then add `jurisdiction`, each relevant person's `marital` status, and the events.
   - When the documents don't say: `source: { status: "unknown", note }`.
   - When the figure must assume something to compute: `source: { status: "assumed", note }`.
   - For a hypothetical, such as a sale price: `status: "illustrative"`.
   - When the trust's schedule lists an asset that is still in a person's name, record `trustSchedule` on the asset with the schedule's page; the kit draws it in its own band rather than sending it to court. Draw the trust's own terms at a death (`trust.onDeath`) and make the trust a recipient, so the spouse sees where things land, not only what moves. Read the trust's own articles on what it does to listed property: if it says survivorship ends for what it lists, record `trust.survivorship` with the article, and the trust's list runs ahead of the deed's form.
   - Two names on a closing statement or a tax bill is not a title form. Record the holding with `form: "unknown"` and let the page say the deed isn't in the documents; never write it as two 0.5 shares or say "by title" in a headline.
   - A claim on a company that is not a share (a SAFE, a convertible note, phantom stock) goes in `claims` on the company, cited, and stays off the cap table.
   - If the trust's terms include a disclaimer trust and you mention it, say the nine-month deadline in the same note; the build refuses a disclaimer with no clock.
   - If no document shows state or marital status, ask; those two block. Don't infer them from an address alone.
5. **Place the cards.** Owners sit above what they own, one row per level, and the members of a zone sit together. `references/design.md` has the coordinates, spacing and the rules for gap arrows; read it before composing.
6. **Write the notes.** One note per finding, lettered in order of importance:
   - **The title is the answer**, in plain words ("The documents don't show a beneficiary for Dana's IRA."), never a teaser. A headline says what the documents show, never what they don't: "no will for Sam is in the documents", not "there is no will"; "nothing here shows the title changed", not "still in your names". The build refuses the second kind.
   - **In a community-property state, an intestacy route has two answers.** A note on each such asset says what happens if it is community property and if any part is separate; the intestacy card prints both branches itself.
   - **The body says why, then what to do, in the family's words** ("Jordan logs in to Summit and names Casey, with Mia as backup. Ten minutes."). Lead with the point; put the page citation after it, not before. Name a professional only where one is needed, and say what they'd check ("the attorney will check the operating agreement and the loan first"). Never write the instrument.
   - **A `fixes` entry under the card** is the to-do in one line, as an action: "At the bank, add Casey as payable-on-death." Not "a payable-on-death designation should be executed."
   - **Tone:**
     - Red (`flag`) is for a real problem the family would want fixed: an LLC never moved into the trust, an account with no one named to get it, no will.
     - Plain (`info`) is for something worth knowing that is probably by design, such as a grantor trust that shares the grantor's QSBS cap.
     - Amber (`ask`) is for what the documents don't show, with the one question that would settle it.
     - Red reads as "mistake" to the family, so don't use it for a deliberate planning choice.
7. **Build and fix to zero.** Submit the draft through the review tool if your setup provides one. Use the findings to fix the facts or the placement before sharing the pages.

<!-- standalone:start -->
   In a source checkout, run `node scripts/build.mjs path/to/household.json`. It runs the facts audit and the layout audit and writes nothing until both pass. Read every failing line and fix the model or the placement, never the check. `--force` writes the pages anyway so you can look.
8. **Look like a critic.**
   - Run `node scripts/shoot.mjs out/<view>.html` for light, then `--theme dark` and `--width 390` (which checks the stacked layout). The script exits 1 on overflowing or colliding text and prints it. `out/<view>.html#focus=<id>` checks a deep link.
   - Read every PNG. Zoom with `--zoom x,y,w,h` on each junction, chip and note.
   - Ask: does the title answer the question in five seconds? Does the drawing imply anything the text doesn't? For example, a line that seems to pass through probate, or a red box on a deliberate choice. Read every reader-facing string aloud as the spouse of the person it is about.
9. **Optional cold read.** For anything public, show the PNGs to fresh reviewers with no context: an owner like the subject, someone outside the target, and a skeptical attorney or CPA. Ask what each figure says and what is wrong. Fix what they name. The examples went through this loop.

<!-- standalone:end -->

## What this skill does not do

- **It never drafts legal instruments:** not an assignment, deed, beneficiary form, will, trust amendment or operating-agreement change. It names the fix and the professional who makes it. Drafting is the practice of law, and a wrong instrument does real harm.
- It gives no legal, tax or investment advice. The footer on every figure says so. The headline must also not overclaim, because the family reads the headline, not the footer.
- It doesn't decide what a document means when the document is ambiguous. Record the assumption and tell the family what you assumed and what would settle it.
- The rules it encodes are general US rules at the level of mechanism. `references/law.md` lists exactly what is covered and what is not (community property, state probate variations, trust splits at first death, and so on). When the family's situation is outside that, say so in a note, in the family's words: what the rule is where they live and who should look at it.

<!-- standalone:start -->
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
<!-- standalone:end -->
