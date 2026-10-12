#!/usr/bin/env node
// Screenshot a built page and run the in-browser text checks.
//   node scripts/shoot.mjs page.html [--out shot.png] [--width 1500] [--theme light|dark] [--scale 2] [--zoom x,y,w,h]
// Prints any text that overflows its card or collides with other text, and
// any console error. Exits 1 if it finds one.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const target = args.find((a) => !a.startsWith("--") && !/^\d/.test(a) && !["light", "dark"].includes(a) && a !== opt("out") && a !== opt("zoom"));
const [file, hash = ""] = target.split("#"); // page.html#focus=id works for deep-link checks
const width = Number(opt("width", 1500));
const scale = Number(opt("scale", 2));
const theme = opt("theme", "light");
const out = opt("out", file.replace(/\.html$/, `-${theme}-${width}.png`));
const zoom = opt("zoom", null)?.split(",").map(Number);

const browser = await launch({ width, height: 1000, scale });
await browser.theme(theme);
await browser.goto(pathToFileURL(resolve(file)).href + `?theme=${theme}` + (hash ? `#${hash}` : ""));
const report = await browser.eval(`(() => {
  const issues = [];
  for (const svg of document.querySelectorAll('svg.bt-figure')) {
    if (!svg.getClientRects().length) continue; // hidden variant for another width
    const texts = [...svg.querySelectorAll('text')];
    const boxes = texts.map(t => ({ t, b: t.getBBox(), s: t.textContent }));
    // text must sit inside its own card or station
    for (const { t, b, s } of boxes) {
      const group = t.closest('.bt-node, .bt-station, .bt-chip, .bt-badge');
      if (!group) continue;
      const rect = group.querySelector('rect, circle');
      if (!rect || rect.tagName !== 'rect') continue;
      const r = rect.getBBox();
      if (b.x < r.x + 2 || b.x + b.width > r.x + r.width - 2 || b.y < r.y + 1 || b.y + b.height > r.y + r.height - 1) issues.push('text overflows its box: "' + s + '"');
    }
    const vb = svg.viewBox.baseVal;
    for (const { b, s } of boxes) if (b.x < vb.x - 1 || b.y < vb.y - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y + b.height > vb.y + vb.height + 1) issues.push('text runs outside the figure: "' + s.slice(0, 60) + '"');
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b, c = boxes[j].b;
      const ov = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
      const ovy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
      if (ov > 1 && ovy > 2) issues.push('text collides: "' + boxes[i].s + '" / "' + boxes[j].s + '"');
    }
  }
  const plate = document.querySelector('.bt-plate').getBoundingClientRect();
  const sideways = document.documentElement.scrollWidth > innerWidth + 1;
  return { issues, plate: { x: plate.x, y: plate.y + scrollY, width: plate.width, height: plate.height }, sideways };
})()`);
const clip = zoom ? { x: report.plate.x + zoom[0], y: report.plate.y + zoom[1], width: zoom[2], height: zoom[3], scale: 2 } : { x: Math.max(0, report.plate.x - 24), y: Math.max(0, report.plate.y - 24), width: Math.min(width, report.plate.width + 48), height: report.plate.height + 48 };
writeFileSync(out, await browser.screenshot(clip));
const problems = [...report.issues, ...browser.errors.map((e) => `console: ${e}`), ...(report.sideways ? ["page scrolls sideways"] : [])];
console.log(`${out}: ${problems.length ? problems.length + " problems" : "clean"} (plate ${Math.round(report.plate.width)}×${Math.round(report.plate.height)})`);
for (const p of problems) console.log("  " + p);
await browser.close();
process.exit(problems.length ? 1 : 0);
