import { createHash } from "node:crypto";
import { defineWorkflowTool, toolOutput, type WorkflowStepToolContext } from "eve/tools";
import { z } from "zod";

type Review = {
  errors?: string[];
  waitingForDocuments?: boolean;
  gapList?: string[];
  files?: Array<{ name: string; gzip: string; embedsFonts: boolean }>;
};

type Answer = "show" | "more";
type Inspected = Review & { confirmationKey?: string; priorAnswer?: Answer };

async function reviewStep(
  ctx: WorkflowStepToolContext,
  action: { modelJson: string } | { confirmationKey: string; answer?: Answer },
): Promise<Inspected> {
  "use step";
  const sandbox = await ctx.getSandbox();
  const key = createHash("sha256").update(ctx.callId).digest("hex").slice(0, 32);
  const directory = `reviews/${key}`;
  let command = `node eve/lib/run-review.mjs ${key}`;
  if ("modelJson" in action) {
    const result = await sandbox.run({ command: `mkdir -p ${directory}` });
    if (result.exitCode !== 0) return { errors: ["Could not prepare the folder for this review."] };
    await sandbox.writeTextFile({ path: `${directory}/household.json`, content: action.modelJson });
    command += " inspect";
  } else {
    if (!/^[a-f0-9]{64}$/.test(action.confirmationKey)) return { errors: ["Could not match the confirmation to this draft."] };
    command += ` render ${action.confirmationKey}`;
    if (action.answer) command += ` ${action.answer}`;
  }
  const result = await sandbox.run({ command });
  return result.exitCode === 0 ? JSON.parse(result.stdout) : { errors: ["Could not finish checking the pages."] };
}

export default defineWorkflowTool({
  description: "Check the facts and layout of a household JSON draft. Repair any reported errors. Ask the family about a checked draft and draw its pages after they confirm.",
  inputSchema: z.object({ modelJson: z.string().min(2).max(96 * 1024) }),
  async execute({ modelJson }, ctx): Promise<Review> {
    "use workflow";
    const inspected = await reviewStep(ctx, { modelJson });
    if (!inspected.confirmationKey) return { errors: inspected.errors ?? ["Could not check the draft."] };
    const { confirmationKey, priorAnswer } = inspected;
    if (priorAnswer === "more") return { waitingForDocuments: true };
    if (priorAnswer === "show") return reviewStep(ctx, { confirmationKey });

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
    if (answer.status !== "answered" || (answer.optionId !== "show" && answer.optionId !== "more")) {
      return { waitingForDocuments: true };
    }
    return reviewStep(ctx, { confirmationKey, answer: answer.optionId });
  },
  toModelOutput(output) {
    return toolOutput.json(output.files ? { files: output.files.map((file) => file.name) } : output);
  },
});
