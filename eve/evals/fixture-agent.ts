import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
// This module is copied next to the answer data only in the separate fixture target.
// @ts-expect-error The fixture target creates this file.
import fixtures from "./fixture-models.json";

export default defineAgent({
  defaultTools: false,
  model: mockModel(({ messages, lastUserMessage, toolResults }) => {
    const tool = (name: string, input: object) => ({ toolCalls: [{ name, input }] });
    if (!toolResults.some((row) => row.name === "eve__skill")) return tool("eve__skill", { name: "belongs-to" });
    const reads = toolResults.filter((row) => row.name === "read_documents");
    if (!reads.length) return tool("read_documents", { filenames: [] });
    const listing = reads[0].output;
    if (!Array.isArray(listing) || !listing.length) return "Please send the example documents.";
    const filenames = listing.map(({ name }) => name);
    if (reads.length === 1) return tool("read_documents", { filenames });
    const result = toolResults.find((row) => row.name === "finish_review");
    if (result) {
      const output = result.output as { waitingForDocuments?: boolean; errors?: string[] };
      if (output?.errors) return `The example could not be checked. ${output.errors.join(" ")}`;
      return output?.waitingForDocuments ? "Start again with the complete folder." : "The pages are ready. Start with the gap in the paperwork.";
    }
    const input = lastUserMessage ?? messages.map((message) => message.text).join("\n");
    const family = Object.keys(fixtures).find((name) => new RegExp(name, "i").test(input))
      ?? (filenames.includes("birch-oa.md") ? "ellery" : filenames.includes("captable.md") ? "okafor" : "park");
    return tool("finish_review", { modelJson: JSON.stringify(fixtures[family]) });
  }),
});
