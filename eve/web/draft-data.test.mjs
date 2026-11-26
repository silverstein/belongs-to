import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeDraft, citationFailure, readDraft } from "./draft-data.ts";

const owner = { name: "Dana Ellery", kind: "person" };
const company = { name: "Birch Avenue LLC", kind: "llc" };
const page = { doc: "ira.md", at: "p. 1" };
const asset = { name: "Dana’s IRA", kind: "retirement", value: { usd: 390000, source: page } };
const encode = (model) => JSON.stringify({ modelJson: JSON.stringify(model) });

test("publishes complete input records, with citation counts and gaps from the model", async () => {
  const model = {
    parties: { owner },
    assets: { ira: asset },
    intake: { lookedFor: [{ what: "Beneficiary form", result: "missing", todo: "Ask for the current form." }] },
  };
  const encoded = encode(model);
  const balance = encoded.indexOf("390000");
  const partial = await readDraft(encoded.slice(0, balance + 3));
  assert.deepEqual(partial.nodes.map(({ name }) => name), [owner.name]);
  const complete = await readDraft(encoded);
  assert.equal(complete.count, 3);
  assert.equal(complete.citations.get("ira.md"), 1);
  assert.deepEqual(complete.nodes[1].facts[0], {
    path: "Household.assets.ira.value", label: "Value", quote: "390,000", ...page,
  });
  assert.deepEqual(complete.gaps, [{ text: "Beneficiary form", detail: "Ask for the current form." }]);
  assert.equal(await readDraft("{?"), undefined);
});

test("places cited amounts once through a company, with unplaced balances outside the ownership tree", async () => {
  const draft = await readDraft(encode({
    parties: { owner, company },
    assets: { ira: asset, cash: { ...asset, value: { usd: 10, source: page } }, cover: { ...asset, kind: "insurance" } },
    holdings: [{ holder: "owner", held: "company", source: page }, { holder: "company", held: "ira", source: page }],
  }));
  const { total, cover, groups, children, pool } = arrangeDraft(draft);
  assert.equal(total, 390010);
  assert.equal(cover, 390000);
  assert.deepEqual(groups.map(({ label, value }) => [label, value]), [["Dana", 390000], ["Not placed", 10]]);
  assert.equal(children.get("company")[0].name, asset.name);
  assert.ok(pool.some(({ id }) => id === "cash"));
});

test("pins a check failure only to the exact citation that the error identifies", () => {
  const fact = { path: "Household.assets.ira.value", label: "Value", ...page };
  const message = "Household.assets.ira.value.usd gives $390000, which does not appear on ira.md, p. 1.";
  assert.equal(citationFailure(fact, [message]), "Not on p. 1");
  assert.equal(citationFailure({ ...fact, path: "Household.assets.ira" }, [message]), undefined);
  assert.equal(citationFailure({ ...fact, at: "p. 2" }, [message]), undefined);
});

test("keeps a holding under its cited company while the top owner's name is still unwritten", async () => {
  const draft = await readDraft(encode({
    parties: { company }, assets: { ira: asset },
    holdings: [{ holder: "company", held: "ira", source: page }],
  }));
  const { pool, children, groups } = arrangeDraft(draft);
  assert.deepEqual(pool.map(({ id }) => id), ["company"]);
  assert.equal(children.get("company")[0].id, "ira");
  assert.equal(groups[0].label, "Not placed");
});
