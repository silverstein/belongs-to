import { normalize, todosFromIntake } from "../../kit/model.mjs";
import { pagesCovered, verify } from "../../kit/verify.mjs";
import { deathRoutes, QSBS_CONDITIONS } from "../../kit/derive.mjs";

const viewTypes = new Map([["whose-name", "structure"], ["at-a-death", "transfer"], ["qsbs", "structure"]]);
const id = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const documentOrUnknown = (source) => Boolean(source?.doc || source?.status === "unknown");

function citationPages(at) {
  if (typeof at !== "string" || at.length > 160) return [];
  const locator = at.trim().match(/^\b(p\.\s*\d+(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:p\.\s*)?\d+)*)(?:\s*,\s*(?:art(?:icle)?\.?|sec(?:tion)?\.?|§)\s*[\w.()]+)?$/i);
  return locator ? [...locator[1].matchAll(/\d+/g)].map((match) => Number(match[0])) : [];
}

function checkSources(value, folder, documents, location, errors) {
  if (!value || typeof value !== "object") return;
  if (value.source) {
    const { doc, at, status } = value.source;
    const [collection, , group, condition] = location;
    const saleScenario = status === "illustrative" && collection === "events" && location.length === 2 && value.kind === "sale";
    const eligibilityAssumption = status === "assumed" && collection === "parties" && location.length === 4
      && group === "qsbs" && QSBS_CONDITIONS.some(({ key }) => key === condition);
    const label = ["Household", ...location].join(".");
    if (Object.hasOwn(value.source, "doc")) {
      const pages = folder.get(doc);
      const cited = citationPages(at);
      const document = documents[doc];
      const covered = document?.read === "partial" ? pagesCovered(document.readNote) : null;
      if ((status && !saleScenario) || !pages || !cited.length
          || ["unreadable", "not-provided"].includes(document?.read)
          || cited.some((page) => !pages.has(page) || (covered && !covered.has(page)))) {
        errors.push(`${label} needs a page that exists in ${String(doc)} and was read. List each page, for example "p. 1 and p. 2".`);
      }
    } else if (status !== "unknown" && !eligibilityAssumption) {
      errors.push(`${label} needs a document page or must stay open. A sample sale needs the page with its terms.`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "source") checkSources(child, folder, documents, [...location, key], errors);
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
  if (errors.length) return { errors };
  checkSources(raw, folder, raw.documents, [], errors);

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
    if (item.kind === "llc" && (!documentOrUnknown(item.llc?.source)
        || (item.llc.source.status === "unknown" && item.llc.successor))) {
      errors.push(`Cite ${name}'s agreement on what happens at a death, or show that the papers do not say.`);
    }
    const designation = item.designation;
    if ((designation || ["retirement", "insurance"].includes(item.kind)) && (!documentOrUnknown(designation?.source)
        || (designation.source.status === "unknown" && (designation.primary?.length || designation.contingent?.length)))) {
      errors.push(`Cite the beneficiary page for ${name}, or leave the beneficiary open.`);
    }
    if (item.will && (!documentOrUnknown(item.will.source) || (item.will.source.status === "unknown" && item.will.none))) {
      errors.push(`Cite what the will says for ${name}, or leave the will terms open.`);
    }
    if (item.will?.residueTo && (!item.will.source?.doc || raw.documents[item.will.source.doc]?.signed !== "signed")) {
      errors.push(`The papers do not show a signed will for ${name}. Keep the recipient open.`);
    }
    const onDeath = item.trust?.onDeath;
    if (onDeath && (!documentOrUnknown(onDeath.source)
        || (onDeath.source.doc && raw.documents[onDeath.source.doc]?.signed !== "signed")
        || (onDeath.source.status === "unknown" && (onDeath.first || onDeath.trusteeAfter)))) {
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
