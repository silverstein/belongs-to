import "./stage.mjs";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceUploadNames } from "../evals/upload-names.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const target = join(app, ".eve-fixture");
mkdirSync(target, { recursive: true });
cpSync(join(app, "agent"), join(target, "agent"), { recursive: true });
cpSync(join(app, "evals/fixture-agent.ts"), join(target, "agent/agent.ts"));
writeFileSync(join(target, "package.json"), JSON.stringify({ name: "belongs-to-eve", private: true, type: "module", dependencies: { eve: "1.5.0", zod: "^4.3.0" } }));

const specialPages = {
  ellery: { "trust:Art. 6": 6, "will-sam:Art. 3": 3, "elm-oa:§ 9.2": 5, "birch-oa:§ 9.2": 5, "birch-oa:Sched. A": 6 },
  okafor: { "holdco-oa:Sched. A": 6, "ada-trust:Art. 4": 4, "theo-trust:Art. 4": 4, "ada-trust:Art. 9": 9, "theo-trust:Art. 9": 9 },
  park: { "08-vehicle-title-and-value.md:attachment": 2 },
};

function prepareFixture(name, anonymize) {
  const model = JSON.parse(readFileSync(join(app, "..", "examples", name, "household.json"), "utf8"));
  const originalFilename = (doc) => name === "park" ? doc : `${doc}.md`;
  const aliases = evidenceUploadNames(readdirSync(join(app, "..", "examples", name, "documents")).filter((filename) => filename.endsWith(".md")));
  const filename = (doc) => {
    const original = originalFilename(doc);
    return anonymize ? aliases.get(original) ?? original : original;
  };
  const documents = Object.entries(model.documents);
  for (const [doc, data] of documents) {
    if (["trust", "will-sam", "idgt", "ada-trust", "theo-trust"].includes(doc)) data.signed = "signed";
  }
  if (name === "okafor") {
    model.parties.ada = { kind: "person", name: "Ada Okafor", source: { doc: "ada-trust", at: "p. 4" } };
    model.parties.theo = { kind: "person", name: "Theo Okafor", source: { doc: "theo-trust", at: "p. 4" } };
    model.documents["ada-trust"].short = "Ada trust";
    model.documents["theo-trust"].short = "Theo trust";
    model.parties.holdco.llc = { source: { status: "unknown", note: "The documents do not include the agreement's terms for a member's death." } };
    model.intake.lookedFor.unshift({
      what: "The Okafor Holdings LLC operating agreement section about a member's death",
      result: "missing",
      todo: "Get the missing section of the LLC agreement and ask an attorney who would receive Maya's interest.",
    });
    model.events["maya-dies"] = { kind: "death", who: "maya", survivors: [] };
    const structure = structuredClone(model.views[0]);
    structure.id = "whose-name";
    delete structure.ledger;
    model.views.unshift(structure, {
      id: "at-a-death", type: "transfer", fig: 2, event: "maya-dies", recipients: [], bands: ["unknown"],
      title: "The LLC papers do not say where Maya's interest goes", order: ["holdco"],
      notes: [{ on: "holdco", tone: "flag", title: "The LLC papers leave a gap", body: "The documents include the ownership page. Ask for the section about what happens when a member dies." }],
    });
  }
  const renameSources = (value, path = "") => {
    if (!value || typeof value !== "object") return;
    if (value.source?.doc) {
      const source = value.source;
      const page = specialPages[name][`${source.doc}:${source.at}`]
        ?? ({ "assets.elm.value": 2, "assets.birch.value": 3 }[path]);
      source.at = page ? `p. ${page}` : /\bp\.\s*\d+/.test(source.at ?? "") ? source.at : "p. 1";
      source.doc = filename(source.doc);
    }
    for (const [key, child] of Object.entries(value)) if (key !== "source") renameSources(child, path ? `${path}.${key}` : key);
  };
  renameSources(model);
  model.documents = Object.fromEntries(documents.map(([doc, data]) => [filename(doc), data]));
  for (const item of model.intake.lookedFor) if (item.doc) item.doc = filename(item.doc);
  for (const view of model.views) {
    if (view.type === "transfer") view.id = "at-a-death";
    else if (!view.ledger) view.id = "whose-name";
  }
  return model;
}

const fixtures = Object.fromEntries(["ellery", "okafor", "park"].map((name) => [name, {
  named: prepareFixture(name, false),
  numbered: prepareFixture(name, true),
}]));
writeFileSync(join(target, "agent", "fixture-models.json"), JSON.stringify(fixtures));
