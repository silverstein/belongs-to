import { FileText } from "lucide-react";
import type { UseEveAgentReturn } from "eve/react";
import {
  Attachment, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle,
} from "@/components/ui/trace";
import { RecordKey, RecordMark } from "./record-mark";

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

export function reviewActivity(events: UseEveAgentReturn["events"]): Activity {
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
              <AttachmentMedia className="document-icon">{checked !== undefined ? <RecordMark kind="found" /> : <FileText />}</AttachmentMedia>
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

export function TraceRow({ title, status, detail }: {
  title: string; status: CheckStatus | "running"; detail?: string;
}) {
  return (
    <TraceLine status={status === "failed" ? "error" : status === "running" ? "running" : status === "skipped" ? "pending" : undefined} className="trace-row">
      <TraceIcon><RecordMark kind={status === "passed" ? "confirmed" : status === "running" ? "found" : status === "failed" ? "failed" : "missing"} /></TraceIcon>
      <TraceTitle>{title}</TraceTitle>
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

function AuditRows({ audit }: { audit: Audit }) {
  return <>
    <TraceRow title="Citations point to pages read" status={outcome(audit.audit?.citations)}
      detail={tally(audit.audit?.citations)} />
    <TraceRow title="Dollar amounts on the page" status={outcome(audit.audit?.dollars)}
      detail={tally(audit.audit?.dollars)} />
    <TraceRow title="Names on the page" status={outcome(audit.audit?.names)}
      detail={tally(audit.audit?.names)} />
    <TraceRow title="Household facts" status={audit.facts} detail={statusText[audit.facts]} />
    <TraceRow title="Drawing layout" status={audit.layout} detail={statusText[audit.layout]} />
  </>;
}

const statusText = { passed: "Passed", failed: "Needs repair", skipped: "Not run" };

export function ReviewTrace({ activity, busy, hasQuestion, hasPacket }: {
  activity: Activity; busy: boolean; hasQuestion: boolean; hasPacket: boolean;
}) {
  const current = activity.attempts.at(-1);
  const noticed = activity.read.size > 0 || current;
  const evidence = current?.audit?.evidence ?? activity.attempts.findLast((item) => item.audit?.evidence?.length)?.audit?.evidence ?? [];
  const active = !hasQuestion && !hasPacket && busy;
  const label = activity.reading ? "Reading the uploaded pages"
    : current?.stage === "rendering" ? "Drawing the approved pages"
    : current?.stage === "checking" ? "Checking the draft"
    : current?.stage === "drafting" || current?.errors?.length ? "Drafting the household picture"
    : activity.read.size ? "Working from the cited documents" : "Opening the folder";
  return (
    <section className="review-trace reveal" aria-label="Review activity">
      <div className="section-heading"><h3>Review activity</h3></div>
      <Trace>
        {activity.read.size > 0 && <TraceRow title="Documents read" status="running" detail={`${activity.read.size} files`} />}
        {activity.attempts.map((item, index) => {
          const failed = Boolean(item.errors?.length);
          const earlier = activity.attempts[index - 1];
          const title = earlier?.errors?.length ? `Repair ${index}` : earlier ? "Check revised draft" : "Check the draft";
          return (
            <TraceCollapsible key={item.id} defaultOpen>
              <TraceCollapsibleTrigger>
                <TraceRow title={title}
                  status={failed ? "failed" : item.audit?.layout === "passed" ? "passed" : "running"}
                  detail={failed ? "Needs repair" : item.audit?.layout === "passed" ? "Passed" : undefined} />
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
        {active && <TraceRow title={label} status="running" />}
        {!noticed && !active && !hasQuestion && <TraceRow title="Waiting for a folder" status="skipped" />}
      </Trace>
      {evidence.length > 0 && (
        <details className="evidence" open>
          <summary>{evidence.length} names and amounts found on cited pages</summary>
          <ul>{evidence.map(({ text, doc, at }) => <li key={`${text}:${doc}:${at}`}>
            <RecordMark kind="confirmed" /><strong>{text}</strong><span>{doc}, {at}</span>
          </li>)}</ul>
        </details>
      )}
      {activity.told.map((answer, index) => <p key={index} className="answer-record"><RecordMark kind="told" /> The family answered {answer}.</p>)}
      <RecordKey />
    </section>
  );
}
