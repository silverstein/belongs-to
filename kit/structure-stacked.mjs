// Structure view, stacked: the phone-native ownership tree, designed at 420
// units. Each holder is a card; what it holds nests beneath it with a share
// chip; something held by several parties becomes one shared card at the end
// with its holders listed. Zones wrap contiguous runs of cards. A gap (not in
// the trust) is a red chip on the card, since a line would have to cross
// other households' cards to reach the zone.
import { holdingsOf, holdingsBy, shortName } from "./model.mjs";
import { layoutCard, drawCard } from "./structure.mjs";
import { measure, esc, shares as fmtShares, pct, listJoin, inSentence } from "./text.mjs";

export function renderStructureStacked(model, view, { noteBadges }) {
  const W = 420, M = 14, INDENT = 22, GAP = 10, CHIP_H = 18;
  const placed = new Set(Object.keys(view.place ?? {}));
  const problems = [];
  const isShared = (id) => holdingsOf(model, id).filter((h) => h.holders.some((x) => placed.has(x))).reduce((n, h) => n + h.holders.length, 0) > 1;
  const relFrom = (id) => (view.relations ?? []).filter((r) => r.from === id && placed.has(r.to));

  // Order: depth-first from each person; a trust a person created follows that
  // person's holdings; then anything still unplaced; shared items last.
  const order = [];
  const seen = new Set();
  const visit = (id, depth) => {
    if (seen.has(id) || !placed.has(id)) return;
    seen.add(id);
    order.push({ id, depth });
    const kids = holdingsBy(model, id).filter((h) => placed.has(h.held) && !isShared(h.held)).map((h) => h.held);
    kids.sort((a, b) => (view.place[a]?.[0] ?? 0) - (view.place[b]?.[0] ?? 0));
    for (const k of kids) visit(k, depth + 1);
    for (const r of relFrom(id)) if (!isShared(r.to)) visit(r.to, depth + 1);
  };
  const ids = Object.keys(view.place);
  for (const id of ids) if (model.nodes[id].kind === "person") visit(id, 0);
  for (const id of ids) if (!isShared(id)) visit(id, 0);
  const shared = ids.filter((id) => isShared(id));
  for (const id of shared) { seen.add(id); order.push({ id, depth: 0, shared: true }); }

  // Zones: a zone whose members are not adjacent in the tree is drawn as one
  // box per contiguous run. Runs are known from the order, before layout.
  const rowIndex = (id) => order.findIndex((e) => e.id === id);
  const runsOf = (zone) => {
    const idx = zone.members.map(rowIndex).filter((i) => i >= 0).sort((a, b) => a - b);
    const runs = [];
    for (const i of idx) { const last = runs.at(-1); if (last && i === last.at(-1) + 1) last.push(i); else runs.push([i]); }
    return runs.map((r) => r.map((i) => order[i].id));
  };
  const zoneRuns = (view.zones ?? []).flatMap((zone) => runsOf(zone).map((members, k) => ({ ...zone, members, first: k === 0 })));
  const startsZone = new Set(zoneRuns.map((z) => z.members[0]));
  const endsZone = new Set(zoneRuns.map((z) => z.members.at(-1)));

  // Lay out cards.
  const cards = {};
  let y = 8;
  const rows = [];
  for (const entry of order) {
    const node = model.nodes[entry.id];
    const x = M + entry.depth * INDENT, width = W - M - x;
    const chips = [];
    const incoming = holdingsOf(model, entry.id).filter((h) => h.holders.some((p) => placed.has(p)));
    if (!entry.shared && incoming.length === 1 && entry.depth > 0) {
      const h = incoming[0];
      chips.push({ text: h.joint ? "Joint" : h.shares != null ? `${fmtShares(h.shares)} · ${pct(h.fraction)}` : pct(h.fraction), cls: "" });
    }
    if (entry.shared) for (const h of incoming) for (const holder of h.holders) chips.push({ text: `${shortName(model.nodes[holder])}: ${h.joint ? "joint" : pct(h.fraction)}`, cls: "" });
    for (const r of (view.relations ?? []).filter((r) => r.to === entry.id && placed.has(r.from))) chips.push({ text: `${r.label} · ${shortName(model.nodes[r.from])}`, cls: "bt-chip-rel" });
    for (const g of (view.gaps ?? []).filter((g) => g.from === entry.id)) chips.push({ text: g.label, cls: "bt-chip-gap" });
    // Chips flow into rows of the card's width.
    let cx = 0, row = 0;
    for (const chip of chips) { chip.w = measure(chip.text, "chip") + 12; if (cx + chip.w > width && cx > 0) { cx = 0; row++; } chip.dx = cx; chip.row = row; cx += chip.w + 6; }
    const chipRows = chips.length ? row + 1 : 0;
    if (startsZone.has(entry.id)) y += 26;
    const card = layoutCard(model, node, width, noteBadges.get(entry.id) ?? []);
    const chipTop = chipRows ? y : null;
    const cy = chipRows ? y + chipRows * (CHIP_H + 4) + 2 : y;
    cards[entry.id] = { ...card, x, y: cy, width, chips, chipTop, chipRows, depth: entry.depth, shared: entry.shared };
    rows.push(entry.id);
    y = cy + card.height + GAP + (endsZone.has(entry.id) ? 12 : 0);
  }
  const height = y + 6;

  const zones = zoneRuns.map((zone) => {
    const ys = zone.members.flatMap((id) => [cards[id].chipTop ?? cards[id].y, cards[id].y + cards[id].height]);
    const top = Math.min(...ys) - 8, bottom = Math.max(...ys) + 8;
    return { ...zone, x: M - 7, y: top - (zone.first ? 12 : 0), w: W - 2 * M + 14, h: bottom - top + (zone.first ? 12 : 0) };
  });

  const out = [], boxes = [], segments = [], labels = [];
  out.push(`<svg class="bt-figure bt-stacked" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(view.title)}" xmlns="http://www.w3.org/2000/svg">`);
  for (const zone of zones) {
    out.push(`<g class="bt-zone bt-zone-${zone.tone}" data-zone="${esc(zone.id)}"><rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"/>`);
    if (zone.first) {
      // The tab sits at the right end of the top edge, clear of the connector lines on the left.
      const lw = Math.min(zone.w - 24, measure(zone.label, "zone") + 20);
      const tx = zone.x + zone.w - 12 - lw;
      out.push(`<rect class="bt-zone-tab" x="${tx}" y="${zone.y - 10}" width="${lw}" height="20" rx="10"/><text class="bt-zone-label" x="${tx + 10}" y="${zone.y + 4}">${esc(zone.label)}</text>`);
      zone.labelBox = { x: tx, y: zone.y - 10, w: lw, h: 20 };
    }
    out.push(`</g>`);
  }
  // Connectors: a line down the parent's left margin with a stub to each nested card.
  out.push(`<g class="bt-edges">`);
  for (const [i, id] of rows.entries()) {
    const card = cards[id];
    const kids = rows.slice(i + 1).filter((k) => cards[k].depth === card.depth + 1 && !cards[k].shared && rows.slice(i + 1, rows.indexOf(k)).every((m) => cards[m].depth > card.depth));
    if (!kids.length) continue;
    const lx = card.x + 11;
    const last = cards[kids.at(-1)];
    const lastY = last.y + Math.min(26, last.height / 2);
    out.push(`<path class="bt-edge" d="M${lx} ${card.y + card.height}V${lastY}"/>`);
    segments.push({ a: [lx, card.y + card.height], b: [lx, lastY], from: id });
    for (const k of kids) {
      const kc = cards[k];
      const ky = kc.y + Math.min(26, kc.height / 2);
      out.push(`<path class="bt-edge" d="M${lx} ${ky}H${kc.x}" marker-end="url(#bt-arrow)"/>`);
      segments.push({ a: [lx, ky], b: [kc.x, ky], from: id, to: k });
    }
  }
  out.push(`</g>`);
  out.push(`<defs><marker id="bt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="bt-arrowhead" d="M1 1.5L9 5L1 8.5z"/></marker></defs>`);
  for (const id of rows) {
    const card = cards[id];
    for (const chip of card.chips) {
      const cx = card.x + chip.dx, cy = card.chipTop + chip.row * (CHIP_H + 4);
      out.push(`<g class="bt-chip ${chip.cls}"><rect x="${cx}" y="${cy}" width="${chip.w}" height="${CHIP_H}" rx="9"/><text x="${cx + chip.w / 2}" y="${cy + 12.5}" text-anchor="middle">${esc(chip.text)}</text></g>`);
      labels.push({ x: cx, y: cy, w: chip.w, h: CHIP_H, text: chip.text });
    }
    out.push(drawCard(card, card.x, card.y, card.width));
    boxes.push({ id, x: card.x, y: card.y, w: card.width, h: card.height });
  }
  out.push(`</svg>`);
  return { svg: out.join(""), width: W, height, geometry: { boxes, segments, labels, zones, crossings: 0, problems } };
}
