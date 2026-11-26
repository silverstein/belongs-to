import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, FileText, FolderOpen, LockKeyhole, PenLine } from "lucide-react";
import { ClientError } from "eve/client";
import { activeTurn, openInteractions, type InteractionRequest } from "eve/events";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { reviewActivity, useReviewSession, type DocumentInfo } from "./activity";
import { object, readDraft, type Citation, type DraftData, type Gap } from "./draft-data";
import { Checker, count, Documents, DraftPanel, FactKey, Household, Mark, PagePeek } from "./review-panels";
import { ReviewPacket, isPacket } from "./packet";
import examples from "./generated/examples.json";
import "./style.css";

declare const __BELONGS_TO_PASSWORD_REQUIRED__: boolean;

const passwordRequired = __BELONGS_TO_PASSWORD_REQUIRED__;
const families = { ellery: "The Ellerys", okafor: "The Okafors", park: "The Parks" };
const documentName = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,116}\.(?:md|txt)$/i;
const requestForFolder = "Please review this folder. Draw whose name things are in and what happens at a death. Include a QSBS ledger if the folder has a stock sale scenario.";
const markdownRules = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];
const secureMarkdownUrl = (url: string, key: string) => key === "href" && /^https:\/\//i.test(url) ? url : undefined;
const markdownComponents = {
  img: () => null,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
};

async function filePart(file: File) {
  const reader = new FileReader();
  const data = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.readAsDataURL(file);
  });
  return {
    type: "file" as const, filename: file.name,
    mediaType: file.name.toLowerCase().endsWith(".md") ? "text/markdown" as const : "text/plain" as const,
    data,
  };
}

async function filesFromDrop(event: DragEvent) {
  const entries = Array.from(event.dataTransfer.items, (item) => item.webkitGetAsEntry()).filter((entry) => entry !== null);
  const flatFiles = Array.from(event.dataTransfer.files);
  async function list(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file((file) => resolve([file]), reject));
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map(list))).flat();
  }
  return entries.length ? (await Promise.all(entries.map(list))).flat() : flatFiles;
}

function Markdown({ text, busy = false }: { text: string; busy?: boolean }) {
  return <Streamdown className="assistant-copy" mode={busy ? "streaming" : "static"} skipHtml
    rehypePlugins={markdownRules} urlTransform={secureMarkdownUrl} components={markdownComponents} controls={false}>{text}</Streamdown>;
}

type Answer = { optionId: string } | { text: string };
function FamilyQuestion({ request, gaps, disabled, answer, addDocument }: {
  request: InteractionRequest; gaps: Gap[]; disabled: boolean; answer: (value: Answer) => void;
  addDocument: (file: File, optionId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const options = request.options ?? [];
  const review = options.some(({ label }) => label === "Show the pages");
  const title = review ? request.prompt.split("\n\n")[0] : request.prompt;
  const canType = request.allowFreeform ?? request.display === "text";
  return <section className="question" aria-labelledby="qH">
    <h2 id="qH" className="d2"><Mark kind="gold" /><span>{title}</span></h2>
    {review && gaps.length > 0 && <>
      <ul className="q-gaps">{gaps.map(({ text, detail }) => <li key={text}>
        <Mark kind="missing" /><span className="g">{text}</span>
        {detail && <span className="s"><em>Would settle it:</em> {detail}</span>}</li>)}</ul>
      <p className="q-open">You can see the pages with these gaps left open.</p>
    </>}
    {options.length > 0 && <div className="q-actions">{options.map((option, index) => {
      const more = review && option.label === "I have another document";
      return <button key={option.id} type="button" disabled={disabled} className={`btn ${index ? "btn-quiet" : "btn-primary"}`}
        aria-expanded={more ? adding : undefined} onClick={() => more ? setAdding(!adding) : answer({ optionId: option.id })}>
        {option.label}{review && index === 0 && <ArrowRight className="arrow" aria-hidden="true" />}</button>;
    })}</div>}
    {adding && <div className="q-add"><p>Add a Markdown or text file. The review will check the updated folder.</p>
      <input type="file" aria-label="Add a document" accept=".md,.txt,text/plain,text/markdown" disabled={disabled} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        const option = options.find((item) => item.label === "I have another document");
        if (file && option) addDocument(file, option.id);
      }} /></div>}
    {canType && <form className="composer q-open" onSubmit={(event) => {
      event.preventDefault();
      const text = new FormData(event.currentTarget).get("answer");
      if (typeof text === "string" && text.trim()) answer({ text: text.trim() });
    }}><input className="field" name="answer" placeholder="Your answer" aria-label="Your answer" required disabled={disabled} />
      <button className="btn btn-primary" disabled={disabled}>Send</button></form>}
  </section>;
}

