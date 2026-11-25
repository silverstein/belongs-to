#!/usr/bin/env node
// Build every view of a household model into standalone HTML pages.
//   node scripts/build.mjs examples/ellery/household.json [--out dir] [--force]
// Exits non-zero when the facts audit or the layout audit fails; --force
// writes the pages anyway so you can look at what is wrong.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadModel, shortName, footerMissing, noteTargets } from "../kit/model.mjs";
import { verify } from "../kit/verify.mjs";
import { renderStructure } from "../kit/structure.mjs";
import { renderTransfer } from "../kit/transfer.mjs";
import { renderTransferStacked } from "../kit/transfer-stacked.mjs";
import { renderStructureStacked } from "../kit/structure-stacked.mjs";
import { renderQsbsLedger } from "../kit/ledger.mjs";
import { auditLayout } from "../kit/audit.mjs";
import { deathRoutes } from "../kit/derive.mjs";
import { pageHtml } from "../kit/page.mjs";
import { documentsLookedAt, readReceipt } from "../kit/receipt.mjs";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
if (!input) { console.error("usage: node scripts/build.mjs <household.json> [--out dir] [--force]"); process.exit(2); }
const outDir = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : join(dirname(input), "out"));
const force = args.includes("--force");
const geometryOnly = args.includes("--audit-only");
const model = loadModel(input);

const facts = verify(model);
console.log(`facts audit: ${facts.ok ? "passed" : "FAILED"}`);
for (const c of facts.checks) console.log(`  ${c.passed ? "ok " : "!! "} ${c.name}${c.passed ? "" : `\n      ${c.problems.join("\n      ")}`}`);
if (facts.open.length) console.log(`  open facts shown on the page: ${facts.open.length}\n      ${facts.open.map((o) => `${o.status}: ${o.where}`).join("\n      ")}`);

const pages = [];
const citedDocs = documentsLookedAt(model);
let failed = !facts.ok;

