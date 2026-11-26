import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { FAMILIES, fontFaceCss } from "../../kit/fonts.mjs";
import { foundationCss } from "../../kit/page.mjs";
import { esc } from "../../kit/text.mjs";
import { readFolder } from "./intake.mjs";
import { previewReadyScript } from "./preview.mjs";
import { inspectReview, reviewConfirmationKey } from "./review.mjs";

const confirmationPath = join("reviews", "confirmation.json");

function readConfirmation() {
  try {
    return JSON.parse(readFileSync(confirmationPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function pack(name, html, checkScript = false) {
  const script = checkScript ? html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>\s*<\/html>\s*$/)?.[1] : undefined;
  const scriptPolicy = [previewReadyScript, script].filter(Boolean)
    .map((source) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`).join(" ");
  const policy = `default-src 'none'; script-src ${scriptPolicy}; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'`;
  const secured = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace("</body>", () => `<script>${previewReadyScript}</script></body>`);
  const css = fontFaceCss();
  return {
    name,
    gzip: gzipSync(secured.replace(css, "/* BELONGS_TO_EMBED_FONTS */")).toString("base64"),
    embedsFonts: secured.includes(css),
  };
}

try {
  const [key, action, expectedKey, answer] = process.argv.slice(2);
  if (!/^[a-f0-9]{32}$/.test(key) || !["inspect", "render"].includes(action)
      || (action === "render" && !/^[a-f0-9]{64}$/.test(expectedKey))
      || (answer !== undefined && answer !== "show")) throw Error("Invalid review.");
  const path = join("reviews", key);
  const modelPath = join(path, "household.json");
  const model = JSON.parse(readFileSync(modelPath, "utf8"));
  const inspected = inspectReview(model, readFolder(".eve/attachments"));

  if (inspected.errors.length) {
    console.log(JSON.stringify({
      errors: inspected.errors,
      activity: { facts: "failed", ...inspected.activity, layout: "skipped" },
    }));
    process.exit(0);
  }
  const confirmationKey = reviewConfirmationKey(model, inspected.gapList);
  const prior = readConfirmation();
  if (action === "inspect") {
    try {
      execFileSync(process.execPath, ["scripts/build.mjs", modelPath, "--audit-only"], { encoding: "utf8", timeout: 15000 });
    } catch (error) {
      console.log(JSON.stringify({
        errors: [error.stdout ? String(error.stdout).slice(-4000) : error.message],
        activity: { ...inspected.activity, layout: "failed" },
      }));
      process.exit(0);
    }
    console.log(JSON.stringify({
      gapList: inspected.gapList,
      confirmationKey,
      priorAnswer: prior?.key === confirmationKey && prior.answer === "show" ? prior.answer : undefined,
      activity: { ...inspected.activity, layout: "passed", gaps: inspected.gapDetails },
    }));
  } else {
    if (expectedKey !== confirmationKey) throw Error("The facts changed during review. Check the draft again.");
    if (answer !== undefined) {
      const temp = join(path, "confirmation.json");
      writeFileSync(temp, JSON.stringify({ key: confirmationKey, answer }));
      renameSync(temp, confirmationPath);
    }
    const decision = answer ?? (prior?.key === confirmationKey ? prior.answer : undefined);
    if (decision !== "show") throw Error("The family must confirm this draft before the pages can be drawn.");
    const out = join(path, "out");
    execFileSync(process.execPath, ["scripts/build.mjs", modelPath, "--out", out, "--eve"], { encoding: "utf8", timeout: 15000 });
    const files = model.views.map(({ id }) => pack(`${id}.html`, readFileSync(join(out, `${id}.html`), "utf8"), true));
    const list = inspected.todo.length ? `<ol>${inspected.todo.map((todo) => `<li>${esc(todo)}</li>`).join("")}</ol>` : "<p>Keep the pages with your documents and check them when your paperwork changes.</p>";
    files.push(pack("what-to-do.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>What to do</title><style>${fontFaceCss()}${foundationCss}body{font:16px/1.6 ${FAMILIES.sans};background:var(--paper);color:var(--ink);max-width:40rem;margin:3rem auto;padding:0 1.5rem}h1{font:400 36px/1.08 ${FAMILIES.serif}}li{margin-bottom:0.7rem}</style></head><body><h1>What to do</h1><p>${esc(model.household)}</p>${list}</body></html>`));
    files.push({ name: "household.json", gzip: gzipSync(JSON.stringify(model, null, 2)).toString("base64"), embedsFonts: false });
    console.log(JSON.stringify({ files, gaps: inspected.gapList, checks: inspected.checks }));
  }
} catch (error) {
  const details = error.stdout ? String(error.stdout).slice(-4000) : error.message;
  console.log(JSON.stringify({ errors: [details] }));
}
