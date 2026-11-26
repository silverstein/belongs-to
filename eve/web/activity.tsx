import { useEffect, useState } from "react";
import { SessionStore, type SessionStoreInit, type SessionStoreSnapshot } from "eve/client";
import { object } from "./draft-data";

export type DocumentInfo = { name: string; pages: number };
export type CheckStatus = "passed" | "failed" | "skipped";
export type Totals = { checked: number; failed: number };
type Evidence = { text: string; doc: string; at: string };
export type Audit = {
  audit?: Record<"citations" | "dollars" | "names", Totals>;
  evidence?: Evidence[];
  gaps?: Array<{ text: string; detail?: string }>;
  facts: CheckStatus;
  layout: CheckStatus;
};
export type Attempt = { id: string; stage: "drafting" | "checking" | "checked" | "rendering" | "settled"; audit?: Audit; errors?: string[] };
export type Activity = {
  read: Map<string, number>;
  reading: boolean;
  pages: Map<string, Record<string, string>>;
  answers: number;
  attempts: Attempt[];
  told: string[];
  toolFailure?: string;
};

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
  const texts = new Map<string, Record<string, string>>();
  let answers = 0;
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
        if (event.data.outcome === "accepted" && object(event.data.response).optionId === "show") answers++;
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
            const actual = Object.fromEntries(Object.entries(object(pages)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
            read.set(name, Object.keys(actual).length);
            texts.set(name, actual);
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
  return { read, pages: texts, answers, reading: pendingReads.size > 0, attempts: Array.from(attempts.values()), told, toolFailure };
}
