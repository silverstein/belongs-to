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
    const regression = input.includes("Try the invented Roth beneficiary first.");
    const reviews = toolResults.filter((row) => row.name === "finish_review");
    const result = reviews.at(-1);
    if (result) {
      const output = result.output as { waitingForDocuments?: boolean; errors?: string[] };
      if (output?.errors) {
        if (regression && reviews.length === 1) return tool("finish_review", { modelJson: JSON.stringify(model) });
        return `The example could not be checked. ${output.errors.join(" ")}`;
      }
      return output?.waitingForDocuments ? "Start again with the complete folder." : "The pages are ready. Start with the gap in the paperwork.";
    }
    if (regression) {
      const draft = structuredClone(model);
      draft.assets.roth.designation = { primary: [{ to: "mia", share: 1 }], source: { status: "assumed" } };
      return tool("finish_review", { modelJson: JSON.stringify(draft) });
    }
    return tool("finish_review", { modelJson: JSON.stringify(model) });
  }),
});
