// Transfer view: what happens to each thing when an event occurs. One band
// per mechanism (form, title, trust, will and probate), each item's line
// stays inside its own band, and lines meet their recipients in the gutter.
// A line never crosses another mechanism's band, so it can't seem to pass
// through probate when it doesn't.
import { deathRoutes, ROUTES } from "./derive.mjs";
import { shortName } from "./model.mjs";
import { kindLabel } from "./structure.mjs";
import { measure, wrap, esc, money, inSentence } from "./text.mjs";
import { icon, iconFor } from "./icons.mjs";

export const BAND_TEXT = {
  contract: { title: "Goes to whoever the form names", sub: "As long as that person is still living. No court.", icon: "form" },
  agreement: { title: "Goes to whoever the LLC agreement names", sub: "The agreement says who steps in. No court.", icon: "llc" },
  title: { title: "Goes to the other name on it", sub: "Whoever is left on the account keeps it. No court.", icon: "key" },
  trust: { title: "Already in the trust", sub: "Nothing has to move. The trust’s own rules take over. No court.", icon: "trust" },
  probate: { title: "Goes to court first", sub: "Public record. Often months. Court and legal fees come out first.", icon: "court" },
  unknown: { title: "The documents don’t say", sub: "Nothing on file shows where this goes.", icon: "form" },
};
export const ORDER = ["contract", "agreement", "title", "trust", "probate", "unknown"];

