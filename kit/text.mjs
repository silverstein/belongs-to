// Text measurement and wrapping against the measured kit fonts, so layout
// is decided at build time and the page needs no script to lay out.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const metrics = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "metrics.json"), "utf8"));

export const STYLES = {
  kind: { face: "mono-500", size: 10.5, upper: true, spacing: 0.06 },
  name: { face: "sans-600", size: 15 },
  nameSm: { face: "sans-600", size: 13.5 },
  detail: { face: "sans-400", size: 12.5 },
  value: { face: "mono-500", size: 13.5 },
  cite: { face: "sans-400", size: 11 },
  chip: { face: "mono-500", size: 11 },
  lane: { face: "mono-500", size: 11, upper: true, spacing: 0.06 },
  laneSub: { face: "sans-400", size: 12 },
  zone: { face: "sans-600", size: 12 },
  badge: { face: "sans-600", size: 11 },
  big: { face: "mono-500", size: 18 },
  serif: { face: "serif-400", size: 20 },
};

function nearestSize(face, size) {
  const sizes = Object.keys(metrics[face]).map(Number);
  return sizes.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), sizes[0]);
}

export function measure(text, style) {
  const { face, size, upper, spacing = 0 } = typeof style === "string" ? STYLES[style] : style;
  const table = metrics[face][nearestSize(face, size)];
  const fallback = table["n"];
  const str = upper ? text.toUpperCase() : text;
  let width = 0;
  for (const ch of str) width += table[ch] ?? fallback;
  return width * size + spacing * size * Math.max(0, str.length - 1);
}

export function wrap(text, style, maxWidth, maxLines = Infinity) {
  // Non-breaking spaces glue words; if a glued unit can't fit, let it break.
  const words = text.split(/ +/).filter(Boolean).flatMap((w) => (measure(w, style) > maxWidth && w.includes("\u00A0") ? w.split("\u00A0") : [w]));
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, style) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length && measure(last + "…", style) > maxWidth) last = last.slice(0, -1).trimEnd();
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

export const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// $10M, $8.4M, $1.39M, $740K: two decimals at most, trailing zeros dropped.
export function money(usd) {
  if (usd == null) return null;
  const abs = Math.abs(usd);
  const trim = (n, d) => String(+n.toFixed(d));
  if (abs >= 1e9) return `$${trim(usd / 1e9, 2)}B`;
  if (abs >= 1e6) return `$${trim(usd / 1e6, abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return `$${Math.round(usd)}`;
}

export function shares(count) {
  if (count >= 1e6) return `${+(count / 1e6).toFixed(2)}M sh`;
  if (count >= 1e3) return `${+(count / 1e3).toFixed(1)}K sh`;
  return `${count} sh`;
}

export function pct(fraction) {
  const value = fraction * 100;
  if (Math.abs(value - Math.round(value)) < 1e-6) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
}

// "The family trust" reads "the family trust" mid-sentence.
export const inSentence = (name) => (/^The [a-z]/.test(name) ? "t" + name.slice(1) : name);

export function listJoin(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
