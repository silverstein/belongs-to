import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontFaceCss } from "../../kit/fonts.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const root = join(app, "..");
const workspace = join(app, "agent/sandbox/workspace");
const skill = join(app, "agent/skills/belongs-to");
const generated = join(app, "web/generated");
const publicFiles = join(app, "public");

mkdirSync(join(workspace, "scripts"), { recursive: true });
mkdirSync(join(workspace, "eve/lib"), { recursive: true });
mkdirSync(skill, { recursive: true });
mkdirSync(generated, { recursive: true });
mkdirSync(publicFiles, { recursive: true });
cpSync(join(root, "kit"), join(workspace, "kit"), { recursive: true });
const skillSource = readFileSync(join(root, "SKILL.md"), "utf8");
writeFileSync(join(skill, "SKILL.md"), skillSource.replace(/<!-- standalone:start -->[\s\S]*?<!-- standalone:end -->\n*/g, ""));
cpSync(join(root, "references"), join(skill, "references"), { recursive: true });
cpSync(join(root, "scripts/build.mjs"), join(workspace, "scripts/build.mjs"));
for (const filename of ["intake.mjs", "preview.mjs", "review.mjs", "run-review.mjs"]) {
  cpSync(join(app, "lib", filename), join(workspace, "eve/lib", filename));
}

const examples = {};
for (const name of ["ellery", "okafor", "park"]) {
  const folder = join(root, "examples", name, "documents");
  examples[name] = Object.fromEntries(readdirSync(folder).filter((filename) => filename.endsWith(".md")).sort()
    .map((filename) => [filename, readFileSync(join(folder, filename), "utf8")]));
}

writeFileSync(join(generated, "examples.json"), JSON.stringify(examples));
writeFileSync(join(publicFiles, "belongs-to-fonts.css"), fontFaceCss());
