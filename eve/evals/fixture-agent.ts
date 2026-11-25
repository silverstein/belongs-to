import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
// This module is copied next to the answer data only in the separate fixture target.
// @ts-expect-error The fixture target creates this file.
import fixtures from "./fixture-models.json";

export default defineAgent({
  defaultTools: false,
  model: mockModel(({ messages, lastUserMessage, toolResults }) => {
    const tool = (name: string, input: object) => ({ toolCalls: [{ name, input }] });
    const read = toolResults.find((row) => row.name === "read_documents");
    if (!read) return tool("read_documents", {});
    const documents = (read.output as { documents?: Record<string, unknown> })?.documents;
    if (!documents || !Object.keys(documents).length) return "Please send the documents.";
    if (!toolResults.some((row) => row.name === "eve__skill")) return tool("eve__skill", { name: "belongs-to" });
    if (!toolResults.some((row) => row.name === "read_reference")) return tool("read_reference", { topics: ["model", "design"] });

    const filenames = Object.keys(documents);
    const variant = filenames.every((name) => /^document-\d+\.md$/.test(name)) ? "numbered" : "named";
    const family = Object.keys(fixtures).find((name) => {
      const expected = Object.keys(fixtures[name][variant].documents);
      return expected.length === filenames.length && expected.every((name) => Object.hasOwn(documents, name));
    });
    if (!family) return "Please send one of the fictional folders.";
    const model = fixtures[family][variant];
    const input = lastUserMessage ?? messages.map((message) => message.text).join("\n");
    const inventedBeneficiary = input.includes("Try the invented Roth beneficiary first.");
    const layoutRepairs = input.includes("Try two Park layout errors, then adjust the checked layout.");
    const changedFacts = input.includes("Add the documented vehicle trim after the first Park packet.");
    const missingTitle = input.includes("Try an Ellery draft with no death view title, then add it.");
    if (input.includes("Ask the Ellery intake questions before drafting.")) {
      const answers = toolResults.filter((row) => row.name === "ask_question")
        .map((row) => (row.output as { answer?: string })?.answer);
      if (!answers.length) return tool("ask_question", {
        question: "Before I draw this, which state do you live in? Sam's will says Ohio, so I'll use Ohio unless you tell me otherwise.",
        options: [
          { label: "Different state", description: "Tell me which one." },
          { label: "Ohio (Recommended)", description: "Matches Sam's will, page 1." },
        ],
      });
      if (answers[0] !== "Ohio (Recommended)") return "Please tell me which state.";
      if (answers.length === 1) return tool("ask_question", {
        question: "Should I use the uploaded documents for this review?",
        options: [
          { label: "Use the uploaded documents", description: "Review the folder I sent." },
          { label: "Wait for more documents", description: "Stop the review for now." },
        ],
      });
      if (answers[1] !== "Use the uploaded documents") return "Send the rest of the folder when you have it.";
    }
    const reviews = toolResults.filter((row) => row.name === "finish_review");
    const result = reviews.at(-1);
    if (result) {
      const output = result.output as { waitingForDocuments?: boolean; errors?: string[] };
      if (output?.errors) {
        if (layoutRepairs && reviews.length === 1) {
          const draft = structuredClone(model);
          draft.views[1].bands = draft.views[1].bands.filter((band: string) => band !== "probate");
          return tool("finish_review", { modelJson: JSON.stringify(draft) });
        }
        if (((inventedBeneficiary || missingTitle) && reviews.length === 1) || (layoutRepairs && reviews.length === 2)) {
          return tool("finish_review", { modelJson: JSON.stringify(model) });
        }
        return `The example could not be checked. ${output.errors.join(" ")}`;
      }
      if (!output?.waitingForDocuments && layoutRepairs && reviews.length === 3) {
        const draft = structuredClone(model);
        for (const place of Object.values(draft.views[0].place) as number[][]) place[0] += 1;
        return tool("finish_review", { modelJson: JSON.stringify(draft) });
      }
      if (!output?.waitingForDocuments && changedFacts && reviews.length === 1) {
        const draft = structuredClone(model);
        draft.assets.car.name = "2022 Subaru Outback Limited";
        return tool("finish_review", { modelJson: JSON.stringify(draft) });
      }
      return output?.waitingForDocuments ? "Start again with the complete folder." : "The pages are ready. Start with the gap in the paperwork.";
    }
    if (inventedBeneficiary) {
      const draft = structuredClone(model);
      draft.assets.roth.designation = { primary: [{ to: "mia", share: 1 }], source: { status: "assumed" } };
      return tool("finish_review", { modelJson: JSON.stringify(draft) });
    }
    if (layoutRepairs) {
      const draft = structuredClone(model);
      const place = draft.views[0].place;
      place.k401 = place.roth;
      return tool("finish_review", { modelJson: JSON.stringify(draft) });
    }
    if (missingTitle) {
      const draft = structuredClone(model);
      delete draft.views.find((view: { id: string }) => view.id === "at-a-death").title;
      return tool("finish_review", { modelJson: JSON.stringify(draft) });
    }
    return tool("finish_review", { modelJson: JSON.stringify(model) });
  }),
});
