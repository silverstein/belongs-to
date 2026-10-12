# Design rules

The look is a ledger, not a dashboard: warm paper, ink, hairlines, one accent per meaning, and evidence that reads as first-class. Newsreader is used for the answer, IBM Plex Sans for names and prose, and IBM Plex Mono for numbers, kinds and shares. All three are embedded, so a figure is one offline file.

## Composition

- **The title is the answer,** in plain words, and it stands without the drawing: "One rental is still in Sam's own name, outside the trust." Never write a topic ("Ellery estate overview") or a teaser.
- **The subtitle says the consequence and defines the one term a non-expert needs** (QSBS, probate). Keep it to one or two sentences.
- **Owners sit above what they own,** one row per level. Ownership lines run down, and the share goes on the line.
- **Zones group what a reader must see as one thing:** what the trust holds, or one taxpayer. A gap arrow from outside a zone to its edge shows what should be inside but isn't. That is the single most legible way to show a funding gap.
- **In a transfer view, each mechanism is a band and each item's line stays in its band until the gutter.** A line must never appear to pass through the probate band unless it does.
- **Line width is value only in transfer views,** and only when every value is on one basis.

## Color means one thing each

| Token | Meaning | Use |
|---|---|---|
| `flag` (vermilion) | A real problem the plan didn't intend | A funding gap, an unplanned probate route |
| `ask` (amber) | The documents don't show it | Missing designation, an assumed condition |
| `info` (outlined, ink) | Worth knowing; often by design | A grantor trust sharing a cap; trust administration after a death |
| `ok` (green) | Held where it should be; within a limit | Trust zone, exclusion within the cap |

A client reads red as "a mistake was made". Never use `flag` for a deliberate planning choice.

## Text

- Write every card fact as a sentence fragment a client understands: "Taxed as Maya (grantor trust)", not "Grantor: Y".
- Hide data-model words. Members see "Held through the trust", never `holding`, `node`, `zone`.
- Cite each fact by name on its card ("Held: Deed, p. 1", "Tax: Counsel memo, p. 2"). Years go in the sources list.
- Don't use em dashes or dash-style punctuation anywhere.
- Notes are lettered by importance. A note's badge sits on the card it is about, pinned to the corner.

## The receipt

The "Checked before drawing" list is for the reader: ownership adds to 100%, every fact is cited or marked, how many things the documents don't show, and whether everything the event touches is shown. Layout checks are the maker's business and stay out of the page.

## Before calling a figure done

Run `shoot.mjs` in light, dark and at 390 wide, then zoom on every junction. Then read it as three people would:
- the owner it describes: "Do I see my problem in five seconds?"
- someone outside the audience: "What words lost me?"
- a skeptical attorney: "What does the drawing imply that the text doesn't say?"
