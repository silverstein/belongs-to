import { createHash } from "node:crypto";
import { normalize, todosFromIntake } from "../../kit/model.mjs";
import { pagesCovered, verify } from "../../kit/verify.mjs";
import { deathRoutes, QSBS_CONDITIONS } from "../../kit/derive.mjs";

const viewTypes = new Map([["whose-name", "structure"], ["at-a-death", "transfer"], ["qsbs", "structure"]]);
const id = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const documentOrUnknown = (source) => Boolean(source?.doc || source?.status === "unknown");
const personalPronoun = /\b(?:he|him|his|himself|she|her|hers|herself)\b/i;

function stableJson(value) {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : entry);
}

export function reviewConfirmationKey(raw, gaps) {
  const { household, asOf, jurisdiction, documents, parties, assets, holdings, events, intake, views } = raw;
  // Keep every authored claim and label. Ignore coordinates and the order of
  // plotted cards, bands, and recipients while keeping their membership.
  const scenarios = views.map(({ place, order, bands, recipients, pitch, cardWidth, zones, ...content }) => ({
    ...content,
    place: place && Object.keys(place).sort(),
    order: order && [...order].sort(),
    bands: bands && [...bands].sort(),
    recipients: recipients && [...recipients].sort(),
    zones: zones?.map(({ x, y, w, h, labelBox, members, ...zone }) => ({
      ...zone, members: members && [...members].sort(),
    })).map(stableJson).sort(),
  }));
  return createHash("sha256").update(stableJson({
    household, asOf, jurisdiction, documents, parties, assets, events,
    holdings: holdings.map(stableJson).sort(),
    intake,
    scenarios: scenarios.map(stableJson).sort(),
    gaps: [...new Set(gaps)].sort(),
  })).digest("hex");
}

function citationPages(at) {
  if (typeof at !== "string" || at.length > 160) return [];
  const locator = at.trim().match(/^\b(p\.\s*\d+(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:p\.\s*)?\d+)*)(?:\s*,\s*(?:art(?:icle)?\.?|sec(?:tion)?\.?|§)\s*[\w.()]+)?$/i);
  return locator ? [...locator[1].matchAll(/\d+/g)].map((match) => Number(match[0])) : [];
}

const dollarFields = ["usd", "gross", "loan", "pricePerShare", "basisPerShare"];
const normalizedName = (text) => String(text ?? "").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
const includesName = (page, name) => {
  const words = normalizedName(name);
  return words && ` ${normalizedName(page)} `.includes(` ${words} `);
};

function pageNumbers(text) {
  const amounts = new Set();
  for (const [, digits, unit] of text.matchAll(/(?<![\w.,])(?:\$\s*)?(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*([kmb]))?(?!\w|[.,]\d)/gi)) {
    const scale = { k: 1e3, m: 1e6, b: 1e9 }[unit?.toLowerCase()] ?? 1;
    amounts.add(Number(digits.replaceAll(",", "")) * scale);
  }
  return amounts;
}

function namesNobody(page, tier) {
  const empty = /\b(?:(primary|contingent)\s+)?beneficiar(?:y|ies)(?:\s+(?:on file|designation))?\s*[:=]\s*(?:none|no one|not named|not on file)\b/gi;
  return [...page.matchAll(empty)].some((match) => (match[1]?.toLowerCase() ?? "primary") === tier)
    || page.split("\n").some((line) => new RegExp(`^\\s*(?:[-*]\\s*)?no ${tier === "contingent" ? "contingent " : "(?:primary )?"}beneficiar(?:y|ies) (?:named|on file|designated)\\b`, "i").test(line));
}

function pageCheck(audit, errors, kind, problem) {
  audit[kind].checked++;
  if (problem) {
    audit[kind].failed++;
    errors.push(problem);
  }
}

function addEvidence(evidence, text, { doc, at }) {
  if (evidence.length < 30 && !evidence.some((item) => item.text === text && item.doc === doc && item.at === at)) {
    evidence.push({ text, doc, at });
  }
}

