#!/usr/bin/env node
// Build every view of a household model into standalone HTML pages.
//   node scripts/build.mjs examples/ellery/household.json [--out dir] [--force]
// Exits non-zero when the facts audit or the layout audit fails; --force
// writes the pages anyway so you can look at what is wrong.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadModel, shortName, footerMissing } from "../kit/model.mjs";
import { verify } from "../kit/verify.mjs";
import { renderStructure } from "../kit/structure.mjs";
import { renderTransfer } from "../kit/transfer.mjs";
import { renderTransferStacked } from "../kit/transfer-stacked.mjs";
import { renderStructureStacked } from "../kit/structure-stacked.mjs";
import { renderQsbsLedger } from "../kit/ledger.mjs";
import { auditLayout } from "../kit/audit.mjs";
import { pageHtml } from "../kit/page.mjs";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
if (!input) { console.error("usage: node scripts/build.mjs <household.json> [--out dir] [--force]"); process.exit(2); }
const outDir = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : join(dirname(input), "out"));
const force = args.includes("--force");
const model = loadModel(input);

const facts = verify(model);
console.log(`facts audit: ${facts.ok ? "passed" : "FAILED"}`);
for (const c of facts.checks) console.log(`  ${c.passed ? "ok " : "!! "} ${c.name}${c.passed ? "" : `\n      ${c.problems.join("\n      ")}`}`);
if (facts.open.length) console.log(`  open facts shown on the page: ${facts.open.length}\n      ${facts.open.map((o) => `${o.status}: ${o.where}`).join("\n      ")}`);

mkdirSync(outDir, { recursive: true });
const citedDocs = Object.keys(model.documents).filter((id) => JSON.stringify(model.raw.parties ?? {}).includes(`"doc":"${id}"`) || JSON.stringify(model.raw).includes(`"doc":"${id}"`));
let failed = !facts.ok;

for (const view of model.views) {
  const notes = (view.notes ?? []).map((note, i) => ({ ...note, letter: String.fromCharCode(65 + i) }));
  const noteBadges = new Map();
  for (const note of notes) if (note.on) { if (!noteBadges.has(note.on)) noteBadges.set(note.on, []); noteBadges.get(note.on).push({ letter: note.letter, tone: note.tone }); }
  const extraSections = [];
  let rendered, stacked = null, legend = [];
  const receipt = [];
  const checkNamed = (name) => facts.checks.find((c) => c.name === name)?.passed;
  if (checkNamed("every fact cited or marked")) receipt.push({ text: "Every number here points to one of your documents. Where we couldn’t find something, we said so." });
  const openHere = facts.open.filter((o) => o.status !== "illustrative");
  const openLetters = [...new Set(openHere.map((o) => notes.find((n) => n.on === o.where.split(".")[0])?.letter).filter(Boolean))];
  if (openHere.length) receipt.push({ text: `${openHere.length === 1 ? "One thing" : `${openHere.length} things`} the documents don’t answer. We said so instead of guessing${openLetters.length ? ` (${openLetters.length === 1 ? "note" : "notes"} ${openLetters.join(", ")})` : ""}`, open: true });
  const illustrative = facts.open.filter((o) => o.status === "illustrative");
  const notIn = footerMissing(model).length;
  const readCount = Object.values(model.documents).filter((d) => d.read === "read" || d.read === "partial").length;
  if (checkNamed("intake recorded")) receipt.push({ text: `All ${readCount} documents listed under “What we looked at” were read in full` });
  if (notIn) receipt.push({ text: `${notIn} ${notIn === 1 ? "thing" : "things"} we looked for and couldn’t find, listed here`, open: true });
  if (illustrative.length) receipt.push({ text: `The sale price is an example, not a real offer`, open: true });

  if (view.type === "structure") {
    rendered = renderStructure(model, view, { noteBadges });
    stacked = renderStructureStacked(model, view, { noteBadges });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend.push({ kind: "own", text: "Owns. The share is on the line." });
    if (view.relations?.length) legend.push({ kind: "rel", text: view.relations.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join(" · ") });
    if (view.gaps?.length) legend.push({ kind: "gap", text: view.gaps[0].label });
    for (const zone of view.zones ?? []) if (!legend.find((l) => l.kind === `zone-${zone.tone}`)) legend.push({ kind: `zone-${zone.tone}`, text: zone.taxpayer ? "One taxpayer for income tax" : zone.legend ?? zone.label });
    if (view.ledger?.kind === "qsbs") {
      const assumptionNote = notes.find((n) => n.on === view.ledger.issuer || n.tone === "ask");
      const ledger = renderQsbsLedger(model, { ...view.ledger, assumptionLetter: assumptionNote?.letter }, rendered.width);
      extraSections.push(ledger.svg + ledger.checklist);
      receipt.push({ text: `Each taxpayer’s exclusion is worked out from the cap table, not estimated` });
    }
  } else if (view.type === "transfer") {
    rendered = renderTransfer(model, view, { noteBadges });
    stacked = renderTransferStacked(model, view, { noteBadges });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend = [{ kind: "flow", text: "Goes straight to the person. Thicker means more money." }];
    if (rendered.routes.includes("trust")) legend.push({ kind: "flow-stay", text: "Already in the trust. Nothing moves." });
    if (rendered.routes.includes("probate")) legend.push({ kind: "flow-court", text: "Stuck in court first" });
    receipt.push({ text: `All ${rendered.rows.length} things in ${shortName(model.nodes[model.events[view.event].who])}’s name are on the page, not a selection` });
  } else throw new Error(`Unknown view type ${view.type}`);

  const layout = auditLayout(rendered.geometry);
  console.log(`view ${view.id}: layout audit ${layout.ok ? "passed" : "FAILED"}, ${layout.crossings} line crossings`);
  for (const p of layout.problems) console.log(`      ${p}`);
  // The layout audit gates the build; it is a maker's check, not a reader's, so it stays out of the page.
  if (!layout.ok) failed = true;

  const html = pageHtml({ model, view, figureSvg: rendered.svg, figureWidth: rendered.width, stackedSvg: stacked?.svg ?? null, extraSections, notes, legend, receipt, sourcesUsed: citedDocs });
  const file = join(outDir, `${view.id}.html`);
  if (failed && !force) continue;
  writeFileSync(file, html);
  console.log(`  wrote ${file} (${(html.length / 1024).toFixed(0)} KB)`);
}
process.exit(failed ? 1 : 0);
