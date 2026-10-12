// Layout audit on the geometry a renderer returns. A figure ships at zero:
// no card overlaps a card, no line passes through a card it does not
// belong to, no label sits on a card, line or another label, and no card
// that is not in a zone sits inside it.
const inset = (box, d) => ({ x: box.x + d, y: box.y + d, w: box.w - 2 * d, h: box.h - 2 * d });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function segmentHitsBox([x1, y1], [x2, y2], box) {
  // Axis-aligned segments only; curves are sampled by the caller.
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  return maxX > box.x && minX < box.x + box.w && maxY > box.y && minY < box.y + box.h;
}

function sample(seg) {
  if (!seg.curve) return [[seg.a, seg.b]];
  const out = [];
  const [x0, y0] = seg.a, [x3, y3] = seg.b;
  const mid = (x0 + x3) / 2;
  let prev = seg.a;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    const x = u ** 3 * x0 + 3 * u * u * t * mid + 3 * u * t * t * mid + t ** 3 * x3;
    const y = u ** 3 * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y3 + t ** 3 * y3;
    out.push([prev, [x, y]]);
    prev = [x, y];
  }
  return out;
}

export function auditLayout(geometry, { zones = [] } = {}) {
  const problems = [...(geometry.problems ?? [])];
  const { boxes, segments, labels } = geometry;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(inset(boxes[i], -6), boxes[j])) problems.push(`cards too close or overlapping: ${boxes[i].id} and ${boxes[j].id}`);
  for (const seg of segments) {
    for (const box of boxes) {
      if (box.id === seg.from || box.id === seg.to || box.id === `station-${seg.from}`) continue;
      if (sample(seg).some(([a, b]) => segmentHitsBox(a, b, inset(box, 1)))) problems.push(`line ${seg.from} → ${seg.to ?? ""} passes through ${box.id}`);
    }
  }
  for (const seg of segments) for (const zone of geometry.zones ?? []) if (zone.labelBox && sample(seg).some(([a, b]) => segmentHitsBox(a, b, zone.labelBox))) problems.push(`line ${seg.from} → ${seg.to ?? ""} runs through zone tab "${zone.label}"`);
  for (let i = 0; i < labels.length; i++) {
    for (const box of boxes) if (overlap(labels[i], box)) problems.push(`label "${labels[i].text}" sits on card ${box.id}`);
    for (let j = i + 1; j < labels.length; j++) if (overlap(inset(labels[i], -3), labels[j])) problems.push(`labels "${labels[i].text}" and "${labels[j].text}" collide`);
    for (const zone of geometry.zones ?? []) {
      if (zone.labelBox && overlap(labels[i], zone.labelBox)) problems.push(`label "${labels[i].text}" sits on zone tab "${zone.label}"`);
      const l = labels[i];
      const inside = l.x >= zone.x && l.x + l.w <= zone.x + zone.w && l.y >= zone.y && l.y + l.h <= zone.y + zone.h;
      if (overlap(l, zone) && !inside) problems.push(`label "${l.text}" sits on the border of zone "${zone.label}"`);
    }
  }
  for (const zone of geometry.zones ?? []) {
    for (const box of boxes) {
      if (zone.members.includes(box.id)) continue;
      if (overlap(inset(box, -4), zone)) problems.push(`${box.id} is not in zone "${zone.label}" but touches it`);
    }
    if (zone.labelBox) for (const box of boxes) if (overlap(zone.labelBox, box)) problems.push(`zone tab "${zone.label}" sits on ${box.id}`);
    for (const other of geometry.zones) if (other !== zone && other.labelBox && zone.labelBox && overlap(zone.labelBox, other.labelBox)) problems.push(`zone tabs "${zone.label}" and "${other.label}" collide`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], crossings: geometry.crossings ?? 0 };
}