function buildView(view) {
  const notes = (view.notes ?? []).map((note, i) => ({ ...note, letter: String.fromCharCode(65 + i) }));
  const noteBadges = new Map();
  for (const note of notes) for (const id of noteTargets(note)) {
    if (!noteBadges.has(id)) noteBadges.set(id, []);
    noteBadges.get(id).push({ letter: note.letter, tone: note.tone });
  }
  const extraSections = [];
  let rendered, stacked = null, legend = [];
  const receipt = [];
  const checkNamed = (name) => facts.checks.find((c) => c.name === name)?.passed;
  // The check behind this line covers dollar figures (5d) and cited facts; a
  // date or a count in a note is not checked, so the line doesn't claim it.
  if (checkNamed("every fact cited or marked")) receipt.push({ text: "Every dollar figure here points to one of your documents. Where we couldn’t find something, we said so." });
  const openHere = facts.open.filter((o) => o.status !== "illustrative");
  const openLetters = [...new Set(openHere.map((o) => noteBadges.get(o.where.split(".")[0])?.[0]?.letter).filter(Boolean))].sort();
  if (openHere.length) receipt.push({ text: `${openHere.length === 1 ? "One thing" : `${openHere.length} things`} the documents don’t answer. We said so instead of guessing${openLetters.length ? ` (${openLetters.length === 1 ? "note" : "notes"} ${openLetters.join(", ")})` : ""}`, open: true });
  const illustrative = facts.open.filter((o) => o.status === "illustrative");
  const notIn = footerMissing(model).length;
  if (checkNamed("intake recorded")) receipt.push(readReceipt(model, citedDocs));
  if (model.raw.jurisdiction?.source?.status === "unknown") {
    receipt.push({ text: "The family’s state of residence is open. Any transfer that depends on state law stays open.", open: true });
  }
  if (notIn) receipt.push({ text: `${notIn} ${notIn === 1 ? "thing" : "things"} we looked for and couldn’t find, listed here`, open: true });
  if (illustrative.length) receipt.push({ text: `The sale price is an example, not a real offer`, open: true });

  if (view.type === "transfer") {
    // Items drawn as the trust's by its schedule rest on the trust papers being
    // signed. When the copy in hand isn't, the page says so under the title.
    const listed = deathRoutes(model, view.event).filter((r) => r.route === "declared");
    const trustDoc = listed.length ? model.documents[model.nodes[listed[0].to[0].to].source?.doc] : null;
    if (trustDoc && trustDoc.signed !== "signed" && !view.kicker) view.kicker = `The copy we have of the trust papers is ${trustDoc.signed === "unsigned" ? "unsigned" : "not shown as signed"}. If the signed set exists, the trust’s list most likely already covers what’s drawn under “On the trust’s list”; if it doesn’t, nothing is in the trust yet.`;
  }
  if (view.type === "structure") {
    // The same caption on a structure view whose cards sit on an unsigned trust's list.
    const listed = Object.values(model.nodes).filter((n) => n.trustSchedule && view.place?.[n.id]);
    const trustDoc = listed.length ? model.documents[model.nodes[listed[0].trustSchedule.trust]?.source?.doc] : null;
    if (trustDoc && trustDoc.signed !== "signed" && !view.kicker) view.kicker = `The copy we have of the trust papers is ${trustDoc.signed === "unsigned" ? "unsigned" : "not shown as signed"}. If the signed set exists, the trust’s list most likely already covers what it names; if it doesn’t, nothing is in the trust yet.`;
  }
  if (view.type === "structure") {
    rendered = renderStructure(model, view, { noteBadges, geometryOnly });
    stacked = renderStructureStacked(model, view, { noteBadges, geometryOnly });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend.push({ kind: "own", text: "Owns. The share is on the line." });
    if (view.relations?.length) legend.push({ kind: "rel", text: view.relations.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join(" · ") });
    if (view.gaps?.length) legend.push({ kind: "gap", text: view.gaps[0].label });
    for (const zone of view.zones ?? []) if (!legend.find((l) => l.kind === `zone-${zone.tone}`)) legend.push({ kind: `zone-${zone.tone}`, text: zone.taxpayer ? "One taxpayer for income tax" : zone.legend ?? zone.label });
    if (!geometryOnly && view.ledger?.kind === "qsbs") {
      const assumptionNote = notes.find((n) => noteTargets(n).includes(view.ledger.issuer) || n.tone === "ask");
      const ledger = renderQsbsLedger(model, { ...view.ledger, assumptionLetter: assumptionNote?.letter }, rendered.width);
      extraSections.push(ledger.svg + ledger.checklist);
      receipt.push({ text: `Each taxpayer’s exclusion is worked out from the cap table, not estimated` });
    }
  } else if (view.type === "transfer") {
    rendered = renderTransfer(model, view, { noteBadges, geometryOnly });
    stacked = renderTransferStacked(model, view, { noteBadges, geometryOnly });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend = [{ kind: "flow", text: "Goes straight to the person. Thicker means more money." }];
    if (rendered.routes.includes("trust")) legend.push({ kind: "flow-stay", text: "Already in the trust. Nothing moves." });
    if (rendered.routes.includes("probate")) legend.push({ kind: "flow-court", text: "Stuck in court first" });
    const count = rendered.rows.length;
    const name = shortName(model.nodes[model.events[view.event].who]);
    const text = count === 0 ? `Nothing in ${name}’s name is affected by this death.`
      : count === 1 ? `The only thing in ${name}’s name is on the page.`
      : `All ${count} things in ${name}’s name are on the page.`;
    receipt.push({ text });
  } else throw new Error(`Unknown view type ${view.type}`);

  const layout = auditLayout(rendered.geometry);
  console.log(`view ${view.id}: layout audit ${layout.ok ? "passed" : "FAILED"}, ${layout.crossings} line crossings`);
  for (const p of layout.problems) console.log(`      ${p}`);
  // The layout audit gates the build; it is a maker's check, not a reader's, so it stays out of the page.
  if (!layout.ok) failed = true;
  if (geometryOnly) return;

  const html = pageHtml({ model, view, figureSvg: rendered.svg, figureWidth: rendered.width, stackedSvg: stacked?.svg ?? null, extraSections, notes, legend, receipt, sourcesUsed: citedDocs,
    eve: args.includes("--eve") });
  const file = join(outDir, `${view.id}.html`);
  pages.push({ file, html });
}

for (const view of model.views) {
  try {
    buildView(view);
  } catch (error) {
    console.log(`view ${view.id}: layout audit FAILED`);
    console.log(`      ${error.message}`);
    failed = true;
  }
}

if (geometryOnly || (failed && !force)) process.exit(failed ? 1 : 0);
mkdirSync(outDir, { recursive: true });
for (const { file, html } of pages) {
  writeFileSync(file, html);
  console.log(`  wrote ${file} (${(html.length / 1024).toFixed(0)} KB)`);
}
process.exit(failed ? 1 : 0);