export function renderTransfer(model, view, { noteBadges }) {
  const event = model.events[view.event];
  const who = model.nodes[event.who];
  const all = deathRoutes(model, view.event);
  const picked = (view.order ?? all.map((r) => r.id)).map((id) => all.find((r) => r.id === id)).filter(Boolean);
  const problems = all.filter((r) => !picked.includes(r)).map((r) => `${r.id} is affected by the event but not shown`);

  const M = 26, assetW = 290, stationX = M + assetW + 34, stationW = 236, recipW = 262;
  const gutter = 150;
  const recipX = stationX + stationW + gutter;
  const width = recipX + recipW + M;
  const headH = 52, bandHead = 40, rowH = 60, rowGap = 12, bandGap = 14, bandPadB = 14;

  // Bands in mechanism order, rows inside them in authored order.
  const bands = [];
  let y = headH;
  const bandList = view.bands ?? ORDER;
  for (const r of picked) if (!bandList.includes(r.route)) problems.push(`${r.id} passes by "${ROUTES[r.route].label}", but that band is not in view.bands, so it would be left off the drawing`);
  for (const route of bandList) {
    const rows = picked.filter((r) => r.route === route);
    if (!rows.length) continue;
    const fixes = rows.filter((r) => view.fixes?.[r.id]).length;
    const h = bandHead + rows.length * rowH + (rows.length - 1) * rowGap + bandPadB + fixes * 26;
    bands.push({ route, rows, y, h });
    let cy = y + bandHead;
    rows.forEach((row) => { row.y = cy; cy += rowH + rowGap + (view.fixes?.[row.id] ? 26 : 0); });
    y += h + bandGap;
  }
  const bodyBottom = y - bandGap;
  const rows = bands.flatMap((b) => b.rows);
  const maxValue = Math.max(...rows.map((r) => r.value ?? 0));
  const flowW = (v) => (v == null ? 2 : Math.max(3, 18 * (v / maxValue)));

  // Recipients, centered on the rows that reach them.
  const recipients = (view.recipients ?? []).map((id) => ({ id, node: model.nodes[id], flows: [] }));
  for (const row of rows) for (const entry of row.to) recipients.find((r) => r.id === entry.to)?.flows.push({ ...row, value: row.value == null ? null : row.value * entry.share, route: row.route, y: row.y, id: row.id });
  let cursor = headH;
  const recipLayout = recipients.map((recip) => {
    const ys = recip.flows.map((row) => row.y + rowH / 2);
    const known = recip.flows.every((row) => row.value != null);
    const sum = (list) => list.reduce((s, row) => s + (row.value ?? 0), 0);
    // Three different things: money that arrives without a court, property
    // the trust already held (nothing moves), and what waits for probate.
    const arrives = recip.flows.filter((row) => !ROUTES[row.route].court && row.route !== "trust");
    const stays = recip.flows.filter((row) => row.route === "trust");
    const court = recip.flows.filter((row) => ROUTES[row.route].court);
    const preTax = recip.flows.filter((row) => row.item?.taxTreatment === "pre-tax");
    const lines = [];
    if (!known) lines.push({ text: "No total: one value isn’t in the documents", tone: "ask" });
    else {
      if (arrives.length) lines.push({ text: `${money(sum(arrives))} with no court`, tone: "", key: "arrives", amount: sum(arrives), suffix: " with no court" });
      if (preTax.length) lines.push({ text: `Income tax is still owed on ${money(sum(preTax))} of it`, tone: "sub", key: "pretax", amount: sum(preTax), prefix: "Income tax is still owed on ", suffix: " of it" });
      if (stays.length) lines.push({ text: `${money(sum(stays))} already here, nothing moves`, tone: "", key: "stays", amount: sum(stays), suffix: " already here, nothing moves" });
      if (court.length) lines.push({ text: `${money(sum(court))} after court, minus fees`, tone: "flag", key: "court", amount: sum(court), suffix: " after court, minus fees" });
    }
    const survivors = (event.survivors ?? []).map((id) => shortName(model.nodes[id]));
    const subtitle = recip.node.kind === "law" ? "Usually the spouse and children, split the way the state’s rulebook says" : recip.node.kind === "person" ? `It becomes ${shortName(recip.node)}’s` : recip.node.trust?.onDeath?.trusteeAfter === "survivor" ? `${survivors.join(" and ")} now runs it alone` : "";
    const subtitleLines = subtitle ? wrap(subtitle, "detail", recipW - 32, 2) : [];
    const h = 58 + subtitleLines.length * 18 + lines.reduce((sum, l) => sum + (l.tone === "sub" ? 17 : 22), 0) + 16;
    const mid = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : cursor + h / 2;
    let top = Math.max(cursor, mid - h / 2);
    top = Math.min(top, Math.max(cursor, bodyBottom - h));
    cursor = top + h + 24;
    return { ...recip, x: recipX, y: top, h, lines, subtitleLines };
  });
  const height = Math.max(bodyBottom, cursor - 24) + 20;

  const out = [];
  const boxes = [], segments = [];
  out.push(`<svg class="bt-figure bt-transfer" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(view.title)}" xmlns="http://www.w3.org/2000/svg">`);
  out.push(`<text class="bt-colhead" x="${M}" y="24">WHAT IS IN ${esc(shortName(who).toUpperCase())}’S NAME</text>`);
  out.push(`<text class="bt-colhead" x="${stationX}" y="24">HOW IT GETS TO SOMEONE</text>`);
  out.push(`<text class="bt-colhead" x="${recipX}" y="24">WHO ENDS UP WITH IT</text>`);

  // Bands.
  for (const band of bands) {
    const court = band.route === "probate";
    const text = BAND_TEXT[band.route];
    const bandW = stationX + stationW + 18 - (M - 12);
    out.push(`<g class="bt-bandg" data-band="${band.route}"><rect class="bt-band${court ? " bt-band-court" : ""}" x="${M - 12}" y="${band.y}" width="${bandW}" height="${band.h}" rx="14"/>`);
    out.push(icon(text.icon, M, band.y + 12, 15, `bt-icon${court ? " bt-icon-flag" : ""}`));
    out.push(`<text class="bt-bandhead${court ? " bt-tone-flag" : ""}" x="${M + 22}" y="${band.y + 23.5}">${esc(text.title.toUpperCase())}</text>`);
    const subX = M + 22 + measure(text.title, "lane") + 14;
    out.push(`<text class="bt-bandsub${court ? " bt-tone-flag" : ""}" x="${subX}" y="${band.y + 23.5}">${esc(text.sub)}</text></g>`);
  }

  // Flows (under cards and stations).
  const portCursor = new Map();
  for (const recip of recipLayout) {
    const total = recip.flows.reduce((s, flow) => s + (flow.route === "trust" ? 2 : flowW(flow.value)) + 7, -7);
    portCursor.set(recip.id, recip.y + recip.h / 2 - total / 2);
  }
  const flows = [];
  for (const row of rows) {
    const y0 = row.y + rowH / 2;
    const court = ROUTES[row.route].court;
    for (const entry of row.to) {
      const w = row.route === "trust" ? 2 : flowW(row.value == null ? null : row.value * entry.share);
      const recip = recipLayout.find((r) => r.id === entry.to);
      if (!recip) { problems.push(`${row.id} goes to ${entry.to}, which is not drawn`); continue; }
      const py = portCursor.get(recip.id) + w / 2;
      portCursor.set(recip.id, portCursor.get(recip.id) + w + 7);
      const x0 = M + assetW, x1 = stationX + stationW, x2 = recip.x;
      const c1 = x1 + gutter * 0.55, c2 = x2 - gutter * 0.55;
      // Trust property doesn't move at a death: a thin "stays" tie, not a value ribbon.
      const stay = row.route === "trust";
      const cls = court ? " bt-flow-court" : stay ? " bt-flow-stay" : "";
      flows.push(`<path class="bt-flow${cls}" d="M${x0} ${y0}H${stationX}" stroke-width="${stay ? 2 : w}" data-from="${esc(row.id)}" data-to="${esc(entry.to)}"/>`);
      flows.push(`<path class="bt-flow${cls}${court ? " bt-flow-later" : ""}" d="M${x1} ${y0}C${c1} ${y0} ${c2} ${py} ${x2} ${py}" stroke-width="${stay ? 2 : w}" data-from="${esc(row.id)}" data-to="${esc(entry.to)}"/>`);
      segments.push({ a: [x0, y0], b: [stationX, y0], from: row.id }, { a: [x1, y0], b: [x2, py], from: row.id, to: entry.to, curve: true });
    }
  }
  out.push(`<g class="bt-flows">${flows.join("")}</g>`);

  // Item cards and stations.
  for (const row of rows) {
    const { y, item: node } = row;
    const badges = noteBadges.get(row.id) ?? [];
    const court = ROUTES[row.route].court;
    // Say what governs each item, so the red "name alone" belongs only to the court route.
    const holdText = row.ownedBy ? `Owned by ${row.ownedBy.map((id) => shortName(model.nodes[id])).join(" and ")}` : row.via ? `In ${inSentence(shortName(model.nodes[row.via]))}` : row.holding.joint ? `Joint with ${row.holding.holders.filter((h) => h !== event.who).map((h) => shortName(model.nodes[h])).join(", ")}` : row.route === "contract" ? `${shortName(who)}’s, and a form says who gets it` : row.route === "agreement" ? `${shortName(who)}’s, and the agreement says who steps in` : node.designation && node.designation.source?.status !== "unknown" && !(node.designation.primary ?? []).length ? `${shortName(who)}’s, and no one is named to get it` : `${shortName(who)}’s alone, and no one is named to get it`;
    out.push(`<g class="bt-node" data-id="${esc(row.id)}" tabindex="0" role="group" aria-label="${esc(node.name)}">`);
    out.push(`<rect class="bt-card bt-asset${court ? " bt-t-flag" : ""}" x="${M}" y="${y}" width="${assetW}" height="${rowH}" rx="10"/>`);
    out.push(icon(iconFor(node), M + 14, y + 12, 15, "bt-icon"));
    const valueText = row.value == null ? "Not in documents" : money(row.value);
    const valueW = measure(valueText, "value");
    const badgeW = badges.length * 22;
    const nameMax = assetW - 38 - 14 - valueW - 12 - badgeW;
    const name = measure(node.name, "name") <= nameMax ? node.name : shortName(node);
    out.push(`<text class="bt-name" x="${M + 38}" y="${y + 25}">${esc(wrap(name, "name", nameMax, 1)[0])}</text>`);
    out.push(`<text class="bt-detail${court ? " bt-tone-flag" : ""}" x="${M + 38}" y="${y + 44}">${esc(holdText)}</text>`);
    out.push(`<text class="bt-value${row.value == null ? " bt-tone-ask" : ""}" x="${M + assetW - 14 - badgeW}" y="${y + 25}" text-anchor="end">${esc(valueText)}</text>`);
    badges.forEach((badge, k) => { const cx = M + assetW - 16 - k * 22, cy = y + 20; out.push(`<g class="bt-badge bt-tone-${badge.tone}"><circle cx="${cx}" cy="${cy}" r="9.5"/><text x="${cx}" y="${cy + 3.8}" text-anchor="middle">${badge.letter}</text></g>`); });
    out.push(`</g>`);
    boxes.push({ id: row.id, x: M, y, w: assetW, h: rowH });

    const lines = wrap(row.detail, "detail", stationW - (court ? 46 : 28), 2);
    const sh = court ? rowH : Math.max(34, 14 + lines.length * 16);
    const sy = y + rowH / 2 - sh / 2;
    out.push(`<g class="bt-station${court ? " bt-station-court" : ""}" data-station="${esc(row.id)}"><rect x="${stationX}" y="${sy}" width="${stationW}" height="${sh}" rx="${court ? 9 : sh / 2}"/>`);
    if (court) {
      out.push(icon("clock", stationX + 12, sy + 11, 15, "bt-icon bt-icon-flag"));
      out.push(`<text class="bt-station-title" x="${stationX + 34}" y="${sy + 23}">Court first</text>`);
      lines.forEach((line, k) => out.push(`<text class="bt-station-text" x="${stationX + 34}" y="${sy + 39 + k * 14.5}">${esc(line)}</text>`));
    } else {
      lines.forEach((line, k) => out.push(`<text class="bt-station-text" x="${stationX + stationW / 2}" y="${sy + sh / 2 + 4.5 - (lines.length - 1) * 8 + k * 16}" text-anchor="middle">${esc(line)}</text>`));
    }
    out.push(`</g>`);
    boxes.push({ id: `station-${row.id}`, x: stationX, y: sy, w: stationW, h: sh, station: true });
    if (view.fixes?.[row.id]) out.push(`<text class="bt-fix" data-fix="${esc(row.id)}" x="${M + 2}" y="${y + rowH + 20}"><tspan class="bt-fix-label">The fix:</tspan> ${esc(view.fixes[row.id])}</text>`);
  }

  // Recipients.
  for (const recip of recipLayout) {
    const { x, y: ry, h, node } = recip;
    out.push(`<g class="bt-node" data-id="${esc(recip.id)}" tabindex="0" role="group" aria-label="${esc(node.name)}">`);
    out.push(`<rect class="bt-card bt-recip bt-k-${node.kind}" x="${x}" y="${ry}" width="${recipW}" height="${h}" rx="${node.kind === "person" ? 16 : 4}"/>`);
    if (node.kind === "trust") out.push(`<path class="bt-deco" d="M${x + 4} ${ry + 4.5}H${x + recipW - 4}"/>`);
    out.push(icon(iconFor(node), x + 16, ry + 15, 15, "bt-icon"));
    (noteBadges.get(recip.id) ?? []).forEach((badge, k) => { const cx = x + recipW - 3 - k * 23, cy = ry + 3; out.push(`<g class="bt-badge bt-tone-${badge.tone}"><circle cx="${cx}" cy="${cy}" r="9.5"/><text x="${cx}" y="${cy + 3.8}" text-anchor="middle">${badge.letter}</text></g>`); });
    out.push(`<text class="bt-kind" x="${x + 38}" y="${ry + 26.5}">${esc((node.kind === "person" ? "Survivor" : node.kind === "law" ? "No will: intestacy" : kindLabel(node)).toUpperCase())}</text>`);
    out.push(`<text class="bt-name" x="${x + 16}" y="${ry + 50}">${esc(node.kind === "person" ? node.name : node.name)}</text>`);
    let ty = ry + 50;
    for (const line of recip.subtitleLines) { ty += 18; out.push(`<text class="bt-detail" x="${x + 16}" y="${ty}">${esc(line)}</text>`); }
    for (const line of recip.lines) {
      const tag = line.key ? ` data-line="${line.key}" data-amount="${line.amount}" data-prefix="${esc(line.prefix ?? "")}" data-suffix="${esc(line.suffix)}"` : "";
      if (line.tone === "sub") { ty += 17; out.push(`<text class="bt-detail"${tag} x="${x + 16}" y="${ty}">${esc(line.text)}</text>`); continue; }
      ty += 22; out.push(`<text class="bt-value${line.tone ? ` bt-tone-${line.tone}` : ""}"${tag} x="${x + 16}" y="${ty}">${esc(line.text)}</text>`);
    }
    out.push(`</g>`);
    boxes.push({ id: recip.id, x, y: ry, w: recipW, h });
  }
  out.push(`</svg>`);
  return { svg: out.join(""), width, height, geometry: { boxes, segments, labels: [], zones: [], crossings: 0, problems }, rows, routes: bands.map((b) => b.route) };
}
