import { isCited, normalize, todosFromIntake } from "../../kit/model.mjs";
import { verify } from "../../kit/verify.mjs";
import { deathRoutes } from "../../kit/derive.mjs";

const viewTypes = new Map([["whose-name", "structure"], ["at-a-death", "transfer"], ["qsbs", "structure"]]);
const id = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function checkSources(value, folder, path, errors) {
  if (!value || typeof value !== "object") return;
  if (value.source && Object.hasOwn(value.source, "doc")) {
    const { doc, at, status } = value.source;
    const pages = folder.get(doc);
    const matches = typeof at === "string" && at.length <= 160
      ? [...at.matchAll(/\bp\.\s*(\d+)(?!\d)/gi)] : [];
    const onPaperScenario = status === "illustrative" && value.kind === "sale" && path.startsWith("Household.events.");
    if ((status && !onPaperScenario) || !pages || !matches.length || /\bpp\.|\bp\.\s*\d+\s*(?:-|\u2013|to\b|through\b)/i.test(at)
        || matches.some((match) => !pages.has(Number(match[1])))) {
      errors.push(`${path} needs a page that exists in ${String(doc)}. Spell out each page, for example "p. 1 and p. 2".`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "source") checkSources(child, folder, `${path}.${key}`, errors);
  }
}

export function inspectReview(raw, folder) {
  if (!folder.size) return { errors: ["Send a folder of text documents first."] };
  if (raw?.kind !== "belongs-to/household@1" || typeof raw.household !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)
      || !raw.documents || !raw.parties || !raw.assets || !Array.isArray(raw.holdings)
      || !raw.events || !Array.isArray(raw.views)) {
    return { errors: ["Use the household format in references/model.md."] };
  }

  const errors = [];
  for (const filename of folder.keys()) {
    if (!Object.hasOwn(raw.documents, filename) || raw.documents[filename].read === "not-provided") {
      errors.push(`Include ${filename} in the list of documents you read.`);
    }
  }
  const shorts = new Set();
  for (const [filename, doc] of Object.entries(raw.documents)) {
    if (!folder.has(filename) && doc.read !== "not-provided") errors.push(`${filename} was not uploaded.`);
    if (!doc.short || shorts.has(doc.short)) errors.push(`Use a distinct short name for ${filename}.`);
    if (typeof doc.readNote === "string" && /\d{6,}/.test(doc.readNote)) errors.push(`Check the page numbers for ${filename}.`);
    shorts.add(doc.short);
  }
  for (const name of [...Object.keys(raw.parties), ...Object.keys(raw.assets), ...Object.keys(raw.events)]) {
    if (!id.test(name) || ["__proto__", "constructor", "prototype"].includes(name)) errors.push("Use simple IDs for people, property and events.");
  }
  checkSources(raw, folder, "Household", errors);

  const viewIds = new Set();
  for (const view of raw.views) {
    if (viewTypes.get(view.id) !== view.type || viewIds.has(view.id)
        || (view.id === "qsbs") !== (view.ledger?.kind === "qsbs")) errors.push(`Check the type and ID of the ${view.id} view.`);
    viewIds.add(view.id);
  }
  if (!viewIds.has("whose-name") || !viewIds.has("at-a-death")) errors.push("Include both whose-name and at-a-death.");
  if (Object.values(raw.events).some((event) => event.kind === "sale") && !viewIds.has("qsbs")) errors.push("Include the separate QSBS view for the sale.");
  if (!raw.jurisdiction?.source?.doc || !raw.jurisdiction.state) errors.push("Cite the page that shows the family's state.");
  for (const person of Object.values(raw.parties).filter((party) => party.kind === "person" && party.marital)) {
    if (!person.marital.source?.doc) errors.push(`Cite the page that shows whether ${person.name} is married.`);
  }
  for (const [name, item] of Object.entries({ ...raw.parties, ...raw.assets })) {
    if (item.kind === "llc" && (!isCited(item.llc?.source)
        || (item.llc.source.status !== "unknown" && !item.llc.source.doc))) {
      errors.push(`Cite ${name}'s agreement on what happens at a death, or show that the papers do not say.`);
    }
    if (["retirement", "insurance"].includes(item.kind) && (!item.designation || !isCited(item.designation.source))) {
      errors.push(`Show what the paperwork says about who receives ${name}, or show that the papers do not say.`);
    }
    if (item.will?.residueTo && (!item.will.source?.doc || raw.documents[item.will.source.doc]?.signed !== "signed")) {
      errors.push(`The papers do not show a signed will for ${name}. Keep the recipient open.`);
    }
    if (item.trust?.onDeath?.source?.doc && raw.documents[item.trust.onDeath.source.doc]?.signed !== "signed") {
      errors.push(`Cite signed papers for what ${name} does at a death, or show that the papers do not say.`);
    }
    const trust = raw.parties[item.trustSchedule?.trust];
    if (trust && raw.documents[trust.source?.doc]?.signed !== "signed") {
      errors.push(`${name} cannot pass under the trust's list until the papers show it was signed. Keep the documented title and give it an unknown route.`);
    }
  }
  for (const holding of raw.holdings) {
    if (!holding.source?.doc) errors.push(`The holding for ${holding.held} needs its title or ownership page.`);
  }
  if (errors.length) return { errors };

  const model = normalize(raw);
  const facts = verify(model);
  if (!facts.ok) return { errors: facts.errors };

  const todo = [...new Set([...raw.views.flatMap((view) => Object.values(view.fixes ?? {})), ...todosFromIntake(model)])];
  const gaps = new Set();
  for (const doc of Object.values(raw.documents)) {
    if (["unsigned", "unknown"].includes(doc.signed)) gaps.add(`A signed copy of ${doc.short}`);
  }
  for (const item of Object.values(model.nodes)) {
    if (item.designation?.source?.status === "unknown") gaps.add(`Who is named to receive ${item.name}`);
    if (item.designation?.source?.doc && item.designation.primary?.length === 0 && !item.designation.contingent?.length) {
      gaps.add(`Any newer beneficiary form for ${item.name}`);
    }
  }
  for (const [eventId, event] of Object.entries(model.events)) {
    if (event.kind !== "death") continue;
    for (const route of deathRoutes(model, eventId)) {
      if (route.route === "unknown") gaps.add(`Where ${route.item.name} goes if ${model.nodes[event.who].name} dies`);
    }
  }
  for (const item of raw.intake?.lookedFor ?? []) {
    if (item.result !== "found") gaps.add(item.what);
  }
  return { errors, gapList: [...gaps], todo, checks: facts.checks.map(({ name, passed }) => ({ name, passed })) };
}
