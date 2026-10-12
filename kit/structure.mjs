// Structure view: who holds what, as cards on a grid with orthogonal
// ownership lines. Placement comes from the view (the author decides the
// composition); routing, lanes, labels and crossings are computed here, and
// every box, segment and label is returned for the layout audit.
import { holdingsOf, holdingsBy, citeLabel, shortName, valueOf } from "./model.mjs";
import { STYLES, measure, wrap, esc, money, shares as fmtShares, pct, listJoin, inSentence } from "./text.mjs";
import { icon, iconFor } from "./icons.mjs";

const PAD = 14;
const LH = { kind: 16, name: 19, nameSm: 17, detail: 16.5, value: 19, cite: 15 };
const LABEL_ZONE = 24;
const LANE_STEP = 11;
const MIN_GAP = 64;
const RADIUS = 7;

const TONES = { flag: "flag", ask: "ask", info: "info" };

export function kindLabel(node) {
  switch (node.kind) {
    case "person": return "";
    case "trust": return `${node.trust?.revocable ? "Revocable" : "Irrevocable"} trust${node.since ? ` · ${node.since}` : ""}`;
    case "llc": return `LLC${node.since ? ` · ${node.since}` : ""}`;
    case "corp": return `${node.corp?.type ? `${node.corp.type} corporation` : "Corporation"}${node.since ? ` · ${node.since}` : ""}`;
    case "group": return "Other shareholders";
    case "home": return "Home";
    case "rental": return "Rental property";
    case "brokerage": return "Brokerage account";
    case "retirement": return "Retirement account";
    case "insurance": return "Life insurance";
    case "vehicle": return "Vehicle";
    case "bank": case "bank account": case "checking": case "savings": return "Bank account";
    case "stock": return "Stock";
    default: return node.kind;
  }
}

function nameList(model, entries) {
  return listJoin(entries.map((entry) => inSentence(shortName(model.nodes[entry.to ?? entry]))));
}

export function cardFacts(model, node) {
  const details = [];
  if (node.detail) details.push({ text: node.detail });
  if (node.kind === "person" && node.role) details.push({ text: node.role });
  if (node.trust?.trustees?.length) details.push({ text: `Trustees: ${nameList(model, node.trust.trustees)}` });
  if (node.trust?.beneficiaryText) details.push({ text: node.trust.beneficiaryText });
  if (node.trust?.trustee) details.push({ text: `Trustee: ${node.trust.trustee.name}${node.trust.trustee.state ? ` (${node.trust.trustee.state})` : ""}` });
  if (node.tax?.label) details.push({ text: node.tax.label, tone: "tax" });
  if (node.corp?.shares) details.push({ text: `${(node.corp.shares / 1e6).toFixed(0)}M shares outstanding` });
  const joint = holdingsOf(model, node.id).find((h) => h.joint);
  if (joint) details.push({ text: `Joint, with right of survivorship` });
  if (node.designation) {
    if (node.designation.source?.status === "unknown") details.push({ text: "Beneficiary: not in documents", tone: "ask" });
    else if (!(node.designation.primary ?? []).length) details.push({ text: "Beneficiary: none named", tone: "flag" });
    else {
      let text = `Beneficiary: ${nameList(model, node.designation.primary ?? [])}`;
      if (node.designation.contingent?.length) text += `, then ${nameList(model, node.designation.contingent)}`;
      details.push({ text });
    }
  }
  let value = null;
  if (!node.isAsset && ["llc", "trust"].includes(node.kind)) {
    const inside = valueOf(model, node.id);
    if (inside != null) value = { text: money(inside), basis: "held inside" };
  }
  if (node.isAsset && node.value) {
    value = node.value.usd == null ? { text: "Value not in documents", tone: "ask" } : { text: money(node.value.usd), basis: node.value.basis };
  }
  // Each card cites the facts it states, by name: how it is held (or
  // formed), and its tax status or beneficiary form when it shows one.
  const incoming = holdingsOf(model, node.id);
  const cites = [];
  if (node.kind !== "person") {
    if (incoming.length === 1) cites.push({ label: "Held", source: incoming[0].source });
    else if (node.source) cites.push({ label: "Formed", source: node.source });
    if (node.tax?.source) cites.push({ label: "Tax", source: node.tax.source });
    if (node.corp?.taxSource) cites.push({ label: "Tax", source: node.corp.taxSource });
    if (node.designation?.source && node.designation.source.doc) cites.push({ label: "Form", source: node.designation.source });
  }
  const cite = cites.map((c) => `${c.label}: ${citeLabel(model, c.source)}`).filter((t) => !t.endsWith(": "));
  return { kind: kindLabel(node), details, value, cite };
}

