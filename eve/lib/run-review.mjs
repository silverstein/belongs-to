import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fontFaceCss } from "../../kit/fonts.mjs";
import { esc } from "../../kit/text.mjs";
import { readFolder } from "./intake.mjs";
import { inspectReview } from "./review.mjs";

function pack(name, html, checkScript = false) {
  const script = checkScript ? html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>\s*<\/html>\s*$/)?.[1] : undefined;
  const scriptPolicy = script
    ? `'sha256-${createHash("sha256").update(script).digest("base64")}'`
    : "'none'";
  const policy = `default-src 'none'; script-src ${scriptPolicy}; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'`;
  const secured = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  const css = fontFaceCss();
  return {
    name,
    gzip: gzipSync(secured.replace(css, "/* BELONGS_TO_EMBED_FONTS */")).toString("base64"),
    embedsFonts: secured.includes(css),
  };
}

try {
  const [key, action] = process.argv.slice(2);
  if (!/^[a-f0-9]{32}$/.test(key) || !["inspect", "render"].includes(action)) throw Error("Invalid review.");
  const path = join("reviews", key);
  const modelPath = join(path, "household.json");
  const model = JSON.parse(readFileSync(modelPath, "utf8"));
  const inspected = inspectReview(model, readFolder(".eve/attachments"));

  if (action === "inspect" || inspected.errors.length) {
    console.log(JSON.stringify(inspected));
  } else {
    const out = join(path, "out");
    execFileSync(process.execPath, ["scripts/build.mjs", modelPath, "--out", out, "--eve"], { encoding: "utf8", timeout: 15000 });
    const files = model.views.map(({ id }) => pack(`${id}.html`, readFileSync(join(out, `${id}.html`), "utf8"), true));
    const list = inspected.todo.length ? `<ol>${inspected.todo.map((todo) => `<li>${esc(todo)}</li>`).join("")}</ol>` : "<p>Keep the pages with your documents and check them when your paperwork changes.</p>";
    files.push(pack("what-to-do.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>What to do</title><style>body{font:18px/1.6 system-ui;max-width:40rem;margin:4rem auto;padding:0 1.5rem}li{margin-bottom:0.7rem}</style></head><body><h1>What to do</h1><p>${esc(model.household)}</p>${list}</body></html>`));
    files.push({ name: "household.json", gzip: gzipSync(JSON.stringify(model, null, 2)).toString("base64"), embedsFonts: false });
    console.log(JSON.stringify({ files, gaps: inspected.gapList, checks: inspected.checks }));
  }
} catch (error) {
  const details = error.stdout ? String(error.stdout).slice(-4000) : error.message;
  console.log(JSON.stringify({ errors: [details] }));
}