type Stage = "reading" | "drafting" | "checking" | "question" | "drawing" | "done" | "error";
const steps = ["Read", "Write", "Check", "Ask you", "Draw"];
const phase: Record<Stage, number> = { reading: 0, drafting: 1, checking: 2, question: 3, drawing: 4, done: 5, error: 1 };

function ReviewHeader({ stage, title, subtitle, family, files, fictional, elapsed, summary, restart, heading }: {
  stage: Stage; title: string; subtitle: React.ReactNode; family: string; files: number; fictional: boolean; elapsed: number;
  summary: string[]; restart: () => void; heading: React.Ref<HTMLHeadingElement>;
}) {
  const at = phase[stage];
  const seconds = Math.floor(elapsed);
  return <header className="mast"><div className="mast-in">
    <div className="mast-top"><span className="wordmark">belongs-to</span><span className="fam-name">{family} · {count(files, "document")}{fictional && " · fictional"}</span>
      <span className="sp" /><button className="btn-on-brand" type="button" onClick={restart}>Start again</button></div>
    <div className="mast-title"><div><h1 className="d2" ref={heading} tabIndex={-1}>{title}</h1><p className="stage-line">{subtitle}</p></div>
      <div className="clock"><span>{stage === "question" ? "Waiting for you · so far" : stage === "done" ? "The run took" : stage === "error" ? "Stopped after" : "Elapsed"}</span>
        <b>{seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`}</b></div></div>
    <ol className="rail" aria-label="Steps">{steps.map((step, index) => {
      const state = index === at ? stage === "error" ? "stop" : stage === "question" ? "you" : "now" : index < at ? "done" : "wait";
      return <li key={step} data-s={state} aria-current={index === at ? "step" : undefined}>
        <span className="rn"><Mark className="rm" kind={state === "done" ? "read" : state === "you" ? "gold" : state === "now" ? "reading" : state === "stop" ? "fail" : "wait"} />{step}</span>
        <span className="rc">{index === 1 && summary[index] ? <><span className="rail-full">{summary[index]}</span><span className="rail-short">{summary[index].split(" ")[0]}</span></>
          : index === 2 && summary[index] === "passed after repair" ? <><span className="rail-full">{summary[index]}</span><span className="rail-short">passed</span></>
            : summary[index]}</span></li>;
    })}</ol>
  </div></header>;
}

function checkFiles(files: File[]) {
  if (!files.length || files.some((file) => !documentName.test(file.name))) return "Choose Markdown or text documents with simple filenames.";
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > 40 || bytes > 768 * 1024 || files.some((file) => file.size > 256 * 1024)) {
    return "Choose up to 40 documents, under 768 KB altogether and 256 KB per file.";
  }
  if (new Set(files.map((file) => file.name)).size !== files.length) return "Give each document a different filename.";
}

type Run = { key: number; files: File[]; name: string; household: string; fictional: boolean; started: number };
function App() {
  const [password, setPassword] = useState("");
  const credentials = useRef("");
  const [unlocked, setUnlocked] = useState(!passwordRequired);
  const [rejected, setRejected] = useState(false);
  const [run, setRun] = useState<Run>();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [problem, setProblem] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [finished, setFinished] = useState<number>();
  const [peek, setPeek] = useState<{ doc: string; fact?: Citation }>();
  const [drafts, setDrafts] = useState<{ run: number; results: Map<string, DraftData> }>();
  const [message, setMessage] = useState("");
  const lastUpdate = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const runCount = useRef(0);

  const { store, snapshot: { events, messages, view, session, status } } = useReviewSession((): Record<string, string> => {
    const current = credentials.current;
    if (passwordRequired && !current) throw new Error("Enter the family password.");
    return current ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`family:${current}`)))}` } : {};
  }, report);

  const activity = useMemo(() => reviewActivity(events), [events]);
  const lastEvent = events.at(-1);
  const pending = openInteractions(view).find((item) => item.request.kind === "question" && item.answer === undefined);
  const isReview = pending?.request.options?.some(({ label }) => label === "Show the pages");
  const current = activity.attempts.at(-1);
  const lastFailure = activity.attempts.findLast((attempt) => attempt.errors?.length);
  const oldFailure = activity.attempts.findLast((attempt) => attempt !== current && attempt.errors?.length);
  const parts = messages.flatMap((entry) => entry.parts);
  const call = parts.findLast((part) => part.type === "tool" && part.callId === current?.id);
  const wrapped = call?.type === "tool" && call.state === "streaming";
  const candidate = call?.type === "tool" ? (wrapped ? call.inputText : object(call.input).modelJson) : undefined;
  const packetPart = parts.findLast((part) => part.type === "tool" && part.name === "finish_review" && part.state === "completed" && isPacket(part.output));
  const packet = packetPart?.type === "tool" && isPacket(packetPart.output) ? packetPart.output : undefined;
  const packetId = packetPart?.type === "tool" ? packetPart.callId : undefined;
  const busy = sending || status === "busy" || status === "resuming";
  const endedWithoutPages = !busy && !pending && !packet && events.some((event) => event.type === "turn.settled");
  const issues = problem || activity.toolFailure || (endedWithoutPages ? "The review ended before the pages could be drawn." : "");
  const writing = current?.stage === "drafting" || (!current && !activity.reading && activity.read.size > 0);
  const draft = run && drafts?.run === run.key
    ? (current && drafts.results.get(current.id)) ?? [...drafts.results.values()].at(-1) : undefined;
  const previous = oldFailure && drafts?.results.get(oldFailure.id);
  const acceptedGaps = current?.audit?.gaps ?? packet?.gaps?.map((text) => ({ text }));
  const promptGaps = isReview && pending ? pending.request.prompt.split("\n").filter((line) => /^• /.test(line)).map((line) => line.replace(/^• /, "")) : [];
  const gaps = acceptedGaps ?? (isReview ? promptGaps.map((text) => ({ text, detail: draft?.gaps.find((item) => item.text === text)?.detail })) : draft?.gaps ?? []);
  const idle = Math.max(0, Math.floor((clock - lastUpdate.current) / 1000));
  const stage: Stage = issues ? "error" : pending ? "question" : packet ? "done"
    : current?.stage === "rendering" || activity.answers > 0 && !current?.errors?.length ? "drawing"
    : current && current.stage !== "drafting" || oldFailure ? "checking"
    : writing ? "drafting" : "reading";

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run]);
  useEffect(() => { lastUpdate.current = Date.now(); }, [lastEvent]);
  useEffect(() => {
    if (packetId && !busy) setFinished((done) => done ?? Date.now());
  }, [packetId, busy]);
  useEffect(() => {
    if (!run || !current || typeof candidate !== "string") return;
    let alive = true;
    void readDraft(candidate, !wrapped).then((result) => {
      if (!alive || !result) return;
      setDrafts((previous) => {
        const values = previous?.run === run.key ? previous.results : new Map<string, DraftData>();
        if (values.get(current.id)?.text === result.text) return previous;
        const results = new Map([...values].slice(-3));
        results.set(current.id, result);
        return { run: run.key, results };
      });
    }, () => {});
    return () => { alive = false; };
  }, [candidate, current?.id, run, wrapped]);

  function report(error: unknown) {
    if (passwordRequired && ClientError.is(error) && error.status === 401) {
      credentials.current = "";
      setPassword("");
      setUnlocked(false);
      setRejected(true);
      setRun(undefined);
      setProblem("");
      return;
    }
    const detail = error instanceof Error ? error.message : "";
    setProblem(/timeout|timed out/i.test(detail) ? "The connection to the review timed out."
      : /sandbox/i.test(detail) ? "The review could not open its document workspace."
      : /gateway|credential|model provider/i.test(detail) ? "The review could not reach its model provider."
      : /network|stream|fetch|connect/i.test(detail) ? "The connection to the review was interrupted."
      : "The review stopped before it could finish.");
  }

  async function start(fileList: File[], name: string, fictional = false, replace = false) {
    if (!unlocked || (busy && !replace)) return;
    const files = fileList.filter((file) => !file.name.startsWith("."));
    const error = checkFiles(files);
    if (error) { setProblem(error); return; }
    const started = Date.now();
    setSending(true);
    setProblem("");
    setFinished(undefined);
    setClock(started);
    lastUpdate.current = started;
    setRun({ key: ++runCount.current, files, name, fictional, started,
      household: fictional ? `The ${name.slice(4, -1)} household` : name });
    setDocuments(files.map(({ name }) => ({ name, pages: 0 })));
    setMessage("");
    store.newSession();
    requestAnimationFrame(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); });
    try {
      const uploads = await Promise.all(files.map(filePart));
      const inventory = await Promise.all(files.map(async (file) => ({
        name: file.name, pages: (await file.text()).match(/^#{1,6} (?:Page \d+(?=\s|:|$)|Attached:)/gim)?.length || 1,
      })));
      setDocuments(inventory);
      await store.send({ message: [{ type: "text", text: requestForFolder }, ...uploads], signal: AbortSignal.timeout(60_000) });
    } catch (error) { report(error); }
    finally { setSending(false); }
  }

  async function answer(value: Answer) {
    if (!pending || answering || !unlocked) return false;
    setAnswering(true);
    setProblem("");
    try {
      await store.send({ answers: [{ interactionId: pending.interactionId, ...value }] });
      return true;
    } catch (error) { report(error); return false; }
    finally { setAnswering(false); }
  }

  async function addDocument(file: File, optionId: string) {
    if (!run) return;
    const files = [...run.files.filter((item) => item.name !== file.name), file];
    const error = checkFiles(files);
    if (error) { setProblem(error); return; }
    if (await answer({ optionId })) await start(files, run.name, run.fictional, true);
  }

  async function restart() {
    if (activeTurn(view) && session) {
      try { await store.cancel(); } catch { /* Starting again releases the local session. */ }
    }
    store.newSession();
    setRun(undefined);
    setDrafts(undefined);
    setDocuments([]);
    setProblem("");
    window.scrollTo(0, 0);
  }

  async function retry() {
    if (!run) return;
    setProblem("");
    lastUpdate.current = Date.now();
    if (!session || !busy) { await start(run.files, run.name, run.fictional, true); return; }
    try { await store.resume(); } catch (error) { report(error); }
  }

  async function followUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || busy || pending || !unlocked) return;
    try { await store.send({ message: message.trim() }); setMessage(""); }
    catch (error) { report(error); }
  }

  if (!run || !unlocked) return <div id="app" data-stage="start"><main className="start" aria-labelledby="startH">
    <div className="start-top"><span className="wordmark">belongs-to</span></div>
    <div className="start-body"><div><h1 className="d1" id="startH">Hand it a family’s documents.</h1>
      <p className="lede">It draws who owns what, cites every page, and shows the gaps in red. Nothing is drawn until a checker has tested every fact against its page and you have seen what is missing.</p>
      <ol className="promise"><li><span className="n">01</span><b>Reads every page</b>Trusts, wills, deeds, agreements, statements, forms.</li>
        <li><span className="n">02</span><b>Checks every fact</b>Each citation, amount and name is found on its page.</li>
        <li><span className="n">03</span><b>Asks before drawing</b>You see the open gaps and decide.</li></ol><FactKey start /></div>
      <div className="tray"><div className="choose" onDragOver={(event) => { if (unlocked) event.preventDefault(); }}
        onDrop={(event) => { event.preventDefault(); if (unlocked) void filesFromDrop(event).then((files) => start(files, "Your household")).catch(report); }}>
        {!unlocked ? <form className="pw" onSubmit={(event) => {
          event.preventDefault();
          if (!password) return;
          credentials.current = password;
          setPassword("");
          setUnlocked(true);
          setRejected(false);
        }}><h2 className="d3">This deployment is protected</h2><p className="sub">Enter the family password to open it.</p>
          <label htmlFor="pw">Family password</label><div className="pw-row"><input className="field" id="pw" type="password" autoComplete="current-password"
            value={password} aria-invalid={rejected} onChange={(event) => { setRejected(false); setPassword(event.currentTarget.value); }} />
            <button className="btn btn-primary" disabled={!password}>Open</button></div>
          {rejected && <p className="err" role="alert">That password didn’t work.</p>}</form>
          : <div><h2 className="d3">Try a fictional family</h2><p className="sub">Made up people, real looking papers. Or bring your own folder.</p>
            <ul className="fam-list">{(Object.keys(families) as (keyof typeof families)[]).map((id) => {
              const entries = Object.entries(examples[id]);
              return <li key={id}><button className="fam" type="button" onClick={() =>
                void start(entries.map(([name, body]) => new File([body], name, { type: "text/markdown" })), families[id], true)}>
                <FileText className="ic" aria-hidden="true" /><span><b>{families[id]}</b>{id === "ellery" && <small>A trust, two LLCs, a will, statements and forms</small>}</span>
                <span className="files">{count(entries.length, "file")}</span><ArrowRight className="arrow" aria-hidden="true" /></button></li>;
            })}<li><button className="fam fam-folder" type="button" onClick={() => folderInput.current?.click()}>
              <FolderOpen className="ic" aria-hidden="true" /><span><b>Choose a folder</b><small>Markdown or text files</small></span><span />
              <ArrowRight className="arrow" aria-hidden="true" /></button><input type="file" multiple hidden
                ref={(input) => { folderInput.current = input; input?.setAttribute("webkitdirectory", ""); }} onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  const name = files[0]?.webkitRelativePath.split("/")[0] || "Your household";
                  event.currentTarget.value = "";
                  if (files.length) void start(files, name);
                }} /></li></ul>
              {problem && <p className="err" role="alert">{problem}</p>}</div>}
        <p className="privacy"><LockKeyhole aria-hidden="true" /><span>Documents stay with your own deployment. The model reads the text through Vercel AI Gateway.</span></p>
      </div></div></div></main></div>;

  const read = activity.read.size;
  const checked = current?.audit?.audit?.citations;
  const writingDetail = draft?.section === "assets" ? "Writing what the family owns and what it is worth."
    : draft?.section === "holdings" ? "Writing whose name each holding is in."
    : draft?.section === "views" ? "Writing the notes for the pages."
    : draft?.section === "parties" ? "Writing the people and entities." : "";
  const lead = stage === "reading" ? "Reading the documents." : stage === "drafting" ? "Writing down the household."
    : stage === "checking" ? "Checking every fact against its page." : stage === "question" ? isReview ? "Before anything is drawn." : "A question about the papers."
    : stage === "drawing" ? "Drawing the pages." : stage === "done" ? run.fictional ? `${run.name}’ pages.` : "Your household pages." : "The review has paused.";
  const line = stage === "reading" ? <>{read} of {documents.length} read.</>
    : stage === "drafting" ? draft?.count ? <><b>{count(draft.count, "record")}</b> written, <b>{count(draft.facts, "fact")}</b> cited, <b>{count(gaps.length, "gap")}</b>. {writingDetail}</> : "Waiting for the model’s first words."
    : stage === "checking" ? current?.errors?.length ? "The checker found a problem. The agent is repairing the draft."
      : checked ? <>Checking <b>{count(checked.checked, "citation")}</b>, <b>{count(current?.audit?.audit?.dollars.checked ?? 0, "amount")}</b> and <b>{count(current?.audit?.audit?.names.checked ?? 0, "name")}</b>.</>
        : oldFailure ? "Checking again after a repair." : "Checking the citations, amounts and names on their pages."
    : stage === "question" ? isReview ? <>The draft passed the checks. <b>{count(gaps.length, "gap")}</b> open for review.</> : "The review needs your answer to continue."
    : stage === "drawing" ? "Drawing from the checked household."
    : stage === "done" ? <><b>{count(gaps.length, "gap")}</b> left open.</>
    : <>{read} of {documents.length} documents read. {packet ? "Your existing pages are still here." : "No pages have been drawn."}</>;
  const outputCount = packet?.files.filter((file) => file.name.endsWith(".html") && file.name !== "what-to-do.html").length ?? 0;
  const summary = [
    `${read} of ${documents.length}`,
    phase[stage] > 0 ? count(draft?.count ?? 0, "record") : "",
    phase[stage] > 2 ? oldFailure ? "passed after repair" : "passed" : stage === "checking" ? checked ? `${checked.checked - checked.failed} of ${checked.checked}` : "checking" : "",
    stage === "question" ? isReview ? `${gaps.length} open` : "answer needed" : phase[stage] > 3 ? "answered" : "",
    stage === "done" ? count(outputCount, "page") : stage === "drawing" ? "placing" : "",
  ];
  const open = (doc: string, fact?: Citation) => setPeek({ doc, fact });
  const packetEntry = messages.findIndex((entry) => entry.parts.some((part) => part.type === "tool" && part.callId === packetId));
  const textOf = (entry: typeof messages[number]) => entry.parts.flatMap((part) =>
    part.type === "text" && !part.text.startsWith(requestForFolder) && part.text.trim() ? [part.text] : []).join("\n\n");
  const received = packetEntry >= 0 ? messages.slice(packetEntry).filter((entry) => textOf(entry)) : [];
  const note = received[0]?.role === "assistant" ? textOf(received[0]) : "";
  const followUps = note ? received.slice(1) : received;
  const tail = wrapped && typeof candidate === "string" && !drafts?.results.get(current?.id ?? "") ? candidate : draft?.text ?? "";
  const activeCheck = current?.stage === "drafting" ? lastFailure : current;

  return <div id="app" data-stage={stage}>
    <ReviewHeader stage={stage} title={lead} subtitle={line} files={documents.length} summary={summary}
      elapsed={Math.max(0, ((finished ?? clock) - run.started) / 1000)} heading={heading}
      family={run.name} fictional={run.fictional} restart={() => void restart()} />
    <main className="work">
      <Documents files={documents} activity={activity} draft={draft} open={open} />
      <div className="main">
        {issues && <section className="errcard" aria-labelledby="errH" role="alert"><h2 className="d3" id="errH"><Mark kind="fail" />{issues}</h2>
          <p>{session ? "Retry to reconnect or start again with your folder." : "Retry with the same folder, or start again with other documents."}</p>
          <div className="q-actions"><button className="btn btn-primary" onClick={() => void retry()}>Retry</button>
            <button className="btn btn-quiet" onClick={() => void restart()}>Start again</button></div></section>}
        {pending && <FamilyQuestion key={pending.interactionId} request={pending.request} gaps={gaps} disabled={answering}
          answer={(value) => void answer(value)} addDocument={(file, id) => void addDocument(file, id)} />}
        {stage === "drawing" && <section className="panel drawing"><h2 className="d3">Drawing the pages</h2>
          <ol className="dsteps">{draft?.views.map(({ id, title, fig }) => <li key={id}><Mark kind="reading" />{title}<span className="ct">FIG. {fig}</span></li>)}</ol></section>}
        {packet ? <ReviewPacket key={packetId} files={packet.files} />
          : <Household title={run.household} draft={draft} audit={current?.stage === "drafting" ? undefined : current}
            failure={lastFailure} previous={previous} open={open} stopped={Boolean(issues)} />}
        {note && <section className="panel note" aria-label="The agent’s note"><div className="from"><PenLine className="mk" aria-hidden="true" />From the agent</div>
          <Markdown text={note} busy={busy} /></section>}
        {packet && <section className="panel after" aria-labelledby="askH">
          <h2 className="sr" id="askH">Ask about the pages</h2>
          <div className="thread" aria-live="polite">{followUps.map((entry) => <div className={entry.role === "user" ? "msg-q" : "msg-a"} key={entry.id}>
            {entry.role === "user" ? textOf(entry) : <Markdown text={textOf(entry)} busy={busy} />}</div>)}</div>
          <form className="composer" onSubmit={(event) => void followUp(event)}><label className="sr" htmlFor="ask">Ask about the pages</label>
            <input className="field" id="ask" value={message} placeholder="Ask about the pages" onChange={(event) => setMessage(event.currentTarget.value)} />
            <button className="btn btn-primary" disabled={!message.trim() || busy || Boolean(pending)}>Ask</button></form>
          <div className="after-foot"><span>Answers come from the same pages, with citations.</span>
            <button className="btn btn-quiet btn-sm" onClick={() => void restart()}>Start again with other documents</button></div></section>}
      </div>
      <aside className="side" aria-label="The draft and the checker">
        <DraftPanel draft={draft} tail={tail} gaps={gaps} started={Boolean(candidate)} writing={busy && writing && !pending} active={busy && !pending && !issues && !packet}
          idle={idle} canRetry={Boolean(session)} retry={() => void retry()} />
        <Checker attempt={activeCheck} previous={oldFailure} draft={draft} repairing={Boolean(current?.errors?.length && busy || oldFailure && writing)} open={open} />
        <FactKey />
      </aside>
    </main>
    {peek && <PagePeek key={peek.doc + peek.fact?.path} doc={peek.doc} fact={peek.fact} title={draft?.documents[peek.doc]?.title}
      pages={activity.pages.get(peek.doc)} close={() => setPeek(undefined)} />}
  </div>;
}

document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  document.documentElement.dataset.theme = event.matches ? "dark" : "light";
});
createRoot(document.getElementById("root")!).render(<App />);
