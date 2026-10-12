# The rules the kit encodes, and the ones it doesn't

The kit draws what documents say and derives a few outcomes from general US rules at the level of mechanism. This page lists exactly what is derived, so a figure never implies more. When a household hits something on the "not modeled" lists, say so in a note. Don't let the drawing imply an answer.

These rules were reviewed against the statute and by a trusts-and-estates read in October 2026. Re-check them when the law changes.

## At a death (`deathRoutes`, `kit/derive.mjs`)

For each thing the decedent holds, the first rule that applies decides the route:

1. **Joint title with right of survivorship**, with a living co-owner: the survivors hold it. No court.
2. **Life insurance on someone else's life:** nothing pays. The policy itself passes to a named successor owner, or else through the estate, at its cash value.
3. **Beneficiary designation** (retirement accounts, insurance, transfer-on-death or payable-on-death registrations): it goes to the living primary beneficiaries, rescaled pro rata, else the contingent ones. No court. If the documents don't show the designation, the route is "not in the documents".
4. **LLC successor clause** in the operating agreement: it goes to the named successor, in its own band. No court.
5. **Otherwise: the will, through probate.** It goes to the will's residuary beneficiary (often the trust, under a pour-over will) after probate. With no will, it goes to whoever the state's intestacy law names, drawn as the `intestacy` recipient; the kit does not model who that is (usually the spouse and children in shares the state sets) or small-estate shortcuts.

Two more rules:
- Assets held by a revocable trust the decedent created stay in the trust, under its cited `onDeath` terms. No court.
- Policies on the decedent's life owned by someone else still pay by their form.

What moves is the decedent's interest: the whole of a survivorship account, else the decedent's share.

**Not modeled** (say so when it applies):
- Community property and quasi-community property: who owns what despite title, step-up, and spousal property procedures.
- State probate differences: independent or unsupervised administration, small-estate affidavits, Heggstad-type petitions, and how much the court is involved. The figure says "often months, with costs" and "details depend on the state".
- Trust splits at a death (survivor's, bypass and QTIP shares), trust administration, portability elections, and state estate tax.
- Per stirpes designations: the kit refuses them. So are plan-default beneficiaries when no named beneficiary survives; the kit routes those through the will, which may be wrong. Check the plan's terms.
- What an operating agreement or state LLC act says about a sole member's death beyond a simple successor clause: dissolution after 90 days, economic interest only, transfer restrictions. Lender consent for transfers.
- Disclaimers, simultaneous death, creditor claims, and incapacity (durable powers of attorney).

## QSBS (`qsbsLedger`, IRC § 1202)

- **Who has a cap:** each taxpayer, per issuer. Holders are grouped by income-tax owner: grantor trusts and single-member disregarded LLCs collapse to their owner, and non-grantor trusts are separate. The single-member-LLC treatment is standard practice under the check-the-box rules, not § 1202-specific authority. The LLC must stay disregarded through the sale.
- **Cap:** the greater of the dollar limit (less earlier exclusions from that issuer, which the kit assumes are zero and says so) or 10× the basis of the stock sold that year. The dollar limit is $10M for stock acquired on or before Jul 4, 2025 and $15M after (indexed for tax years beginning after 2026). Married filing separately gets half; filing jointly, spouses share one limit.
- **Percentage**, by the first day held after tacking (a gift keeps the donor's date):

  | Acquired | Exclusion |
  |---|---|
  | Issued on or before Aug 10, 1993 | Not QSBS |
  | On or before Feb 17, 2009 | 50% after more than 5 years |
  | Feb 18, 2009 to Sep 27, 2010 | 75% after more than 5 years |
  | Sep 28, 2010 to Jul 4, 2025 | 100% after more than 5 years |
  | After Jul 4, 2025 | 50% / 75% / 100% after at least 3 / 4 / 5 years |

  Holding periods are measured in calendar anniversaries. "More than five years" is met the day after the fifth anniversary; "at least three years" is met on the third.
- **Conditions every ledger shows as cited or assumed:**
  - a C corporation the whole time, with no S election;
  - gross assets of $50M or less at all times before, and right after, issuance ($75M for stock issued after Jul 4, 2025);
  - the active-business test (80% of assets) over substantially all of the holding period;
  - not an excluded field;
  - no disqualifying redemptions;
  - original issuance (gifts inherit it);
  - an 83(b) election if the shares vested;
  - the holding period.
- **§ 643(f):** trusts with substantially the same grantor and the same primary beneficiaries can be treated as one trust if a principal purpose was avoiding tax. Different beneficiaries keep them apart. Trustees are not the test.
- **Federal only.** States differ; California does not follow § 1202. The ledger says so.

**Not modeled** (the kit refuses or says so):
- One taxpayer holding lots under different rules or percentages (refused).
- Partnership-held stock (§ 1202(g)).
- § 1045 rollovers.
- Options. A cap table's options are not stock; the kit counts outstanding shares only.
- 28%-rate gain on the non-excluded part of partially excluded stock.
- The 3.8% net investment income tax on the taxed part.

## Things a figure must never do

- Draft or describe the wording of an instrument. Name the fix and the professional instead.
- State an absence as a fact. Say "not in the documents".
- Cite a legal conclusion to a page that doesn't establish it.
- Present a total that depends on an unknown value. The renderers withhold it and say why.
