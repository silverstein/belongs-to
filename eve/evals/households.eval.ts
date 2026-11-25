import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineEval, type EveEvalLiveTurn } from "eve/evals";
import { equals } from "eve/evals/expect";
import { calls, openInteractions, type SessionView } from "eve/events";
import { readFolder } from "../lib/intake.mjs";
import examples from "../web/generated/examples.json";
import { evidenceUploadNames } from "./upload-names.mjs";

const cases = {
  ellery: { gap: /birch|ira/i, sale: false },
  okafor: { gap: /operating agreement|balance sheet|buyback/i, sale: true },
  park: { gap: /roth|beneficiary/i, sale: false },
};

type Files = { files?: Array<{ name: string; gzip: string; embedsFonts: boolean }>; gaps?: string[] };
type ReviewResult = Files & { errors?: string[] };

const regressions = {
  beneficiary: {
    description: "Refuse an invented Roth beneficiary and let the corrected Park draft proceed",
    request: "Try the invented Roth beneficiary first.",
  },
  layout: {
    description: "Repair two Park layouts before asking, then reuse the answer for a layout edit",
    request: "Try two Park layout errors, then adjust the checked layout.",
  },
  facts: {
    description: "Ask again when the checked facts change",
    request: "Add the documented vehicle trim after the first Park packet.",
  },
  title: {
    description: "Return a field error for an Ellery draft missing its death view title",
    request: "Try an Ellery draft with no death view title, then add it.",
  },
};

const scenarios = [
  ...Object.keys(cases).map((name) => ({ name: name as keyof typeof cases, regression: undefined })),
  { name: "park" as const, regression: "beneficiary" as const },
  { name: "park" as const, regression: "layout" as const },
  { name: "park" as const, regression: "facts" as const },
  { name: "ellery" as const, regression: "title" as const },
];

const localModule = (path: string) => pathToFileURL(resolve(process.cwd(), path)).href;

function pendingReviewQuestion(view: SessionView) {
  return openInteractions(view).find(({ answer, call, request }) =>
    answer === undefined && call?.name === "finish_review" && request.kind === "question"
      && request.options?.some(({ id }) => id === "show"));
}

async function gradeFacts(name: keyof typeof cases, raw: ReturnType<typeof JSON.parse>, uploadNames: ReadonlyMap<string, string>) {
  const { deathRoutes }: typeof import("../../kit/derive.mjs") = await import(localModule("../kit/derive.mjs"));
  const { normalize }: typeof import("../../kit/model.mjs") = await import(localModule("../kit/model.mjs"));
  const model = normalize(raw);
  const death = raw.views.find((view: { id: string }) => view.id === "at-a-death");
  const routes = deathRoutes(model, death.event);

  if (name === "ellery") {
    const birch = routes.find((route) => /birch avenue llc/i.test(route.item.name));
    const ira = Object.values(model.nodes).find((item) => /ira/i.test(item.name));
    return birch?.route === "probate"
      && birch.facts.some((source) => source?.doc === uploadNames.get("birch-oa.md") && /\bp\. 6\b/.test(source?.at))
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
      && shares.length === 5 && shares.every((row: { source?: { doc: string; at: string } }) => row.source?.doc === uploadNames.get("captable.md") && /\bp\. 1\b/.test(row.source?.at ?? ""));
  }
  const roth = Object.values(model.nodes).find((item) => /roth/i.test(item.name));
  const value = roth?.value;
  const designation = roth?.designation;
  const file = uploadNames.get("03-roth-ira-statement-q3-2026.md");
  return value?.usd === 88920.55 && value.source?.doc === file && /\bp\. 1\b/.test(value.source.at)
    && designation?.primary?.length === 0 && designation.source?.doc === file && /\bp\. 2\b/.test(designation.source.at);
}

