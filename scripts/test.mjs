#!/usr/bin/env node
// Proves the audits catch what they claim to: each case breaks a known-good
// model in one way and expects a specific failure. Run: node scripts/test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../kit/model.mjs";
import { verify } from "../kit/verify.mjs";
import { deathRoutes, qsbsLedger, anniversary, qsbsRegime } from "../kit/derive.mjs";
import { renderStructure } from "../kit/structure.mjs";
import { renderTransfer } from "../kit/transfer.mjs";
import { renderTransferStacked } from "../kit/transfer-stacked.mjs";
import { auditLayout } from "../kit/audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "examples", name, "household.json"), "utf8"));
let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`ok   ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}\n     ${error.message}`); }
};
const expectFail = (raw, check, pattern) => {
  const result = verify(normalize(raw));
  const c = result.checks.find((x) => x.name === check);
  if (!c) throw new Error(`no check named ${check}`);
  if (c.passed) throw new Error(`"${check}" passed but should have failed`);
  if (pattern && !c.problems.some((p) => pattern.test(p))) throw new Error(`"${check}" failed, but not with ${pattern}: ${c.problems.join("; ")}`);
};

test("both examples pass the facts audit", () => {
  for (const name of ["ellery", "okafor"]) { const r = verify(normalize(load(name))); if (!r.ok) throw new Error(`${name}: ${r.errors.join("; ")}`); }
});

test("ownership that adds to 90% fails", () => {
  const raw = load("ellery");
  raw.holdings.find((h) => h.held === "home").share = 0.9;
  expectFail(raw, "ownership adds to 100%", /home: ownership adds to 90/);
});

test("a cap table that doesn't add up fails", () => {
  const raw = load("okafor");
  raw.holdings.find((h) => h.holder === "others").shares = 13900000;
  expectFail(raw, "ownership adds to 100%", /19,900,000 of 20,000,000/);
});

test("an asset with no owner fails", () => {
  const raw = load("ellery");
  raw.assets.boat = { kind: "home", name: "Boat", value: { usd: 1, source: { doc: "appraisals" } } };
  expectFail(raw, "ownership adds to 100%", /boat .* has no owner/);
});

test("a holding with no source fails", () => {
  const raw = load("ellery");
  delete raw.holdings.find((h) => h.held === "birch").source;
  expectFail(raw, "every fact cited or marked", /birchllc → birch has no source/);
});

test("a value with no source fails", () => {
  const raw = load("ellery");
  delete raw.assets.home.value.source;
  expectFail(raw, "every fact cited or marked", /home value has no source/);
});

test("citing a document that isn't listed fails", () => {
  const raw = load("ellery");
  raw.holdings.find((h) => h.held === "home").source = { doc: "deed-typo" };
  expectFail(raw, "references resolve", /deed-typo/);
});

test("a beneficiary who doesn't exist fails", () => {
  const raw = load("ellery");
  raw.assets.k401.designation.primary = [{ to: "danna", share: 1 }];
  expectFail(raw, "references resolve", /danna/);
});

test("beneficiary shares that add to 150% fail", () => {
  const raw = load("ellery");
  raw.assets.k401.designation.primary = [{ to: "dana", share: 1 }, { to: "trust", share: 0.5 }];
  expectFail(raw, "ownership adds to 100%", /primary beneficiaries add to 150/);
});

test("an ownership loop fails", () => {
  const raw = load("ellery");
  raw.holdings.push({ holder: "elmllc", held: "trust", share: 1, source: { doc: "trust" } });
  expectFail(raw, "no loops", /loop/);
});

test("a probate route nobody notes fails (findings must be surfaced)", () => {
  const raw = load("ellery");
  for (const view of raw.views) view.notes = view.notes.filter((n) => n.on !== "birchllc");
  expectFail(raw, "findings surfaced", /Birch Avenue LLC passes through probate/);
});

test("an assumption nobody notes fails", () => {
  const raw = load("okafor");
  raw.views[0].notes = raw.views[0].notes.filter((n) => n.on !== "opco");
  expectFail(raw, "findings surfaced", /Assumed/);
});

test("death routes: title beats form beats will", () => {
  const model = normalize(load("ellery"));
  const routes = Object.fromEntries(deathRoutes(model, "sam-dies").map((r) => [r.id, r.route]));
  const want = { brokerage: "title", k401: "contract", life: "contract", birchllc: "probate", home: "trust", elmllc: "trust" };
  for (const [id, route] of Object.entries(want)) if (routes[id] !== route) throw new Error(`${id}: ${routes[id]}, want ${route}`);
});

