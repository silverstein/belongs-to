// Transfer view, stacked: the phone-native layout, designed at ~420 units so
// it shows 1:1 on a phone and scales cleanly into a vertical video frame.
// Items stack top to bottom inside their mechanism bands; each item's ribbon
// leaves to the right, drops down a lane in the gutter, and lands on its
// recipient at the bottom. Width is value; the court ribbon is red.
import { deathRoutes, ROUTES } from "./derive.mjs";
import { shortName } from "./model.mjs";
import { kindLabel, roundedPath } from "./structure.mjs";
import { BAND_TEXT, ORDER } from "./transfer.mjs";
import { measure, wrap, esc, money, inSentence } from "./text.mjs";
import { icon, iconFor } from "./icons.mjs";

export function renderTransferStacked(model, view, { noteBadges }) {
  const event = model.events[view.event];
  const who = model.nodes[event.who];
  const all = deathRoutes(model, view.event);
  const picked = (view.order ?? all.map((r) => r.id)).map((id) => all.find((r) => r.id === id)).filter(Boolean);
  const problems = all.filter((r) => !picked.includes(r)).map((r) => `${r.id} is affected by the event but not shown`);

  const W = 420, M = 14, cardW = 282, gutterX = M + cardW + 14; // lanes live from gutterX to W - M - 6
  const bandHead = 46, baseRowH = 84, rowGap = 10, bandGap = 12, bandPadB = 12;
  const stationLinesOf = (row) => wrap(ROUTES[row.route].court ? `Court first. ${row.detail}` : row.detail, "laneSub", cardW - 54, 2);
  const fixLinesOf = (row) => (view.fixes?.[row.id] ? wrap(view.fixes[row.id], "laneSub", cardW - 40, 2) : []);
  const rowHOf = (row) => baseRowH + (stationLinesOf(row).length - 1) * 13;
  const fixHOf = (row) => (fixLinesOf(row).length ? 16 + fixLinesOf(row).length * 15 : 0);
  const recipients = (view.recipients ?? []).map((id) => ({ id, node: model.nodes[id], flows: [] }));

  // Bands and rows.
  const bands = [];
  let y = 8;
  const bandList = view.bands ?? ORDER;
  for (const r of picked) if (!bandList.includes(r.route)) problems.push(`${r.id} passes by "${ROUTES[r.route].label}", but that band is not in view.bands, so it would be left off the drawing`);
  for (const route of bandList) {
    const rows = picked.filter((r) => r.route === route);
    if (!rows.length) continue;
    let cy = y + bandHead;
    rows.forEach((row) => { row.y = cy; row.h = rowHOf(row); cy += row.h + rowGap + fixHOf(row); });
    const h = cy - y - rowGap + bandPadB;
    bands.push({ route, rows, y, h });
    y += h + bandGap;
  }
  const rows = bands.flatMap((b) => b.rows);
  const maxValue = Math.max(...rows.map((r) => r.value ?? 0));
  const flowW = (v) => (v == null ? 2 : Math.max(3, 12 * (v / maxValue)));
  for (const row of rows) for (const entry of row.to) {
    const recip = recipients.find((r) => r.id === entry.to);
    if (!recip) { problems.push(`${row.id} goes to ${entry.to}, which is not drawn`); continue; }
    recip.flows.push({ row, share: entry.share, w: row.route === "trust" ? 2 : flowW(row.value == null ? null : row.value * entry.share) });
  }
  // One lane per recipient in the gutter, sized to the ribbons it carries.
  const gutterW = W - M - gutterX - 6;
  const laneTotals = recipients.map((r) => r.flows.reduce((sum, f) => sum + f.w + 3, 0));
  const laneSpread = laneTotals.reduce((a, b) => a + b, 0) + 10 * Math.max(0, recipients.length - 1);
  const squeeze = Math.min(1, (gutterW - 8) / Math.max(1, laneSpread));
  const laneStart = [];
  let lx0 = gutterX + 8;
  recipients.forEach((r, i) => { laneStart[i] = lx0; lx0 += laneTotals[i] * squeeze + 10; });

  // Recipients stack full width at the bottom, each a box with its totals.
  const recipTop = y + 36;
  let ry = recipTop;
  const recipLayout = recipients.map((recip, i) => {
    const known = recip.flows.every((f) => f.row.value != null);
    const sum = (list) => list.reduce((s, f) => s + (f.row.value ?? 0) * f.share, 0);
    const arrives = recip.flows.filter((f) => !ROUTES[f.row.route].court && f.row.route !== "trust");
    const stays = recip.flows.filter((f) => f.row.route === "trust");
    const court = recip.flows.filter((f) => ROUTES[f.row.route].court);
    const lines = [];
    if (!known) lines.push({ text: "No total: one value isn’t in the documents", tone: "ask" });
    else {
      if (arrives.length) lines.push({ text: `${money(sum(arrives))} with no court`, key: "arrives", amount: sum(arrives), suffix: " with no court" });
      if (stays.length) lines.push({ text: `${money(sum(stays))} already here, nothing moves`, key: "stays", amount: sum(stays), suffix: " already here, nothing moves" });
      if (court.length) lines.push({ text: `${money(sum(court))} after court, minus fees`, tone: "flag", key: "court", amount: sum(court), suffix: " after court, minus fees" });
    }
    const survivors = (event.survivors ?? []).map((id) => shortName(model.nodes[id]));
    const subtitle = recip.node.kind === "law" ? "Usually the spouse and children, split the way the state’s rulebook says" : recip.node.kind === "person" ? `It becomes ${shortName(recip.node)}’s` : recip.node.trust?.onDeath?.trusteeAfter === "survivor" ? `${survivors.join(" and ")} now runs it alone` : "";
    const subtitleLines = subtitle ? wrap(subtitle, "detail", cardW - 28, 2) : [];
    const h = 50 + subtitleLines.length * 16 + lines.length * 20 + 14;
    const box = { ...recip, x: M, y: ry, w: cardW, h, lines, subtitleLines, lane: i };
    ry += h + 14;
    return box;
  });
  const height = ry + 6;

  const out = [], boxes = [], segments = [];
  out.push(`<svg class="bt-figure bt-transfer bt-stacked" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(view.title)}" xmlns="http://www.w3.org/2000/svg">`);

  // Bands.
  for (const band of bands) {
    const court = band.route === "probate";
    const text = BAND_TEXT[band.route];
    out.push(`<g class="bt-bandg" data-band="${band.route}"><rect class="bt-band${court ? " bt-band-court" : ""}" x="${M - 6}" y="${band.y}" width="${cardW + 12}" height="${band.h}" rx="12"/>`);
    out.push(icon(text.icon, M + 4, band.y + 10, 13, `bt-icon${court ? " bt-icon-flag" : ""}`));
    out.push(`<text class="bt-bandhead${court ? " bt-tone-flag" : ""}" x="${M + 22}" y="${band.y + 20}">${esc(text.title.toUpperCase())}</text>`);
    wrap(text.sub, "laneSub", cardW - 20, 1).forEach((line) => out.push(`<text class="bt-bandsub${court ? " bt-tone-flag" : ""}" x="${M + 4}" y="${band.y + 36}">${esc(line)}</text>`));
    out.push(`</g>`);
  }

  // Ribbons: out of the card's right edge, into the gutter lane, down beside
  // the recipients, then left into the recipient's right edge.
  const flows = [];
  const laneCursor = recipLayout.map(() => 0);
  const entryCursor = recipLayout.map((r) => r.y + 30);
  for (const row of rows) {
    const y0 = row.y + row.h / 2;
    for (const entry of row.to) {
      const recip = recipLayout.find((r) => r.id === entry.to);
      if (!recip) continue;
      const flow = recip.flows.find((f) => f.row === row && f.share === entry.share);
      const w = flow.w * squeeze;
      const court = ROUTES[row.route].court, stay = row.route === "trust";
      const lx = laneStart[recip.lane] + laneCursor[recip.lane] + w / 2;
      laneCursor[recip.lane] += w + 3 * squeeze;
      const ey = entryCursor[recip.lane] + w / 2;
      entryCursor[recip.lane] += w + 3;
      const pts = [[M + cardW, y0], [lx, y0], [lx, ey], [recip.x + recip.w, ey]];
      const d = roundedPath(pts, 12);
      const cls = court ? " bt-flow-court bt-flow-later" : stay ? " bt-flow-stay" : "";
      flows.push(`<path class="bt-flow${cls}" d="${d}" stroke-width="${w}" data-from="${esc(row.id)}" data-to="${esc(recip.id)}"/>`);
      for (let k = 0; k < pts.length - 1; k++) segments.push({ a: pts[k], b: pts[k + 1], from: row.id, to: recip.id });
    }
  }
  out.push(`<g class="bt-flows">${flows.join("")}</g>`);

  // Rows: one card each, with its station as a third line.
  for (const row of rows) {
    const { y: ry0, item: node } = row;
    const badges = noteBadges.get(row.id) ?? [];
    const court = ROUTES[row.route].court;
    const holdText = row.ownedBy ? `Owned by ${row.ownedBy.map((id) => shortName(model.nodes[id])).join(" and ")}` : row.via ? `In ${inSentence(shortName(model.nodes[row.via]))}` : row.holding.joint ? `Joint with ${row.holding.holders.filter((h) => h !== event.who).map((h) => shortName(model.nodes[h])).join(", ")}` : row.route === "contract" ? `${shortName(who)}’s, and a form says who gets it` : row.route === "agreement" ? `${shortName(who)}’s, and the agreement says who steps in` : node.designation && node.designation.source?.status !== "unknown" && !(node.designation.primary ?? []).length ? `${shortName(who)}’s, and no one is named to get it` : `${shortName(who)}’s alone, and no one is named to get it`;
    out.push(`<g class="bt-node" data-id="${esc(row.id)}" tabindex="0" role="group" aria-label="${esc(node.name)}">`);
    const rowH = row.h;
    out.push(`<rect class="bt-card bt-asset${court ? " bt-t-flag" : ""}" x="${M}" y="${ry0}" width="${cardW}" height="${rowH}" rx="9"/>`);
    out.push(icon(iconFor(node), M + 11, ry0 + 11, 13, "bt-icon"));
    const valueText = row.value == null ? "Not in documents" : money(row.value);
    const valueW = measure(valueText, "nameSm");
    const badgeW = badges.length * 20;
    const nameMax = cardW - 32 - 10 - valueW - 10 - badgeW;
    const name = measure(node.name, "nameSm") <= nameMax ? node.name : shortName(node);
    out.push(`<text class="bt-name bt-name-sm" x="${M + 31}" y="${ry0 + 22}">${esc(wrap(name, "nameSm", nameMax, 1)[0])}</text>`);
    out.push(`<text class="bt-value${row.value == null ? " bt-tone-ask" : ""}" x="${M + cardW - 10 - badgeW}" y="${ry0 + 22}" text-anchor="end" style="font-size:12.5px">${esc(valueText)}</text>`);
    out.push(`<text class="bt-detail${court ? " bt-tone-flag" : ""}" x="${M + 31}" y="${ry0 + 40}" style="font-size:11.5px">${esc(wrap(holdText, "detail", cardW - 42, 1)[0])}</text>`);
    // Station, as a pill inside the card.
    const sLines = stationLinesOf(row);
    const sw = Math.min(cardW - 22, Math.max(...sLines.map((l) => measure(l, "laneSub"))) + 30);
    const sh = 24 + (sLines.length - 1) * 13;
    out.push(`<g class="bt-station${court ? " bt-station-court" : ""}" data-station="${esc(row.id)}"><rect x="${M + 11}" y="${ry0 + 50}" width="${sw}" height="${sh}" rx="12"/>`);
    out.push(icon(court ? "clock" : "form", M + 19, ry0 + 55, 12, `bt-icon${court ? " bt-icon-flag" : ""}`));
    sLines.forEach((line, k) => out.push(`<text class="bt-station-text${court ? " bt-tone-flag" : ""}" x="${M + 35}" y="${ry0 + 66 + k * 13}" style="font-size:11px">${esc(line)}</text>`));
    out.push(`</g>`);
    badges.forEach((badge, k) => { const cx = M + cardW - 3 - k * 21, cy = ry0 + 3; out.push(`<g class="bt-badge bt-tone-${badge.tone}"><circle cx="${cx}" cy="${cy}" r="8.5"/><text x="${cx}" y="${cy + 3.4}" text-anchor="middle" style="font-size:10px">${badge.letter}</text></g>`); });
    out.push(`</g>`);
    boxes.push({ id: row.id, x: M, y: ry0, w: cardW, h: rowH });
    fixLinesOf(row).forEach((line, k) => out.push(`<text class="bt-fix" data-fix="${esc(row.id)}" x="${M + 2}" y="${ry0 + rowH + 19 + k * 15}" style="font-size:11.5px">${k === 0 ? `<tspan class="bt-fix-label">The fix:</tspan> ` : ""}${esc(line)}</text>`));
  }

  // Recipients.
  for (const recip of recipLayout) {
    const { x, y: by, w, h, node } = recip;
    out.push(`<g class="bt-node" data-id="${esc(recip.id)}" tabindex="0" role="group" aria-label="${esc(node.name)}">`);
    out.push(`<rect class="bt-card bt-recip bt-k-${node.kind}" x="${x}" y="${by}" width="${w}" height="${h}" rx="${node.kind === "person" ? 14 : 4}"/>`);
    if (node.kind === "trust") out.push(`<path class="bt-deco" d="M${x + 4} ${by + 4.5}H${x + w - 4}"/>`);
    (noteBadges.get(recip.id) ?? []).forEach((badge, k) => { const cx = x + w - 3 - k * 21, cy = by + 3; out.push(`<g class="bt-badge bt-tone-${badge.tone}"><circle cx="${cx}" cy="${cy}" r="8.5"/><text x="${cx}" y="${cy + 3.4}" text-anchor="middle" style="font-size:10px">${badge.letter}</text></g>`); });
    out.push(icon(iconFor(node), x + 14, by + 13, 13, "bt-icon"));
    out.push(`<text class="bt-kind" x="${x + 33}" y="${by + 23}">${esc((node.kind === "person" ? "Survivor" : node.kind === "law" ? "No will: intestacy" : kindLabel(node)).toUpperCase())}</text>`);
    out.push(`<text class="bt-name bt-name-sm" x="${x + 14}" y="${by + 44}">${esc(node.name)}</text>`);
    let ty = by + 44;
    for (const line of recip.subtitleLines) { ty += 16; out.push(`<text class="bt-detail" x="${x + 14}" y="${ty}" style="font-size:11.5px">${esc(line)}</text>`); }
    for (const line of recip.lines) {
      ty += 20;
      const tag = line.key ? ` data-line="${line.key}" data-amount="${line.amount}" data-suffix="${esc(line.suffix)}"` : "";
      out.push(`<text class="bt-value${line.tone ? ` bt-tone-${line.tone}` : ""}"${tag} x="${x + 14}" y="${ty}" style="font-size:12.5px">${esc(line.text)}</text>`);
    }
    out.push(`</g>`);
    boxes.push({ id: recip.id, x, y: by, w, h });
  }
  out.push(`</svg>`);
  return { svg: out.join(""), width: W, height, geometry: { boxes, segments, labels: [], zones: [], crossings: 0, problems }, rows, routes: bands.map((b) => b.route), recipients: recipLayout };
}
