// Loads a belongs-to household model and gives the rest of the kit one
// normalized view of it: nodes (parties and assets), holdings as fractions,
// look-through values, and tax-owner resolution.
import { readFileSync } from "node:fs";

export const SOURCE_STATUSES = ["unknown", "assumed", "illustrative"];

export function loadModel(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return normalize(raw);
}

export function normalize(raw) {
  const nodes = {};
  for (const [id, party] of Object.entries(raw.parties ?? {})) nodes[id] = { ...party, id, isAsset: false };
  for (const [id, asset] of Object.entries(raw.assets ?? {})) {
    if (nodes[id]) throw new Error(`Id "${id}" is used for both a party and an asset`);
    nodes[id] = { ...asset, id, isAsset: true };
  }
  // A virtual recipient for what passes with no will: state intestacy law decides.
  nodes.intestacy = { id: "intestacy", kind: "law", name: "Whoever state law names", short: "state law", virtual: true };
  const holdings = (raw.holdings ?? []).map((holding, index) => {
    const holders = holding.holders ?? (holding.holder ? [holding.holder] : []);
    const held = nodes[holding.held];
    let fraction = null;
    if (holding.shares != null && held?.corp?.shares) fraction = holding.shares / held.corp.shares;
    else if (holding.share != null) fraction = holding.share;
    else if (holding.form === "joint-survivorship") fraction = 1;
    return { ...holding, index, holders, fraction, joint: holding.form === "joint-survivorship" };
  });
  return { raw, nodes, holdings, documents: raw.documents ?? {}, events: raw.events ?? {}, views: raw.views ?? [] };
}

export const holdingsOf = (model, heldId) => model.holdings.filter((h) => h.held === heldId);
export const holdingsBy = (model, holderId) => model.holdings.filter((h) => h.holders.includes(holderId));

// Who a node answers to for income tax. Persons and groups are their own
// taxpayer; an entity says so with tax.treatedAs ("self" or another party id).
export function taxpayerOf(model, id, seen = new Set()) {
  if (seen.has(id)) throw new Error(`Tax owner loop through ${[...seen, id].join(" → ")}`);
  seen.add(id);
  const node = model.nodes[id];
  if (!node) throw new Error(`Unknown party "${id}"`);
  const treatedAs = node.tax?.treatedAs;
  if (!treatedAs || treatedAs === "self") return id;
  return taxpayerOf(model, treatedAs, seen);
}

// Look-through value in dollars, or null when any part is unknown. An entity
// is worth the sum of what it holds times its share of each.
export function valueOf(model, id, seen = new Set()) {
  if (seen.has(id)) return null;
  seen.add(id);
  const node = model.nodes[id];
  if (!node) return null;
  if (node.isAsset) return node.value?.usd ?? null;
  const held = holdingsBy(model, id);
  if (!held.length) return null;
  let total = 0;
  for (const holding of held) {
    const value = valueOf(model, holding.held, new Set(seen));
    if (value == null || holding.fraction == null) return null;
    total += value * (holding.joint ? 1 / holding.holders.length : holding.fraction);
  }
  return total;
}

export function sourceOf(fact) {
  return fact?.source ?? null;
}

export function isCited(source) {
  return Boolean(source && (source.doc || SOURCE_STATUSES.includes(source.status)));
}

// "Deed, p. 1" when a place is cited, else "Deed 2019". Years live in the sources list.
export function citeLabel(model, source) {
  if (!source) return "";
  if (source.status === "unknown") return "Not in documents";
  if (source.status === "assumed") return "Assumed";
  if (source.status === "illustrative") return "Illustrative";
  const doc = model.documents[source.doc];
  if (!doc) return "";
  const name = (doc.short ?? doc.title).replace(/ /g, "\u00A0");
  if (source.at) return `${name}, ${source.at.replace(/ /g, "\u00A0")}`;
  return doc.date ? `${name} ${doc.date.slice(0, 4)}` : name;
}

export const shortName = (node) => node.short ?? node.name;

// What a careful review wanted and the documents didn't give: derived from
// the intake record, never typed by hand.
export function missingFromIntake(model) {
  const items = (model.raw.intake?.lookedFor ?? []).filter((i) => i.result !== "found");
  const unreadable = Object.entries(model.documents).filter(([, d]) => d.read === "unreadable" || d.read === "not-provided").map(([id, d]) => `${d.title}${d.read === "unreadable" ? " (could not be read)" : " (not provided)"}`);
  return [...items.map((i) => `${i.what}${i.result === "unreadable" ? " (could not be read)" : ""}${i.note ? `: ${i.note}` : ""}`), ...unreadable];
}

// The intake splits two ways on the page. Things the family doesn't have
// (a will, powers of attorney) are news and go in the to-do list, written
// as `todo`. Things the reviewer wanted and couldn't find (a plan's default
// rules, a custodial agreement) are the reviewer's business and stay in
// the footer. An entry with `todo` is the first kind.
export function todosFromIntake(model) {
  return (model.raw.intake?.lookedFor ?? []).filter((i) => i.result !== "found" && i.todo).map((i) => i.todo);
}
export function footerMissing(model) {
  const items = (model.raw.intake?.lookedFor ?? []).filter((i) => i.result !== "found" && !i.todo);
  const unreadable = Object.entries(model.documents).filter(([, d]) => d.read === "unreadable" || d.read === "not-provided").map(([id, d]) => `${d.title}${d.read === "unreadable" ? " (could not be read)" : " (not provided)"}`);
  return [...items.map((i) => `${i.what}${i.result === "unreadable" ? " (could not be read)" : ""}${i.note ? `: ${i.note}` : ""}`), ...unreadable];
}