test("death routes: a dead primary beneficiary falls to the contingent", () => {
  const raw = load("ellery");
  raw.events["dana-dies"] = { kind: "death", who: "dana", survivors: ["sam"] };
  raw.holdings.find((h) => h.held === "k401").holder = "sam";
  const model = normalize(raw);
  // Sam's 401(k) names Dana then the trust; if Dana is the decedent the 401(k) is not hers, so check via a synthetic swap
  model.nodes.k401.designation.primary = [{ to: "dana", share: 1 }];
  raw.holdings.find((h) => h.held === "k401").holder = "dana";
  const swapped = normalize(raw);
  const row = deathRoutes(swapped, "dana-dies").find((r) => r.id === "k401");
  if (row.to[0].to !== "trust") throw new Error(`went to ${row.to[0].to}`);
});

test("QSBS: grantor trust and disregarded LLC share one cap; non-grantor trusts get their own", () => {
  const model = normalize(load("okafor"));
  const ledger = qsbsLedger(model, "sale", ["maya", "adatrust", "theotrust"]);
  const maya = ledger.rows.find((r) => r.taxpayer === "maya");
  if (maya.shares !== 4600000) throw new Error(`Maya's group holds ${maya.shares}`);
  if (Math.round(ledger.total) !== 26799860) throw new Error(`total ${ledger.total}`);
});

test("QSBS: a holding period under five years excludes nothing (pre-2025 stock)", () => {
  const raw = load("okafor");
  raw.events.sale.date = "2025-12-01";
  const ledger = qsbsLedger(normalize(raw), "sale", ["maya"]);
  if (ledger.rows[0].excludable !== 0) throw new Error(`excluded ${ledger.rows[0].excludable}`);
});

test("QSBS: stock acquired after July 4, 2025 gets the $15M cap and the 3/4/5-year tiers", () => {
  const raw = load("okafor");
  for (const h of raw.holdings) if (h.acquired) { h.acquired.date = "2025-09-01"; h.acquired.tacksFrom = "2025-09-01"; }
  raw.events.sale.date = "2029-10-01"; // 4.08 years
  const ledger = qsbsLedger(normalize(raw), "sale", ["maya"]);
  const row = ledger.rows[0];
  if (row.cap !== 15000000) throw new Error(`cap ${row.cap}`);
  if (row.pct !== 0.75) throw new Error(`pct ${row.pct}`);
});

test("QSBS: stock acquired in 2010 before Sep 28 gets 75%, not 100%", () => {
  const r = qsbsRegime("2010-03-01", "2020-01-01", "2010-03-01");
  if (r.pct !== 0.75) throw new Error(`pct ${r.pct}`);
});

test("QSBS: stock issued on or before Aug 10, 1993 is not QSBS", () => {
  const r = qsbsRegime("1993-06-01", "2020-01-01", "1993-06-01");
  if (r.pct !== 0) throw new Error(`pct ${r.pct}`);
});

test("QSBS: selling on the exact 5th anniversary is not 'more than 5 years'", () => {
  if (qsbsRegime("2019-03-01", "2024-03-01").pct !== 0) throw new Error("anniversary counted as more than five years");
  if (qsbsRegime("2019-03-01", "2024-03-02").pct !== 1) throw new Error("day after anniversary not counted");
});

test("QSBS: post-2025 stock reaches 50% on the 3rd anniversary itself", () => {
  if (qsbsRegime("2025-09-01", "2028-09-01").pct !== 0.5) throw new Error("3rd anniversary not counted");
  if (anniversary("2024-02-29", 1) !== "2025-02-28") throw new Error("leap day anniversary");
});

test("QSBS: one taxpayer holding old and new lots is refused, not guessed", () => {
  const raw = load("okafor");
  const idgt = raw.holdings.find((h) => h.holder === "idgt");
  idgt.acquired = { how: "original issuance", date: "2025-09-01", basisPerShare: 1, source: { doc: "spa" } };
  const r = verify(normalize(raw));
  if (!r.errors.some((e) => /different § 1202 rules/.test(e))) throw new Error(r.errors.join("; ") || "passed");
});

test("QSBS: married filing separately halves the dollar cap", () => {
  const raw = load("okafor");
  raw.parties.maya.marital = { status: "married", filing: "separate", source: { doc: "maya-1040" } };
  const row = qsbsLedger(normalize(raw), "sale", ["maya"]).rows[0];
  if (row.cap !== 5000000) throw new Error(`cap ${row.cap}`);
});

