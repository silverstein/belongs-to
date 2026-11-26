import { createHash } from "node:crypto";
import { defineWorkflowTool, toolOutput, type WorkflowStepToolContext } from "eve/tools";
import { z } from "zod";

type Review = {
  errors?: string[];
  waitingForDocuments?: boolean;
  gapList?: string[];
  files?: Array<{ name: string; gzip: string; embedsFonts: boolean }>;
};

type Answer = "show";
type CheckResult = "passed" | "failed" | "skipped";
type AuditActivity = {
  audit?: Record<"citations" | "dollars" | "names", { checked: number; failed: number }>;
  evidence?: Array<{ text: string; doc: string; at: string }>;
  gaps?: Array<{ text: string; detail?: string }>;
  facts: CheckResult;
  layout: CheckResult;
};
type Inspected = Review & { confirmationKey?: string; priorAnswer?: Answer; activity?: AuditActivity };
type ReviewProgress = { reviewActivity: { stage: "checking" | "rendering" } | { stage: "checked"; result: AuditActivity } };

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
  async *execute({ modelJson }, ctx): AsyncGenerator<ReviewProgress, Review> {
    "use workflow";
    yield { reviewActivity: { stage: "checking" } };
    const inspected = await reviewStep(ctx, { modelJson });
    if (inspected.activity) {
      const evidence = inspected.activity.evidence ?? [];
      for (let count = 6; count < evidence.length; count += 6) {
        yield { reviewActivity: { stage: "checked", result: { ...inspected.activity, evidence: evidence.slice(0, count) } } };
      }
      yield { reviewActivity: { stage: "checked", result: inspected.activity } };
    }
    if (!inspected.confirmationKey) return { errors: inspected.errors ?? ["Could not check the draft."] };
    const { confirmationKey, priorAnswer } = inspected;
    if (priorAnswer === "show") {
      yield { reviewActivity: { stage: "rendering" } };
      return reviewStep(ctx, { confirmationKey });
    }

    const gaps = inspected.gapList ?? [];
    const shown = gaps.length <= 10 ? gaps : gaps.slice(0, 8);
    const pending = shown.map((gap) => `• ${gap}`).join("\n");
    const more = shown.length < gaps.length ? `\n\nThe pages will list ${gaps.length - shown.length} more gaps.` : "";
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
    if (answer.status !== "answered" || answer.optionId !== "show") {
      return { waitingForDocuments: true };
    }
    yield { reviewActivity: { stage: "rendering" } };
    return reviewStep(ctx, { confirmationKey, answer: answer.optionId });
  },
  toModelOutput(output) {
    return toolOutput.json("files" in output && output.files ? { files: output.files.map((file) => file.name) } : output);
  },
});
