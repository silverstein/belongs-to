import { parsePartialJson } from "ai";

export type Citation = { path: string; doc: string; at: string; label: string; quote?: string };
export type DraftRow = {
  id: string; name: string; short: string; kind: string; detail: string;
  facts: Citation[]; missing: string[]; amount?: number; valued: boolean; cover: boolean;
};
export type Gap = { text: string; detail?: string };
export type Holding = { held: string; holders: string[]; citation?: Citation };
export type DraftData = {
  nodes: DraftRow[]; holdings: Holding[]; gaps: Gap[];
  documents: Record<string, { title: string; short: string; date: string }>;
  citations: Map<string, number>; facts: number; count: number; jurisdiction: string; jurisdictionFact?: Citation;
  views: { id: string; title: string; fig: number }[]; text: string;
  section?: string;
};

export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
const array = (value: unknown) => Array.isArray(value) ? value : [];
const number = new Intl.NumberFormat("en-US");
const kinds: Record<string, string> = {
  person: "Person", trust: "Trust", llc: "Company", corp: "Company", group: "Group",
  retirement: "Retirement account", insurance: "Life insurance", brokerage: "Brokerage account",
  home: "Home", rental: "Rental property", bank: "Bank account",
};
const labels: Record<string, string> = {
  value: "Value", designation: "Beneficiary", marital: "Marriage", will: "Will",
  onDeath: "At a death", llc: "Agreement", trustSchedule: "Trust schedule", tax: "Tax",
};

function cite(value: unknown, path: string, label: string): Citation | undefined {
  const { doc, at } = object(value);
  return string(doc) && string(at) ? { path, doc: string(doc), at: string(at), label } : undefined;
}

