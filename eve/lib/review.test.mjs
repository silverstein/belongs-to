import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deathRoutes } from "../../kit/derive.mjs";
import { normalize } from "../../kit/model.mjs";
import { intestacyLine } from "../../kit/transfer.mjs";
import { readFolder } from "./intake.mjs";
import { inspectReview, reviewConfirmationKey } from "./review.mjs";

const folder = readFolder(fileURLToPath(new URL("../../examples/park/documents/", import.meta.url)));
const parkedModel = JSON.parse(readFileSync(new URL("../../examples/park/household.json", import.meta.url), "utf8"));
parkedModel.views[0].id = "whose-name";
parkedModel.views[1].id = "at-a-death";
parkedModel.assets.car.value.source.at = "p. 2";

test("a beneficiary needs a source page or stays open", () => {
  assert.deepEqual(inspectReview(parkedModel, folder).errors, []);
  for (const source of [undefined, { status: "assumed" }, { status: "illustrative" }, { status: "unknown" }]) {
    const draft = structuredClone(parkedModel);
    draft.assets.roth.designation = { primary: [{ to: "mia", share: 1 }], source };
    assert.match(inspectReview(draft, folder).errors.join("\n"), /Cite the beneficiary page for roth/);
  }
});

test("every number in a page list must exist and have been read", () => {
  const draft = structuredClone(parkedModel);
  const source = draft.assets.home.value.source;
  source.at = "p. 1, 2, section 9.2";
  assert.deepEqual(inspectReview(draft, folder).errors, []);

  source.at = "p. 1, 999";
  assert.match(inspectReview(draft, folder).errors.join("\n"), /needs a page that exists/);

  source.at = "p. 1, 2";
  Object.assign(draft.documents[source.doc], { read: "partial", readNote: "p. 1 of 2" });
  assert.match(inspectReview(draft, folder).errors.join("\n"), /needs a page that exists.*and was read/);
});

test("uncited will and trust terms are refused", () => {
  const draft = structuredClone(parkedModel);
  draft.parties.jordan.will = { none: true, source: { status: "assumed" } };
  draft.parties.trust = { kind: "trust", trust: { onDeath: { first: "continues", source: { status: "illustrative" } } } };
  const errors = inspectReview(draft, folder).errors.join("\n");
  assert.match(errors, /Cite what the will says for jordan/);
  assert.match(errors, /Cite signed papers for what trust does at a death/);
});

test("a confirmation follows the facts and gap set through layout edits", () => {
  const draft = structuredClone(parkedModel);
  const { gapList } = inspectReview(draft, folder);
  const key = reviewConfirmationKey(draft, gapList);
  draft.views.reverse();
  draft.views[1].place.roth = [0, 0];
  draft.holdings.reverse();
  draft.documents = Object.fromEntries(Object.entries(draft.documents).reverse());
  assert.equal(reviewConfirmationKey(draft, [...gapList].reverse()), key);
  assert.notEqual(reviewConfirmationKey(draft, [...gapList, "A newer vehicle title"]), key);
  draft.assets.car.name = "2022 Subaru Outback Limited";
  assert.notEqual(reviewConfirmationKey(draft, gapList), key);
});

test("every reader facing edit changes the confirmation key", () => {
  const { gapList } = inspectReview(parkedModel, folder);
  const key = reviewConfirmationKey(parkedModel, gapList);
  for (const change of [
    (draft) => { draft.views[0].title += " Confirm this finding."; },
    (draft) => { draft.views[0].subtitle += " Another sentence."; },
    (draft) => { draft.views[0].kicker += " Another sentence."; },
    (draft) => { draft.views[0].notes[0].body += " Another finding."; },
    (draft) => { draft.views[1].fixes.roth += " Bring the statement."; },
    (draft) => { draft.intake.lookedFor[0].todo += " Bring the statement."; },
    (draft) => { draft.views[0].law += " Another rule."; },
    (draft) => { draft.views[0].zones[0].label += " Another claim."; },
  ]) {
    const draft = structuredClone(parkedModel);
    change(draft);
    assert.notEqual(reviewConfirmationKey(draft, gapList), key);
  }
  const layout = structuredClone(parkedModel);
  layout.views[0].zones[0].x = 20;
  layout.views[1].order.reverse();
  assert.equal(reviewConfirmationKey(layout, gapList), key);
});

test("a missing death view title returns a draft field error", () => {
  const draft = structuredClone(parkedModel);
  delete draft.views[1].title;
  assert.deepEqual(inspectReview(draft, folder).errors, ["views resolve: at-a-death needs text in title."]);
});

test("notes use documented names except in a verified quotation", () => {
  const draft = structuredClone(parkedModel);
  const note = draft.views[0].notes[0];
  note.body += " Jordan asks his attorney about a will.";
  assert.match(inspectReview(draft, folder).errors.join("\n"), /whose-name note A body uses "his"/);

  const file = draft.holdings[0].source.doc;
  const short = draft.documents[file].short;
  const pages = new Map(folder.get(file));
  const quote = "Jordan explained that this was his account.";
  pages.set(1, `${pages.get(1)}\n${quote}`);
  const withQuote = new Map(folder).set(file, pages);
  note.body = `“${quote}” (${short}, p. 1)`;
  assert.deepEqual(inspectReview(draft, withQuote).errors, []);
  assert.match(inspectReview(draft, folder).errors.join("\n"), /uses "his"/);
});

