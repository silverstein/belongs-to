#!/usr/bin/env node
// Export a built page as a PNG, a standalone SVG, or a 4:5 share card.
//   node scripts/export.mjs out/first-death.html --png fig.png --svg fig.svg --social card.png [--theme dark] [--scale 2]
// The SVG carries the theme's tokens and the embedded fonts, so it opens
// anywhere with the same look. The share card is the title and the figure
// only, at 1080x1350, for a feed.
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const file = args.find((a) => a.endsWith(".html"));
if (!file) { console.error("usage: node scripts/export.mjs page.html [--png out.png] [--svg out.svg] [--social out.png] [--theme light|dark] [--scale 2]"); process.exit(2); }
const theme = opt("theme", "light"), scale = Number(opt("scale", 2));
const png = opt("png", null), svg = opt("svg", null), social = opt("social", null);
if (!png && !svg && !social) { console.error("nothing to export: pass --png, --svg or --social"); process.exit(2); }

const browser = await launch({ width: 1500, height: 1000, scale });
await browser.theme(theme);
await browser.goto(pathToFileURL(resolve(file)).href + `?theme=${theme}`);

if (png) {
  const plate = await browser.eval(`(() => { const r = document.querySelector('.bt-plate').getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
  writeFileSync(png, await browser.screenshot({ x: plate.x - 24, y: Math.max(0, plate.y - 24), width: plate.width + 48, height: plate.height + 48 }));
  console.log(`${png}: ${Math.round(plate.width)}×${Math.round(plate.height)} at ${scale}×`);
}

if (svg) {
  const text = await browser.eval(`(() => {
    const el = [...document.querySelectorAll('svg.bt-figure')].find((s) => s.getClientRects().length);
    const root = getComputedStyle(document.documentElement);
    const tokens = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
      .flatMap((rule) => (rule.style ? [...rule.style] : [])).filter((p) => p.startsWith('--bt-'));
    const vars = [...new Set(tokens)].map((p) => p + ':' + root.getPropertyValue(p).trim()).join(';');
    const css = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
      .filter((rule) => rule.cssText.startsWith('@font-face') || /^\\.bt-(figure|card|k-|t-|deco|disc|initials|icon|kind|name|detail|value|cite|tone|badge|halo|zone|edge|arrow|chip|gap|band|col|lane|flow|station|recip|fix|basis|ledger|bar|hatch|cap|stacked|asset)/.test(rule.selectorText || ''))
      .map((rule) => rule.cssText).join('\\n');
    const clone = el.cloneNode(true);
    clone.removeAttribute('class');
    clone.setAttribute('class', 'bt-figure');
    clone.insertAdjacentHTML('afterbegin', '<style>svg.bt-figure{' + vars + ';background:var(--bt-plate)}' + css.replace(/</g, '&lt;') + '</style>');
    return '<?xml version="1.0" encoding="UTF-8"?>\\n' + clone.outerHTML;
  })()`);
  writeFileSync(svg, text);
  console.log(`${svg}: ${(text.length / 1024).toFixed(0)} KB, standalone (${theme})`);
}

if (social) {
  // 1080 wide; the height fits the title, figure and legend (1080 to 1350 tall).
  await browser.viewport(1080, 1350, 2);
  const height = await browser.eval(`(() => {
    const s = document.createElement('style');
    s.textContent = 'body{padding:0 !important;background:var(--bt-plate) !important}.bt-plate{border:0 !important;border-radius:0 !important;box-shadow:none !important;max-width:none !important}.bt-notes,.bt-foot,.bt-section,.bt-swipe{display:none !important}.bt-head{padding:56px 64px 10px !important}.bt-title{font-size:52px !important}.bt-sub{font-size:20px !important}.bt-canvas{padding:24px 24px 0 !important}.bt-canvas svg{max-width:1032px !important}.bt-legend{padding:14px 64px 48px !important;font-size:15px !important}';
    document.head.appendChild(s);
    const legend = document.querySelector('.bt-legend');
    const canvas = [...document.querySelectorAll('.bt-canvas')].find((c) => c.getClientRects().length);
    const bottom = (legend || canvas).getBoundingClientRect().bottom + scrollY;
    return Math.max(1080, Math.min(1350, Math.ceil(bottom)));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(social, await browser.screenshot({ x: 0, y: 0, width: 1080, height }));
  console.log(`${social}: 1080×${height} share card (${theme})`);
}
await browser.close();
