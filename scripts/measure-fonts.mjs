// Measures glyph advance widths of the kit fonts in headless Chrome and writes
// kit/metrics.json. Run once after changing fonts: node scripts/measure-fonts.mjs
import { writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fontFaceCss } from "../kit/fonts.mjs";
import { launch } from "./chrome.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chars = [];
for (let code = 32; code < 127; code++) chars.push(String.fromCharCode(code));
chars.push(..."’‘“”–—·§×é…→←↓↑•≈½¼¾%");

const styles = [
  { key: "sans-400", font: "400 SIZEpx 'BT Plex Sans'" },
  { key: "sans-500", font: "500 SIZEpx 'BT Plex Sans'" },
  { key: "sans-600", font: "600 SIZEpx 'BT Plex Sans'" },
  { key: "mono-400", font: "400 SIZEpx 'BT Plex Mono'" },
  { key: "mono-500", font: "500 SIZEpx 'BT Plex Mono'" },
  { key: "serif-400", font: "400 SIZEpx 'BT Newsreader'" },
  { key: "serif-500", font: "500 SIZEpx 'BT Newsreader'" },
];
const sizes = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];

const dir = mkdtempSync(join(tmpdir(), "bt-measure-"));
const page = join(dir, "measure.html");
// Probe elements make the browser load every face before measuring.
writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>${fontFaceCss()}
body{font-optical-sizing:auto}</style>
<span style="font:400 20px 'BT Plex Sans'">a</span><span style="font:600 20px 'BT Plex Sans'">a</span>
<span style="font:400 20px 'BT Plex Mono'">a</span><span style="font:500 20px 'BT Plex Mono'">a</span>
<span style="font:400 20px 'BT Newsreader'">a</span>`);

const browser = await launch();
await browser.goto(pathToFileURL(page).href);
const result = await browser.eval(`(() => {
  const chars = ${JSON.stringify(chars)};
  const styles = ${JSON.stringify(styles)};
  const sizes = ${JSON.stringify(sizes)};
  const out = {};
  // Measure with DOM spans so optical sizing applies exactly as it will on the page.
  const span = document.createElement('span');
  span.style.whiteSpace = 'pre';
  span.style.position = 'absolute';
  document.body.appendChild(span);
  for (const style of styles) {
    out[style.key] = {};
    for (const size of sizes) {
      span.style.font = style.font.replace('SIZE', size);
      const widths = {};
      for (const ch of chars) { span.textContent = ch.repeat(10); widths[ch] = +(span.getBoundingClientRect().width / 10 / size).toFixed(5); }
      out[style.key][size] = widths;
    }
  }
  return out;
})()`);
await browser.close();
writeFileSync(join(root, "kit/metrics.json"), JSON.stringify(result));
console.log("wrote kit/metrics.json:", Object.keys(result).join(", "));
