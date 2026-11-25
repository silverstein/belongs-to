import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Read the named review guides. Model explains the JSON format, design explains the layout, and law explains the rules the kit covers.",
  inputSchema: z.object({ topics: z.array(z.enum(["model", "design", "law"])).min(1).max(3) }),
  async execute({ topics }, ctx) {
    const sandbox = await ctx.getSandbox();
    const guides: Record<string, string> = {};
    for (const topic of new Set(topics)) {
      const result = await sandbox.run({ command: `cat "$HOME/.agents/skills/belongs-to/references/${topic}.md"` });
      if (result.exitCode !== 0) return { error: `Could not open the ${topic} guide.` };
      guides[topic] = result.stdout;
    }
    return guides;
  },
});
