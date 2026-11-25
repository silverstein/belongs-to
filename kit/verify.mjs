// The facts audit. A figure ships only when this passes: every reference
// resolves, ownership closes to 100%, nothing is orphaned, every fact is cited
// or openly marked unknown/assumed/illustrative, and every high-severity
// finding the derivations produce is surfaced by a note in some view.
import { isCited, holdingsOf, taxpayerOf, citeLabel, shortName, valueOf, noteTargets } from "./model.mjs";
import { deathRoutes, qsbsLedger, QSBS_CONDITIONS, QSBS_RULES, DISCLAIMER_RULE } from "./derive.mjs";

// The pages a partial read covers, from its readNote ("pp. 1 to 6, 20 and
// 27 of 40"). Null when the note names no pages, so nothing is enforced.
export function pagesCovered(readNote) {
  if (!readNote) return null;
  const text = String(readNote).replace(/\bof\s+\d+\b/g, "");
  if (!/\d/.test(text)) return null;
  const pages = new Set();
  for (const m of text.matchAll(/(\d+)\s*(?:to|through|-|–)\s*(\d+)/g)) for (let p = +m[1]; p <= +m[2]; p++) pages.add(p);
  for (const m of text.replace(/(\d+)\s*(?:to|through|-|–)\s*(\d+)/g, " ").matchAll(/\d+/g)) pages.add(+m[0]);
  return pages;
}
// The pages a citation names: "p. 21", "pp. 3 to 6", "Art. 4C, p. 7".
export function pagesCited(at) {
  const out = [];
  for (const m of String(at ?? "").matchAll(/\bpp?\.\s*(\d+)(?:\s*(?:to|through|-|–)\s*(\d+))?/g)) { const a = +m[1], b = m[2] ? +m[2] : a; for (let p = a; p <= b; p++) out.push(p); }
  return out;
}

const EPS = 1e-9;