export function layoutCard(model, node, width, badges) {
  const facts = cardFacts(model, node);
  const inner = width - PAD * 2;
  if (node.kind === "person") {
    const nameLines = wrap(node.name, "name", width - 64 - PAD, 2);
    const detailLines = facts.details.flatMap((d) => wrap(d.text, "detail", width - 64 - PAD, 2).map((text) => ({ text, tone: d.tone })));
    const height = Math.max(56, 16 + nameLines.length * LH.name + detailLines.length * LH.detail + 10);
    return { node, facts, person: true, nameLines, detailLines, height, badges };
  }
  // Badges pin to the card's corner, so the kind line keeps its full width.
  const badgeRoom = 0;
  const kindRoom = inner - 20;
  const kindText = [facts.kind, facts.kind.replace(/ · \d{4}$/, ""), facts.kind.replace(/ · \d{4}$/, "").replace(/^(Revocable|Irrevocable|Retirement|Brokerage|Rental) /, "")]
    .find((text) => measure(text, "kind") <= kindRoom) ?? facts.kind.split(" ")[0];
  const nameStyle = measure(node.name, "name") > inner * 2 - 8 ? "nameSm" : "name";
  const nameLines = wrap(node.name, nameStyle, inner - (badgeRoom && !kindText ? badgeRoom : 0), 3);
  const detailLines = facts.details.flatMap((d) => wrap(d.text, "detail", inner, 3).map((text) => ({ text, tone: d.tone })));
  let valueLines = [];
  if (facts.value) {
    const { text, basis, tone } = facts.value;
    if (!basis) valueLines = wrap(text, "value", inner, 2).map((t) => ({ text: t, tone }));
    else if (measure(text, "value") + 6 + measure(basis, "detail") <= inner) valueLines = [{ text, basis, tone }];
    else valueLines = [{ text, tone }, { text: "", basis, tone }];
  }
  const citeLines = facts.cite.flatMap((c) => wrap(c, "cite", inner, 2));
  let height = PAD + (kindText ? LH.kind + 6 : 0) + nameLines.length * LH[nameStyle] + 2;
  if (detailLines.length) height += 4 + detailLines.length * LH.detail;
  if (valueLines.length) height += 6 + valueLines.reduce((sum, line) => sum + (line.text ? LH.value : LH.detail), 0);
  if (citeLines.length) height += 12 + citeLines.length * LH.cite;
  height += PAD - 2;
  return { node, facts, kindText, nameStyle, nameLines, detailLines, valueLines, citeLines, height: Math.ceil(height), badges };
}

function cardClass(node, badges) {
  const tone = badges.find((b) => b.tone === "flag") ? "flag" : badges.find((b) => b.tone === "ask") ? "ask" : "";
  return `bt-card bt-k-${node.kind}${node.isAsset ? " bt-asset" : ""}${tone ? ` bt-t-${tone}` : ""}`;
}

