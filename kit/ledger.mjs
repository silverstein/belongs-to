// QSBS ledger: one bar per taxpayer, gain against that taxpayer's cap. The
// visible consequence is the overflow: gain past the cap is taxed.
import { qsbsLedger, QSBS_RULES } from "./derive.mjs";
import { shortName, citeLabel } from "./model.mjs";
import { measure, wrap, esc, money, listJoin } from "./text.mjs";

export function renderQsbsLedger(model, spec, width) {
  const ledger = qsbsLedger(model, spec.event, spec.for);
  const left = 26, labelW = 300, right = 210;
  const barX = left + labelW + 16;
  const barW = width - barX - right - 26;
  const maxGain = Math.max(...ledger.rows.map((r) => Math.max(r.gain, r.cap)));
  const scale = barW / maxGain;
  const rowH = 70;
  const top = 64;
  const height = top + ledger.rows.length * rowH + 4;
  const capXOf = (row) => barX + row.cap * scale;
  const capX = capXOf(ledger.rows[0]);
  const sameCap = ledger.rows.every((r) => r.cap === ledger.rows[0].cap);
  const out = [];
  out.push(`<svg class="bt-figure bt-ledger" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="QSBS exclusion by taxpayer" xmlns="http://www.w3.org/2000/svg">`);
  out.push(`<defs><pattern id="bt-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="bt-hatch-bg" width="6" height="6"/><path class="bt-hatch-line" d="M0 0V6"/></pattern></defs>`);
  out.push(`<text class="bt-ledger-head" x="${left}" y="28">IF ${esc(shortName(ledger.issuer).toUpperCase())} SELLS AT $${ledger.event.pricePerShare.toFixed(2)} A SHARE</text>`);
  out.push(`<text class="bt-ledger-sub" x="${left}" y="48">${sameCap ? `Each taxpayer’s gain, against the ${esc(money(ledger.rows[0].cap))} that taxpayer can exclude` : "Each taxpayer’s gain, against that taxpayer’s own cap"}</text>`);
  if (sameCap) out.push(`<text class="bt-cap-label" x="${capX}" y="${top - 2}" text-anchor="middle">${esc(money(ledger.rows[0].cap))} cap</text>`);
  ledger.rows.forEach((row, i) => {
    const y = top + i * rowH + 12;
    const name = shortName(model.nodes[row.taxpayer]);
    const via = row.holders.map((h) => shortName(model.nodes[h.id]));
    out.push(`<text class="bt-ledger-name" x="${left}" y="${y + 13}">${esc(row.taxpayer === row.holders[0]?.id && row.holders.length === 1 ? name : `${name}`)}</text>`);
    const viaText = row.holders.length > 1 || row.holders[0].id !== row.taxpayer ? `Holds through ${listJoin(via)}` : `Holds directly`;
    wrap(viaText, "detail", labelW, 2).forEach((line, k) => out.push(`<text class="bt-ledger-via" x="${left}" y="${y + 32 + k * 15}">${esc(line)}</text>`));
    const within = Math.min(row.gain, row.cap) * scale;
    const over = row.over * scale;
    out.push(`<rect class="bt-bar-in" x="${barX}" y="${y}" width="${within}" height="22" rx="3"/>`);
    if (over > 0) out.push(`<rect class="bt-bar-over" x="${barX + within}" y="${y}" width="${over}" height="22" rx="3"/><path class="bt-bar-seam" d="M${barX + within} ${y}V${y + 22}"/>`);
    // The cap is a tick through each bar, so it never cuts a label.
    const rowCapX = capXOf(row);
    out.push(`<path class="bt-cap-rule" d="M${rowCapX} ${y - 5}V${y + 27}"/>`);
    if (!sameCap) out.push(`<text class="bt-cap-label" x="${rowCapX}" y="${y - 8}" text-anchor="middle">${esc(money(row.cap))} cap</text>`);
    const gainLabel = `${money(row.gain)} gain`;
    const gx = Math.max(barX + within + over, rowCapX) + 10;
    out.push(`<text class="bt-bar-label" x="${gx}" y="${y + 15.5}">${esc(gainLabel)}</text>`);
    const overText = over > 0 ? `${money(row.over)} over the cap is taxed` : `All of it within the cap`;
    out.push(`<text class="bt-bar-note${over > 0 ? " bt-tone-flag" : " bt-tone-ok"}" x="${barX}" y="${y + 40}">${esc(overText)}</text>`);
    out.push(`<text class="bt-ledger-excl" x="${width - 26}" y="${y + 13}" text-anchor="end">${esc(money(row.excludable))}</text>`);
    out.push(`<text class="bt-ledger-excl-sub" x="${width - 26}" y="${y + 31}" text-anchor="end">${row.excludable ? "can be excluded" : "not eligible"}</text>`);
  });
  const fy = top + ledger.rows.length * rowH + 10;
  const first = shortName(model.nodes[spec.for[0]]);
  const assumed = ledger.checklist.filter((c) => c.status !== "cited" && c.status !== "computed").length;
  const lowBasis = ledger.rows[0].basis * 10 < ledger.rows[0].cap;
  const fmt = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const band = ledger.rows[0].band;
  const start = ledger.rows[0].lots.map((l) => l.start).filter(Boolean).sort()[0];
  const capWhy = lowBasis ? `The cap is the larger of ${money(band.cap)} or 10 times what the shares cost; founder shares cost almost nothing, so it is ${money(band.cap)}. ` : "";
  const ruleWhy = band.cap === 10_000_000 ? `These shares date from ${fmt(start)}, before the July 2025 changes, so the cap is $10M and the shares need more than five years for a ${Math.round(band.tiers[0][1] * 100)}% exclusion. Stock acquired after July 4, 2025 gets a $15M cap and partial exclusions at three and four years.` : `These shares were acquired after July 4, 2025: a $15M cap, and 50%, 75% or 100% after three, four or five years.`;
  const trustStates = ledger.rows.map((r) => model.nodes[r.taxpayer]).filter((n) => n.kind === "trust" && n.trust?.trustee?.state);
  const trustNote = trustStates.length ? ` ${listJoin(trustStates.map((n) => shortName(n)))} ${trustStates.length > 1 ? "have" : "has"} a ${trustStates[0].trust.trustee.state} trustee, but where a trust owes state tax depends on the state: some look at the trustee, some at the beneficiaries (California looks at both), some at where the grantor lived.` : "";
  const gifts = ledger.rows.flatMap((r) => r.lots).filter((l) => l.acquired?.how === "gift").map((l) => l.acquired.date).sort();
  const giftNote = gifts.length ? ` The gifts were made ${fmt(gifts[0])}, well before these sale terms.` : "";
  const state = model.raw.jurisdiction;
  const stateNote = state?.label?.includes("no state income tax") ? `Federal tax only. ${state.state} has no state income tax; a state that doesn’t follow QSBS, such as California, would tax the full gain.` : "Federal tax only. Some states, such as California, tax the full gain anyway.";
  var totalHtml = `<div class="bt-total"><p class="bt-total-main">At $${ledger.event.pricePerShare} a share, ${esc(money(ledger.total))} can be excluded across ${ledger.rows.length} taxpayers. If ${esc(first)} held every share alone, the most would be ${esc(money(ledger.singleCap))}.</p><p class="bt-total-sub">${assumed ? `Counts only if the ${assumed} conditions marked ? below hold. ` : ""}${esc(capWhy + ruleWhy)} Assumes a taxable sale of stock for cash and no earlier exclusions from this company.${esc(giftNote)} ${esc(stateNote)}${esc(trustNote)}</p></div>`;
  out.push(`</svg>`);
  const mark = { cited: ["bt-mark-ok", "✓"], computed: ["bt-mark-ok", "✓"], assumed: ["bt-mark-q", "?"], missing: ["bt-mark-q", "?"], partial: ["bt-mark-q", "½"], fails: ["bt-mark-x", "✕"] };
  const checklist = `<div class="bt-check"><h4>What the exclusion depends on</h4><ul>${ledger.checklist.map((c) => {
    const [cls, glyph] = mark[c.status];
    const cite = c.status === "computed" ? "Worked out from the dates above" : c.status === "fails" ? "Not met" : c.status === "partial" ? "Partial exclusion only" : c.source?.doc ? citeLabel(model, c.source) : "Not in the documents; assumed";
    return `<li class="${c.status}"><span class="${cls}" aria-hidden="true">${glyph}</span><span>${esc(c.label)}</span><small>${esc(cite)}</small></li>`;
  }).join("")}</ul></div>`;
  return { svg: out.join(""), checklist: totalHtml + checklist, width, height, ledger };
}