export default scenarios.map(({ name, regression }) => defineEval({
  description: regression ? regressions[regression].description : `Review the ${name} source folder`,
  tags: regression ? [name, "fixture"] : [name],
  timeoutMs: regression ? 90_000 : 480_000,
  async test(t) {
    const sources: Record<string, string> = examples[name];
    const uploadNames = evidenceUploadNames(Object.keys(sources));
    const files = [...uploadNames].map(([sourceName, filename]) => ({
      type: "file" as const, filename, mediaType: "text/markdown", data: Buffer.from(sources[sourceName]).toString("base64"),
    }));
    const session = await t.session();
    // Eve 1.5.0 gives start a text-only type. Its driver uses the same
    // message path as send, including inline file parts.
    const start = session.start.bind(session) as
      (message: Parameters<typeof session.send>[0]) => Promise<EveEvalLiveTurn>;
    let inFlight: EveEvalLiveTurn | undefined;
    try {
      inFlight = await start([
        { type: "text", text: `Please review the uploaded documents. Draw whose name things are in, what happens at a death, and a QSBS ledger if the uploads include a sale scenario.${regression ? ` ${regressions[regression].request}` : ""}` },
        ...files,
      ]);
      const bytes = Object.values(sources).reduce((total, content) => total + Buffer.byteLength(content), 0);
      t.log(`Eve accepted ${files.length} files (${bytes} bytes before encoding) for ${session.id}.`);
      const turn = await inFlight.result();
      inFlight = undefined;
      turn.awaitingInput();
      let question = pendingReviewQuestion(turn.view);
      t.check(Boolean(question), equals(true)).label("Eve paused at the review gate");
      if (!question) {
        const questions = turn.events.filter((event) => event.type === "interaction.opened");
        t.log(`Review gate missing. Observed question tools: ${questions.map((event) => event.data.origin?.call?.name).filter(Boolean).join(", ") || "none"}.`);
        return;
      }
      t.check(cases[name].gap.test(question.request.prompt), equals(true)).label("The question names a real document gap");
      const completedReviews = calls(turn.view, { name: "finish_review" }).filter((row) => row.outcome === "completed");
      t.check(completedReviews.some((row) => Boolean((row.output as Files | undefined)?.files?.length)), equals(false))
        .label("The packet was unavailable before the answer");
      if (regression === "beneficiary") {
        t.check(completedReviews.some((row) => (row.output as ReviewResult | undefined)?.errors?.some((error) =>
          error.includes("Cite the beneficiary page for roth"))), equals(true))
          .label("The invented Roth beneficiary was refused before the corrected draft asked for an answer");
      }
      if (regression === "layout") {
        t.check(completedReviews.filter((row) => (row.output as ReviewResult | undefined)?.errors?.some((error) =>
          error.includes("layout audit FAILED"))).length, equals(2)).label("Two layout failures were returned before the first question");
      }
      if (regression === "title") {
        t.check(completedReviews.some((row) => (row.output as ReviewResult | undefined)?.errors?.some((error) =>
          error.includes("at-a-death needs text in title."))), equals(true))
          .label("The missing title received a field error before the question");
      }

      const submitted = new Set<string>();
      let answered = turn;
      while (question && !submitted.has(question.interactionId)) {
        const { interactionId } = question;
        submitted.add(interactionId);
        t.log(`Answering review question ${submitted.size} (${interactionId}).`);
        inFlight = await session.startRespond([{ interactionId, optionId: "show" }]);
        answered = await inFlight.result();
        inFlight = undefined;
        const accepted = session.events.some((event) => event.type === "interaction.settled"
          && event.data.interactionId === interactionId && event.data.outcome === "accepted"
          && event.data.response?.optionId === "show");
        t.check(accepted, equals(true)).label(`Eve accepted review answer ${submitted.size}`);
        if (!accepted) break;
        question = pendingReviewQuestion(answered.view);
      }

      if (regression === "layout") {
        t.check(session.events.filter((event) => event.type === "interaction.opened").length, equals(1))
          .label("The family saw exactly one question");
        t.check(calls(answered.view, { name: "finish_review" }).filter((row) =>
          Boolean((row.output as Files | undefined)?.files?.length)).length, equals(2))
          .label("The checked layout and its layout-only revision both rendered");
      }
      if (regression === "facts") {
        t.check(submitted.size, equals(2)).label("The changed facts required a new confirmation");
      }
      answered.succeeded();
      t.calledSkill("belongs-to");
      t.calledTool("read_documents");
      const guides = turn.toolCalls.find((call) => call.name === "read_reference")?.output as { model?: string; design?: string } | undefined;
      t.check(Boolean(guides?.model?.startsWith("# The household model") && guides.design?.startsWith("# Design rules")
        && !guides.model.includes("examples/")), equals(true)).label("The model and layout guides are available without sample paths");

      const reviews = calls(answered.view, { name: "finish_review" }).filter((call) => call.outcome === "completed");
      const packets = reviews.filter((call) => (call.output as Files | undefined)?.files?.length);
      const packet = packets.at(-1)?.output as Files | undefined;
      if (regression === "facts") {
        t.check(packets.length, equals(2)).label("Each confirmed version produced a packet");
      }
      if (process.env.BELONGS_TO_PACKET_DIR) {
        const { saveReviewPackets }: typeof import("../scripts/export-packet.mjs") =
          await import(localModule("scripts/export-packet.mjs"));
        saveReviewPackets(reviews, resolve(process.env.BELONGS_TO_PACKET_DIR, session.id));
      }
      const expected = ["at-a-death.html", "household.json", "what-to-do.html", "whose-name.html"];
      if (cases[name].sale) expected.push("qsbs.html");
      t.check(packet?.files?.map((file) => file.name).sort() ?? [], equals(expected.sort())).label("The checked packet has all expected files");

      const modelFile = packet?.files?.find((file) => file.name === "household.json");
      if (!modelFile) return;
      const raw = JSON.parse(gunzipSync(Buffer.from(modelFile.gzip, "base64")).toString("utf8"));
      const sourceFolder = readFolder(resolve(process.cwd(), "..", "examples", name, "documents"));
      const folder = new Map([...uploadNames].map(([sourceName, filename]) => [filename, sourceFolder.get(sourceName)!]));
      const { inspectReview }: typeof import("../lib/review.mjs") = await import(localModule("lib/review.mjs"));
      const check = inspectReview(raw, folder);
      t.score({ score: check.errors.length ? 0 : 1, message: check.errors.join("\n") || "Facts audit and page checks passed." })
        .label("Kit verification and real page numbers").gate(1);
      t.score((await gradeFacts(name, raw, uploadNames)) ? 1 : 0).label("Known values, ownership links and source pages").gate(1);
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
    } finally {
      const events = [...session.events, ...(inFlight?.events ?? [])];
      const count = (type: string) => events.filter((event) => event.type === type).length;
      t.log(`Observed ${count("turn.started")} turns, ${count("model.started")} model starts, and ${count("call.requested")} calls including skills.`);
      if (inFlight) {
        const lastReview = calls(inFlight.view, { name: "finish_review" }).findLast((call) => call.outcome === "completed");
        const error = (lastReview?.output as ReviewResult | undefined)?.errors?.[0];
        if (error) t.log(`Last completed review error: ${error.slice(0, 300)}`);
      }
    }
  },
}));
