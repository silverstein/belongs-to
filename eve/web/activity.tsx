import { useEffect, useRef, useState } from "react";
import { FileCheck, FileText } from "lucide-react";
import { SessionStore, type SessionStoreInit, type SessionStoreSnapshot } from "eve/client";
import {
  Attachment, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle,
} from "@/components/ui/trace";
import { RecordKey, RecordMark } from "./record-mark";
import { DraftSketch, motionDelay, useDraftSketch } from "./draft-sketch";

export type DocumentInfo = { name: string; pages: number };
type CheckStatus = "passed" | "failed" | "skipped";
type Totals = { checked: number; failed: number };
type Evidence = { text: string; doc: string; at: string };
type Audit = {
  audit?: Record<"citations" | "dollars" | "names", Totals>;
  evidence?: Evidence[];
  facts: CheckStatus;
  layout: CheckStatus;
};
type Attempt = { id: string; stage: "drafting" | "checking" | "checked" | "rendering" | "settled"; audit?: Audit; errors?: string[] };
type Activity = {
  read: Map<string, number>;
  reading: boolean;
  attempts: Attempt[];
  told: string[];
  toolFailure?: string;
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function useReviewSession(headers: SessionStoreInit["headers"], onError: (error: Error) => void) {
  const [store] = useState(() => new SessionStore({ headers }));
  const [snapshot, setSnapshot] = useState(store.snapshot);
  store.setCallbacks({ onError });
  useEffect(() => {
    let frame: number | undefined;
    const unsubscribe = store.subscribe(() => {
      if (frame === undefined) frame = requestAnimationFrame(() => {
        frame = undefined;
        setSnapshot(store.snapshot);
      });
    });
    const stop = store.observe();
    return () => {
      unsubscribe();
      stop();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [store]);
  return { store, snapshot };
}

export function reviewActivity(events: SessionStoreSnapshot["events"]): Activity {
  const read = new Map<string, number>();
  const calls = new Map<string, string>();
  const pendingReads = new Set<string>();
  const attempts = new Map<string, Attempt>();
  const intake = new Map<string, Map<string, string>>();
  const told: string[] = [];
  let toolFailure: string | undefined;
  const attempt = (id: string) => {
    const current = attempts.get(id) ?? { id, stage: "drafting" };
    attempts.set(id, current);
    return current;
  };

  for (const event of events) {
    switch (event.type) {
      case "interaction.opened":
        if (event.data.request.kind === "question" && !event.data.request.options?.some(({ label }) => label === "Show the pages")) {
          intake.set(event.data.interactionId, new Map(event.data.request.options?.map(({ id, label }) => [id, label])));
        }
        break;
      case "interaction.settled": {
        const options = intake.get(event.data.interactionId);
        if (!options || event.data.outcome !== "accepted") break;
        const { optionId, text } = object(event.data.response);
        const answer = typeof text === "string" ? text : typeof optionId === "string" ? options.get(optionId) : undefined;
        if (answer) told.push(answer);
        break;
      }
      case "call.input":
        if (event.data.name === "finish_review") attempt(event.data.callId);
        break;
      case "call.requested": {
        const { callId, capability } = event.data;
        calls.set(callId, capability.name);
        if (capability.name === "finish_review") attempt(callId).stage = "checking";
        if (capability.name === "read_documents") pendingReads.add(callId);
        break;
      }
      case "call.progress": {
        const { callId, output } = event.data;
        const data = object(output);
        if (calls.get(callId) === "read_documents") {
          const { name, pages } = object(data.documentRead);
          if (typeof name === "string" && typeof pages === "number") read.set(name, pages);
        }
        if (calls.get(callId) === "finish_review") {
          const progress = object(data.reviewActivity);
          const item = attempt(callId);
          if (progress.stage === "checking" || progress.stage === "rendering") item.stage = progress.stage;
          if (progress.stage === "checked") {
            item.stage = "checked";
            item.audit = progress.result as Audit;
          }
        }
        break;
      }
      case "call.settled": {
        const { callId, outcome, output } = event.data;
        const data = object(output);
        if (calls.get(callId) === "read_documents") {
          pendingReads.delete(callId);
          for (const [name, pages] of Object.entries(object(data.documents))) {
            read.set(name, Object.keys(object(pages)).length);
          }
          toolFailure = outcome === "completed" && typeof data.error !== "string"
            ? undefined : typeof data.error === "string" ? data.error : "The agent could not open the uploaded documents.";
        }
        if (calls.get(callId) === "finish_review") {
          const item = attempt(callId);
          item.stage = "settled";
          item.errors = Array.isArray(data.errors) ? data.errors.filter((message): message is string => typeof message === "string")
            : outcome === "failed" ? ["The agent could not finish checking the draft."] : undefined;
        }
        break;
      }
    }
  }
  return { read, reading: pendingReads.size > 0, attempts: Array.from(attempts.values()), told, toolFailure };
}

export function DocumentCards({ documents, activity }: { documents: DocumentInfo[]; activity: Activity }) {
  const readOrder = [...activity.read.keys()];
  return (
    <section className="documents reveal" aria-label="Uploaded documents">
      <div className="section-heading">
        <h3>Documents</h3>
        <span aria-live="polite">{activity.read.size} of {documents.length} read</span>
      </div>
      <AttachmentGroup className="document-grid" tabIndex={0} aria-label="Files in the folder">
        {documents.map(({ name, pages }) => {
          const checked = activity.read.get(name);
          const count = checked ?? pages;
          return (
            <Attachment key={name} className="document-card" data-read={checked !== undefined}>
              <AttachmentMedia className="document-icon">
                {checked !== undefined
                  ? <FileCheck className="mark-settle" style={motionDelay(readOrder.indexOf(name))} aria-hidden="true" />
                  : <FileText aria-hidden="true" />}
              </AttachmentMedia>
              <AttachmentContent className="min-w-0">
                <AttachmentTitle title={name}>{name}</AttachmentTitle>
                <AttachmentDescription>{count ? `${count} ${count === 1 ? "page" : "pages"}${checked !== undefined ? " read" : ""}` : "Pages pending"}</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          );
        })}
      </AttachmentGroup>
    </section>
  );
}

export function TraceRow({ title, status, detail, shimmer = false }: {
  title: string; status: CheckStatus | "running"; detail?: string; shimmer?: boolean;
}) {
  const kind = status === "passed" ? "confirmed" : status === "running" ? "found" : status === "failed" ? "failed" : "missing";
  return (
    <TraceLine status={status === "failed" ? "error" : status === "running" ? "running" : status === "skipped" ? "pending" : undefined} className="trace-row">
      <TraceIcon><span key={kind} className="mark-settle"><RecordMark kind={kind} /></span></TraceIcon>
      <TraceTitle><span className={shimmer ? "active-step-label" : undefined} data-label={shimmer ? title : undefined}>{title}</span></TraceTitle>
      {detail && <TraceDescription>{detail}</TraceDescription>}
    </TraceLine>
  );
}

function outcome(totals?: Totals): CheckStatus {
  return totals?.failed ? "failed" : totals?.checked ? "passed" : "skipped";
}

function tally(totals?: Totals) {
  if (!totals?.checked) return "None checked";
  return totals.failed ? `${totals.failed} of ${totals.checked} need repair` : `${totals.checked} passed`;
}

const statusText = { passed: "Passed", failed: "Needs repair", skipped: "Not run" };

function AuditRows({ audit }: { audit: Audit }) {
  const rows = [
    { title: "Citations point to pages read", totals: audit.audit?.citations },
    { title: "Dollar amounts on the page", totals: audit.audit?.dollars },
    { title: "Names on the page", totals: audit.audit?.names },
    { title: "Household facts", status: audit.facts },
    { title: "Drawing layout", status: audit.layout },
  ];
  return rows.map(({ title, totals, status }, index) => (
    <div className="enter-record" key={title} style={motionDelay(index)}>
      <TraceRow title={title} status={status ?? outcome(totals)} detail={status ? statusText[status] : tally(totals)} />
    </div>
  ));
}

function ActiveStep({ title, count, writing, lastEvent }: {
  title: string; count?: string; writing: boolean; lastEvent: SessionStoreSnapshot["events"][number] | undefined;
}) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(started);
  const lastUpdate = useRef(started);
  useEffect(() => { lastUpdate.current = Date.now(); }, [lastEvent]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.floor((now - started) / 1000);
  const idle = Math.floor((now - lastUpdate.current) / 1000);
  const quiet = idle >= 20;
  const duration = elapsed < 60 ? `${elapsed} s` : `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, "0")}s`;
  return <div className="active-step" data-quiet={quiet}>
    <TraceRow title={title} status="running" detail={duration} shimmer={Boolean(lastEvent) && !quiet} />
    {count && <p className="active-step-detail">{count}</p>}
    {quiet && <p className="active-step-detail">Still {writing ? "writing" : "working"}, last update {idle} s ago</p>}
  </div>;
}

export function ReviewTrace({ activity, busy, hasQuestion, hasPacket, lastEvent, inputText }: {
  activity: Activity; busy: boolean; hasQuestion: boolean; hasPacket: boolean;
  lastEvent: SessionStoreSnapshot["events"][number] | undefined; inputText?: string;
}) {
  const current = activity.attempts.at(-1);
  const noticed = activity.read.size > 0 || current;
  const evidence = current?.audit?.evidence ?? activity.attempts.findLast((item) => item.audit?.evidence?.length)?.audit?.evidence ?? [];
  const active = !hasQuestion && !hasPacket && busy;
  const writing = current?.stage === "drafting";
  const checking = current?.stage === "checking";
  const sketch = useDraftSketch(active && (writing || checking) ? current?.id : undefined, inputText);
  const label = activity.reading ? "Reading the uploaded pages"
    : current?.stage === "rendering" ? "Drawing the approved pages"
    : current?.stage === "checked" ? "Preparing the review question"
    : writing || current?.errors?.length ? "Drafting the household picture"
    : activity.read.size ? "Working from the cited documents" : "Opening the folder";
  const count = writing ? sketch?.count
    ? `${sketch.count} ${sketch.count === 1 ? "record" : "records"} written`
    : inputText ? `${inputText.length.toLocaleString("en-US")} draft characters received` : undefined
    : current?.audit?.evidence?.length ? `${current.audit.evidence.length} facts cited`
    : activity.read.size ? `${activity.read.size} ${activity.read.size === 1 ? "file" : "files"} read` : undefined;
  return (
    <section className="review-trace reveal" aria-label="Review activity">
      <div className="section-heading"><h3>Review activity</h3></div>
      <Trace>
        {activity.read.size > 0 && !activity.reading && <TraceRow title="Documents read" status="passed" detail={`${activity.read.size} files`} />}
        {activity.attempts.map((item, index) => {
          if (item.stage === "drafting") return null;
          const failed = Boolean(item.errors?.length) || item.audit?.facts === "failed" || item.audit?.layout === "failed";
          const earlier = activity.attempts[index - 1];
          const title = earlier?.errors?.length ? `Repair ${index}` : earlier ? "Check revised draft" : "Check the draft";
          const status = failed ? "failed" : item.audit?.layout === "passed" || item.stage === "settled" ? "passed" : "running";
          const detail = failed ? "Needs repair" : status === "passed" ? "Passed" : undefined;
          if (item === current && checking && active) return <ActiveStep key={item.id} title={title} count={count} writing={false} lastEvent={lastEvent} />;
          if (!item.audit && !failed) return <TraceRow key={item.id} title={title} status={status} />;
          return (
            <TraceCollapsible key={item.id} defaultOpen>
              <TraceCollapsibleTrigger>
                <TraceRow title={title} status={status} detail={detail} />
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent className="trace-checks">
                {item.audit && <AuditRows audit={item.audit} />}
                {item.errors?.length ? <details className="check-notes">
                  <summary>See what needs repair</summary>
                  <ul>{item.errors.map((error, errorIndex) => <li key={errorIndex}>{error}</li>)}</ul>
                </details> : null}
              </TraceCollapsibleContent>
            </TraceCollapsible>
          );
        })}
        {!noticed && !active && !hasQuestion && <TraceRow title="Waiting for a folder" status="skipped" />}
      </Trace>
      {sketch && sketch.count > 0 && <DraftSketch sketch={sketch} />}
      {evidence.length > 0 && (
        <details className="evidence" open>
          <summary>{evidence.length} names and amounts found on cited pages</summary>
          <ul>{evidence.map(({ text, doc, at }, index) => <li key={`${text}:${doc}:${at}`} className="enter-record" style={motionDelay(index)}>
            <RecordMark kind="confirmed" />
            <span className="evidence-value" data-amount={/^-?\$\d/.test(text)}>{text}</span>
            <span className="evidence-source">{doc}, {at}</span>
          </li>)}</ul>
        </details>
      )}
      {active && !checking && <Trace className="active-trace">
        <ActiveStep key={`${current?.id ?? "read"}:${label}`} title={label} count={count} writing={writing} lastEvent={lastEvent} />
      </Trace>}
      {activity.told.map((answer, index) => <p key={index} className="answer-record"><RecordMark kind="told" /> The family answered {answer}.</p>)}
      <RecordKey />
    </section>
  );
}
