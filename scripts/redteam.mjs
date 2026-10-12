#!/usr/bin/env node
// Attacks the facts audit with plausible-looking wrong models and reports what
// it catches and what it cannot. The second list matters more: it is what a
// reader must check against the documents. Run: node scripts/redteam.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../kit/model.mjs";
import { verify } from "../kit/verify.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "examples", name, "household.json"), "utf8"));

// Each attack changes one thing a careless or dishonest author might, and
// says whether the audit is expected to catch it. "No" is a design limit:
// the audit checks consistency with the model, not truth against documents.
const attacks = [
  { name: "Headline dollar figure off by one digit ($16.8M → $18.6M)", expect: true, run: (raw) => { raw.views[0].title = raw.views[0].title.replace("$16.8M", "$18.6M"); }, on: "okafor" },
  { name: "Ownership quietly totals 95%", expect: true, run: (raw) => { raw.holdings.find((h) => h.held === "home").share = 0.95; }, on: "ellery" },
  { name: "Cap table short by 100,000 shares", expect: true, run: (raw) => { raw.holdings.find((h) => h.holder === "others").shares -= 100000; }, on: "okafor" },
  { name: "A finding stated as fact: 'Dana's IRA has no beneficiary'", expect: true, run: (raw) => { const n = raw.views[0].notes.find((x) => x.on === "ira"); n.title = "Dana’s IRA has no beneficiary."; n.body = "Ask the custodian."; }, on: "ellery" },
  { name: "State and marital status dropped", expect: true, run: (raw) => { delete raw.jurisdiction; delete raw.parties.sam.marital; }, on: "ellery" },
  { name: "A taxpayer zone that contradicts tax ownership", expect: true, run: (raw) => { raw.views[0].zones.find((z) => z.id === "tp-maya").members.push("adatrust"); raw.views[0].zones = raw.views[0].zones.filter((z) => z.id !== "tp-ada"); }, on: "okafor" },
  { name: "QSBS condition silently omitted instead of marked assumed", expect: true, run: (raw) => { delete raw.parties.opco.qsbs.redemptions; }, on: "okafor" },
  { name: "A probate route with no note explaining it", expect: true, run: (raw) => { for (const v of raw.views) v.notes = v.notes.filter((n) => n.on !== "birchllc"); }, on: "ellery" },
  { name: "Trust terms at death left uncited", expect: true, run: (raw) => { delete raw.parties.trust.trust.onDeath.source; }, on: "ellery" },
  { name: "A dollar value in a note that the model never produces", expect: true, run: (raw) => { raw.views[1].notes[0].body += " Probate fees here run about $38,000."; }, on: "ellery" },
  { name: "A citation into a document the agent never read", expect: true, run: (raw) => { raw.documents["deed-home"].read = "not-provided"; }, on: "ellery" },
  { name: "'Not in the documents' claimed with no record of having looked", expect: true, run: (raw) => { delete raw.intake; }, on: "ellery" },
  // Attacks the audit cannot see. Each needs the documents and a reader.
  { name: "A document marked 'read' that the agent only skimmed", expect: false, run: (raw) => { raw.documents.trust.read = "read"; raw.documents.trust.title += " (actually skimmed)"; }, on: "ellery" },
  { name: "Citation points to the right document but the wrong page", expect: false, run: (raw) => { raw.holdings.find((h) => h.held === "home").source.at = "p. 4"; }, on: "ellery" },
  { name: "A value typed wrong from the statement ($740K → $470K)", expect: false, run: (raw) => { raw.assets.birch.value.usd = 470000; }, on: "ellery" },
  { name: "Beneficiary swapped to a different real person", expect: false, run: (raw) => { raw.assets.k401.designation.primary = [{ to: "sam", share: 1 }]; raw.holdings.find((h) => h.held === "k401").holder = "dana"; }, on: "ellery" },
  { name: "An asset left out of the model entirely", expect: false, run: (raw) => { delete raw.assets.ira; raw.holdings = raw.holdings.filter((h) => h.held !== "ira"); raw.views[0].notes = raw.views[0].notes.filter((n) => n.on !== "ira"); delete raw.views[0].place.ira; }, on: "ellery" },
  { name: "A grantor trust labelled non-grantor, citing a memo that says otherwise", expect: false, run: (raw) => { raw.parties.idgt.tax = { treatedAs: "self", label: "Taxed on its own (non-grantor)", source: { doc: "tax-memo", at: "p. 2" } }; raw.views[0].zones.find((z) => z.id === "tp-maya").members = ["maya", "holdco"]; raw.views[0].zones.push({ id: "tp-idgt", label: "Taxpayer 4", members: ["idgt"], tone: "group", taxpayer: "idgt" }); raw.views[0].ledger.for.push("idgt"); raw.views[0].title = "At $12 a share, Maya’s three trusts add $26.8M of QSBS exclusion."; }, on: "okafor" },
];

let caught = 0, uncatchable = 0, missed = 0, surprises = 0;
const rows = [];
for (const attack of attacks) {
  const raw = load(attack.on);
  attack.run(raw);
  let result;
  try { result = verify(normalize(raw)); } catch (error) { result = { ok: false, errors: [error.message] }; }
  const detected = !result.ok;
  let verdict;
  if (attack.expect && detected) { caught++; verdict = "caught"; }
  else if (attack.expect && !detected) { missed++; verdict = "MISSED"; }
  else if (!attack.expect && detected) { surprises++; verdict = "caught (unexpected)"; }
  else { uncatchable++; verdict = "not catchable"; }
  rows.push({ verdict, name: attack.name, how: detected ? result.errors[0] : "" });
}
for (const r of rows) console.log(`${r.verdict.padEnd(20)} ${r.name}${r.how ? `\n${" ".repeat(21)}${r.how}` : ""}`);
console.log(`\n${caught} of ${caught + missed} catchable attacks caught${surprises ? `, ${surprises} caught beyond expectation` : ""}; ${uncatchable} attacks the audit cannot see.`);
console.log("The audit proves the figure agrees with the model. Whether the model agrees with the documents needs a reader with the documents open.");
process.exit(missed ? 1 : 0);