function checkPageFacts(value, source, pages, nodes, location, label, errors, audit, evidence) {
  const numbers = pageNumbers(pages.join("\n"));
  const equity = Number.isFinite(value.gross) && Number.isFinite(value.loan)
    && Math.abs(value.gross - value.loan - value.usd) < 0.005;
  const explained = /\b(?:derived|estimated)\s+(?:by|from|using|as|at)\b/i.test(source.note ?? "");
  for (const field of dollarFields) {
    const amount = value[field];
    if (typeof amount !== "number") continue;
    if (numbers.has(amount)) {
      pageCheck(audit, errors, "dollars");
      addEvidence(evidence, new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 4,
      }).format(amount), source);
    } else if (field !== "usd" || (!equity && !(explained && numbers.size > 0))) {
      pageCheck(audit, errors, "dollars", `${label}.${field} gives $${amount}, which does not appear on ${source.doc}, ${source.at}. Cite the page with the amount or explain the calculation or estimate.`);
    }
  }

  const checkName = (target, role, allowedPages = pages) => {
    const name = nodes[target]?.name;
    if (!name || !allowedPages.some((page) => includesName(page, name))) {
      pageCheck(audit, errors, "names", `${label} needs a cited page naming ${name ?? target} as ${role} in ${source.doc}, ${source.at}.`);
    } else {
      pageCheck(audit, errors, "names");
      addEvidence(evidence, name, source);
    }
  };
  if (location[0] === "holdings" && location.length === 2) {
    for (const holder of value.holders ?? (value.holder ? [value.holder] : [])) {
      if (nodes[holder]?.kind !== "group") checkName(holder, "an owner or member");
    }
  }
  if (["designation", "beneficiaries"].includes(location.at(-1))) {
    for (const tier of ["primary", "contingent"]) {
      const allowedPages = pages.filter((page) => !namesNobody(page, tier));
      for (const entry of value[tier] ?? []) checkName(typeof entry === "string" ? entry : entry.to, `a ${tier} beneficiary`, allowedPages);
    }
  }
  if (location.at(-1) === "llc" && value.successor) checkName(value.successor, "the member's successor");
  if (location.at(-1) === "will" && value.residueTo) checkName(value.residueTo, "the recipient of the residue");
  if (location.at(-1) === "successorOwner" && value.to) checkName(value.to, "the successor owner");
}

function checkSources(value, folder, documents, nodes, location, errors, audit, evidence) {
  if (!value || typeof value !== "object") return;
  const label = ["Household", ...location].join(".");
  if (dollarFields.some((field) => typeof value[field] === "number") && !value.source?.doc) {
    pageCheck(audit, errors, "dollars", `${label} gives a dollar amount without a cited page. Cite the source or leave the amount open.`);
  }
  if (value.source) {
    const { doc, at, status } = value.source;
    const [collection, , group, condition] = location;
    const saleScenario = status === "illustrative" && collection === "events" && location.length === 2 && value.kind === "sale";
    const eligibilityAssumption = status === "assumed" && collection === "parties" && location.length === 4
      && group === "qsbs" && QSBS_CONDITIONS.some(({ key }) => key === condition);
    if (Object.hasOwn(value.source, "doc")) {
      const pages = folder.get(doc);
      const cited = citationPages(at);
      const document = documents[doc];
      const covered = document?.read === "partial" ? pagesCovered(document.readNote) : null;
      if ((status && !saleScenario) || !pages || !cited.length
          || ["unreadable", "not-provided"].includes(document?.read)
          || cited.some((page) => !pages.has(page) || (covered && !covered.has(page)))) {
        pageCheck(audit, errors, "citations", `${label} needs a page that exists in ${String(doc)} and was read. List each page, for example "p. 1 and p. 2".`);
      } else {
        pageCheck(audit, errors, "citations");
        checkPageFacts(value, value.source, cited.map((page) => pages.get(page)), nodes, location, label, errors, audit, evidence);
      }
    } else if (status !== "unknown" && !eligibilityAssumption) {
      pageCheck(audit, errors, "citations", `${label} needs a document page or must stay open. A sample sale needs the page with its terms.`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "source") checkSources(child, folder, documents, nodes, [...location, key], errors, audit, evidence);
  }
}

function checkReaderCopy(raw, folder, errors) {
  const plain = (text) => text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  const readable = new Map(Object.entries(raw.documents)
    .filter(([, doc]) => doc.read === "read" || doc.read === "partial")
    .map(([filename, doc]) => [plain(String(doc.short)).toLowerCase(), { doc, pages: folder.get(filename) }]));
  const names = [raw.household, ...Object.values({ ...raw.parties, ...raw.assets }).flatMap(({ name, short }) => [name, short])]
    .filter((name) => typeof name === "string" && /\s/.test(name)).map(plain).sort((a, b) => b.length - a.length);
  const check = (text, where) => {
    if (typeof text !== "string" || !personalPronoun.test(text)) return;
    let unquoted = plain(text).replace(/"([^"]+)"\s*\(([^"]+?),\s*(p\.[^)]*)\)/g, (citation, quote, short, pageText) => {
      const source = readable.get(short.trim().toLowerCase());
      const readPages = source?.doc.read === "partial" ? pagesCovered(source.doc.readNote) : null;
      const cited = citationPages(pageText);
      if (!cited.length || cited.some((page) => !source?.pages?.has(page) || (readPages && !readPages.has(page)))) return citation;
      const words = cited.map((page) => source.pages.get(page)).join(" ");
      return plain(words).includes(quote) ? "" : citation;
    });
    for (const name of names) unquoted = unquoted.replaceAll(name, "");
    const pronoun = personalPronoun.exec(unquoted)?.[0];
    if (pronoun) errors.push(`${where} uses "${pronoun}". Use the person's documented name, or quote the exact words with the document short name and page.`);
  };
  for (const view of raw.views) {
    for (const field of ["title", "subtitle", "kicker", "law"]) check(view[field], `${view.id} ${field}`);
    for (const [index, note] of (view.notes ?? []).entries()) {
      for (const field of ["title", "body", "fix"]) check(note[field], `${view.id} note ${String.fromCharCode(65 + index)} ${field}`);
    }
    for (const [card, fix] of Object.entries(view.fixes ?? {})) check(fix, `${view.id} fix for ${card}`);
  }
  const prose = new Set(["title", "shortTitle", "label", "legend", "detail", "basis", "text", "note", "what", "todo", "readNote"]);
  const visit = (entry, path) => {
    if (!entry || typeof entry !== "object") return;
    for (const [key, value] of Object.entries(entry)) {
      const where = `${path}.${key}`;
      if ((prose.has(key) && !(key === "title" && /^views\.\d+(?:\.notes\.\d+)?$/.test(path)))
          || (path.startsWith("documents.") && key === "short")) check(value, where);
      visit(value, where);
    }
  };
  for (const collection of ["documents", "parties", "assets", "holdings", "events", "intake", "jurisdiction", "views"]) {
    visit(raw[collection], collection);
  }
}