test("QSBS: a ledger that leaves out a taxpayer who holds the stock fails", () => {
  const raw = load("okafor");
  raw.views[0].ledger.for = ["maya", "adatrust"];
  const r = verify(normalize(raw));
  if (!r.errors.some((e) => /leaves out theotrust/.test(e))) throw new Error(r.errors.join("; ") || "passed");
});

test("a dollar figure in a headline that the model can't produce fails", () => {
  const raw = load("okafor");
  raw.views[0].title = "Maya’s kids’ trusts can add $18.2M of QSBS exclusion.";
  expectFail(raw, "numbers in the text match the model", /\$18\.2M/);
});

test("a taxpayer zone that disagrees with tax ownership fails", () => {
  const raw = load("okafor");
  raw.views[0].zones.find((z) => z.id === "tp-ada").members = ["adatrust"];
  raw.views[0].zones.find((z) => z.id === "tp-maya").members.push("theotrust");
  raw.views[0].zones = raw.views[0].zones.filter((z) => z.id !== "tp-theo");
  expectFail(raw, "zones and trust terms agree with the facts", /theotrust .* income-tax owner/);
});

test("death: a policy Sam owns on Dana's life pays nothing at Sam's death", () => {
  const raw = load("ellery");
  raw.assets.life.insures = "dana";
  raw.assets.life.cashValue = { usd: 50000, source: { doc: "policy" } };
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "life");
  if (row.route !== "probate" || row.value !== 50000) throw new Error(`${row.route} ${row.value}`);
});

test("death: a policy on Sam's life owned by Dana still pays by its form", () => {
  const raw = load("ellery");
  raw.holdings.find((h) => h.held === "life").holder = "dana";
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "life");
  if (!row || row.route !== "contract" || row.to[0].to !== "trust") throw new Error(JSON.stringify(row && [row.route, row.to]));
});

test("death: half an interest moves half the value", () => {
  const raw = load("ellery");
  const h = raw.holdings.find((x) => x.held === "birchllc");
  h.share = 0.5;
  raw.holdings.push({ holder: "dana", held: "birchllc", share: 0.5, source: { doc: "birch-oa", at: "Sched. A" } });
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "birchllc");
  if (row.value !== 370000) throw new Error(`value ${row.value}`);
});

test("death: a 50/50 designation splits value instead of counting it twice", () => {
  const raw = load("ellery");
  raw.assets.k401.designation.primary = [{ to: "dana", share: 0.5 }, { to: "trust", share: 0.5 }];
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "k401");
  const sum = row.to.reduce((s, e) => s + row.value * e.share, 0);
  if (sum !== 910000) throw new Error(`moved ${sum}`);
});

test("death: a predeceased co-beneficiary's share goes pro rata to the living one", () => {
  const raw = load("ellery");
  raw.assets.life.designation.primary = [{ to: "sam", share: 0.5 }, { to: "trust", share: 0.5 }];
  raw.holdings.find((h) => h.held === "life").holder = "dana";
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "life");
  if (row.to.length !== 1 || row.to[0].share !== 1) throw new Error(JSON.stringify(row.to));
});

test("death: an LLC successor clause gets its own route, not 'beneficiary form'", () => {
  const raw = load("ellery");
  raw.parties.birchllc.llc = { onMemberDeath: "successor", successor: "trust", source: { doc: "birch-oa", at: "§ 9.2" } };
  const row = deathRoutes(normalize(raw), "sam-dies").find((r) => r.id === "birchllc");
  if (row.route !== "agreement") throw new Error(row.route);
});

test("absence stated as fact fails", () => {
  const raw = load("ellery");
  raw.views[0].notes.find((n) => n.on === "ira").title = "Dana’s IRA has no beneficiary.";
  raw.views[0].notes.find((n) => n.on === "ira").body = "Ask the custodian.";
  expectFail(raw, "absence said as absence", /states a missing fact/);
});

test("a missing state fails", () => {
  const raw = load("ellery");
  delete raw.jurisdiction;
  expectFail(raw, "context the law turns on", /no jurisdiction/);
});

test("intake: a document with no read status fails", () => {
  const raw = load("ellery");
  delete raw.documents.trust.read;
  expectFail(raw, "intake recorded", /"trust" has no read status/);
});

test("intake: a citation into a document that was not provided fails", () => {
  const raw = load("ellery");
  raw.documents["deed-home"].read = "not-provided";
  expectFail(raw, "intake recorded", /cites "deed-home", which was not provided/);
});

test("intake: a citation into an unreadable scan fails", () => {
  const raw = load("park");
  raw.documents["05-deed-914-josephine.md"].read = "unreadable";
  expectFail(raw, "intake recorded", /was not readable/);
});

