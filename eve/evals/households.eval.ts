import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { calls, openInteractions } from "eve/events";
import { readFolder } from "../lib/intake.mjs";
import examples from "../web/generated/examples.json";

const cases = {
  ellery: { gap: /birch|ira/i, sale: false },
  okafor: { gap: /operating agreement|balance sheet|buyback/i, sale: true },
  park: { gap: /roth|beneficiary/i, sale: false },
};

type Files = { files?: Array<{ name: string; gzip: string; embedsFonts: boolean }>; gaps?: string[] };
type ReviewResult = Files & { errors?: string[] };

const scenarios = [
  ...Object.keys(cases).map((name) => ({ name: name as keyof typeof cases, regression: false })),
  { name: "park" as const, regression: true },
];

const localModule = (path: string) => pathToFileURL(resolve(process.cwd(), path)).href;

async function gradeFacts(name: keyof typeof cases, raw: ReturnType<typeof JSON.parse>) {
  const { deathRoutes }: typeof import("../../kit/derive.mjs") = await import(localModule("../kit/derive.mjs"));
  const { normalize }: typeof import("../../kit/model.mjs") = await import(localModule("../kit/model.mjs"));
  const model = normalize(raw);
  const death = raw.views.find((view: { id: string }) => view.id === "at-a-death");
  const routes = deathRoutes(model, death.event);

  if (name === "ellery") {
    const birch = routes.find((route) => /birch avenue llc/i.test(route.item.name));
    const ira = Object.values(model.nodes).find((item) => /ira/i.test(item.name));
    return birch?.route === "probate"
      && birch.facts.some((source) => source?.doc === "birch-oa.md" && /\bp\. 6\b/.test(source.at))
      && ira?.designation?.source?.status === "unknown";
  }
  if (name === "okafor") {
    const holding = routes.find((route) => /okafor holdings/i.test(route.item.name));
    const issuer = Object.values(model.nodes).find((item) => /tallgrass/i.test(item.name));
    const shares = model.holdings.filter((row: { held: string }) => row.held === issuer?.id);
    const stakes = new Map<string, number>();
    for (const row of shares) {
      const owner = raw.parties[row.holders[0]]?.name;
      if (owner) stakes.set(owner, row.shares);
    }
    return holding?.route === "unknown"
      && issuer?.corp?.shares === 20_000_000
      && stakes.get("Okafor Holdings LLC") === 3_600_000
      && stakes.get("Okafor 2023 Irrevocable Trust") === 1_000_000
      && stakes.get("Ada Okafor 2023 Trust") === 700_000
      && stakes.get("Theo Okafor 2023 Trust") === 700_000
      && shares.length === 5 && shares.every((row: { source?: { doc: string; at: string } }) => row.source?.doc === "captable.md" && /\bp\. 1\b/.test(row.source.at));
  }
  const roth = Object.values(model.nodes).find((item) => /roth/i.test(item.name));
  const value = roth?.value;
  const designation = roth?.designation;
  const file = "03-roth-ira-statement-q3-2026.md";
  return value?.usd === 88920.55 && value.source?.doc === file && /\bp\. 1\b/.test(value.source.at)
    && designation?.primary?.length === 0 && designation.source?.doc === file && /\bp\. 2\b/.test(designation.source.at);
}

export default scenarios.map(({ name, regression }) => defineEval({
  description: regression ? "Refuse an invented Roth beneficiary and let the corrected Park draft proceed" : `Review the ${name} source folder`,
  tags: regression ? [name, "fixture"] : [name],
  timeoutMs: 240000,
  async test(t) {
    const files = Object.entries(examples[name]).map(([filename, content]) => ({
      type: "file" as const, filename, mediaType: "text/markdown", data: Buffer.from(content).toString("base64"),
    }));
    const session = await t.session();
    const turn = await session.send([
      { type: "text", text: `Please review the fictional ${name} household folder. Draw whose name things are in, what happens at a death, and a QSBS ledger if the folder includes a sale scenario.${regression ? " Try the invented Roth beneficiary first." : ""}` },
      ...files,
    ]);
    turn.awaitingInput();
    const interaction = openInteractions(turn.view).find(({ request }) =>
      request.kind === "question" && request.options?.some((option) => option.id === "show"));
    t.check(Boolean(interaction), equals(true)).label("Eve paused at the review gate");
    if (!interaction) return;
    t.check(cases[name].gap.test(interaction.request.prompt), equals(true)).label("The question names a real document gap");
    const completedReviews = calls(turn.view, { name: "finish_review" }).filter((row) => row.outcome === "completed");
    t.check(completedReviews.some((row) => Boolean((row.output as Files | undefined)?.files?.length)), equals(false))
      .label("The packet was unavailable before the answer");
    if (regression) {
      t.check(completedReviews.some((row) => (row.output as ReviewResult | undefined)?.errors?.some((error) =>
        error.includes("Cite the beneficiary page for roth"))), equals(true))
        .label("The invented Roth beneficiary was refused before the corrected draft asked for an answer");
    }

    const answered = await session.respond([{ interactionId: interaction.interactionId, optionId: "show" }]);
    answered.succeeded();
    t.calledSkill("belongs-to");
    t.calledTool("read_documents");

    const packet = answered.toolCalls.filter((call) => call.name === "finish_review" && call.status === "completed")
      .map((call) => call.output as Files | undefined).find((output) => output?.files?.length);
    const expected = ["at-a-death.html", "household.json", "what-to-do.html", "whose-name.html"];
    if (cases[name].sale) expected.push("qsbs.html");
    t.check(packet?.files?.map((file) => file.name).sort() ?? [], equals(expected.sort())).label("The checked packet has all expected files");

    const modelFile = packet?.files?.find((file) => file.name === "household.json");
    if (!modelFile) return;
    const raw = JSON.parse(gunzipSync(Buffer.from(modelFile.gzip, "base64")).toString("utf8"));
    const folder = readFolder(resolve(process.cwd(), "..", "examples", name, "documents"));
    const { inspectReview }: typeof import("../lib/review.mjs") = await import(localModule("lib/review.mjs"));
    const check = inspectReview(raw, folder);
    t.score({ score: check.errors.length ? 0 : 1, message: check.errors.join("\n") || "Facts audit and page checks passed." })
      .label("Kit verification and real page numbers").gate(1);
    t.score((await gradeFacts(name, raw)) ? 1 : 0).label("Known values, ownership links and source pages").gate(1);
    const badCitation = structuredClone(raw);
    const firstPage = badCitation.holdings[0].source.at.match(/\d+/)[0];
    badCitation.holdings[0].source.at = `p. ${firstPage}, 999`;
    t.check(inspectReview(badCitation, folder).errors.some((error) => error.includes("needs a page that exists")), equals(true))
      .label("A nonexistent source page is refused");
    for (const file of packet?.files ?? []) {
      if (!file.name.endsWith(".html")) continue;
      const html = gunzipSync(Buffer.from(file.gzip, "base64")).toString("utf8");
      t.check(html.includes("<!doctype html>") && html.includes("Content-Security-Policy"), equals(true)).label(file.name);
    }
  },
}));
