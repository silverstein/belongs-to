import "./stage.mjs";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const scratchRoot = join(app, ".eve");
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, "hosted-startup."));
const hostedEnv = { PATH: process.env.PATH, VERCEL: "1", VERCEL_ENV: "production" };

try {
  cpSync(join(app, "agent"), join(scratch, "agent"), { recursive: true });
  cpSync(join(app, "package.json"), join(scratch, "package.json"));

  execFileSync(process.execPath, [
    join(app, "node_modules/eve/bin/eve.js"),
    "build",
    "--skip-sandbox-prewarm",
  ], { cwd: scratch, env: hostedEnv, stdio: "inherit" });

  const webFunction = join(scratch, ".vercel/output/functions/__server.func");
  const { handler } = JSON.parse(readFileSync(join(webFunction, ".vc-config.json"), "utf8"));

  execFileSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { pathToFileURL } from "node:url";

    const { default: handler } = await import(pathToFileURL(process.argv[1]));
    const response = await handler.fetch(new Request("http://localhost/eve/v1/health"));
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.status, "ready");
    console.log("Hosted GET /eve/v1/health returned 200 and ready.");
  `, join(webFunction, handler)], {
    cwd: webFunction,
    // Channel routing expects the deployment ID Vercel supplies at runtime.
    env: { ...hostedEnv, VERCEL_DEPLOYMENT_ID: "dpl_hosted_startup_check" },
    stdio: "inherit",
    timeout: 30_000,
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
