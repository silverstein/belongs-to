# The household model

One JSON file per household. The figures are views of it, so a fact is written once and every figure that shows it agrees. Read `examples/ellery/household.json` and `examples/okafor/household.json` alongside this page.

## Sources

Every fact carries `source`. Exactly one of:

| Form | Meaning | How it is drawn |
|---|---|---|
| `{ "doc": "trust", "at": "Art. 6" }` | The fact is stated in that document, at that place. Use the most specific place: page, article, section, schedule. | "Trust, Art. 6" on the card |
| `{ "status": "unknown", "note": "…" }` | The documents don't establish it. | Amber dashed card, "not in documents"; counted in the receipt; must be explained by a note |
| `{ "status": "assumed", "note": "…" }` | The figure needs it to compute, and it is not established. | "?" in checklists; counted; must be explained by a note |
| `{ "status": "illustrative" }` | A hypothetical, such as a sale price. | Counted as an example in the receipt |

Cite a legal conclusion (grantor-trust status, disregarded-entity status, C-corporation status) to what actually establishes it: a counsel memo, a tax return, the operative section. A charter shows a corporation, not its tax status. Page 1 of a trust doesn't show who is taxed on it.

## Top level

```json
{
  "kind": "belongs-to/household@1",
  "household": "The Ellerys",
  "asOf": "2026-10-11",
  "synthetic": true,
  "jurisdiction": { "state": "Ohio", "communityProperty": false, "label": "Ohio, not a community-property state", "source": { … } },
  "documents": { "<id>": { "title": "…", "short": "Deed", "kind": "Deed", "date": "2019-05-02" } },
  "parties": { … },
  "assets": { … },
  "holdings": [ … ],
  "events": { … },
  "views": [ … ]
}
```

