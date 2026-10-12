// Font faces for belongs-to figures. The fonts ship with the kit (SIL OFL 1.1)
// and are embedded as data URIs, so a figure opens offline and renders the
// same everywhere. Text is measured against these exact files (metrics.json).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "fonts");

export const FAMILIES = {
  serif: "'BT Newsreader', Georgia, 'Times New Roman', serif",
  sans: "'BT Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'BT Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

const FACES = [
  { family: "BT Newsreader", file: "Newsreader.woff2", weight: "300 800", opsz: true },
  { family: "BT Plex Sans", file: "IBMPlexSans.woff2", weight: "100 700" },
  { family: "BT Plex Mono", file: "IBMPlexMono-400.woff2", weight: "400" },
  { family: "BT Plex Mono", file: "IBMPlexMono-500.woff2", weight: "500" },
];

export function fontFaceCss() {
  return FACES.map(({ family, file, weight }) => {
    const data = readFileSync(join(here, file)).toString("base64");
    return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-style:normal;font-display:block;}`;
  }).join("\n");
}