export function inspectReview(raw, folder) {
  if (!folder.size) return { errors: ["Send a folder of text documents first."] };
  if (raw?.kind !== "belongs-to/household@1" || typeof raw.household !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)
      || !raw.documents || !raw.parties || !raw.assets || !Array.isArray(raw.holdings)
      || !raw.events || !Array.isArray(raw.views)) {
    return { errors: ["Use the household format in references/model.md."] };
  }

  const errors = [];
  for (const filename of folder.keys()) {
    if (!Object.hasOwn(raw.documents, filename) || raw.documents[filename].read === "not-provided") {
      errors.push(`Include ${filename} in the list of documents you read.`);
    }
  }
  const shorts = new Set();
  for (const [filename, doc] of Object.entries(raw.documents)) {
    if (!folder.has(filename) && doc.read !== "not-provided") errors.push(`${filename} was not uploaded.`);
    if (!doc.short || shorts.has(doc.short)) errors.push(`Use a distinct short name for ${filename}.`);
    if (typeof doc.readNote === "string" && /\d{6,}/.test(doc.readNote)) errors.push(`Check the page numbers for ${filename}.`);
    shorts.add(doc.short);
  }
  for (const name of [...Object.keys(raw.parties), ...Object.keys(raw.assets), ...Object.keys(raw.events)]) {
    if (!id.test(name) || ["__proto__", "constructor", "prototype"].includes(name)) errors.push("Use simple IDs for people, property and events.");
  }
  if (errors.length) return { errors };
  const audit = {
    citations: { checked: 0, failed: 0 },
    dollars: { checked: 0, failed: 0 },
    names: { checked: 0, failed: 0 },
  };
  const evidence = [];
  checkSources(raw, folder, raw.documents, { ...raw.parties, ...raw.assets }, [], errors, audit, evidence);
  const activity = { audit, evidence };

  const viewIds = new Set();
  for (const view of raw.views) {
    if (viewTypes.get(view.id) !== view.type || viewIds.has(view.id)
        || (view.id === "qsbs") !== (view.ledger?.kind === "qsbs")) errors.push(`Check the type and ID of the ${view.id} view.`);
    viewIds.add(view.id);
  }
  if (!viewIds.has("whose-name") || !viewIds.has("at-a-death")) errors.push("Include both whose-name and at-a-death.");
  if (Object.values(raw.events).some((event) => event.kind === "sale") && !viewIds.has("qsbs")) errors.push("Include the separate QSBS view for the sale.");
  const stateOpen = raw.jurisdiction?.source?.status === "unknown";
  if (stateOpen ? raw.jurisdiction.state != null || raw.jurisdiction.communityProperty != null || raw.jurisdiction.label != null
    : !raw.jurisdiction?.source?.doc || !raw.jurisdiction.state) {
    errors.push("Cite the family's state, or set jurisdiction.source.status to unknown and leave state, communityProperty and label open.");
  }
  for (const person of Object.values(raw.parties).filter((party) => party.kind === "person" && party.marital)) {
    if (!person.marital.source?.doc) errors.push(`Cite the page that shows whether ${person.name} is married.`);
  }
  for (const [name, item] of Object.entries({ ...raw.parties, ...raw.assets })) {
    if (item.kind === "llc" && (!documentOrUnknown(item.llc?.source)
        || (item.llc.source.status === "unknown" && item.llc.successor))) {
      errors.push(`Cite ${name}'s agreement on what happens at a death, or show that the papers do not say.`);
    }
    const designation = item.designation;
    if ((designation || ["retirement", "insurance"].includes(item.kind)) && (!documentOrUnknown(designation?.source)
        || (designation.source.status === "unknown" && (designation.primary?.length || designation.contingent?.length)))) {
      errors.push(`Cite the beneficiary page for ${name}, or leave the beneficiary open.`);
    }
    if (item.will && (!documentOrUnknown(item.will.source) || (item.will.source.status === "unknown" && item.will.none))) {
      errors.push(`Cite what the will says for ${name}, or leave the will terms open.`);
    }
    if (item.will?.residueTo && (!item.will.source?.doc || raw.documents[item.will.source.doc]?.signed !== "signed")) {
      errors.push(`The papers do not show a signed will for ${name}. Keep the recipient open.`);
    }
    const onDeath = item.trust?.onDeath;
    if (onDeath && (!documentOrUnknown(onDeath.source)
        || (onDeath.source.doc && raw.documents[onDeath.source.doc]?.signed !== "signed")
        || (onDeath.source.status === "unknown" && (onDeath.first || onDeath.trusteeAfter)))) {
      errors.push(`Cite signed papers for what ${name} does at a death, or show that the papers do not say.`);
    }
    const trust = raw.parties[item.trustSchedule?.trust];
    if (trust && raw.documents[trust.source?.doc]?.signed !== "signed") {
      errors.push(`${name} cannot pass under the trust's list until the papers show it was signed. Keep the documented title and give it an unknown route.`);
    }
  }
  for (const holding of raw.holdings) {
    if (!holding.source?.doc) errors.push(`The holding for ${holding.held} needs its title or ownership page.`);
  }
  if (errors.length) return { errors, activity: { ...activity, facts: "skipped" } };

  const model = normalize(raw);
  const facts = verify(model);
  if (!facts.ok) return { errors: facts.errors, activity: { ...activity, facts: "failed" } };
  checkReaderCopy(raw, folder, errors);
  if (errors.length) return { errors, activity: { ...activity, facts: "failed" } };

  const todo = [...new Set([...raw.views.flatMap((view) => Object.values(view.fixes ?? {})), ...todosFromIntake(model)])];
  const gaps = new Set();
  if (stateOpen) gaps.add("The family's state of residence");
  for (const doc of Object.values(raw.documents)) {
    if (["unsigned", "unknown"].includes(doc.signed)) gaps.add(`A signed copy of ${doc.short}`);
  }
  for (const item of Object.values(model.nodes)) {
    if (item.designation?.source?.status === "unknown") gaps.add(`Who is named to receive ${item.name}`);
    if (item.designation?.source?.doc && item.designation.primary?.length === 0 && !item.designation.contingent?.length) {
      gaps.add(`Any newer beneficiary form for ${item.name}`);
    }
  }
  for (const [eventId, event] of Object.entries(model.events)) {
    if (event.kind !== "death") continue;
    for (const route of deathRoutes(model, eventId)) {
      if (route.route === "unknown") gaps.add(`Where ${route.item.name} goes if ${model.nodes[event.who].name} dies`);
    }
  }
  for (const item of raw.intake?.lookedFor ?? []) {
    if (item.result !== "found") gaps.add(item.what);
  }
  return { errors, gapList: [...gaps], todo, checks: facts.checks.map(({ name, passed }) => ({ name, passed })),
    activity: { ...activity, facts: "passed" } };
}