- `jurisdiction` is required whenever there is an event. Cite the document that establishes residence (a return, an intake note, a will's recital). `communityProperty` is the legal classification of that state, not a document fact; the kit applies it as law.
- `short` is how a document is cited on cards, so keep it to one or two words. Shorts must be unique: three documents all called "Statement" can't be told apart.
- Every document carries `read`: `read`, `partial` (with `readNote` saying which pages, for example "pp. 1 to 6 of 40"), `unreadable` (a scan the agent could not read) or `not-provided` (the household mentioned it but did not hand it over). A citation into an `unreadable` or `not-provided` document fails the build. Unread documents still belong in the list, because "we knew about it and could not read it" is a finding.

## Intake

The intake record is what the agent looked for, before it modeled anything. It is the evidence behind every "not in the documents" on the page, and the build derives the footer's "Looked for, not found" list from it. It is never typed by hand into the footer.

```json
"intake": {
  "lookedFor": [
    { "what": "Dana's will", "result": "missing", "note": "only Sam's will was provided" },
    { "what": "Beneficiary form for Dana's IRA", "result": "missing", "note": "the statement shows no designation page" },
    { "what": "Sam's will", "result": "found", "doc": "will-sam" },
    { "what": "The 2019 appraisal", "result": "unreadable" }
  ]
}
```

- `result` is `found` (name the `doc`), `missing` or `unreadable`.
- Any fact marked `status: "unknown"` requires a `lookedFor` entry somewhere: the audit refuses an unknown with no record of the search.
- Write what a careful attorney or CPA would ask for next, not only what the figures needed: wills for both spouses, powers of attorney, plan default rules, the operating agreement's transfer clause, the custodial agreement a statement cites.

## Parties

```json
"sam":   { "kind": "person", "name": "Sam Ellery", "short": "Sam",
           "marital": { "status": "married", "filing": "joint", "source": { … } },
           "will": { "kind": "pour-over", "residueTo": "trust", "source": { … } } },
"trust": { "kind": "trust", "name": "…", "short": "The family trust", "since": "2019",
           "trust": { "revocable": true, "grantors": ["sam", "dana"], "trustees": ["sam", "dana"],
                      "onDeath": { "first": "continues", "trusteeAfter": "survivor", "source": { … } } },
           "source": { … } },
"holdco": { "kind": "llc", "name": "…", "since": "2021",
            "tax": { "treatedAs": "maya", "label": "Taxed as Maya (disregarded LLC)", "source": { … } },
            "llc": { "onMemberDeath": "estate" | "successor", "successor": "<party>", "source": { … } } },
"opco":  { "kind": "corp", "corp": { "type": "C", "shares": 20000000, "taxSource": { … } },
           "qsbs": { "issued": { "date": "2021-03-01", "source": { … } },
                     "cCorp": { "source": { … } }, "grossAssets": { … }, "activeBusiness": { … },
                     "qualifiedField": { … }, "redemptions": { … } } },
"others": { "kind": "group", "name": "Investors and employees" }
```

- Each party kind is one of `person`, `trust`, `llc`, `corp` or `group` (an aggregate of other holders).
- `tax.treatedAs` names who answers for income tax: `"self"`, or another party's id. Grantor trusts and single-member disregarded LLCs point at their owner. The QSBS ledger groups holders by this.
- `marital` is required for every person a death event or a QSBS taxpayer group touches. `filing` is `single`, `joint` or `separate`.
- `will` has three honest shapes. A will on file: `{ "kind": "pour-over", "residueTo": "trust", "source": { "doc": "will-sam", "at": "Art. 3" } }`. The documents say there is no will (an intake note, a questionnaire): `{ "none": true, "source": { "doc": "intake", "at": "p. 1" } }`. The documents don't say: `{ "source": { "status": "unknown", "note": "No will in the documents" } }`. With no will, anything that would pass under one goes to the virtual recipient `intestacy` ("whoever state law names"); list `"intestacy"` in a transfer view's `recipients` to draw it, and explain it in a note.
- A beneficiary form that the document shows as empty is `"designation": { "primary": [], "source": { "doc": "roth-stmt", "at": "p. 2" } }`, which is different from `status: "unknown"`: the first is a known absence and routes the account through the estate; the second is a gap.
- `trust.onDeath` is required, cited, for a revocable trust whose grantor dies in an event.

## Assets

```json
"k401": { "kind": "retirement", "name": "Sam’s 401(k)",
          "value": { "usd": 910000, "basis": "equity, no loan", "source": { … } },
          "designation": { "primary": [{ "to": "dana", "share": 1 }], "contingent": [{ "to": "trust", "share": 1 }], "source": { … } } },
"life": { "kind": "insurance", "insures": "sam", "value": { "usd": 2000000, "basis": "death benefit", … },
          "cashValue": { "usd": 0, … }, "successorOwner": { "to": "dana", "source": { … } } }
```

- Asset kinds with their own label and icon: `home`, `rental`, `brokerage`, `retirement`, `insurance`, `stock`, `vehicle`, `bank` (also `checking`, `savings`). Any other kind is printed as written with a generic icon, so prefer one of these.
- Put every value on one basis, preferably equity after loans, and say so in `basis`. Line widths compare values, so gross and net values mixed together would mislead. A derived value cites every page it rests on (`"at": "p. 1 and p. 2"`) and may carry its parts, which notes can then quote: `"value": { "usd": 283000, "basis": "equity after the loan", "gross": 685000, "loan": 402150, "source": { … } }`. Any other dollar figure in a title or note must be a number the model produces, or the build fails.
- A payable-on-death or transfer-on-death registration on a bank or brokerage account is a `designation` like any beneficiary form. "None on file" on the statement is a known absence: `"designation": { "primary": [], "source": { "doc": "checking-stmt", "at": "p. 1" } }`.

## Holdings

```json
{ "holder": "trust", "held": "home", "share": 1, "source": { … } }
{ "holders": ["sam", "dana"], "form": "joint-survivorship", "held": "brokerage", "source": { … } }
{ "holder": "holdco", "held": "opco", "shares": 3600000,
  "acquired": { "how": "original issuance", "date": "2021-03-01", "basisPerShare": 0.0001,
                "election83b": { "source": { … } }, "source": { … } }, "source": { … } }
```

- Shares of anything add to 100%. A corporation's `shares` add to `corp.shares`. Use a `group` party for everyone else on a cap table.
- `acquired.how` is `original issuance` or `gift`. A gift has `from` and `tacksFrom`, which is the donor's acquisition date.

## Events

```json
"sam-dies": { "kind": "death", "who": "sam", "survivors": ["dana"] }   // survivors: the people whose roles the figure names (trustee, recipient); each needs a cited marital status, so list adults, not a minor child
"sale":     { "kind": "sale", "of": "opco", "pricePerShare": 12, "date": "2026-11-15", "source": { "status": "illustrative" } }
```

## Views

```json
{ "id": "structure", "type": "structure", "fig": 2,
  "title": "…answer first…", "subtitle": "…",
  "place": { "sam": [1.5, 0], "trust": [4.35, 1] },
  "cardWidth": 184, "pitch": 208,
  "zones": [{ "id": "in-trust", "label": "Held through the trust", "members": [ … ], "tone": "ok" | "group", "taxpayer": "maya" }],
  "relations": [{ "from": "sam", "to": "trust", "label": "Runs it" }],
  "gaps": [{ "from": "birchllc", "zone": "in-trust", "label": "No assignment on file" }],
  "ledger": { "event": "sale", "kind": "qsbs", "for": ["maya", "adatrust", "theotrust"] },
  "notes": [{ "on": "birchllc", "tone": "flag" | "ask" | "info", "title": "…", "body": "…" }] }

{ "id": "first-death", "type": "transfer", "fig": 3, "event": "sam-dies",
  "recipients": ["dana", "trust"], "bands": ["title", "contract", "trust", "probate"],
  "order": ["brokerage", "k401", "life", "home", "elmllc", "birchllc"], "notes": [ … ] }
```

- A zone with `taxpayer` must contain exactly that taxpayer's holders.
- A `gap` arrow needs about 0.9 of a column of clear space. It is for one thing missing from one container (an LLC never assigned to the trust). A household with no trust has no container to point at: use a zone such as "No probate" around what passes by form or title, and let the stragglers sit outside it with `flag` notes.
- Zone tones: `ok` (green, what is held where it should be), `group` (dashed, one taxpayer; needs `taxpayer`), `flag` (red dashed, a problem set). A zone's legend text is its `label` unless `legend` overrides it.
- In a transfer view, `bands` orders the mechanisms to avoid crossings. Every item the event touches must be listed in `order`.
- Dollar figures in titles, subtitles and notes must match a value the model or its derivations produce. The verifier checks this.
