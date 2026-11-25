import { defineAgent } from "eve";

export default defineAgent({
  model: process.env.BELONGS_TO_MODEL || "anthropic/claude-sonnet-5.5",
  defaultTools: false,
  limits: { sessionTimeoutMs: 60 * 60 * 1000 },
});
