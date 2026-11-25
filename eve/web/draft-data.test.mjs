import assert from "node:assert/strict";
import { test } from "node:test";
import { readDraft } from "./draft-data.ts";

test("the sketch uses completed draft records and retains citations across partial input", async () => {
  const model = {
    parties: { parent: { name: "Sam Ellery", kind: "person" } },
    assets: { ira: { name: "Dana’s IRA", kind: "retirement", value: { usd: 390000, source: { doc: "ira.md", at: "p. 1" } } } },
    intake: { lookedFor: [{ what: "Beneficiary form", result: "missing" }] },
  };
  const encoded = JSON.stringify({ modelJson: JSON.stringify(model) });
  const balance = encoded.indexOf("390000");
  const partial = await readDraft(encoded.slice(0, balance + 3));
  assert.deepEqual(partial.people.map(({ name }) => name), ["Sam Ellery"]);
  assert.deepEqual(partial.assets, []);
  const completed = await readDraft(encoded);
  assert.equal(completed.count, 3);
  assert.deepEqual(completed.assets[0], {
    id: "assets:ira", name: "Dana’s IRA", kind: "retirement", amount: 390000, citation: "ira.md, p. 1",
  });
  assert.equal(completed.gaps[0].name, "Beneficiary form");
  assert.equal(await readDraft("{?"), undefined);
});

test("the sketch caps visible entries while counting the real draft records", async () => {
  const people = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index, { name: `Person ${index}`, kind: "person" }]));
  const modelJson = JSON.stringify({ parties: people, intake: { lookedFor: [{ what: "Will", result: "found" }] } });
  const sketch = await readDraft(JSON.stringify({ modelJson }));
  assert.equal(sketch.count, 12);
  assert.equal(sketch.people.length, 4);
  assert.deepEqual(sketch.gaps, []);
});
