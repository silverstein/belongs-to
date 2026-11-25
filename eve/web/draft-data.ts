import { parsePartialJson } from "ai";

export type DraftRow = { id: string; name: string; kind: string; amount?: number; citation?: string };
export type DraftData = { people: DraftRow[]; assets: DraftRow[]; gaps: DraftRow[]; count: number };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";

function citation(value: unknown) {
  const { doc, at } = object(value);
  return string(doc) && string(at) ? `${string(doc)}, ${string(at)}` : undefined;
}

export async function readDraft(inputText: string): Promise<DraftData | undefined> {
  // finish_review sends the household as JSON inside a tool-input string.
  if (inputText.length > 600_000) return;
  const tool = await parsePartialJson(inputText);
  const modelJson = object(tool.value).modelJson;
  if (typeof modelJson !== "string" || modelJson.length > 96 * 1024) return;
  const parsed = await parsePartialJson(modelJson);
  if (parsed.value === undefined) return;
  const model = object(parsed.value);
  const tail = parsed.state === "repaired-parse" ? Object.keys(model).at(-1) : undefined;
  // The parser repairs the unfinished tail. Wait for the next entry before showing
  // a name, balance, or page that could still be changing inside that tail.
  const entries = (value: unknown, stillWriting: boolean) => {
    const rows = Object.entries(object(value));
    return stillWriting ? rows.slice(0, -1) : rows;
  };
  const ownership = new Map<string, string>();
  const holdings = Array.isArray(model.holdings) ? model.holdings : [];
  for (const holding of tail === "holdings" ? holdings.slice(0, -1) : holdings) {
    const { held, source } = object(holding);
    const page = citation(source);
    if (typeof held === "string" && page) ownership.set(held, page);
  }

  const people: DraftRow[] = [];
  const assets: DraftRow[] = [];
  const gaps: DraftRow[] = [];
  let count = 0;
  for (const section of ["parties", "assets"] as const) {
    for (const [id, value] of entries(model[section], tail === section)) {
      const item = object(value);
      const name = string(item.name);
      const kind = string(item.kind);
      if (!name || !kind) continue;
      count++;
      const rows = kind === "person" ? people : assets;
      if (rows.length >= (kind === "person" ? 4 : 8)) continue;
      const { usd, source } = object(item.value);
      rows.push({ id: `${section}:${id}`, name, kind,
        amount: typeof usd === "number" && Number.isFinite(usd) ? usd : undefined,
        citation: citation(source) ?? citation(item.source) ?? ownership.get(id),
      });
    }
  }
  const intake = object(model.intake);
  const lookedFor = Array.isArray(intake.lookedFor) ? intake.lookedFor : [];
  const finished = tail === "intake" && Object.keys(intake).at(-1) === "lookedFor" ? lookedFor.slice(0, -1) : lookedFor;
  for (const [index, value] of finished.entries()) {
    const { what, result } = object(value);
    if (!string(what) || !string(result) || result === "found") continue;
    count++;
    if (gaps.length < 3) gaps.push({ id: `gap:${index}`, name: string(what), kind: "gap" });
  }
  return { people, assets, gaps, count };
}
