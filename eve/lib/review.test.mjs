import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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
