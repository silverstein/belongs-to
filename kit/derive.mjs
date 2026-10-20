// Derivations: what the documents imply when an event happens. Each result
// carries the facts it rests on, so a figure can cite them and the verifier
// can list what was assumed. These are general US rules at the level of
// mechanism (form, title, trust, will). State law, community property and
// document terms can change outcomes; figures must say so.
import { holdingsBy, holdingsOf, valueOf, taxpayerOf, shortName } from "./model.mjs";
import { inSentence, listJoin } from "./text.mjs";

export const ROUTES = {
  contract: { label: "Beneficiary form", court: false, order: 0 },
  agreement: { label: "The LLC agreement", court: false, order: 0.5 },
  title: { label: "Joint title", court: false, order: 1 },
  trust: { label: "The trust", court: false, order: 2 },
  declared: { label: "On the trust’s list, not in its name", court: null, order: 2.5 },
  probate: { label: "Will, through probate court", court: true, order: 3 },
  unknown: { label: "Not in documents", court: null, order: 4 },
};

const alive = (id, event) => id !== event.who;

// The sentence a page owes whenever it mentions a disclaimer trust. The
// deadline is law, not a document fact, and it is what makes the choice urgent.
export const DISCLAIMER_RULE = "A disclaimer has to be made in writing within nine months of the death, and before the survivor takes any benefit from what is disclaimed; an attorney confirms the deadline and the form.";

// Living beneficiaries of the first tier that has any, with their shares
// rescaled pro rata. Per stirpes designations are not modeled: refuse.
function pickBeneficiaries(designation, event) {
  if (designation.perStirpes) throw new Error("per stirpes designations are not modeled; describe the outcome in a note");
  const living = (tier) => {
    const list = (tier ?? []).filter((entry) => alive(entry.to, event));
    const total = list.reduce((s, e) => s + e.share, 0);
    return list.map((e) => ({ ...e, share: e.share / total }));
  };
  const primary = living(designation.primary);
  if (primary.length) return { tier: "primary", to: primary };
  const contingent = living(designation.contingent);
  if (contingent.length) return { tier: "contingent", to: contingent };
  return null;
}

