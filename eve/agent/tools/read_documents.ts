import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Read the uploads in /workspace/.eve/attachments/. Use empty arguments for all text by filename and numbered page. For large uploads, read the filenames returned in the inventory in smaller groups. Cite the numbered page keys, including for attachments.",
  inputSchema: z.object({ filenames: z.array(z.string().max(120)).max(20).optional() }),
  async *execute({ filenames }, ctx) {
    const sandbox = await ctx.getSandbox();
    const key = Buffer.from(JSON.stringify(filenames ?? null)).toString("base64");
    const result = await sandbox.run({ command: `printf '%s' '${key}' | base64 -d | node eve/lib/intake.mjs` });
    if (result.exitCode !== 0) {
      yield { error: "The documents could not be opened." };
      return;
    }
    const output = JSON.parse(result.stdout);
    for (const [name, pages] of Object.entries(output.documents ?? {})) {
      yield { documentRead: { name, pages: Object.keys(pages as object).length } };
    }
    yield output;
  },
});