test("reader copy checks the question, zone, source note, short label and law", () => {
  const draft = structuredClone(parkedModel);
  draft.intake.lookedFor[0].what = "His signed will";
  draft.views[0].zones[0].label = "Her group";
  draft.documents[draft.holdings[0].source.doc].short = "His statement";
  draft.assets.roth.value.source.note = "His account balance";
  draft.views[0].law = "His transfer rule";
  const errors = inspectReview(draft, folder).errors.join("\n");
  for (const field of ["lookedFor.0.what", "zones.0.label", ".short", "source.note", "whose-name law"]) {
    assert.ok(errors.includes(field), errors);
  }
});

test("proper names can contain a pronoun spelling", () => {
  const draft = structuredClone(parkedModel);
  const doc = "01-intake-notes.md";
  const source = { doc, at: "p. 1" };
  const pages = new Map(folder.get(doc));
  pages.set(1, `${pages.get(1)}\nCasey Park is the sole member of She Shed LLC.`);
  draft.parties.shed = { kind: "llc", name: "She Shed LLC", source, llc: { source: { status: "unknown", note: "The operating agreement is open." } } };
  draft.holdings.push({ holder: "casey", held: "shed", share: 1, source });
  draft.views[0].notes[0].body += " Ask She Shed LLC for a copy.";
  assert.deepEqual(inspectReview(draft, new Map(folder).set(doc, pages)).errors, []);
});

test("a quotation can cite a comma in a document name and several read pages", () => {
  const draft = structuredClone(parkedModel);
  const file = draft.assets.home.value.source.doc;
  draft.documents[file].short = "Appraisal, October";
  draft.views[0].notes[0].body = '“Jordan said this was his estimate.” (Appraisal, October, p. 1 and p. 2)';
  const cited = new Map(folder.get(file));
  cited.set(2, `${cited.get(2)}\nJordan said this was his estimate.`);
  const withQuote = new Map(folder).set(file, cited);
  assert.deepEqual(inspectReview(draft, withQuote).errors, []);
  assert.match(inspectReview(draft, folder).errors.join("\n"), /uses "his"/);
});

test("money and names must occur on their cited page", () => {
  const draft = structuredClone(parkedModel);
  const { doc } = draft.assets.life.value.source;
  const pages = new Map(folder.get(doc));
  for (const amount of ["$750,000", "750,000", "$750K"]) {
    pages.set(1, folder.get(doc).get(1).replace("$750,000", amount));
    assert.deepEqual(inspectReview(draft, new Map(folder).set(doc, pages)).errors, []);
  }
  const value = draft.assets.roth.value;
  value.usd = 77000;
  assert.match(inspectReview(draft, folder).errors.join("\n"), /\$77000, which does not appear/);
  const originalSource = value.source;
  value.source = { status: "unknown" };
  assert.match(inspectReview(draft, folder).errors.join("\n"), /gives a dollar amount without a cited page/);
  value.source = originalSource;
  value.usd = 88920.55;
  draft.holdings[1].holder = "casey";
  assert.match(inspectReview(draft, folder).errors.join("\n"), /naming Casey Park as an owner or member/);
});

test("a beneficiary field saying none overrides a name elsewhere on the page", () => {
  const draft = structuredClone(parkedModel);
  const designation = draft.assets.roth.designation;
  designation.primary = [{ to: "casey", share: 1 }];
  const { doc } = designation.source;
  const pages = new Map(folder.get(doc));
  pages.set(2, `${pages.get(2)}\nCasey Park made an account inquiry.`);
  assert.match(inspectReview(draft, new Map(folder).set(doc, pages)).errors.join("\n"), /naming Casey Park as a primary beneficiary/);
});

test("state can stay open while documented transfers remain available", () => {
  const draft = structuredClone(parkedModel);
  draft.jurisdiction = { source: { status: "unknown", note: "The family has not established a current state of residence." } };
  draft.views[1].title = "The beneficiary forms name Casey, and other transfers stay open.";
  draft.views[1].subtitle = "The family has not established a state of residence.";
  draft.views[1].law = "The state of residence is open.";
  draft.views[1].bands = ["contract", "title", "unknown"];
  draft.views[1].recipients = ["casey"];
  assert.deepEqual(inspectReview(draft, folder).errors, []);
  assert.ok(inspectReview(draft, folder).gapList.includes("The family's state of residence"));
  const model = normalize(draft);
  const routes = deathRoutes(model, draft.views[1].event);
  assert.equal(intestacyLine(model), "The family’s state of residence is open");
  assert.equal(routes.find((row) => row.id === "roth").route, "unknown");
  assert.equal(routes.find((row) => row.id === "k401").route, "contract");
  assert.equal(routes.find((row) => row.id === "home").route, "title");
});