// Every item the decedent owned or controlled, with the route it takes.
export function deathRoutes(model, eventId) {
  const event = model.events[eventId];
  if (!event || event.kind !== "death") throw new Error(`No death event "${eventId}"`);
  const who = model.nodes[event.who];
  const rows = [];

  for (const holding of holdingsBy(model, event.who)) {
    const item = model.nodes[holding.held];
    const whole = valueOf(model, item.id);
    // What moves is the decedent's interest: the whole of a survivorship
    // account (the survivor then holds all of it), else the decedent's share.
    // Where a cited trust term ends survivorship, a joint holding moves the
    // decedent's equal part; see `override` below.
    const survivorshipEnds = Boolean(item.trustSchedule && model.nodes[item.trustSchedule.trust]?.trust?.survivorship?.ends && model.nodes[item.trustSchedule.trust].trust.grantors?.includes(event.who));
    const part = holding.joint ? (survivorshipEnds ? 1 / holding.holders.length : 1) : holding.fraction ?? 1;
    const value = whole == null ? null : whole * part;
    const facts = [holding.source];
    let route, to, detail;
    const others = holding.holders.filter((id) => id !== event.who);
    const pays = !(item.kind === "insurance" && item.insures && item.insures !== event.who);
    // The trust's own schedule names this item, but it is still in the
    // decedent's name. In the states that follow California's Heggstad line
    // a signed declaration with a schedule is enough to make it trust
    // property; the title gets conformed by a short court petition, not by
    // probate. The page draws that as its own band and says what it rests on.
    const schedule = item.trustSchedule && model.nodes[item.trustSchedule.trust];
    const declared = schedule?.kind === "trust" && schedule.trust?.revocable && schedule.trust.grantors?.includes(event.who) ? schedule : null;
    // Some trusts say in their own text that survivorship ends for anything
    // they list (a community-property declaration does this). With that term
    // cited, the trust's list runs ahead of the title's form, and the share
    // that moves is the decedent's part, not the whole.
    const override = Boolean(declared?.trust?.survivorship?.ends);
    const declare = () => {
      facts.push(item.trustSchedule.source);
      route = "declared"; to = [{ to: declared.id, share: 1 }];
      if (override && (holding.joint || holding.formUnknown)) { facts.push(declared.trust.survivorship.source); detail = "On the trust’s list, and the trust says survivorship ends for what it lists. Likely the trust’s after one court step."; }
      else detail = "On the trust’s list. Likely the trust’s after one court step.";
    };
    if (holding.joint && others.some((id) => alive(id, event)) && !override) {
      route = "title";
      const living = others.filter((id) => alive(id, event));
      to = living.map((id) => ({ to: id, share: 1 / living.length }));
      detail = living.length > 1 ? `${listJoin(living.map((id) => shortName(model.nodes[id])))} keep it` : `${shortName(model.nodes[living[0]])} keeps it`;
    } else if (!pays) {
      // A policy on someone else's life pays nothing now; the policy itself
      // passes to a named successor owner, else through the estate.
      if (item.successorOwner) { facts.push(item.successorOwner.source); route = "contract"; to = [{ to: item.successorOwner.to, share: 1 }]; detail = "Policy names a successor owner"; }
    } else if (item.designation) {
      facts.push(item.designation.source);
      if (item.designation.source?.status === "unknown") {
        // A policy or plan pays whoever its form names; the trust's schedule
        // can list it but cannot carry the proceeds past a form nobody has seen.
        const formDecides = ["insurance", "retirement", "annuity"].includes(item.kind);
        if (declared && !formDecides) declare();
        else {
          if (declared) facts.push(item.trustSchedule.source);
          route = "unknown";
          to = [];
          detail = item.kind === "property" ? "The deed isn’t in the documents" : item.kind === "vehicle" ? "The title isn’t in the documents" : declared ? "No beneficiary form in the documents; the form decides, not the trust’s list" : "No beneficiary form in the documents";
        }
      } else {
        const picked = pickBeneficiaries(item.designation, event);
        if (picked) {
          route = "contract";
          to = picked.to;
          detail = `The form names ${listJoin(picked.to.map((entry) => inSentence(shortName(model.nodes[entry.to]))))}`;
        }
      }
    } else if (item.llc?.onMemberDeath === "successor" && item.llc.successor) {
      facts.push(item.llc.source);
      route = "agreement";
      to = [{ to: item.llc.successor, share: 1 }];
      detail = "Agreement names a successor";
    }
    if (!route && holding.formUnknown && !(declared && override)) {
      // Names on a document, form not shown: survivorship may or may not
      // apply, and the trust's list can't settle it without the term above.
      route = "unknown"; to = []; detail = declared ? "On the trust’s list, but the documents don’t show how the title is held" : "The documents don’t show how the title is held";
      if (declared) facts.push(item.trustSchedule.source);
    }
    if (!route && declared) declare();
    if (!route && item.llc && item.llc.source?.status === "unknown") {
      // No operating agreement in the documents: it may name a successor, so
      // the route is a gap, the same as a missing beneficiary form.
      facts.push(item.llc.source);
      route = "unknown"; to = []; detail = "The operating agreement isn’t in the documents";
    }
    if (!route) {
      if (item.llc) facts.push(item.llc.source);
      const will = who.will;
      if (will) facts.push(will.source);
      route = "probate";
      if (will?.residueTo) { to = [{ to: will.residueTo, share: 1 }]; detail = `Then the will sends it to ${inSentence(shortName(model.nodes[will.residueTo]))}`; }
      else if (will?.source?.status === "unknown") { to = [{ to: "intestacy", share: 1 }]; detail = "No will on file, so the state’s default list decides"; }
      else if (will?.none) { to = [{ to: "intestacy", share: 1 }]; detail = "No will, so the state’s default list decides"; }
      else { to = []; detail = "Passes under the will"; }
    }
    rows.push({ id: item.id, item, holding, value: pays ? value : item.cashValue?.usd ?? null, route, to, detail, facts });
  }

  // Policies on the decedent's life that someone else owns still pay now.
  for (const node of Object.values(model.nodes)) {
    if (node.kind !== "insurance" || node.insures !== event.who || holdingsBy(model, event.who).some((h) => h.held === node.id)) continue;
    const owners = holdingsOf(model, node.id).flatMap((h) => h.holders);
    const picked = node.designation && node.designation.source?.status !== "unknown" ? pickBeneficiaries(node.designation, event) : null;
    rows.push({
      id: node.id, item: node, holding: holdingsOf(model, node.id)[0], value: node.value?.usd ?? null,
      route: picked ? "contract" : "unknown", to: picked?.to ?? [],
      detail: picked ? `The form names ${listJoin(picked.to.map((e) => inSentence(shortName(model.nodes[e.to]))))}` : "No one named in the documents",
      facts: [node.designation?.source].filter(Boolean), ownedBy: owners,
    });
  }

  // What the decedent controlled through a revocable trust they created.
  for (const node of Object.values(model.nodes)) {
    if (node.kind !== "trust" || !node.trust?.revocable || !node.trust.grantors?.includes(event.who)) continue;
    const terms = node.trust.onDeath;
    for (const holding of holdingsBy(model, node.id)) {
      const item = model.nodes[holding.held];
      const survivorTrustee = terms?.trusteeAfter === "survivor" ? (event.survivors ?? []).map((id) => shortName(model.nodes[id])).join(" and ") : null;
      // The trust's share of the item, not the whole item: a trust that owns half the home holds half its value.
      const wholeValue = valueOf(model, item.id);
      const trustValue = wholeValue == null || holding.fraction == null ? null : wholeValue * holding.fraction;
      rows.push({
        id: item.id, item, holding, value: trustValue, route: "trust", to: [{ to: node.id, share: 1 }],
        detail: terms?.first === "continues" ? `Stays in the trust${survivorTrustee ? `, which ${survivorTrustee} now runs` : ""} (${terms.source?.at ?? "trust terms"})` : `Follows the trust’s rules${terms?.source?.at ? ` (${terms.source.at})` : ""}`,
        facts: [holding.source, terms?.source].filter(Boolean),
        via: node.id,
      });
    }
  }
  return rows;
}