test("intake: 'not in the documents' with no record of looking fails", () => {
  const raw = load("ellery");
  delete raw.intake;
  expectFail(raw, "intake recorded", /lookedFor does not record what was searched/);
});

test("intake: a hand-written notInDocuments list is refused", () => {
  const raw = load("park");
  raw.notInDocuments = ["Dana's will"];
  expectFail(raw, "intake recorded", /hand-written/);
});

test("intake: a 'found' entry must name its document", () => {
  const raw = load("okafor");
  raw.intake.lookedFor.push({ what: "A thing", result: "found" });
  expectFail(raw, "intake recorded", /names no document/);
});

test("intake: a partially read document must say which pages", () => {
  const raw = load("ellery");
  raw.documents.trust.read = "partial";
  expectFail(raw, "intake recorded", /readNote does not say which pages/);
});

// Three findings from an outside review (2026-10-12), each reproduced before the fix.
test("death: a trust that owns half the home moves half its value, not all of it", () => {
  const raw = load("ellery");
  raw.holdings.find((h) => h.held === "home").share = 0.5;
  raw.holdings.push({ holder: "dana", held: "home", share: 0.5, source: { doc: "deed-home", at: "p. 1" } });
  const m = normalize(raw);
  const row = deathRoutes(m, "sam-dies").find((r) => r.id === "home");
  if (row.value !== 800000) throw new Error(`trust route shows ${row.value}`);
  for (const render of [renderTransfer, renderTransferStacked]) {
    const fig = render(m, raw.views[1], { noteBadges: new Map() });
    const trust = fig.recipients ? fig.recipients.find((r) => r.id === "trust") : null;
    const stays = (trust?.lines ?? []).find((l) => l.key === "stays");
    if (trust && stays && stays.amount !== 800000 + 1100000) throw new Error(`${render.name}: trust total ${stays.amount}`);
  }
});

test("a beneficiary with no share fails instead of becoming NaN", () => {
  const raw = load("ellery");
  delete raw.assets.k401.designation.primary[0].share;
  expectFail(raw, "ownership adds to 100%", /k401 primary beneficiary dana: share must be/);
});

for (const [label, value] of [["null", null], ["a string", "50%"], ["zero", 0], ["negative", -0.5], ["over one", 1.5], ["infinite", Infinity]]) {
  test(`a holding share that is ${label} fails`, () => {
    const raw = load("ellery");
    raw.holdings.find((h) => h.held === "home").share = value;
    const r = verify(normalize(raw));
    const c = r.checks.find((x) => x.name === "ownership adds to 100%");
    if (c.passed || !c.problems.some((p) => /trust → home: share must be/.test(p))) throw new Error(c.problems.join("; ") || "passed");
  });
}

test("a cap-table share count that is not a whole number fails", () => {
  const raw = load("okafor");
  raw.holdings.find((h) => h.holder === "others").shares = 14000000.5;
  expectFail(raw, "ownership adds to 100%", /shares must be a positive whole number/);
});

test("a band list that leaves out an affected asset fails the layout audit in both layouts", () => {
  const raw = load("ellery");
  raw.views[1].bands = ["title", "contract", "trust"];
  const m = normalize(raw);
  for (const render of [renderTransfer, renderTransferStacked]) {
    const fig = render(m, raw.views[1], { noteBadges: new Map() });
    const a = auditLayout(fig.geometry);
    if (a.ok || !a.problems.some((p) => /birchllc .* not in view.bands/.test(p))) throw new Error(`${render.name}: ${a.problems.join("; ") || "passed"}`);
  }
});

test("layout audit catches two cards placed on top of each other", () => {
  const raw = load("ellery");
  raw.views[0].place.ira = raw.views[0].place.brokerage;
  const model = normalize(raw);
  const rendered = renderStructure(model, model.views[0], { noteBadges: new Map() });
  const audit = auditLayout(rendered.geometry);
  if (audit.ok || !audit.problems.some((p) => /brokerage|ira/.test(p))) throw new Error("overlap not caught");
});

test("layout audit catches a line drawn through a card", () => {
  const raw = load("ellery");
  raw.views[0].place.elm = [4, 3];
  raw.views[0].place.birch = [4, 2.0001]; // sits between Elm LLC and its property
  raw.views[0].place.elmllc = [4, 1.5];
  const model = normalize(raw);
  try {
    const rendered = renderStructure(model, model.views[0], { noteBadges: new Map() });
    const audit = auditLayout(rendered.geometry);
    if (audit.ok) throw new Error("not caught");
  } catch (error) { if (error.message === "not caught") throw error; }
});

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