export async function readDraft(inputText: string, unwrapped = false): Promise<DraftData | undefined> {
  if (inputText.length > 600_000) return;
  const modelJson = unwrapped ? inputText : object((await parsePartialJson(inputText)).value).modelJson;
  if (typeof modelJson !== "string" || modelJson.length > 96 * 1024) return;
  const parsed = await parsePartialJson(modelJson);
  if (parsed.value === undefined) return;
  const model = object(parsed.value);
  const tail = parsed.state === "repaired-parse" ? Object.keys(model).at(-1) : undefined;
  // A repaired tail may contain part of a name, value, or page. Publish earlier complete records.
  const entries = (section: string) => {
    const rows = Object.entries(object(model[section]));
    return tail === section ? rows.slice(0, -1) : rows;
  };
  const settled = (section: string, value: unknown) => {
    const rows = array(value);
    return tail === section ? rows.slice(0, -1) : rows;
  };
  const citations = new Map<string, number>();
  let facts = 0;
  function collect(value: unknown, path: string, label: string, target: Citation[], depth = 0) {
    if (!value || typeof value !== "object" || depth > 20) return;
    const raw = object(value);
    const note = cite(raw.source, path, label);
    if (note) {
      target.push(note);
      facts++;
      citations.set(note.doc, (citations.get(note.doc) ?? 0) + 1);
    }
    for (const [field, next] of Object.entries(value)) {
      if (field !== "source") collect(next, path + "." + field, labels[field] ?? label, target, depth + 1);
    }
  }
  const documents = Object.fromEntries(entries("documents").map(([id, value]) => {
    const row = object(value);
    return [id, { title: string(row.title), short: string(row.short), date: string(row.date) }];
  }));
  const nodes = ["parties", "assets"].flatMap((section) => entries(section).flatMap(([id, value]) => {
    const item = object(value);
    const name = string(item.name);
    const kind = string(item.kind);
    if (!name || !kind) return [];
    const citationsForRow: Citation[] = [];
    collect(item, `Household.${section}.${id}`, "Named", citationsForRow);
    const { usd, basis, source } = object(item.value);
    for (const fact of citationsForRow) {
      if (fact.path === `Household.${section}.${id}`) fact.quote = name;
      if (fact.label === "Value" && typeof usd === "number") fact.quote = number.format(usd);
    }
    const missing = [["will", "Will"], ["designation", "Beneficiary form"], ["llc", "Agreement"], ["value", "Value"]]
      .filter(([key]) => object(object(item[key]).source).status === "unknown").map(([, label]) => label);
    return [{
      id, name, short: string(item.short) || (kind === "person" ? name.split(" ")[0] : kind === "trust" ? "Trust" : name),
      kind, detail: [kind === "trust" && object(item.trust).revocable ? "Revocable trust" : kinds[kind] ?? kind, string(item.detail), string(basis)]
        .filter(Boolean).filter((part, index, fields) => fields.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(", "),
      facts: citationsForRow, missing,
      amount: typeof usd === "number" && Number.isFinite(usd) ? usd : undefined,
      valued: section === "assets" && Boolean(cite(source, "", "")) && !object(source).status,
      cover: kind === "insurance",
    }];
  }));
  const holdings = settled("holdings", model.holdings).flatMap((raw, index) => {
    const row = object(raw);
    const held = string(row.held);
    const holders = (Array.isArray(row.holders) ? row.holders : [row.holder]).map(string).filter(Boolean);
    if (!held || !holders.length) return [];
    const holdingFacts: Citation[] = [];
    collect(row, `Household.holdings.${index}`, "Title", holdingFacts);
    const node = nodes.find((node) => node.id === held);
    if (node) node.facts.push(...holdingFacts);
    return [{ held, holders, citation: holdingFacts[0] }];
  });
  const intake = object(model.intake);
  const gapRows = tail === "intake" && Object.keys(intake).at(-1) === "lookedFor"
    ? array(intake.lookedFor).slice(0, -1) : array(intake.lookedFor);
  const gaps = gapRows.flatMap((raw) => {
    const { what, result, todo } = object(raw);
    return string(what) && string(result) && result !== "found" ? [{ text: string(what), detail: string(todo) || undefined }] : [];
  });
  const jurisdictionFacts: Citation[] = [];
  const jurisdiction = tail === "jurisdiction" ? {} : object(model.jurisdiction);
  collect(jurisdiction, "Household.jurisdiction", "State", jurisdictionFacts);
  const views = settled("views", model.views).map(object).filter((view) => string(view.title)).map((view, index) => ({
    id: string(view.id), title: string(view.title), fig: typeof view.fig === "number" ? view.fig : index + 1,
  }));
  for (const section of ["events", "documents"]) {
    for (const [id, row] of entries(section)) collect(row, `Household.${section}.${id}`, section, []);
  }
  const state = string(jurisdiction.state);
  const community = jurisdiction.communityProperty;
  return {
    nodes, holdings, gaps, documents, citations, facts, count: nodes.length + holdings.length + gaps.length,
    jurisdiction: [state, typeof community === "boolean" ? (community ? "community property state" : "not a community property state") : ""].filter(Boolean).join(", "),
    jurisdictionFact: jurisdictionFacts[0], views, text: modelJson, section: tail,
  };
}

export function arrangeDraft(draft: DraftData) {
  const nodes = new Map(draft.nodes.map((node) => [node.id, node]));
  const owners = new Map<string, string[]>();
  for (const { held, holders, citation } of draft.holdings) {
    if (!citation || !nodes.has(held) || !holders.every((id) => nodes.has(id))) continue;
    owners.set(held, [...new Set([...(owners.get(held) ?? []), ...holders])]);
  }
  const joint = "@joint";
  const children = new Map<string, DraftRow[]>();
  const roots: DraftRow[] = [];
  const pool: DraftRow[] = [];
  const valueGroups = new Map<string, number>();
  let values = 0;
  let total = 0;
  let cover = 0;
  function root(id: string): string | null | undefined {
    const visited = new Set<string>();
    for (;;) {
      if (visited.has(id)) return null;
      visited.add(id);
      const chain = owners.get(id);
      if (!chain) return ["trust", "person", "group"].includes(nodes.get(id)?.kind ?? "") ? id : undefined;
      if (chain.length > 1) return chain.includes(id) ? null : joint;
      id = chain[0];
    }
  }
  for (const node of draft.nodes) {
    const group = root(node.id);
    const link = owners.get(node.id);
    if (link && group !== null) {
      const parent = link.length === 1 ? link[0] : joint;
      children.set(parent, [...(children.get(parent) ?? []), node]);
    } else if (!link && group === node.id) roots.push(node);
    else pool.push(node);
    if (!node.valued || node.amount === undefined) continue;
    if (node.cover) { cover += node.amount; continue; }
    values++;
    total += node.amount;
    const placement = group ?? "@unplaced";
    valueGroups.set(placement, (valueGroups.get(placement) ?? 0) + node.amount);
  }
  const trusts = roots.filter((row) => row.kind === "trust");
  return { roots, pool, children, total, cover, values, groups: [...valueGroups].map(([id, value]) => ({
    id, value, label: id === joint ? "Jointly" : id === "@unplaced" ? "Not placed"
      : trusts.length === 1 && trusts[0].id === id ? "Trust" : nodes.get(id)?.short ?? id,
  })) };
}

export function citationFailure(fact: Citation, errors: string[]) {
  const matched = errors.find((error) => error.startsWith(fact.path) && /^ (?:needs|gives)|^\.[^. ]+ gives /.test(error.slice(fact.path.length)) &&
    (/does not appear on|needs a cited page naming/.test(error) && error.includes(`${fact.doc}, ${fact.at}`) ||
     error.startsWith(fact.path + " needs a page that exists in " + fact.doc + " ")));
  return matched && (/does not appear on|needs a cited page naming/.test(matched) ? `Not on ${fact.at}` : "Page could not be verified");
}