// QSBS (IRC § 1202). The regime follows the first day the stock was held,
// after tacking (§ 1202(a)(6)(B), § 1223), so gifted stock keeps the donor's.
//   issued on or before Aug 10, 1993: not QSBS (§ 1202(c)(1))
//   acquired on or before Feb 17, 2009: 50% after more than 5 years
//   Feb 18, 2009 to Sep 27, 2010: 75% (§ 1202(a)(3))
//   Sep 28, 2010 to Jul 4, 2025: 100% (§ 1202(a)(4))
//   after Jul 4, 2025: 50/75/100% at 3/4/5 years held (§ 1202(a)(5))
// Cap per taxpayer per issuer (§ 1202(b)): the greater of the dollar limit,
// less earlier exclusions from that issuer, or 10x the basis of the stock
// sold that year. Dollar limit $10M, or $15M for stock acquired after Jul 4,
// 2025 (indexed for tax years beginning after 2026). Married filing
// separately: half; filing jointly: spouses share one limit (§ 1202(b)(3)).
export const QSBS_RULES = {
  notQsbsIssuedOnOrBefore: "1993-08-10",
  changeDate: "2025-07-04",
  bands: [
    { through: "2009-02-17", cap: 10_000_000, tiers: [[5, 0.5, "more"]], label: "acquired on or before Feb 17, 2009" },
    { through: "2010-09-27", cap: 10_000_000, tiers: [[5, 0.75, "more"]], label: "acquired Feb 18, 2009 to Sep 27, 2010" },
    { through: "2025-07-04", cap: 10_000_000, tiers: [[5, 1, "more"]], label: "acquired Sep 28, 2010 to Jul 4, 2025" },
    { through: "9999-12-31", cap: 15_000_000, tiers: [[3, 0.5, "least"], [4, 0.75, "least"], [5, 1, "least"]], label: "acquired after Jul 4, 2025", indexedAfter: 2026 },
  ],
};

// Calendar anniversaries, not decimal years: "more than 5 years" is met the
// day after the 5th anniversary; "at least 3 years" on the 3rd anniversary.
export function anniversary(date, years) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0); // Feb 29 -> Feb 28
  return target.toISOString().slice(0, 10);
}

export function qsbsRegime(start, saleDate, issuedDate) {
  if (issuedDate && issuedDate <= QSBS_RULES.notQsbsIssuedOnOrBefore) return { band: null, pct: 0, reason: "issued on or before Aug 10, 1993" };
  const band = QSBS_RULES.bands.find((b) => start <= b.through);
  let pct = 0;
  for (const [years, value, kind] of band.tiers) {
    const mark = anniversary(start, years);
    if (kind === "more" ? saleDate > mark : saleDate >= mark) pct = value;
  }
  return { band, pct, reason: pct ? null : "holding period not met" };
}

