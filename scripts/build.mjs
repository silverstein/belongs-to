#!/usr/bin/env node
// Build every view of a household model into standalone HTML pages.
//   node scripts/build.mjs examples/ellery/household.json [--out dir] [--force]
// Exits non-zero when the facts audit or the layout audit fails; --force
// writes the pages anyway so you can look at what is wrong.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadModel, shortName } from "../kit/model.mjs";
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
  if (checkNamed("ownership adds to 100%")) receipt.push({ text: "Ownership adds to 100% for every entity and asset" });
  if (checkNamed("every fact cited or marked")) receipt.push({ text: "Every fact cites a document, or says it isn’t in one" });
  const openHere = facts.open.filter((o) => o.status !== "illustrative");
  const openLetters = [...new Set(openHere.map((o) => notes.find((n) => n.on === o.where.split(".")[0])?.letter).filter(Boolean))];
  if (openHere.length) receipt.push({ text: `${openHere.length === 1 ? "One fact" : `${openHere.length} facts`} the documents don’t show, marked rather than guessed${openLetters.length ? ` (${openLetters.length === 1 ? "note" : "notes"} ${openLetters.join(", ")})` : ""}`, open: true });
  const illustrative = facts.open.filter((o) => o.status === "illustrative");
  const notIn = model.raw.notInDocuments?.length ?? 0;
  if (notIn) receipt.push({ text: `${notIn} documents a careful review would want are listed as missing`, open: true });
  if (illustrative.length) receipt.push({ text: `The sale price is an example`, open: true });

  if (view.type === "structure") {
    rendered = renderStructure(model, view, { noteBadges });
    stacked = renderStructureStacked(model, view, { noteBadges });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend.push({ kind: "own", text: "Owns (share shown on the line)" });
    if (view.relations?.length) legend.push({ kind: "rel", text: view.relations.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join(" · ") });
    if (view.gaps?.length) legend.push({ kind: "gap", text: view.gaps[0].label });
    for (const zone of view.zones ?? []) if (!legend.find((l) => l.kind === `zone-${zone.tone}`)) legend.push({ kind: `zone-${zone.tone}`, text: zone.taxpayer ? "One taxpayer for income tax" : zone.legend ?? zone.label });
    if (view.ledger?.kind === "qsbs") {
      const assumptionNote = notes.find((n) => n.on === view.ledger.issuer || n.tone === "ask");
      const ledger = renderQsbsLedger(model, { ...view.ledger, assumptionLetter: assumptionNote?.letter }, rendered.width);
      extraSections.push(ledger.svg + ledger.checklist);
      receipt.push({ text: `Exclusions worked out per taxpayer from the cap table` });
    }
  } else if (view.type === "transfer") {
    rendered = renderTransfer(model, view, { noteBadges });
    stacked = renderTransferStacked(model, view, { noteBadges });
    const stackedAudit = auditLayout(stacked.geometry);
    console.log(`view ${view.id} (stacked): layout audit ${stackedAudit.ok ? "passed" : "FAILED"}`);
    for (const p of stackedAudit.problems) console.log(`      ${p}`);
    if (!stackedAudit.ok) failed = true;
    legend = [{ kind: "flow", text: "Arrives without a court (width is value)" }];
    if (rendered.routes.includes("trust")) legend.push({ kind: "flow-stay", text: "Already the trust’s; nothing moves" });
    if (rendered.routes.includes("probate")) legend.push({ kind: "flow-court", text: "Waits for probate court" });
    receipt.push({ text: `Everything in these documents that ${shortName(model.nodes[model.events[view.event].who])} owns or controls is shown (${rendered.rows.length})` });
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
