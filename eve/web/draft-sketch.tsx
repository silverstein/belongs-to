import { useEffect, useState, type CSSProperties } from "react";
import { readDraft, type DraftData, type DraftRow } from "./draft-data";
import { RecordMark } from "./record-mark";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function motionDelay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index * 36, 288)}ms` };
}

export function useDraftSketch(callId: string | undefined, inputText: string | undefined) {
  const [sketch, setSketch] = useState<{ callId: string; data: DraftData }>();
  useEffect(() => {
    if (!callId || !inputText) return;
    let current = true;
    void readDraft(inputText).then((data) => {
      if (current && data) setSketch((previous) => previous?.callId === callId && JSON.stringify(previous.data) === JSON.stringify(data)
        ? previous : { callId, data });
    }, () => {});
    return () => { current = false; };
  }, [callId, inputText]);
  return sketch?.callId === callId ? sketch?.data : undefined;
}

function SketchRows({ rows, label }: { rows: DraftRow[]; label: string }) {
  if (!rows.length) return null;
  return <ul aria-label={label} className="sketch-rows">
    {rows.map(({ id, name, kind, amount, citation }, index) => (
      <li key={id} className="sketch-row enter-record" style={motionDelay(index)}>
        <RecordMark kind={kind === "gap" ? "missing" : "found"} />
        <div className="sketch-record">
          <span>{name}</span>
          {kind !== "gap" && <small>{kind === "llc" ? "LLC" : kind.replaceAll("-", " ")}</small>}
          {amount !== undefined && <span className="sketch-amount">{usd.format(amount)}</span>}
          {citation && <small>{citation}</small>}
        </div>
      </li>
    ))}
  </ul>;
}

export function DraftSketch({ sketch }: { sketch: DraftData }) {
  const hidden = sketch.count - sketch.people.length - sketch.assets.length - sketch.gaps.length;
  return <section className="draft-sketch" aria-label="Draft household records">
    <div className="sketch-heading"><h4>Draft household</h4><span>Unchecked</span></div>
    <SketchRows rows={sketch.people} label="People" />
    <SketchRows rows={sketch.assets} label="Holdings and accounts" />
    <SketchRows rows={sketch.gaps} label="Gaps" />
    {hidden > 0 && <p className="sketch-more">{hidden} more {hidden === 1 ? "record" : "records"} in the draft</p>}
  </section>;
}