// The § 1202 conditions a figure must address, each cited or marked assumed.
export const QSBS_CONDITIONS = [
  { key: "cCorp", label: "A C corporation the whole time, never an S election" },
  { key: "grossAssets", label: "Gross assets of $50M or less at all times before, and right after, the stock was issued ($75M for stock issued after Jul 4, 2025)" },
  { key: "activeBusiness", label: "Active business (80% of assets) for substantially all of the holding period" },
  { key: "qualifiedField", label: "Not an excluded field (health, law, engineering, consulting, finance and others)" },
  { key: "redemptions", label: "No disqualifying stock redemptions around the issuance" },
];

export function qsbsLedger(model, eventId, taxpayers) {
  const event = model.events[eventId];
  if (!event || event.kind !== "sale") throw new Error(`No sale event "${eventId}"`);
  const issuer = model.nodes[event.of];
  const conditions = issuer.qsbs ?? {};
  const issued = conditions.issued?.date ?? null;
  const assumptions = Object.entries(conditions).filter(([, fact]) => fact.source?.status === "assumed").map(([key, fact]) => ({ key, note: fact.source.note }));
  const groups = new Map();
  const allTaxpayers = new Set();
  for (const holding of holdingsOf(model, issuer.id)) {
    for (const holder of holding.holders) {
      const taxpayer = taxpayerOf(model, holder);
      if (model.nodes[taxpayer]?.kind !== "group") allTaxpayers.add(taxpayer);
      if (taxpayers && !taxpayers.includes(taxpayer)) continue;
      if (!groups.has(taxpayer)) groups.set(taxpayer, { taxpayer, holders: [], lots: [], shares: 0, proceeds: 0, basis: 0, eligible: true, reasons: [] });
      const group = groups.get(taxpayer);
      const shares = holding.shares / holding.holders.length;
      const acquired = holding.acquired ?? {};
      const start = acquired.tacksFrom ?? acquired.date;
      const regime = start ? qsbsRegime(start, event.date, issued) : { band: null, pct: 0, reason: "acquisition date not in documents" };
      const lot = { id: holder, shares, start, acquired, ...regime };
      group.holders.push(lot);
      group.lots.push(lot);
      group.shares += shares;
      group.proceeds += shares * event.pricePerShare;
      group.basis += shares * (acquired.basisPerShare ?? 0);
      if (regime.reason) { group.eligible = false; group.reasons.push(`${shortName(model.nodes[holder])}: ${regime.reason}`); }
      if (!["original issuance", "gift"].includes(acquired.how)) { group.eligible = false; group.reasons.push(`${shortName(model.nodes[holder])}: not acquired at original issuance or by gift`); }
    }
  }
  const unsupported = [];
  const rows = [...groups.values()].map((group) => {
    const gain = group.proceeds - group.basis;
    const bands = new Set(group.lots.map((l) => l.band?.label));
    const pcts = new Set(group.lots.map((l) => l.pct));
    // One taxpayer holding lots under different rules needs a per-lot
    // computation with counsel; the kit refuses rather than guess.
    if (bands.size > 1 || pcts.size > 1) unsupported.push(`${group.taxpayer}: lots under different § 1202 rules or percentages`);
    const band = group.lots[0].band ?? QSBS_RULES.bands[2];
    const filing = model.nodes[group.taxpayer].marital?.filing;
    const dollar = filing === "separate" ? band.cap / 2 : band.cap;
    const cap = Math.max(dollar, 10 * group.basis);
    const pct = group.lots[0].pct;
    const excludable = group.eligible && bands.size === 1 && pcts.size === 1 ? Math.min(gain, cap) * pct : 0;
    return { ...group, band, gain, cap, pct, excludable, over: Math.max(0, gain - cap), filing };
  });
  // Eligibility checklist: issuer conditions, then each acquisition's facts.
  const checklist = QSBS_CONDITIONS.map(({ key, label }) => {
    const fact = conditions[key];
    return { key, label, source: fact?.source ?? null, status: !fact ? "missing" : fact.source?.status === "assumed" ? "assumed" : fact.source?.doc ? "cited" : "missing" };
  });
  const holdingsIn = holdingsOf(model, issuer.id).filter((h) => h.holders.some((id) => !taxpayers || taxpayers.includes(taxpayerOf(model, id))));
  const origin = holdingsIn.find((h) => h.acquired?.how === "original issuance");
  if (origin) checklist.push({ key: "originalIssuance", label: "Bought from the company at original issuance (gifted shares inherit this)", source: origin.acquired.source, status: origin.acquired.source?.doc ? "cited" : "assumed" });
  const vesting = holdingsIn.map((h) => h.acquired?.election83b).find(Boolean);
  if (vesting) checklist.push({ key: "election83b", label: "83(b) election filed, so the five-year clock started at purchase, not at vesting", source: vesting.source, status: vesting.source?.status === "assumed" ? "assumed" : vesting.source?.doc ? "cited" : "missing" });
  const start = holdingsIn.map((h) => h.acquired?.tacksFrom ?? h.acquired?.date).filter(Boolean).sort()[0];
  if (start) {
    const fmt = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const regime = qsbsRegime(start, event.date, issued);
    const need = regime.band?.tiers.at(-1)[2] === "least" ? "at least five years" : "more than five years";
    checklist.push({ key: "holdingPeriod", label: `Held ${need} at the sale: ${fmt(start)} to ${fmt(event.date)}`, status: regime.pct === 1 ? "computed" : regime.pct ? "partial" : "fails" });
  }
  const order = taxpayers ?? rows.map((row) => row.taxpayer);
  rows.sort((a, b) => order.indexOf(a.taxpayer) - order.indexOf(b.taxpayer));
  const missing = [...allTaxpayers].filter((id) => !rows.some((r) => r.taxpayer === id));
  const totalGain = rows.reduce((sum, row) => sum + row.gain, 0);
  const totalBasis = rows.reduce((sum, row) => sum + row.basis, 0);
  const band = rows[0]?.band ?? QSBS_RULES.bands[2];
  const singleCap = Math.min(totalGain, Math.max(band.cap, 10 * totalBasis)) * (rows[0]?.pct ?? 1);
  return { event, issuer, rows, assumptions, checklist, missing, unsupported, total: rows.reduce((sum, row) => sum + row.excludable, 0), singleCap };
}

