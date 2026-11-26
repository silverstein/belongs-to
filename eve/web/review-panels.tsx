import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Building2, FileText, Landmark, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import type { Activity, Attempt, DocumentInfo, Totals } from "./activity";
import { arrangeDraft, citationFailure, type Citation, type DraftData, type DraftRow, type Gap } from "./draft-data";

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const count = (number: number, word: string) => `${number} ${word}${number === 1 ? "" : "s"}`;
export const stagger = (index: number): CSSProperties => ({ "--dl": `${Math.min(index * 18, 140)}ms` } as CSSProperties);

const dot = <circle cx="7" cy="7" r="5.6" fill="currentColor" />;
const half = <><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7 2a5 5 0 0 0 0 10Z" fill="currentColor" /></>;
const marks = {
  ok: dot, pending: half, amber: half,
  told: <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray=".1 2.6" strokeLinecap="round" />,
  missing: <><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M4.3 7h5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  fail: <>{dot}<path d="M5.1 5.1l3.8 3.8m0-3.8-3.8 3.8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></>,
  read: <path d="M2.8 7.4 5.7 10.2 11.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  wait: <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" />,
  reading: <><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="7" cy="7" r="2" fill="currentColor" /></>,
  gold: <>{dot}<path d="M7 4.1v3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /><circle cx="7" cy="9.9" r=".95" fill="#fff" /></>,
};
export function Mark({ kind, className = "" }: { kind: keyof typeof marks; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 14 14" className={`mk mk-${kind} ${className}`}>{marks[kind]}</svg>;
}
const key = [["ok", "Confirmed on the page"], ["amber", "Found, needs checking"], ["told", "Told by the family"], ["missing", "Missing"]] as const;
export function FactKey({ start = false }: { start?: boolean }) {
  if (start) return <div className="start-key" aria-label="How facts are marked">{key.map(([kind, label]) =>
    <span key={kind}><Mark kind={kind} />{label}</span>)}</div>;
  return <section className="panel key"><h2 className="h-sm">How facts are marked</h2>
    <ul>{key.map(([kind, label]) => <li key={kind}><Mark kind={kind} />{label}</li>)}</ul>
    <p>Open gaps are shown in red and marked Missing.</p>
  </section>;
}

type OpenPage = (doc: string, fact?: Citation) => void;
type CitationContext = { draft?: DraftData; failed?: Attempt; previous?: DraftData; confirmed: boolean; open: OpenPage };

function PageChip({ fact, context, label = true }: { fact: Citation; context: CitationContext; label?: boolean }) {
  const failure = citationFailure(fact, context.failed?.errors ?? []);
  const old = context.previous?.nodes.flatMap((node) => node.facts).find((item) => item.path === fact.path && item.doc === fact.doc);
  const repaired = old && old.at !== fact.at && context.confirmed && citationFailure(old, context.failed?.errors ?? []);
  const status = failure ? "fail" : context.confirmed ? "ok" : "pending";
  const name = context.draft?.documents[fact.doc]?.short || fact.doc;
  return <button type="button" className="cite enter" data-s={status} onClick={() => context.open(fact.doc, fact)}
    aria-label={`${fact.label}, ${name}, ${fact.at}, ${failure || (context.confirmed ? "confirmed on the page" : "not checked yet")}. Show the page.`}>
    <Mark key={status} kind={status} className="pop" />
    {label && <span className="cl">{fact.label}</span>}
    <span className="cd">{name}, <span className="pg">{repaired && <del className="was">{old.at}</del>}{fact.at}</span></span>
    {failure && <span className="tag">{failure}</span>}{repaired && <span className="tag">Repaired</span>}
  </button>;
}

export function Documents({ files, activity, draft, open }: {
  files: DocumentInfo[]; activity: Activity; draft?: DraftData; open: OpenPage;
}) {
  const byName = new Map(files.map((file) => [file.name, file]));
  const names = [...new Set([...Object.keys(draft?.documents ?? {}), ...byName.keys()])].filter((name) => byName.has(name));
  const pages = files.reduce((total, file) => total + (activity.read.get(file.name) ?? file.pages), 0);
  return <section className="docs panel" aria-labelledby="docsH">
    <div className="ph"><h2 id="docsH">Documents</h2><span className="meta">{activity.read.size} of {files.length} read</span></div>
    <ul className="doc-list">{names.map((name) => {
      const doc = byName.get(name)!;
      const read = activity.read.get(name);
      const cited = draft?.citations.get(name) ?? 0;
      const meta = draft?.documents[name];
      const detail = meta?.short || meta?.title || (read !== undefined ? "Read" : activity.reading ? "Waiting to be read" : "Waiting");
      return <li key={name}><button className="doc" type="button" data-s={read === undefined ? "wait" : "read"} onClick={() => open(name)}>
        <Mark key={read === undefined ? "wait" : "read"} kind={read === undefined ? "wait" : "read"} className={read === undefined ? "" : "pop"} />
        <span className="file" title={name}>{name}</span><span className="pg">{count(read ?? doc.pages, "page")}</span>
        <span className="st"><span className="sw">{detail}{meta?.date ? `, ${meta.date.slice(0, 4)}` : ""}</span>
          {cited > 0 && <span className="cited">· <b key={cited}>{cited}</b> cited</span>}</span>
      </button></li>;
    })}</ul>
    <p className="fine">{count(pages, "page")} in all. Select a document to see its pages.</p>
  </section>;
}

function Node({ row, context, children, root = false, index }: {
  row: DraftRow; context: CitationContext; children?: ReactNode; root?: boolean; index: number;
}) {
  const Icon = row.kind === "person" ? UserRound : row.kind === "trust" ? ShieldCheck
    : row.kind === "llc" || row.kind === "corp" ? Building2 : row.kind === "group" ? UsersRound : row.kind === "bank" ? Landmark : FileText;
  const failed = context.failed?.errors && row.facts.some((fact) => citationFailure(fact, context.failed!.errors!));
  return <div data-id={row.id} className={`node enter${root ? " root" : ""}${failed ? " flagged" : ""}`} style={stagger(index)}>
    <div className="row"><Icon className="ic" aria-hidden="true" /><div className="nm"><b>{row.name}</b><small>{row.detail}</small></div>
      {row.amount !== undefined && <div className="val">{money.format(row.amount)}{row.cover && <small>life cover</small>}</div>}</div>
    {row.facts.length > 0 && <div className="facts">{row.facts.map((fact) => <PageChip key={fact.path} fact={fact} context={context} />)}</div>}
    {row.missing.length > 0 && <div className="lines">{row.missing.map((gap) =>
      <div key={gap} className="fl gap"><Mark kind="missing" /><span><b>Missing</b> {gap}</span></div>)}</div>}
    {children && <div className="kids">{children}</div>}
  </div>;
}

const realGroup = ["seg-sam", "seg-trust", "seg-joint", "seg-dana"];
export function Household({ title, draft, audit, failure, previous, open, stopped }: {
  title: string; draft?: DraftData; audit?: Attempt; failure?: Attempt; previous?: DraftData; open: OpenPage; stopped: boolean;
}) {
  const graph = useMemo(() => draft && arrangeDraft(draft), [draft]);
  const tree = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const signature = graph && [...graph.children].map(([id, rows]) => `${id}:${rows.map((row) => row.id).join(",")}`).join("|");
  useLayoutEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = [...(tree.current?.querySelectorAll<HTMLElement>(":scope > [data-id]") ?? [])];
    const fresh = new Map(items.map((item) => [item.dataset.id!, item.offsetTop]));
    if (!calm) for (const item of items) {
      const before = positions.current.get(item.dataset.id!);
      const after = fresh.get(item.dataset.id!)!;
      if (before !== undefined && Math.abs(before - after) > 2 && Math.abs(before - after) < 200) {
        item.animate([{ transform: `translateY(${before - after}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
    }
    positions.current = fresh;
  }, [signature]);
  const confirmed = audit?.audit?.facts === "passed";
  const context = { draft, confirmed, failed: confirmed ? undefined : failure, previous, open };
  function renderNode(row: DraftRow, index: number, root = false) {
    const children = graph?.children.get(row.id);
    return <Node key={row.id} row={row} context={context} index={index} root={root}>
      {children?.map((child, order) => renderNode(child, order))}
    </Node>;
  }
  const groups = graph?.groups ?? [];
  const segment = (id: string, index: number) => id === "@unplaced" ? "seg-none" : realGroup[index % realGroup.length];
  const absolute = groups.reduce((sum, group) => sum + Math.abs(group.value), 0);
  const joint = graph?.children.get("@joint");
  return <section className="panel sheet" aria-labelledby="sheetH">
    <div className="sheet-head"><div><h2 className="d3" id="sheetH">{title}</h2>
      <p className="sub">{confirmed ? "Checked against the pages." : failure ? "The checker found a problem in this draft."
        : stopped ? "Draft paused here." : draft?.count ? "As the model writes it. Not checked yet." : "Appears here as the model writes it."}</p></div>
      {draft?.jurisdiction && <div className="juris"><span>{draft.jurisdiction}</span>
        {draft.jurisdictionFact && <PageChip fact={draft.jurisdictionFact} context={context} label={false} />}</div>}</div>
    <div className="sheet-sum"><div><div className="lbl">Values on the pages</div>
      <div className="d2 total num">{money.format(graph?.total ?? 0)}</div>
      <div className="total-sub">{graph?.values ? `${count(graph.values, "value")} cited.` : "None written yet"}
        {graph?.cover ? ` Plus ${money.format(graph.cover)} in life cover.` : ""}</div></div>
      <div><div className="lbl">In whose name</div><div className="bar" aria-hidden="true">{groups.map(({ id, value }, index) =>
        <i key={id} className={segment(id, index)} style={{ flexGrow: absolute ? Math.abs(value) / absolute : 0 }} />)}</div>
        <ul className="legend">{groups.map(({ id, value, label }, index) =>
          <li key={id}><i className={segment(id, index)} /><span>{label}</span><b>{money.format(value)}</b></li>)}</ul></div></div>
    {!draft?.count && <div className="sheet-empty"><span className="d3">Nothing written yet.</span>
      <span>The household forms here as the model writes it, each fact with the page it came from.</span></div>}
    {graph && <div className="tree" ref={tree}>
      {graph.roots.map((row, index) => renderNode(row, index, true))}
      {joint && <Node row={{ id: "@joint", kind: "group", name: "Jointly", short: "Jointly", detail: "Shared title", facts: [], missing: [], valued: false, cover: false }}
        context={context} index={graph.roots.length} root>{joint.map((row, index) => renderNode(row, index))}</Node>}
    </div>}
    {Boolean(graph?.pool.length) && <div className="pool"><h3><span>Written, whose name not written yet</span><span className="mono">{graph?.pool.length}</span></h3>
      <div className="pool-items">{graph?.pool.map((row, index) => renderNode(row, index))}</div></div>}
    {Boolean(draft?.views.length) && <div className="planned"><h3 className="sec-h">Notes for the pages</h3>
      <ol>{draft?.views.map((view) => <li key={view.id} className="vt enter"><span className="fig">FIG. {view.fig}</span>{view.title}</li>)}</ol></div>}
    {Boolean(draft?.gaps.length) && <div className="gaps"><h3 className="sec-h"><span>Not in the documents</span><span className="mono">{draft?.gaps.length}</span></h3>
      <ul>{draft?.gaps.map(({ text }) => <li className="enter" key={text}><Mark kind="missing" /><span><b>Missing</b> {text}</span></li>)}</ul></div>}
    <div className="sheet-foot" /></section>;
}

export function DraftPanel({ draft, tail, gaps, started, writing, active, idle, canRetry, retry }: {
  draft?: DraftData; tail: string; gaps: Gap[]; started: boolean; writing: boolean; active: boolean;
  idle: number; canRetry: boolean; retry: () => void;
}) {
  const quiet = active && idle >= 20;
  return <section className="panel live" aria-labelledby="liveH"><div className="ph"><h2 id="liveH">The draft</h2>
    <span className="meta">{writing ? "writing" : tail ? "done" : "not started"}</span></div>
    <dl className="counts"><div><dt>Records</dt><dd>{draft?.count ?? 0}</dd></div><div><dt>Facts cited</dt><dd>{draft?.facts ?? 0}</dd></div>
      <div><dt>Gaps</dt><dd className="gapn">{gaps.length}</dd></div></dl>
    <div className="stream"><div className="stream-h"><span>{writing ? "What the model is writing" : tail ? "What the model wrote" : "Being written"}</span>
      <span className="mono">{tail.length.toLocaleString("en-US")} chars</span></div>
      <pre className="tail" aria-hidden="true"><span>{tail.slice(-260, -14)}<span className="new">{tail.slice(-14)}</span>
        {writing && !quiet && tail && <i className="caret" />}</span></pre>
      <p className={`last${writing && !quiet && started ? "" : " quiet"}`}><span className="dot" /><span>
        {quiet ? `Last update ${idle} s ago` : writing && started ? "Writing now" : tail ? `Finished · ${tail.length.toLocaleString("en-US")} characters` : "Starts when reading is done"}</span></p></div>
    {quiet && <div className="stall" role="status"><Mark kind="wait" /><span><b>Still {writing ? "writing" : "working"}, last update {idle} s ago.</b>
      {canRetry && <> <button type="button" className="btn btn-quiet btn-sm" onClick={retry}>Retry</button></>}</span></div>}
  </section>;
}

const checks = [["citations", "Citations on the page"], ["dollars", "Dollar amounts on the page"], ["names", "Names on the page"], ["layout", "Layout"]] as const;
function CheckRows({ attempt, draft, second }: { attempt?: Attempt; draft?: DraftData; second?: boolean }) {
  return <ol className="checks">{checks.map(([key, title], index) => {
    const layout = key === "layout";
    const status = attempt?.audit?.layout;
    const audit: Totals | undefined = layout
      ? status === "passed" ? { checked: draft?.views.length ?? 0, failed: 0 } : undefined : attempt?.audit?.audit?.[key];
    const failed = Boolean(audit?.failed) || (layout && status === "failed");
    const passed = Boolean(audit?.checked && !failed) || (layout && status === "passed");
    const state = failed ? "fail" : passed ? "done" : "wait";
    return <li key={key} className={`ck${failed ? " attn" : ""}`} data-s={state}>
      <Mark key={state} kind={failed ? "fail" : passed ? "ok" : "wait"} className={passed ? "pop" : ""} />
      <span className="nm">{title}</span><span className="ct">{audit ? <><b>{audit.checked}</b>/{audit.checked}</> : null}</span>
      <span className="sub enter" key={state + Boolean(second)} style={stagger(index)}>{failed
        ? audit ? `${audit.failed} failed` : "The layout needs repair"
        : passed ? second ? "Passed on recheck" : layout ? "Passed layout check" : "All found on their pages"
          : status === "skipped" && layout ? "Waiting for facts to pass" : "Waiting"}</span>
      <span className="meter"><i style={{ transform: `scaleX(${passed || failed ? 1 : 0})` }} /></span>
    </li>;
  })}</ol>;
}
export function Checker({ attempt, previous, draft, repairing, open }: {
  attempt?: Attempt; previous?: Attempt; draft?: DraftData; repairing: boolean; open: OpenPage;
}) {
  const pass = attempt?.audit?.layout === "passed";
  const failure = Boolean(attempt?.errors?.length || attempt?.audit?.layout === "failed" || attempt?.audit?.facts === "failed");
  const evidence = attempt?.audit?.evidence ?? [];
  const oldErrors = previous?.errors ?? [];
  return <section className="panel checker" aria-labelledby="ckH"><div className="ph"><h2 id="ckH">The checker</h2>
    <span className="meta">{pass ? "passed" : repairing ? "repairing" : failure ? "needs repair" : attempt ? previous ? "checking again" : "first check" : "waits for the draft"}</span></div>
    <p className="intro">Before anything is drawn, every citation, amount and name is looked for on its page. A failure goes back to the agent to repair.</p>
    <CheckRows attempt={attempt} draft={draft} second={Boolean(previous && pass)} />
    {Boolean(attempt?.errors?.length) && <details className="repair" open><summary>{repairing ? "Repairing the draft" : "What needs repair"}</summary>
      <ul>{attempt?.errors?.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
    {previous && pass && <details className="repair"><summary><Mark kind="read" /> <b>Repaired and checked again.</b></summary>
      <CheckRows attempt={previous} draft={draft} />{oldErrors.length > 0 && <ul>{oldErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>}</details>}
    <div className="ev-h"><span className="h-sm">Evidence tested</span>{evidence.length > 0 && <span className="h-sm mono">{evidence.length} shown</span>}</div>
    {evidence.length ? <ol className="evidence">{evidence.slice(-5).map(({ text, doc, at }, index) =>
      <li className="ev enter" key={`${text}:${doc}:${at}`} style={stagger(index)}>
        <Mark kind="ok" /><span className="what">{text}</span>
        <button type="button" className="src" onClick={() => open(doc, { doc, at, path: "", label: "Evidence", quote: text })}>
          {draft?.documents[doc]?.short || doc}, <span className="pg">{at}</span> · <span className="res">Found</span></button></li>)}</ol>
      : <p className="ev-empty">The checker lists the names and amounts found on cited pages here.</p>}
  </section>;
}

export function PagePeek({ doc, fact, pages, title, close }: {
  doc: string; fact?: Citation; pages?: Record<string, string>; title?: string; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hit = useRef<HTMLElement>(null);
  const page = fact?.at.match(/\b(?:p(?:age)?\.?\s*)(\d+)/i)?.[1];
  useLayoutEffect(() => { dialog.current?.showModal(); hit.current?.scrollIntoView({ block: "nearest" }); }, []);
  function excerpt(text: string) {
    const quote = fact?.quote;
    const position = quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1;
    return position < 0 || !quote ? text : <>{text.slice(0, position)}<mark>{text.slice(position, position + quote.length)}</mark>{text.slice(position + quote.length)}</>;
  }
  return <dialog className="peek" ref={dialog} onClose={close} aria-labelledby="peekH">
    <div className="peek-in"><div className="peek-h"><div><div className="file">{doc}</div><h2 id="peekH" className="d3">{title || doc}</h2></div>
      <button className="xbtn" type="button" aria-label="Close" autoFocus onClick={() => dialog.current?.close()}><X /></button></div>
      {fact && <div className="peek-fact">{fact.label} · {fact.at}</div>}
      <div className="peek-pages">{pages ? Object.entries(pages).map(([number, text]) =>
        <section ref={number === page ? hit : undefined} className={`pp${number === page ? " hit" : ""}`} key={number}>
          <h3>Page {number}</h3><p>{number === page ? excerpt(text) : text}</p></section>)
        : <p>This document’s pages have not arrived yet.</p>}</div></div>
  </dialog>;
}
