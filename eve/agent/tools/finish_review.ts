import { createHash } from "node:crypto";
import { defineWorkflowTool, toolOutput, type WorkflowStepToolContext } from "eve/tools";
import { z } from "zod";

type Review = {
  errors?: string[];
  waitingForDocuments?: boolean;
  gapList?: string[];
  files?: Array<{ name: string; gzip: string; embedsFonts: boolean }>;
};

async function reviewStep(ctx: WorkflowStepToolContext, action: "inspect" | "render", modelJson?: string): Promise<Review> {
  "use step";
  const sandbox = await ctx.getSandbox();
  const key = createHash("sha256").update(ctx.callId).digest("hex").slice(0, 32);
  const directory = `reviews/${key}`;
  if (modelJson !== undefined) {
    const result = await sandbox.run({ command: `mkdir -p ${directory}` });
    if (result.exitCode !== 0) return { errors: ["Could not prepare the folder for this review."] };
    await sandbox.writeTextFile({ path: `${directory}/household.json`, content: modelJson });
  }
  const result = await sandbox.run({ command: `node eve/lib/run-review.mjs ${key} ${action}` });
  return result.exitCode === 0 ? JSON.parse(result.stdout) : { errors: ["Could not finish checking the pages."] };
}

export default defineWorkflowTool({
  description: "Check a household JSON model against the uploaded pages, ask about gaps, and draw the downloadable pages only after the family responds.",
  inputSchema: z.object({ modelJson: z.string().min(2).max(96 * 1024) }),
  async execute({ modelJson }, ctx): Promise<Review> {
    "use workflow";
    const inspected = await reviewStep(ctx, "inspect", modelJson);
    if (inspected.errors?.length) return inspected;

    const gaps = inspected.gapList ?? [];
    const pending = gaps.slice(0, 8).map((gap) => `• ${gap}`).join("\n");
    const more = gaps.length > 8 ? `\nThe pages will list the other ${gaps.length - 8} items too.` : "";
    const answer = await ctx.ask({
      display: "select",
      prompt: gaps.length
        ? `Do you have papers that would settle any of these?\n\n${pending}${more}\n\nYou can see the pages with these gaps left open.`
        : "Is there a newer document that changes who owns something or who gets it?",
      options: [
        { id: "show", label: "Show the pages", style: "primary" },
        { id: "more", label: "I have another document" },
      ],
    });
    if (answer.status !== "answered") return { waitingForDocuments: true };
    if (answer.optionId !== "show") return { waitingForDocuments: true };
    return reviewStep(ctx, "render");
  },
  toModelOutput(output) {
    return toolOutput.json(output.files ? { files: output.files.map((file) => file.name) } : output);
  },
});
