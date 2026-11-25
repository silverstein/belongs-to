import { markLabels, markShapes } from "../../kit/record-marks.mjs";

export type Mark = keyof typeof markShapes;

export function RecordMark({ kind }: { kind: Mark }) {
  return <svg className="record-mark" data-kind={kind} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: markShapes[kind] }} />;
}

export function RecordKey() {
  return <ul className="record-key" aria-label="Record mark key">
    {Object.entries(markLabels).map(([kind, text]) => <li key={kind}><RecordMark kind={kind as Mark} />{text}</li>)}
  </ul>;
}
