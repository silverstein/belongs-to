import { useState, type DragEvent, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { openInteractions } from "eve/events";
import { useEveAgent } from "eve/react";
import examples from "./generated/examples.json";
import "./style.css";

const names = { ellery: "Ellery", okafor: "Okafor", park: "Park" };
const labels: Record<string, string> = {
  "whose-name.html": "Whose name is it in?",
  "at-a-death.html": "What happens at a death?",
  "qsbs.html": "QSBS ledger",
  "what-to-do.html": "What to do",
  "household.json": "Model and citations",
};
const documentName = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,116}\.(?:md|txt)$/i;

type Download = { name: string; gzip: string; embedsFonts: boolean };

function isPacket(output: unknown): output is { files: Download[] } {
  if (!output || typeof output !== "object" || !("files" in output) || !Array.isArray(output.files)) return false;
  return output.files.length > 0 && output.files.every((file) =>
    file && Object.hasOwn(labels, file.name) && typeof file.gzip === "string" && typeof file.embedsFonts === "boolean");
}

async function download(file: Download) {
  const stream = new Blob([Uint8Array.from(atob(file.gzip), (char) => char.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"));
  let text = await new Response(stream).text();
  if (file.embedsFonts) {
    const response = await fetch("/belongs-to-fonts.css");
    if (!response.ok) throw new Error("The fonts could not be added to this page. Try the download again.");
    const fonts = await response.text();
    text = text.replace("/* BELONGS_TO_EMBED_FONTS */", () => fonts);
  }
  const type = file.name.endsWith(".html") ? "text/html; charset=utf-8" : "application/json";
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toFilePart(file: File): Promise<{ type: "file"; filename: string; mediaType: string; data: string }> {
  const mediaType = file.name.toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve({ type: "file", filename: file.name, mediaType, data: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}

async function filesFromDrop(event: DragEvent) {
  const entries = Array.from(event.dataTransfer.items, (item) => item.webkitGetAsEntry());
  const flatFiles = Array.from(event.dataTransfer.files);

  async function list(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
      return new Promise((resolve, reject) => (entry as FileSystemFileEntry).file((file) => resolve([file]), reject));
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      entries.push(...batch);
    }
    return (await Promise.all(entries.map(list))).flat();
  }

  const known = entries.filter((entry): entry is FileSystemEntry => entry !== null);
  return known.length ? (await Promise.all(known.map(list))).flat() : flatFiles;
}

function App() {
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState("");
  const [reviewName, setReviewName] = useState("");
  const [problem, setProblem] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const agent = useEveAgent({
    headers: (): Record<string, string> => password
      ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`family:${password}`)))}` } : {},
  });
  const questions = openInteractions(agent.view).filter((item) => item.request.kind === "question" && item.answer === undefined);
  const busy = sending || agent.status === "busy" || agent.status === "resuming";
  const packets = agent.messages.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "tool" && part.name === "finish_review" && part.state === "completed" && isPacket(part.output)
      ? [part.output.files] : []));
  const downloads = packets.at(-1);

  function report(error: unknown) {
    setProblem(error instanceof Error ? error.message : "That didn't go through. Please try again.");
  }

  async function start(fileList: File[], name: string) {
    if (busy) return;
    setProblem("");
    const files = fileList.filter((file) => !file.name.startsWith("."));
    if (!files.length || files.some((file) => !documentName.test(file.name))) {
      setProblem("Choose a folder of .md or .txt documents. Use simple filenames and leave other file types out of the folder.");
      return;
    }
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 40 || bytes > 768 * 1024 || files.some((file) => file.size > 256 * 1024)) {
      setProblem("Choose up to 40 documents, under 768 KB altogether and 256 KB per file.");
      return;
    }
    if (new Set(files.map((file) => file.name)).size !== files.length) {
      setProblem("Give each document a different filename.");
      return;
    }
    setSending(true);
    try {
      const parts = await Promise.all(files.map(toFilePart));
      agent.newSession();
      setReviewName(name);
      setDraft("");
      await agent.send([
        { type: "text", text: "Please review this folder. Draw whose name things are in and what happens at a death. Include a QSBS ledger if the folder has a stock sale scenario." },
        ...parts,
      ]);
    } catch (error) {
      report(error);
    } finally {
      setSending(false);
    }
  }

  async function sendText(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || (busy && questions.length === 0)) return;
    setProblem("");
    const question = questions[0];
    try {
      if (question) {
        await agent.respond([{ interactionId: question.interactionId, text: draft.trim() }]);
      } else {
        await agent.send(draft.trim());
      }
      setDraft("");
    } catch (error) {
      report(error);
    }
  }

  return (
    <main>
      <header className="masthead"><a href="/" aria-label="belongs-to home">belongs<span> to</span></a></header>
      <div className="columns">
        <aside>
          <h1>A picture of what your family owns.</h1>
          <p>See whose name things are in, where they go at a death, and what the paperwork leaves open.</p>
          <div
            className={dragging ? "drop active" : "drop"}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void filesFromDrop(event).then((files) => start(files, "Your folder")).catch(report);
            }}
          >
            <label className="upload" aria-disabled={busy}>
              Choose a folder
              <input
                type="file" ref={(input) => { input?.setAttribute("webkitdirectory", ""); }} multiple disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  const name = files[0]?.webkitRelativePath.split("/")[0] || "Your folder";
                  event.currentTarget.value = "";
                  void start(files, name);
                }}
              />
            </label>
            <small>Or drop a folder of .md or .txt files</small>
          </div>
          <section className="examples" aria-label="Example families">
            <h2>Try a fictional family</h2>
            <div className="options">
              {(Object.keys(names) as Array<keyof typeof names>).map((key) => (
                <button key={key} type="button" disabled={busy} onClick={() => {
                  const files = Object.entries(examples[key]).map(([name, value]) => new File([value], name));
                  void start(files, names[key]);
                }}>{names[key]}</button>
              ))}
            </div>
          </section>
          <details><summary>Deployment password</summary>
            <label>Family password<input type="password" autoComplete="current-password" value={password}
              disabled={busy} onChange={(event) => setPassword(event.target.value)} /></label>
          </details>
          <p className="privacy">Your Vercel deployment handles the files. The model reads their contents through AI Gateway.</p>
        </aside>
        <section className="chat" aria-label="Review">
          <header className="chatHeader">
            <h2>{reviewName || "Family review"}</h2>
            {busy && <button type="button" className="quiet" onClick={() => void agent.cancel().catch(report)}>Stop</button>}
          </header>
          <div className="thread" aria-live="polite">
            {!agent.messages.length && <p className="empty">Choose an example or send a folder to start.</p>}
            {agent.messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                {message.parts.map((part, index) => {
                  if (part.type === "text") return <p key={part.id ?? index}>{part.text}</p>;
                  if (part.type === "file") return <small key={index}>{part.filename}</small>;
                  return null;
                })}
              </div>
            ))}
            {questions.map(({ interactionId, request }) => (
              <fieldset key={interactionId} className="question">
                <legend>A question about your papers</legend>
                <p>{request.prompt}</p>
                <div className="options">{request.options?.map((option) => (
                  <button type="button" key={option.id}
                    onClick={() => void agent.respond([{ interactionId, optionId: option.id }]).catch(report)}>
                    {option.label}
                  </button>
                ))}</div>
              </fieldset>
            ))}
            {busy && !questions.length && <p role="status" className="working">Working through the pages…</p>}
            {downloads && (
              <section className="downloads" aria-label="Downloads">
                <h3>Keep a copy</h3>
                {downloads.map((file) => <button key={file.name} type="button" onClick={() => void download(file).catch(report)}>
                  {labels[file.name]} <span aria-hidden="true">↓</span>
                </button>)}
              </section>
            )}
            {(problem || agent.error) && <p className="error" role="alert">{problem || agent.error?.message}</p>}
          </div>
          {reviewName && (
            <form className="composer" onSubmit={(event) => void sendText(event)}>
              <input aria-label="Message" placeholder={questions.length ? "Type your answer" : "Ask about the pages"}
                disabled={busy && !questions.length} value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button disabled={!draft.trim() || (busy && !questions.length)}>Send</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