// The sentence under an item on the transfer view: whose it is, and what
// governs it. A route the documents don't settle says so; it never claims
// "no one is named" unless a form or agreement was read and names no one.
// A fractional holding says "half" or the share, never "alone".
export function holdLine(model, event, row) {
  const who = model.nodes[event.who];
  const node = row.item;
  if (row.ownedBy) return `Owned by ${row.ownedBy.map((id) => shortName(model.nodes[id])).join(" and ")}`;
  if (row.via) return `In ${inSentence(shortName(model.nodes[row.via]))}`;
  const others = (row.holding?.holders ?? []).filter((h) => h !== event.who).map((h) => shortName(model.nodes[h]));
  if (row.holding?.joint) return row.route === "declared" ? `Joint with ${others.join(", ")}, and the trust’s list names it` : `Joint with ${others.join(", ")}`;
  if (row.holding?.formUnknown) {
    const names = `${shortName(who)}’s and ${others.join(", ")}’s`;
    return row.route === "declared" ? `${names}, and the trust’s list names it` : `${names}; how it’s held isn’t in the documents`;
  }
  const fraction = row.holding?.fraction ?? 1;
  const part = fraction >= 1 ? null : fraction === 0.5 ? "half" : fraction === 1 / 3 ? "third" : fraction === 0.25 ? "quarter" : `${Math.round(fraction * 100)}% share`;
  const mine = part ? `${shortName(who)}’s ${part}` : `${shortName(who)}’s`;
  if (row.route === "contract") return `${mine}, and a form says who gets it`;
  if (row.route === "agreement") return `${mine}, and the agreement says who steps in`;
  if (row.route === "declared") return `${mine}, and the trust’s list names it`;
  if (row.route === "unknown" || node.designation?.source?.status === "unknown") return `${mine}, and the documents don’t show who gets it`;
  if (node.llc && node.llc.source?.status === "unknown") return `${mine}, and the documents don’t show who steps in`;
  if (node.designation && !(node.designation.primary ?? []).length) return `${mine}, and no one is named to get it`;
  return part ? `${mine}, and no one is named to get it` : `${mine} alone, and no one is named to get it`;
}