export function verify(model) {
  const errors = [];
  const open = []; // facts shown as unknown, assumed or illustrative
  const findings = []; // derived conditions a reader must see
  const checks = [];
  const { nodes, holdings, documents } = model;
  const check = (name, problems) => { checks.push({ name, passed: problems.length === 0, problems }); errors.push(...problems.map((p) => `${name}: ${p}`)); };

  // 1. References
  const refProblems = [];
  const need = (id, where) => { if (!nodes[id]) refProblems.push(`${where} names "${id}", which is not a party or asset`); };
  for (const h of holdings) { h.holders.forEach((id) => need(id, `holding #${h.index}`)); need(h.held, `holding #${h.index}`); if (!h.holders.length) refProblems.push(`holding #${h.index} has no holder`); }
  for (const node of Object.values(nodes)) {
    for (const tier of ["primary", "contingent"]) for (const entry of node.designation?.[tier] ?? []) need(entry.to, `${node.id} designation`);
    for (const id of node.trust?.grantors ?? []) need(id, `${node.id} grantors`);
    for (const id of node.trust?.trustees ?? []) need(id, `${node.id} trustees`);
    if (node.will?.residueTo) need(node.will.residueTo, `${node.id} will`);
    if (node.trustSchedule) { need(node.trustSchedule.trust, `${node.id} trustSchedule`); if (nodes[node.trustSchedule.trust] && nodes[node.trustSchedule.trust].kind !== "trust") refProblems.push(`${node.id} trustSchedule names "${node.trustSchedule.trust}", which is not a trust`); }
    if (node.tax?.treatedAs && node.tax.treatedAs !== "self") need(node.tax.treatedAs, `${node.id} tax owner`);
  }
  const sources = [];
  const collect = (fact, where) => { if (fact && typeof fact === "object") { if (fact.source) sources.push({ source: fact.source, where }); } };
  for (const h of holdings) { collect(h, `holding ${h.holders.join("+")} → ${h.held}`); collect(h.acquired, `acquisition ${h.holders.join("+")} → ${h.held}`); }
  for (const node of Object.values(nodes)) {
    collect(node, node.id);
    for (const key of ["value", "designation", "tax", "will", "corp", "llc", "trustSchedule"]) collect(node[key], `${node.id}.${key}`);
    collect(node.trust?.onDeath, `${node.id}.trust.onDeath`);
    collect(node.trust?.survivorship, `${node.id}.trust.survivorship`);
    if (node.detail && typeof node.detail === "object") collect(node.detail, `${node.id}.detail`);
    for (const [i, claim] of (node.claims ?? []).entries()) collect(claim, `${node.id}.claims[${i}]`);
    for (const [key, fact] of Object.entries(node.qsbs ?? {})) collect(fact, `${node.id}.qsbs.${key}`);
  }
  for (const event of Object.values(model.events)) collect(event, `event ${event.kind}`);
  for (const { source, where } of sources) if (source.doc && !documents[source.doc]) refProblems.push(`${where} cites document "${source.doc}", which is not listed`);
  check("references resolve", refProblems);

  // 1b. Intake: every document says whether it was read, a citation never
  // points into one that wasn't, and every "not in the documents" claim is
  // backed by a record of having looked.
  const intakeProblems = [];
  const READ = ["read", "partial", "unreadable", "not-provided"];
  for (const [id, doc] of Object.entries(documents)) {
    if (!doc.read) intakeProblems.push(`document "${id}" has no read status (read, partial, unreadable or not-provided)`);
    else if (!READ.includes(doc.read)) intakeProblems.push(`document "${id}" has read status "${doc.read}", which is not one of ${READ.join(", ")}`);
    if (doc.read === "partial" && !doc.readNote) intakeProblems.push(`document "${id}" is partially read but readNote does not say which pages`);
    if (doc.signed != null && !["signed", "unsigned", "unknown"].includes(doc.signed)) intakeProblems.push(`document "${id}" has signed: "${doc.signed}"; it is signed, unsigned or unknown`);
  }
  // A citation into a document read in part must land on a page that was read.
  const pageOk = (docId, at) => { const covered = pagesCovered(documents[docId]?.readNote); if (documents[docId]?.read !== "partial" || !covered) return true; return pagesCited(at).every((p) => covered.has(p)); };
  for (const { source, where } of sources) {
    const doc = source.doc && documents[source.doc];
    if (doc && ["unreadable", "not-provided"].includes(doc.read)) intakeProblems.push(`${where} cites "${source.doc}", which was ${doc.read === "unreadable" ? "not readable" : "not provided"}`);
    if (doc && !pageOk(source.doc, source.at)) intakeProblems.push(`${where} cites "${source.doc}" at ${source.at}, outside the pages its readNote says were read (${doc.readNote})`);
  }
  const intake = model.raw.intake;
  const unknownFacts = sources.filter(({ source }) => source.status === "unknown");
  const unknownForms = holdings.filter((h) => h.formUnknown);
  for (const h of unknownForms) if (h.holders.length < 2) intakeProblems.push(`holding → ${h.held} has form "unknown" with one holder; that form is for two or more names whose title form the documents don't show`);
  if (unknownFacts.length || unknownForms.length || model.raw.notInDocuments) {
    if (!intake?.lookedFor?.length) intakeProblems.push(`facts are marked "not in the documents" but intake.lookedFor does not record what was searched`);
  }
  for (const item of intake?.lookedFor ?? []) {
    if (!item.what) intakeProblems.push(`an intake.lookedFor entry has no "what"`);
    if (!["found", "missing", "unreadable"].includes(item.result)) intakeProblems.push(`intake.lookedFor "${item.what}" needs result found, missing or unreadable`);
    if (item.result === "found" && !item.doc) intakeProblems.push(`intake.lookedFor "${item.what}" is found but names no document`);
    if (item.doc && !documents[item.doc]) intakeProblems.push(`intake.lookedFor "${item.what}" names document "${item.doc}", which is not listed`);
  }
  if (model.raw.notInDocuments) intakeProblems.push(`notInDocuments is hand-written; move each entry into intake.lookedFor with result "missing" so the footer is derived from the search`);
  check("intake recorded", intakeProblems);

  // 2. Every fact is cited, or openly marked
  const citeProblems = [];
  for (const h of holdings) if (!isCited(h.source)) citeProblems.push(`holding ${h.holders.join("+")} → ${h.held} has no source`);
  for (const node of Object.values(nodes)) {
    if (node.value && !isCited(node.value.source)) citeProblems.push(`${node.id} value has no source`);
    if (node.designation && !isCited(node.designation.source)) citeProblems.push(`${node.id} beneficiary designation has no source`);
    if (node.tax && !isCited(node.tax.source)) citeProblems.push(`${node.id} tax treatment has no source`);
    if (node.will && !isCited(node.will.source)) citeProblems.push(`${node.id} will has no source`);
    if (node.trustSchedule && !isCited(node.trustSchedule.source)) citeProblems.push(`${node.id} trustSchedule has no source (cite the schedule's page)`);
    if (node.trust?.survivorship && !isCited(node.trust.survivorship.source)) citeProblems.push(`${node.id} trust.survivorship has no source (cite the article that ends survivorship for listed property)`);
    if (node.detail && typeof node.detail === "object" && (!node.detail.text || !isCited(node.detail.source))) citeProblems.push(`${node.id} detail needs text and a source, or write it as a plain label string`);
    for (const [i, claim] of (node.claims ?? []).entries()) if (!claim.text || !isCited(claim.source)) citeProblems.push(`${node.id} claims[${i}] needs text and a source`);
    if (node.virtual) continue;
    if (node.trust?.onDeath && !isCited(node.trust.onDeath.source)) citeProblems.push(`${node.id} trust terms on death have no source`);
    if (!node.isAsset && node.kind !== "person" && !isCited(node.source)) citeProblems.push(`${node.id} has no formation document`);
  }
  for (const { source, where } of sources) if (source.status) open.push({ where, status: source.status, note: source.note ?? citeLabel(model, source) });
  check("every fact cited or marked", citeProblems);

  // 3. Ownership closes. A missing or malformed share would otherwise become NaN
  // and slip past the sum, so every fraction and share count is checked first.
  const closeProblems = [];
  const okFraction = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1 + EPS;
  const okShares = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 && Number.isInteger(v);
  for (const h of holdings) {
    if (h.joint || h.formUnknown) continue;
    if (h.shares != null) { if (!okShares(h.shares)) closeProblems.push(`holding ${h.holders.join("+")} → ${h.held}: shares must be a positive whole number, got ${JSON.stringify(h.shares)}`); }
    else if (!okFraction(h.share)) closeProblems.push(`holding ${h.holders.join("+")} → ${h.held}: share must be a number above 0 and at most 1, got ${JSON.stringify(h.share)}`);
  }
  for (const node of Object.values(nodes)) for (const tier of ["primary", "contingent"]) for (const e of node.designation?.[tier] ?? []) {
    if (!okFraction(e.share)) closeProblems.push(`${node.id} ${tier} beneficiary ${e.to}: share must be a number above 0 and at most 1, got ${JSON.stringify(e.share)}`);
  }
  const heldIds = new Set(holdings.map((h) => h.held));
  for (const id of heldIds) {
    const node = nodes[id];
    const rows = holdingsOf(model, id);
    if (node?.corp?.shares) {
      const total = rows.reduce((sum, h) => sum + (h.shares ?? 0), 0);
      if (total !== node.corp.shares) closeProblems.push(`${id}: holders own ${total.toLocaleString()} of ${node.corp.shares.toLocaleString()} shares`);
    } else {
      // A two-name holding of unknown form carries one row for all its names.
      const total = rows.reduce((sum, h) => sum + (h.fraction ?? 0) * (h.formUnknown ? h.holders.length : 1), 0);
      if (Math.abs(total - 1) > EPS) closeProblems.push(`${id}: ownership adds to ${(total * 100).toFixed(2)}%, not 100%`);
    }
  }
  for (const node of Object.values(nodes)) {
    if (node.virtual) continue;
    if (node.isAsset && !heldIds.has(node.id)) closeProblems.push(`${node.id} (${node.name}) has no owner`);
    if (["llc", "corp"].includes(node.kind) && !heldIds.has(node.id)) closeProblems.push(`${node.id} (${node.name}) has no owner`);
  }
  for (const node of Object.values(nodes)) {
    for (const tier of ["primary", "contingent"]) {
      const list = node.designation?.[tier];
      if (list?.length) { const total = list.reduce((sum, e) => sum + e.share, 0); if (Math.abs(total - 1) > EPS) closeProblems.push(`${node.id} ${tier} beneficiaries add to ${(total * 100).toFixed(1)}%`); }
    }
  }
  check("ownership adds to 100%", closeProblems);

  // 4. No ownership loops; tax owners resolve
  const loopProblems = [];
  const visit = (id, path) => {
    if (path.includes(id)) { loopProblems.push(`ownership loop: ${[...path, id].join(" → ")}`); return; }
    for (const h of model.holdings.filter((x) => x.holders.includes(id))) visit(h.held, [...path, id]);
  };
  for (const id of Object.keys(nodes)) visit(id, []);
  for (const id of Object.keys(nodes)) { try { taxpayerOf(model, id); } catch (error) { loopProblems.push(error.message); } }
  check("no loops", [...new Set(loopProblems)]);

  // 5. Events derive cleanly, and their findings are collected
  const eventProblems = [];
  for (const [eventId, event] of Object.entries(model.events)) {
    try {
      if (event.kind === "death") {
        for (const row of deathRoutes(model, eventId)) {
          if (row.route === "probate") findings.push({ node: row.id, severity: "high", text: `${shortName(row.item)} passes through probate court if ${shortName(nodes[event.who])} dies` });
          if (row.route === "unknown") findings.push({ node: row.id, severity: "high", text: `${shortName(row.item)}: route not in documents` });
          if (row.route === "declared") {
            // Whether the schedule counts rests on the trust papers being signed; the model must say which.
            const trust = nodes[row.to[0].to];
            const doc = documents[trust.source?.doc];
            const signed = doc?.signed;
            if (!["signed", "unsigned", "unknown"].includes(signed)) eventProblems.push(`${row.id} is drawn as the trust's by its schedule, so the trust document "${trust.source?.doc}" needs signed: "signed", "unsigned" or "unknown"`);
            findings.push({ node: row.id, severity: "high", text: `${shortName(row.item)}: on the trust's list but still in ${shortName(nodes[event.who])}'s name` });
            if (signed && signed !== "signed") findings.push({ node: trust.id, severity: "high", text: `${shortName(trust)}: the copy of the trust papers is ${signed === "unsigned" ? "unsigned" : "not known to be signed"}, and the schedule only counts if they were` });
          }
          if (row.route === "probate" && row.to.some((e) => e.to === "intestacy")) findings.push({ node: row.id, severity: "high", text: `${shortName(row.item)}: no will, so state intestacy law decides who gets it` });
          if (row.route === "probate" && !row.to.length) eventProblems.push(`${row.id}: the will's residuary beneficiary is not given (will.residueTo), or mark the will unknown`);
        }
      }
      if (event.kind === "sale") qsbsLedger(model, eventId);
    } catch (error) { eventProblems.push(`${eventId}: ${error.message}`); }
  }
  for (const node of Object.values(nodes)) if (node.designation?.source?.status === "unknown") findings.push({ node: node.id, severity: "high", text: `${shortName(node)}: no beneficiary form in documents` });
  for (const h of unknownForms) {
    findings.push({ node: h.held, severity: "high", text: `${shortName(nodes[h.held] ?? { name: h.held })}: in ${h.holders.length} names, and the documents don't show how the title is held` });
    open.push({ where: `${h.held}.form`, status: "unknown", note: `How ${shortName(nodes[h.held] ?? { name: h.held })} is titled is not in the documents` });
  }
  for (const fact of open) if (fact.status === "assumed") findings.push({ node: fact.where.split(".")[0], severity: "high", text: `Assumed: ${fact.note}` });

  // 5b. Facts the law turns on: where the household lives, marital status, and every QSBS condition.
  const contextProblems = [];
  const events = Object.values(model.events);
  if (events.length) {
    const j = model.raw.jurisdiction;
    if (!j) contextProblems.push("no jurisdiction: give the state (and whether it is community property), or mark it unknown");
    else if (!isCited(j.source)) contextProblems.push("jurisdiction has no source");
    else if (j.source.status) open.push({ where: "jurisdiction", status: j.source.status, note: j.source.note ?? "State not in documents" });
    const people = new Set();
    for (const e of events) {
      if (e.kind === "death") { people.add(e.who); (e.survivors ?? []).forEach((id) => people.add(id)); }
      if (e.kind === "sale") for (const h of holdingsOf(model, e.of)) for (const id of h.holders) { const tp = taxpayerOf(model, id); if (nodes[tp]?.kind === "person") people.add(tp); }
    }
    for (const id of people) {
      const m = nodes[id]?.marital;
      if (!m) contextProblems.push(`${id}: marital status and filing status not given (mark unknown if the documents don't say)`);
      else if (!isCited(m.source)) contextProblems.push(`${id}: marital status has no source`);
      else if (m.source.status) open.push({ where: `${id}.marital`, status: m.source.status, note: m.source.note ?? "Marital status not in documents" });
    }
    for (const e of events) if (e.kind === "sale") {
      const q = nodes[e.of]?.qsbs ?? {};
      for (const { key } of QSBS_CONDITIONS) if (!q[key]) contextProblems.push(`${e.of}: QSBS condition "${key}" not addressed (cite it or mark it assumed)`);
    }
  }
  check("context the law turns on", contextProblems);

  // 5c. Absence is said as absence: a note about a fact the documents don't show must say so.
  const absenceProblems = [];
  const unknownNodes = new Set([...Object.values(nodes).filter((n) => ["designation", "value", "tax", "will"].some((k) => n[k]?.source?.status === "unknown")).map((n) => n.id), ...unknownForms.map((h) => h.held)]);
  for (const view of model.views) for (const note of view.notes ?? []) {
    for (const id of noteTargets(note)) {
      if (unknownNodes.has(id) && !/document|on file|paperwork|isn’t in|isn't in|nothing (here|shows)/i.test(`${note.title} ${note.body}`)) absenceProblems.push(`${view.id}: the note on ${id} states a missing fact without saying it is missing from the documents`);
    }
    // "never assigned" is an absence stated as fact; "never qualifies" is a rule. Only the first kind is refused.
    const over = `${note.title} ${note.body} ${view.title} ${view.subtitle ?? ""}`.match(/\b(never (?:\w+ ){0,2}?(?:assigned|moved|signed|named|funded|retitled|filed|transferred|recorded|changed|updated|made|done|put|added|set up|executed|delivered|sent|given|got|had|was|were)\b|everything they own|all they own)\b/i);
    if (over) absenceProblems.push(`${view.id}: "${over[0]}" claims more than the documents can show`);
  }
  // A headline is the sentence the family reads first. When a will's status is
  // unknown, "there is no will" is a claim the documents don't make.
  const willUnknown = Object.values(nodes).some((n) => n.will?.source?.status === "unknown");
  if (willUnknown) for (const view of model.views) {
    const head = `${view.title} ${view.subtitle ?? ""} ${view.kicker ?? ""}`;
    for (const m of head.matchAll(/\b(there is no will|no will for \w+|without a will|has no will|left no will)\b/gi)) {
      const after = head.slice(m.index + m[0].length, m.index + m[0].length + 48);
      const before = head.slice(Math.max(0, m.index - 48), m.index);
      const qualified = /in (the|these|your) documents|on file|we (have|were sent)|in what (we|you) (have|sent)|is in the documents/i.test(after) || /documents (show|say|list)|copies show|papers show/i.test(before);
      if (!qualified) absenceProblems.push(`${view.id} title: "${m[0]}" states as fact what the documents don't show; say "no will in the documents"`);
    }
  }
  // Title is a fact about a deed or a statement. When the model carries an
  // asset whose title form isn't shown, or one the trust's schedule lists but
  // nothing retitles, a headline or zone label may not say "by title" or
  // "still in your name" unless it names the evidence in the same breath.
  const titleOpen = unknownForms.length > 0 || Object.values(nodes).some((n) => n.trustSchedule);
  if (titleOpen) for (const view of model.views) {
    const heads = [["title", `${view.title} ${view.subtitle ?? ""} ${view.kicker ?? ""}`], ...(view.zones ?? []).map((z) => [`zone "${z.label}"`, `${z.label} ${z.legend ?? ""}`])];
    for (const [where, text] of heads) for (const m of text.matchAll(/\b(by title|still titled|still in (?:your|his|her|their|one|both|the same) names?)\b/gi)) {
      const sentence = text.slice(Math.max(0, text.lastIndexOf(".", m.index) + 1), (text.indexOf(".", m.index) + 1) || text.length);
      if (!/deed|statement|title report|tax roll|on file|documents? (show|says?|don’t show|don't show)|in the documents|papers show/i.test(sentence)) absenceProblems.push(`${view.id} ${where}: "${m[0]}" asserts how title is held; the documents don't show it, so say what they show instead`);
    }
  }
  // A trust that ends survivorship for what it lists (cited) decides ahead
  // of the deed's form; a note on a listed asset may not say the form decides.
  for (const view of model.views) for (const note of view.notes ?? []) for (const id of noteTargets(note)) {
    const node = nodes[id];
    const trust = node?.trustSchedule && nodes[node.trustSchedule.trust];
    if (!trust?.trust?.survivorship?.ends) continue;
    const text = `${note.title} ${note.body}`;
    const m = text.match(/\b(trust or no trust|by a form|the (deed|form|title) decides|whatever the trust says|regardless of the trust)\b/i);
    // "Without a signed trust, the deed decides" is the honest branch, not the claim this refuses.
    const sentence = m ? text.slice(Math.max(0, text.lastIndexOf(".", m.index) + 1), (text.indexOf(".", m.index) + 1) || text.length) : "";
    if (m && !/without a signed trust|if the trust was(n’t|n't| not| never) signed|unsigned|only without/i.test(sentence)) absenceProblems.push(`${view.id}: the note on ${id} says "${m[0]}", but the trust's own text ends survivorship for what it lists (${citeLabel(model, trust.trust.survivorship.source)}); say what the trust says and name the attorney's question`);
  }
  // A page that mentions a disclaimer trust owes the one fact that makes it urgent.
  for (const view of model.views) for (const note of view.notes ?? []) {
    const text = `${note.title} ${note.body}`;
    if (/disclaim/i.test(text) && !/nine months|9 months/i.test(text)) absenceProblems.push(`${view.id}: a note mentions a disclaimer without its deadline; say it: "${DISCLAIMER_RULE}"`);
  }
  // In a community-property state, intestacy isn't one answer: say both branches.
  if (model.raw.jurisdiction?.communityProperty) for (const [eventId, event] of Object.entries(model.events)) {
    if (event.kind !== "death") continue;
    let rows = [];
    try { rows = deathRoutes(model, eventId); } catch {}
    for (const row of rows) {
      if (!row.to.some((e) => e.to === "intestacy")) continue;
      const notes = model.views.flatMap((v) => (v.notes ?? []).filter((n) => noteTargets(n).includes(row.id)).map((n) => `${n.title} ${n.body}`));
      if (!notes.some((t) => /community/i.test(t) && /separate/i.test(t))) absenceProblems.push(`${row.id} would pass by intestacy in a community-property state; a note on it must say what happens if it is community property and if any part is separate`);
    }
  }
  check("absence said as absence", [...new Set(absenceProblems)]);

  // 5c2. A citation written into prose ("(Trust schedule, p. 3)") must name a
  // document the footer lists by that short name, or the reader cannot find it.
  const proseCiteProblems = [];
  const plain = (s) => String(s ?? "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const shorts = new Map(Object.entries(documents).filter(([, d]) => d.read === "read" || d.read === "partial").map(([id, d]) => [plain(d.short), id]));
  const scan = (text, where) => {
    for (const m of String(text ?? "").matchAll(/\(([^()]*?)\)/g)) {
      for (const part of m[1].split(";")) {
        if (!/(^|[\s,])pp?\.\s*\d/.test(part)) continue;
        const page = /\bpp?\.\s*\d/.exec(part);
        const name = part.slice(0, page.index).replace(/,\s*$/, "").trim();
        if (!name || /^(pp?\.|Art\.|§|notes?\b)/.test(name)) continue;
        if (!shorts.has(plain(name))) { proseCiteProblems.push(`${where} cites "${name}, …" but no readable document is listed with the short name "${name}"`); continue; }
        const docId = shorts.get(plain(name));
        if (!pageOk(docId, part)) proseCiteProblems.push(`${where} cites "${part.trim()}", outside the pages its readNote says were read (${documents[docId].readNote})`);
      }
    }
  };
  for (const view of model.views) {
    for (const [i, note] of (view.notes ?? []).entries()) scan(`${note.title} ${note.body}`, `${view.id} note ${String.fromCharCode(65 + i)}`);
    for (const [id, fix] of Object.entries(view.fixes ?? {})) scan(fix, `${view.id} fix for ${id}`);
    scan(`${view.title} ${view.subtitle ?? ""} ${view.kicker ?? ""}`, `${view.id} title`);
  }
  check("prose citations name a listed document", [...new Set(proseCiteProblems)]);

  // 5d. Numbers in prose match numbers the model or the rules produce.
  const numbers = new Set([12]);
  const add = (v) => { if (v != null && Number.isFinite(v)) numbers.add(v); };
  for (const node of Object.values(nodes)) { add(node.isAsset ? node.value?.usd : valueOf(model, node.id)); add(node.value?.gross); add(node.value?.loan); }
  for (const band of QSBS_RULES.bands) add(band.cap);
  [50e6, 75e6].forEach(add);
  for (const [eventId, event] of Object.entries(model.events)) {
    try {
      if (event.kind === "sale") {
        add(event.pricePerShare);
        const view = model.views.find((v) => v.ledger?.event === eventId);
        const ledger = qsbsLedger(model, eventId, view?.ledger?.for);
        for (const row of ledger.rows) [row.gain, row.cap, row.excludable, row.over, row.proceeds].forEach(add);
        [ledger.total, ledger.singleCap].forEach(add);
        const ex = ledger.rows.map((r) => r.excludable);
        for (let mask = 1; mask < 1 << ex.length; mask++) add(ex.reduce((sum, v, i) => (mask & (1 << i) ? sum + v : sum), 0));
        add(ledger.total - ledger.singleCap);
        if (ledger.missing.length) eventProblems.push(`${eventId}: the ledger leaves out ${ledger.missing.join(", ")}, who also hold this stock`);
        if (ledger.unsupported.length) eventProblems.push(`${eventId}: ${ledger.unsupported.join("; ")}`);
      }
      if (event.kind === "death") {
        const rows = deathRoutes(model, eventId);
        rows.forEach((r) => add(r.value));
        const byTo = new Map();
        for (const r of rows) for (const e of r.to) { const k = `${e.to}|${r.route === "probate"}`; byTo.set(k, (byTo.get(k) ?? 0) + (r.value ?? 0) * e.share); }
        byTo.forEach(add);
      }
    } catch {}
  }
  const parseMoney = (text) => { const m = text.match(/^\$([\d,.]+)\s*([KMB])?/); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, "")); return n * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] ?? 1); };
  const proseProblems = [];
  const viewProblems = [];
  for (const view of model.views) {
    const fields = [["title", view.title]];
    if (view.subtitle != null) fields.push(["subtitle", view.subtitle]);
    for (const [index, note] of (view.notes ?? []).entries()) {
      fields.push([`notes[${index}].title`, note.title], [`notes[${index}].body`, note.body]);
    }
    for (const [field, text] of fields) {
      if (typeof text !== "string" || (field !== "subtitle" && !text.trim())) {
        viewProblems.push(`${view.id} needs text in ${field}.`);
        continue;
      }
      for (const hit of text.match(/\$[\d][\d,.]*\s?[KMB]?/g) ?? []) {
        const value = parseMoney(hit.replace(/\s/, ""));
        const close = [...numbers].some((n) => Math.abs(n - value) <= Math.max(0.006 * Math.abs(n), 0.5));
        if (!close) proseProblems.push(`${view.id}: "${hit}" in the text doesn't match any value in the model or its derivations`);
      }
    }
  }
  check("numbers in the text match the model", proseProblems);
  check("events derive", eventProblems);

  // 5e. Zones that claim a taxpayer agree with tax ownership; trusts that a death touches have cited terms.
  const zoneProblems = [];
  for (const view of model.views) for (const zone of view.zones ?? []) {
    if (!zone.taxpayer) continue;
    for (const id of zone.members) if (taxpayerOf(model, id) !== zone.taxpayer) zoneProblems.push(`${view.id}: ${id} is in zone "${zone.label}" but its income-tax owner is ${taxpayerOf(model, id)}`);
    for (const other of view.zones) if (other !== zone && other.taxpayer === zone.taxpayer) zoneProblems.push(`${view.id}: two zones claim taxpayer ${zone.taxpayer}`);
  }
  for (const event of Object.values(model.events)) if (event.kind === "death") for (const node of Object.values(nodes)) {
    if (node.kind === "trust" && node.trust?.revocable && node.trust.grantors?.includes(event.who) && !isCited(node.trust.onDeath?.source)) zoneProblems.push(`${node.id}: what the trust does at ${event.who}'s death (trust.onDeath) is not cited or marked`);
  }
  check("zones and trust terms agree with the facts", [...new Set(zoneProblems)]);

  // 6. Every high-severity finding is surfaced by a note in some view
  const surfaceProblems = [];
  const noted = new Set(model.views.flatMap((view) => (view.notes ?? []).flatMap(noteTargets)));
  for (const finding of findings) if (finding.severity === "high" && !noted.has(finding.node)) surfaceProblems.push(`not surfaced in any view: ${finding.text}`);
  check("findings surfaced", surfaceProblems);

  // 7. Views reference real things
  for (const view of model.views) {
    for (const id of Object.keys(view.place ?? {})) if (!nodes[id]) viewProblems.push(`${view.id} places unknown "${id}"`);
    for (const zone of view.zones ?? []) for (const id of zone.members) if (!view.place?.[id]) viewProblems.push(`${view.id} zone ${zone.id} includes "${id}", which is not placed`);
    for (const note of view.notes ?? []) for (const id of noteTargets(note)) {
      if (typeof id !== "string" || !Object.hasOwn(nodes, id)) viewProblems.push(`${view.id} note points to an unknown card "${id}"`);
      else if (view.type === "structure" && !view.place?.[id]) viewProblems.push(`${view.id} note is on "${id}", which is not placed`);
    }
    if (view.event && !model.events[view.event]) viewProblems.push(`${view.id} uses unknown event "${view.event}"`);
  }
  check("views resolve", viewProblems);

  return { ok: errors.length === 0, errors, checks, open, findings };
}
