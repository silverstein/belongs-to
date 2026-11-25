import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, ArrowRight, FileStack, FolderOpen, LockKeyhole, Moon, Sun } from "lucide-react";
import { ClientError } from "eve/client";
import { openInteractions, type InteractionRequest } from "eve/events";
import { useEveAgent } from "eve/react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem,
  MessageScrollerProvider, MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Questionnaire, QuestionnaireActions, QuestionnaireChoice, QuestionnaireChoices,
  QuestionnaireDescription, QuestionnaireError, QuestionnaireInput, QuestionnaireItem, QuestionnaireSubmit, QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { DocumentCards, ReviewTrace, reviewActivity, type DocumentInfo } from "./activity";
import { ReviewPacket, isPacket } from "./packet";
import { RecordMark } from "./record-mark";
import examples from "./generated/examples.json";
import "./style.css";

declare const __BELONGS_TO_PASSWORD_REQUIRED__: boolean;

const passwordRequired = __BELONGS_TO_PASSWORD_REQUIRED__;
const names = { ellery: "Ellery", okafor: "Okafor", park: "Park" };
const documentName = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,116}\.(?:md|txt)$/i;
const quietMs = 60_000;
const requestForFolder = "Please review this folder. Draw whose name things are in and what happens at a death. Include a QSBS ledger if the folder has a stock sale scenario.";
const markdownRules = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];
const secureMarkdownUrl = (url: string, key: string) => key === "href" && /^https:\/\//i.test(url) ? url : undefined;
const markdownComponents = {
  img: () => null,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
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

function FamilyQuestion({ request, disabled, onAnswer }: {
  request: InteractionRequest;
  disabled: boolean;
  onAnswer: (answer: { optionId: string } | { text: string }) => void;
}) {
  const options = request.options ?? [];
  const review = options.some(({ label }) => label === "Show the pages");
  const [prompt, ...details] = review ? request.prompt.split("\n\n") : [request.prompt];
  const canType = request.allowFreeform ?? request.display === "text";
  const choices = options.map(({ id }) => ({ value: `option:${id}` }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const answer = new FormData(event.currentTarget).getAll("answer")
      .findLast((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (!answer) return;
    const option = choices.find(({ value }) => value === answer);
    onAnswer(option ? { optionId: option.value.slice("option:".length) } : { text: answer.trim() });
  }

  return (
    <div className="question reveal">
      <Item className="question-heading">
        <ItemContent><ItemTitle>{review ? "Review the gaps" : "A question about your papers"}</ItemTitle></ItemContent>
      </Item>
      <Questionnaire items={[{ name: "answer", required: true, choices }]} onSubmit={submit}>
        <QuestionnaireItem name="answer" required disabled={disabled}>
          <QuestionnaireTitle className="question-prompt">
            {review && <RecordMark kind="missing" />} {prompt}
          </QuestionnaireTitle>
          {details.length > 0 && <QuestionnaireDescription className="question-details">
            {details.join("\n\n")}
          </QuestionnaireDescription>}
          <QuestionnaireChoices>
            {options.map((option) => <QuestionnaireChoice key={option.id} value={`option:${option.id}`}>
              <span>{option.label}</span>
              {option.description && <small>{option.description}</small>}
            </QuestionnaireChoice>)}
            {canType && <QuestionnaireInput aria-label="Your answer" placeholder="Your answer" />}
          </QuestionnaireChoices>
          <QuestionnaireError>Choose an answer to continue.</QuestionnaireError>
        </QuestionnaireItem>
        <QuestionnaireActions><QuestionnaireSubmit disabled={disabled}>Confirm answer</QuestionnaireSubmit></QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}

function App() {
  const [password, setPassword] = useState("");
  const [passwordRejected, setPasswordRejected] = useState(false);
  const [draft, setDraft] = useState("");
  const [folder, setFolder] = useState<{ files: File[]; name: string }>();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [problem, setProblem] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [theme, setTheme] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const passwordForRequests = useRef("");
  const workspace = useRef<HTMLHeadingElement>(null);

  const passwordLocked = passwordRequired && (!password || passwordRejected);
  const agent = useEveAgent({
    headers: (): Record<string, string> => {
      const current = passwordForRequests.current;
      if (passwordRequired && !current) throw new Error("Enter the family password.");
      return current ? { Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`family:${current}`)))}` } : {};
    },
    onError(error) { report(error, true); },
  });
  const questions = openInteractions(agent.view).filter((item) => item.request.kind === "question" && item.answer === undefined);
  const busy = sending || agent.status === "busy" || agent.status === "resuming";
  const startDisabled = busy || passwordLocked;
  const activity = useMemo(() => reviewActivity(agent.events), [agent.events]);
  const packet = agent.messages.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "tool" && part.name === "finish_review" && part.state === "completed" && isPacket(part.output)
      ? [{ key: part.callId, files: part.output.files }] : [])).at(-1);
  const lastEvent = agent.events.at(-1);
  const listening = busy && !questions.length;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    setQuiet(false);
    if (!listening) return;
    const timer = window.setTimeout(() => setQuiet(true), quietMs);
    return () => window.clearTimeout(timer);
  }, [listening, lastEvent, reconnectCount]);

  function report(error: unknown, fromAgent = false) {
    if (passwordRequired && ClientError.is(error) && error.status === 401) {
      setPasswordRejected(true);
      setProblem("");
      return;
    }
    const message = error instanceof Error ? error.message : "";
    if (!fromAgent) { setProblem(message || "That didn't go through. Try again."); return; }
    if (/timeout|timed out/i.test(message)) setProblem("The connection to the review timed out.");
    else if (/sandbox/i.test(message)) setProblem("The review could not open its document workspace.");
    else if (/gateway|credential|model provider/i.test(message)) setProblem("The review could not reach its model provider.");
    else if (/network|stream|fetch|connect/i.test(message)) setProblem("The connection to the review was interrupted.");
    else setProblem("The review stopped before it could finish.");
  }

  async function start(fileList: File[], name: string) {
    if (startDisabled) return;
    setProblem("");
    const files = fileList.filter((file) => !file.name.startsWith("."));
    if (!files.length || files.some((file) => !documentName.test(file.name))) {
      setProblem("Choose a folder of Markdown or text documents with simple filenames.");
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
    setQuiet(false);
    setFolder({ files, name });
    setDocuments(files.map((file) => ({ name: file.name, pages: 0 })));
    setDraft("");
    agent.newSession();
    requestAnimationFrame(() => workspace.current?.focus({ preventScroll: window.innerWidth >= 768 }));
    try {
      const parts = await Promise.all(files.map(filePart));
      const inventory = await Promise.all(files.map(async (file) => ({
        name: file.name,
        pages: (await file.text()).match(/^#{1,6} (?:Page \d+(?=\s|:|$)|Attached:)/gim)?.length || 1,
      })));
      setDocuments(inventory);
      await agent.send([{ type: "text", text: requestForFolder }, ...parts], { signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      report(error, true);
    } finally {
      setSending(false);
    }
  }

  async function answer(interactionId: string, response: { optionId: string } | { text: string }) {
    if (answering || passwordLocked) return;
    setProblem("");
    setAnswering(true);
    try {
      await agent.respond([{ interactionId, ...response }]);
    } catch (error) {
      report(error, true);
    } finally {
      setAnswering(false);
    }
  }

  async function reconnect() {
    if (passwordLocked || !agent.session) return;
    setProblem("");
    setReconnectCount((value) => value + 1);
    try {
      await agent.resume();
    } catch (error) {
      report(error, true);
    }
  }

  async function sendText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startDisabled || questions.length || !draft.trim()) return;
    setProblem("");
    try {
      await agent.send(draft.trim());
      setDraft("");
    } catch (error) {
      report(error, true);
    }
  }

  const issue = problem || activity.toolFailure || (quiet ? "No new activity for a minute. The review may still be running." : "");
  const recover = agent.session && (busy || quiet);
  return (
    <main className="app">
      <a className="skip" href="#review">Skip to review</a>
      <header className="masthead">
        <a href="/" aria-label="belongs-to home">belongs<span> to</span></a>
        <Button variant="outline" size="icon" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      </header>
      <div className="columns">
        <aside className="intake" aria-label="Choose a folder">
          <h1>A picture of what your family owns.</h1>
          <p className="intro">See whose name things are in, where they go at a death, and what the paperwork leaves open.</p>
          {passwordRequired && (
            <div className="access">
              <label htmlFor="family-password"><LockKeyhole aria-hidden="true" /> Family password</label>
              <input id="family-password" type="password" autoComplete="current-password" value={password}
                aria-invalid={passwordRejected} aria-describedby={passwordRejected ? "password-error" : "password-help"}
                disabled={busy && !passwordRejected} onChange={(event) => {
                  passwordForRequests.current = event.target.value;
                  setPassword(event.target.value);
                  setPasswordRejected(false);
                }} />
              {passwordRejected
                ? <p id="password-error" className="error" role="alert"><AlertCircle aria-hidden="true" /> That password didn't work.</p>
                : <p id="password-help">Enter the password to choose a family or send a folder.</p>}
            </div>
          )}
          <section className="examples" aria-label="Example families">
            <h2>Try a fictional family</h2>
            {Object.keys(names).map((key) => {
              const family = key as keyof typeof names;
              return <Button key={family} className="family-option" variant="outline" disabled={startDisabled}
                aria-label={names[family]} aria-pressed={folder?.name === names[family]}
                onClick={() => void start(Object.entries(examples[family]).map(([name, value]) =>
                  new File([value], name)), names[family])}>
                <FileStack aria-hidden="true" /><span>{names[family]}</span>
                <small>{Object.keys(examples[family]).length} files</small><ArrowRight aria-hidden="true" />
              </Button>;
            })}
          </section>
          <div className={dragging ? "drop active" : "drop"}
            onDragOver={(event) => { event.preventDefault(); if (!startDisabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!startDisabled) void filesFromDrop(event).then((files) => start(files, "Your folder")).catch(report);
            }}>
            <label className="upload" aria-disabled={startDisabled}>
              <FolderOpen aria-hidden="true" /> Choose a folder
              <input type="file" ref={(input) => { input?.setAttribute("webkitdirectory", ""); }} multiple disabled={startDisabled}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  const name = files[0]?.webkitRelativePath.split("/")[0] || "Your folder";
                  event.currentTarget.value = "";
                  void start(files, name);
                }} />
            </label>
            <small>Markdown or text files</small>
          </div>
          <p className="privacy">Documents stay with your Vercel deployment. The model reads the text through AI Gateway.</p>
        </aside>

        <section className="chat" aria-labelledby="review">
          <header className="chat-header">
            <h2 id="review" ref={workspace} tabIndex={-1}>{folder?.name ?? "Family review"}</h2>
            {busy && <Button variant="ghost" disabled={passwordLocked || !agent.session}
              onClick={() => void agent.cancel().catch((error) => report(error, true))}>Stop review</Button>}
          </header>

          <MessageScrollerProvider key={folder?.name ?? "empty"}>
            <MessageScroller className="chat-scroller">
              <MessageScrollerViewport className="chat-viewport">
                <MessageScrollerContent className="thread">
                  {!folder && <MessageScrollerItem>
                    <div className="empty">
                      <FolderOpen aria-hidden="true" />
                      <h3>Start with the papers.</h3>
                      <p>Choose an example or upload a folder to follow the review here.</p>
                    </div>
                  </MessageScrollerItem>}
                  {folder && <MessageScrollerItem>
                    <DocumentCards documents={documents} activity={activity} />
                  </MessageScrollerItem>}
                  {folder && <MessageScrollerItem>
                    <ReviewTrace activity={activity} busy={busy} hasQuestion={Boolean(questions.length)} hasPacket={Boolean(packet)} />
                  </MessageScrollerItem>}
                  {questions.map(({ interactionId, request }) => <MessageScrollerItem key={interactionId}>
                    <FamilyQuestion request={request} disabled={answering || passwordLocked}
                      onAnswer={(response) => void answer(interactionId, response)} />
                  </MessageScrollerItem>)}
                  {packet && <MessageScrollerItem key={packet.key} className="packet-entry">
                    <Marker className="packet-marker"><MarkerContent>Review confirmed</MarkerContent></Marker>
                    <ReviewPacket files={packet.files} theme={theme} onError={report} />
                  </MessageScrollerItem>}
                  {agent.messages.map((message) => {
                    const text = message.parts.filter((part) => part.type === "text" && !part.text.startsWith(requestForFolder) && part.text.trim());
                    if (!text.length) return null;
                    return <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                      <Message align={message.role === "user" ? "end" : "start"} data-author={message.role}>
                        <MessageContent>{text.map((part, index) => part.type === "text" &&
                          <Bubble key={part.id ?? index} variant={message.role === "user" ? "muted" : "ghost"}>
                            <BubbleContent className="message-text">
                              {message.role === "assistant"
                                ? <Streamdown className="assistant-copy" mode={busy ? "streaming" : "static"} skipHtml
                                  rehypePlugins={markdownRules} urlTransform={secureMarkdownUrl} components={markdownComponents} controls={false}>
                                  {part.text}
                                </Streamdown>
                                : part.text}
                            </BubbleContent>
                          </Bubble>)}</MessageContent>
                      </Message>
                    </MessageScrollerItem>;
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
          {issue && <div className="recovery" role="alert">
            <AlertCircle aria-hidden="true" /><span>{issue}</span>
            {recover ? <Button variant="outline" disabled={passwordLocked} onClick={() => void reconnect()}>Reconnect</Button>
              : folder && <Button variant="outline" disabled={startDisabled} onClick={() => void start(folder.files, folder.name)}>Retry review</Button>}
          </div>}
          {folder && !questions.length && <form className="composer" onSubmit={(event) => void sendText(event)}>
            <input aria-label="Message" placeholder="Ask about the pages" disabled={startDisabled || !agent.session}
              value={draft} onChange={(event) => setDraft(event.target.value)} />
            <Button type="submit" disabled={startDisabled || !agent.session || !draft.trim()}>Send</Button>
          </form>}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