export function drawCard(card, x, y, width) {
  const { node, badges } = card;
  const out = [];
  const h = card.height;
  const cls = cardClass(node, badges);
  out.push(`<g class="bt-node" data-id="${esc(node.id)}" tabindex="0" role="group" aria-label="${esc(node.name)}">`);
  if (card.person) {
    out.push(`<rect class="${cls}" x="${x}" y="${y}" width="${width}" height="${h}" rx="${h / 2}"/>`);
    const initials = node.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    out.push(`<circle class="bt-disc" cx="${x + 28}" cy="${y + h / 2}" r="17"/>`);
    out.push(`<text class="bt-initials" x="${x + 28}" y="${y + h / 2 + 4.5}" text-anchor="middle">${esc(initials)}</text>`);
    let ty = y + (h - (card.nameLines.length * LH.name + card.detailLines.length * LH.detail)) / 2 + 14.5;
    for (const line of card.nameLines) { out.push(`<text class="bt-name" x="${x + 54}" y="${ty}">${esc(line)}</text>`); ty += LH.name; }
    for (const line of card.detailLines) { out.push(`<text class="bt-detail" x="${x + 54}" y="${ty - 2}">${esc(line.text)}</text>`); ty += LH.detail; }
  } else {
    const rx = node.isAsset ? 10 : node.kind === "trust" ? 3 : node.kind === "group" ? 10 : 2;
    out.push(`<rect class="${cls}" x="${x}" y="${y}" width="${width}" height="${h}" rx="${rx}"/>`);
    if (node.kind === "trust") out.push(`<path class="bt-deco" d="M${x + rx} ${y + 4.5}H${x + width - rx}"/>`);
    if (node.kind === "corp") out.push(`<rect class="bt-deco" x="${x + 3.5}" y="${y + 3.5}" width="${width - 7}" height="${h - 7}" rx="1"/>`);
    let ty = y + PAD;
    if (card.kindText) {
      out.push(icon(iconFor(node), x + PAD - 1, ty - 2, 15, "bt-icon"));
      out.push(`<text class="bt-kind" x="${x + PAD + 20}" y="${ty + 9.5}">${esc(card.kindText.toUpperCase())}</text>`);
      ty += LH.kind + 6;
    }
    for (const line of card.nameLines) { ty += LH[card.nameStyle]; out.push(`<text class="bt-name${card.nameStyle === "nameSm" ? " bt-name-sm" : ""}" x="${x + PAD}" y="${ty - 4}">${esc(line)}</text>`); }
    ty += 2;
    if (card.detailLines.length) { ty += 4; for (const line of card.detailLines) { ty += LH.detail; out.push(`<text class="bt-detail${line.tone ? ` bt-tone-${line.tone}` : ""}" x="${x + PAD}" y="${ty - 4}">${esc(line.text)}</text>`); } }
    if (card.valueLines.length) {
      ty += 6;
      for (const line of card.valueLines) {
        ty += line.text ? LH.value : LH.detail;
        const basis = line.basis ? `<tspan class="bt-basis"${line.text ? ` dx="6"` : ""}>${esc(line.basis)}</tspan>` : "";
        out.push(`<text class="bt-value${line.tone ? ` bt-tone-${line.tone}` : ""}" x="${x + PAD}" y="${ty - 5}">${esc(line.text)}${basis}</text>`);
      }
    }
    if (card.citeLines.length) {
      ty += 6;
      out.push(`<path class="bt-cite-rule" d="M${x + PAD} ${ty}H${x + width - PAD}"/>`);
      ty += 6;
      for (const line of card.citeLines) { ty += LH.cite; out.push(`<text class="bt-cite" x="${x + PAD}" y="${ty - 4}">${esc(line)}</text>`); }
    }
  }
  badges.forEach((badge, i) => {
    const cx = card.person ? x + width - 22 - i * 22 : x + width - 3 - i * 23, cy = card.person ? y + h / 2 : y + 3;
    out.push(`<g class="bt-badge bt-tone-${badge.tone}"><circle cx="${cx}" cy="${cy}" r="9.5"/><text x="${cx}" y="${cy + 3.8}" text-anchor="middle">${badge.letter}</text></g>`);
  });
  out.push(`</g>`);
  return out.join("");
}

// Orthogonal polyline with rounded corners.
export function roundedPath(points, r = RADIUS) {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py), outLen = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * rr, ay = cy - ((cy - py) / inLen) * rr;
    const bx = cx + ((nx - cx) / outLen) * rr, by = cy + ((ny - cy) / outLen) * rr;
    d += ` L${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`;
  }
  const last = pts.at(-1);
  d += ` L${last[0]} ${last[1]}`;
  return d;
}

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

