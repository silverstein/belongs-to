import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List every uploaded document and its page numbers. Pass filenames to read their labelled pages inside the sandbox.",
  inputSchema: z.object({ filenames: z.array(z.string().max(120)).max(20) }),
  async execute({ filenames }, ctx) {
    const sandbox = await ctx.getSandbox();
    const key = Buffer.from(JSON.stringify(filenames)).toString("base64");
    const result = await sandbox.run({ command: `printf '%s' '${key}' | base64 -d | node eve/lib/intake.mjs` });
    if (result.exitCode !== 0) return { error: "The documents could not be opened." };
    return JSON.parse(result.stdout);
  },
});