export function renderStructure(model, view, { noteBadges }) {
  const W = view.cardWidth ?? 184;
  const PITCH = view.pitch ?? W + 24;
  const MARGIN = 26;
  const place = view.place;
  const ids = Object.keys(place);
  const cards = {};
  for (const id of ids) cards[id] = layoutCard(model, model.nodes[id], W, noteBadges.get(id) ?? []);
  const rowOf = (id) => place[id][1];
  const rows = [...new Set(ids.map(rowOf))].sort((a, b) => a - b);
  const xOf = (id) => MARGIN + place[id][0] * PITCH;
  const cxOf = (id) => xOf(id) + W / 2;

  // Edges: holdings among placed nodes, plus authored relations.
  const edges = [];
  for (const h of model.holdings) {
    if (!place[h.held]) continue;
    for (const holder of h.holders) {
      if (!place[holder]) continue;
      let label;
      if (h.joint) label = "Joint";
      else if (h.shares != null) label = `${fmtShares(h.shares)} · ${pct(h.fraction)}`;
      else label = pct(h.fraction);
      edges.push({ from: holder, to: h.held, label, style: "own", joint: h.joint });
    }
  }
  const relCount = (label) => (view.relations ?? []).filter((r) => r.label === label).length;
  for (const rel of view.relations ?? []) edges.push({ from: rel.from, to: rel.to, label: relCount(rel.label) >= 3 ? null : rel.label, style: "rel" });
  const problems = [];
  for (const e of edges) if (rowOf(e.to) <= rowOf(e.from)) problems.push(`edge ${e.from} → ${e.to} does not point down a row`);

  // Trees: merge (many parents, one child) or split (one parent, many children).
  const outCount = (id) => edges.filter((e) => e.from === id).length;
  const trees = [];
  const used = new Set();
  for (const child of ids) {
    const incoming = edges.filter((e) => e.to === child && e.style === "own" && !e.joint);
    if (incoming.length >= 2 && incoming.every((e) => outCount(e.from) === 1) && new Set(incoming.map((e) => rowOf(e.from))).size === 1) {
      trees.push({ type: "merge", child, edges: incoming, gap: rowOf(incoming[0].from) });
      incoming.forEach((e) => used.add(e));
    }
  }
  for (const parent of ids) {
    // Ownership and authored relations (trustee, created) get separate
    // trees, so a dashed line never rides on a solid one.
    for (const style of ["own", "rel"]) {
      const outgoing = edges.filter((e) => e.from === parent && e.style === style && !used.has(e));
      if (outgoing.length) trees.push({ type: "split", parent, edges: outgoing, gap: rowOf(parent), style });
    }
  }

  // Child ports: one per incoming tree, ordered by where it comes from.
  const portsByChild = new Map();
  for (const tree of trees) {
    const targets = tree.type === "merge" ? [{ child: tree.child, srcX: tree.edges.reduce((s, e) => s + cxOf(e.from), 0) / tree.edges.length, tree, edge: null }] : tree.edges.map((e) => ({ child: e.to, srcX: cxOf(tree.parent), tree, edge: e }));
    for (const t of targets) { if (!portsByChild.has(t.child)) portsByChild.set(t.child, []); portsByChild.get(t.child).push(t); }
  }
  const portX = new Map();
  for (const [child, list] of portsByChild) {
    list.sort((a, b) => a.srcX - b.srcX);
    const spacing = Math.min(18, (W - 40) / Math.max(1, list.length - 1));
    const ports = list.map((_, i) => cxOf(child) + (i - (list.length - 1) / 2) * spacing);
    // If one line comes from straight above, shift the ports so it drops
    // without a jog (keeping their spacing and staying on the card).
    const lo = xOf(child) + 16, hi = xOf(child) + W - 16;
    const straight = list.findIndex((t, i) => t.srcX >= lo && t.srcX <= hi && Math.abs(t.srcX - ports[i]) < spacing);
    if (straight >= 0) {
      const delta = list[straight].srcX - ports[straight];
      if (ports.every((p) => p + delta >= lo && p + delta <= hi)) ports.forEach((p, i) => (ports[i] = p + delta));
    }
    list.forEach((t, i) => portX.set(t, ports[i]));
  }
  const portFor = (tree, edge) => {
    const child = tree.type === "merge" ? tree.child : edge.to;
    return portX.get(portsByChild.get(child).find((t) => t.tree === tree && (tree.type === "merge" || t.edge === edge)));
  };
  for (const tree of trees) {
    tree.ups = tree.type === "merge" ? tree.edges.map((e) => cxOf(e.from)) : [cxOf(tree.parent)];
    tree.downs = tree.type === "merge" ? [portFor(tree, null)] : tree.edges.map((e) => portFor(tree, e));
    const xs = [...tree.ups, ...tree.downs];
    tree.lo = Math.min(...xs); tree.hi = Math.max(...xs);
    tree.flat = tree.hi - tree.lo < 0.5;
  }

  // Lanes per gap, ordered to minimize crossings.
  const lanesByGap = new Map();
  for (const gap of rows) {
    const inGap = trees.filter((t) => t.gap === gap && !t.flat);
    const flats = trees.filter((t) => t.gap === gap && t.flat);
    const crossings = (order) => {
      let count = 0;
      order.forEach((a, ia) => {
        for (const [ib, b] of order.entries()) {
          if (a === b) continue;
          for (const x of b.ups) if (x > a.lo + 0.5 && x < a.hi - 0.5 && ia < ib) count++;
          for (const x of b.downs) if (x > a.lo + 0.5 && x < a.hi - 0.5 && ia > ib) count++;
        }
        for (const f of flats) if (f.ups[0] > a.lo + 0.5 && f.ups[0] < a.hi - 0.5) count++;
      });
      return count;
    };
    let best = inGap, bestCount = crossings(inGap);
    if (inGap.length <= 7) for (const order of permutations(inGap)) { const c = crossings(order); if (c < bestCount) { best = order; bestCount = c; } }
    lanesByGap.set(gap, { order: best, crossings: bestCount });
  }

  // Vertical layout.
  const rowHeight = new Map(rows.map((r) => [r, Math.max(...ids.filter((id) => rowOf(id) === r).map((id) => cards[id].height))]));
  const zoneTopRows = new Set((view.zones ?? []).map((z) => Math.min(...z.members.map(rowOf))));
  // A zone whose top cards receive labelled lines grows upward so the labels sit inside it.
  const zoneTopMembers = (z) => z.members.filter((id) => rowOf(id) === Math.min(...z.members.map(rowOf)));
  const zoneLifted = new Set((view.zones ?? []).filter((z) => edges.some((e) => e.label && zoneTopMembers(z).includes(e.to) && !z.members.includes(e.from))).map((z) => z.id));
  const liftRows = new Set((view.zones ?? []).filter((z) => zoneLifted.has(z.id)).map((z) => Math.min(...z.members.map(rowOf))));
  // A zone that ends on a row pushes that gap's lanes down past its border.
  const zoneBottomRows = new Set((view.zones ?? []).map((z) => Math.max(...z.members.map(rowOf))));
  const laneShift = (r) => (zoneBottomRows.has(r) ? 22 : 0);
  let y = 30 + (zoneTopRows.has(rows[0]) ? 22 : 0);
  const rowTop = new Map();
  rows.forEach((r, i) => {
    rowTop.set(r, y);
    const lanes = lanesByGap.get(r)?.order.length ?? 0;
    const zoneRoom = i + 1 < rows.length && zoneTopRows.has(rows[i + 1]) ? (liftRows.has(rows[i + 1]) ? 34 : 14) : 0;
    const gap = Math.max(MIN_GAP, LABEL_ZONE * 2 + Math.max(0, lanes - 1) * LANE_STEP + 12 + zoneRoom + laneShift(r));
    y += rowHeight.get(r) + gap;
  });
  const topOf = (id) => rowTop.get(rowOf(id));
  const bottomOf = (id) => topOf(id) + cards[id].height;

  // Paths.
  const segments = [];
  const labels = [];
  const paths = [];
  for (const [gap, { order }] of lanesByGap) {
    const gapTop = rowTop.get(gap) + rowHeight.get(gap);
    order.forEach((tree, i) => { tree.laneY = gapTop + LABEL_ZONE + 6 + laneShift(gap) + i * LANE_STEP; });
  }
  for (const tree of trees) {
    const laneY = tree.flat ? null : tree.laneY;
    const dashed = tree.edges.every((e) => e.style === "rel");
    const cls = `bt-edge${dashed ? " bt-edge-rel" : ""}`;
    if (tree.type === "split") {
      const px = cxOf(tree.parent), py = bottomOf(tree.parent);
      tree.edges.forEach((edge, i) => {
        const cx = tree.downs[i], cy = topOf(edge.to);
        const pts = tree.flat ? [[px, py], [cx, cy]] : [[px, py], [px, laneY], [cx, laneY], [cx, cy]];
        paths.push({ d: roundedPath(pts), cls: `${cls}${edge.style === "rel" ? " bt-edge-rel" : ""}`, end: [cx, cy], from: edge.from, to: edge.to });
        for (let k = 0; k < pts.length - 1; k++) segments.push({ a: pts[k], b: pts[k + 1], from: edge.from, to: edge.to });
        if (edge.label && !(edge.joint && tree.edges.indexOf(edge) !== i)) labels.push({ text: edge.label, x: cx, y: cy - 13, edge, rel: edge.style === "rel" });
      });
    } else {
      const cx = tree.downs[0], cy = topOf(tree.child);
      tree.edges.forEach((edge, i) => {
        const px = tree.ups[i], py = bottomOf(edge.from);
        const pts = [[px, py], [px, laneY], [cx, laneY], [cx, cy]];
        paths.push({ d: roundedPath(pts), cls, end: [cx, cy], from: edge.from, to: edge.to, merge: true });
        for (let k = 0; k < pts.length - 1; k++) segments.push({ a: pts[k], b: pts[k + 1], from: edge.from, to: edge.to });
        labels.push({ text: edge.label, x: px, y: py + 13, edge, below: edge.from });
      });
    }
  }
  // Lines into one card that say the same thing ("Joint", "Trustee") share
  // one label, centered between them.
  const groups = new Map();
  for (const label of labels) {
    if (label.below) continue;
    const key = `${label.edge.to}|${label.text}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(label);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const merged = { ...list[0], x: list.reduce((s, l) => s + l.x, 0) / list.length };
    for (const label of list) labels.splice(labels.indexOf(label), 1);
    labels.push(merged);
  }

  // Zones.
  const zones = (view.zones ?? []).map((zone) => {
    const zp = zone.tone === "ok" ? 16 : 12;
    const xs = zone.members.flatMap((id) => [xOf(id), xOf(id) + W]);
    const ys = zone.members.flatMap((id) => [topOf(id), bottomOf(id)]);
    const lift = zoneLifted.has(zone.id) ? 22 : 0;
    return { ...zone, x: Math.min(...xs) - zp, y: Math.min(...ys) - zp - 8 - lift, w: Math.max(...xs) - Math.min(...xs) + zp * 2, h: Math.max(...ys) - Math.min(...ys) + zp * 2 + 8 + lift };
  });

  // Gaps: something that should be inside a zone but isn't, drawn as a
  // dashed arrow that stops at the zone's edge.
  const gapPaths = [];
  for (const gap of view.gaps ?? []) {
    const zone = zones.find((z) => z.id === gap.zone);
    if (!zone || !place[gap.from]) { problems.push(`gap from ${gap.from} to zone ${gap.zone} does not resolve`); continue; }
    const cardY = topOf(gap.from) + Math.min(46, cards[gap.from].height / 2);
    const leftOf = xOf(gap.from) + W <= zone.x;
    const x0 = leftOf ? xOf(gap.from) + W : xOf(gap.from);
    const x1 = leftOf ? zone.x - 2 : zone.x + zone.w + 2;
    const w = measure(gap.label, "chip") + 14;
    if (Math.abs(x1 - x0) < w + 12) problems.push(`gap arrow from ${gap.from} is too short (${Math.round(Math.abs(x1 - x0))}px) for its label`);
    gapPaths.push({ d: `M${x0} ${cardY}H${x1}`, label: gap.label, x: (x0 + x1) / 2, y: cardY });
    segments.push({ a: [x0, cardY], b: [x1, cardY], from: gap.from, to: gap.zone });
    labels.push({ text: gap.label, x: (x0 + x1) / 2, y: cardY - 15, edge: { to: gap.zone }, gap: true });
  }

  for (const label of labels) {
    if (!label.below) continue;
    const zone = zones.find((z) => z.members.includes(label.below) && z.y + z.h > label.y - 9);
    if (zone) label.y = zone.y + zone.h + 12;
  }
  const width = Math.max(...ids.map((id) => xOf(id) + W)) + MARGIN;
  const height = Math.max(...ids.map(bottomOf)) + 30;

  const svg = [];
  svg.push(`<svg class="bt-figure" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(view.title)}" xmlns="http://www.w3.org/2000/svg">`);
  svg.push(`<defs><marker id="bt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="bt-arrowhead" d="M1 1.5L9 5L1 8.5z"/></marker><marker id="bt-arrow-gap" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="bt-arrowhead-gap" d="M1 1.5L9 5L1 8.5z"/></marker></defs>`);
  for (const zone of zones) {
    svg.push(`<g class="bt-zone bt-zone-${zone.tone}" data-zone="${esc(zone.id)}"><rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="${zone.tone === "ok" ? 18 : 14}"/>`);
    // The tab sits on the top border wherever no line crosses it: left, then right.
    const lw = measure(zone.label, "zone") + 20;
    const clear = (tx) => !segments.some((seg) => { const minX = Math.min(seg.a[0], seg.b[0]), maxX = Math.max(seg.a[0], seg.b[0]), minY = Math.min(seg.a[1], seg.b[1]), maxY = Math.max(seg.a[1], seg.b[1]); return maxX > tx - 3 && minX < tx + lw + 3 && maxY > zone.y - 10 && minY < zone.y + 10; });
    const tx = [zone.x + 14, zone.x + zone.w - 14 - lw].find(clear) ?? zone.x + 14;
    svg.push(`<rect class="bt-zone-tab" x="${tx}" y="${zone.y - 10}" width="${lw}" height="20" rx="10"/><text class="bt-zone-label" x="${tx + 10}" y="${zone.y + 4}">${esc(zone.label)}</text></g>`);
    zone.labelBox = { x: tx, y: zone.y - 10, w: lw, h: 20 };
  }
  svg.push(`<g class="bt-edges">`);
  for (const p of paths) svg.push(`<path class="bt-halo" d="${p.d}"/>`);
  for (const p of paths) svg.push(`<path class="${p.cls}" d="${p.d}" data-from="${esc(p.from)}" data-to="${esc(p.to)}" marker-end="url(#bt-arrow)"/>`);
  for (const gp of gapPaths) svg.push(`<path class="bt-halo" d="${gp.d}"/><path class="bt-gap" d="${gp.d}" marker-end="url(#bt-arrow-gap)"/>`);
  svg.push(`</g>`);
  const labelBoxes = [];
  for (const label of labels) {
    const w = measure(label.text, "chip") + 12;
    const box = { x: label.x - w / 2, y: label.y - 9, w, h: 18 };
    labelBoxes.push({ ...box, text: label.text });
    svg.push(`<g class="bt-chip${label.rel ? " bt-chip-rel" : ""}${label.gap ? " bt-chip-gap" : ""}"><rect x="${box.x}" y="${box.y}" width="${w}" height="18" rx="9"/><text x="${label.x}" y="${label.y + 3.8}" text-anchor="middle">${esc(label.text)}</text></g>`);
  }
  for (const id of ids) svg.push(drawCard(cards[id], xOf(id), topOf(id), W));
  svg.push(`</svg>`);

  const boxes = ids.map((id) => ({ id, x: xOf(id), y: topOf(id), w: W, h: cards[id].height }));
  const gapCrossings = [...lanesByGap.values()].reduce((s, g) => s + g.crossings, 0);
  return { svg: svg.join(""), width, height, geometry: { boxes, segments, labels: labelBoxes, zones, crossings: gapCrossings, problems } };
}
