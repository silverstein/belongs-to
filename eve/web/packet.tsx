import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Expand, X } from "lucide-react";
import { previewReady } from "../lib/preview.mjs";

const labels: Record<string, string> = {
  "whose-name.html": "Whose name is it in?",
  "at-a-death.html": "What happens at a death?",
  "qsbs.html": "QSBS ledger",
  "what-to-do.html": "What to do",
  "household.json": "Model and citations",
};

type DownloadFile = { name: string; gzip: string; embedsFonts: boolean };
export function isPacket(output: unknown): output is { files: DownloadFile[]; gaps?: string[] } {
  if (!output || typeof output !== "object" || !("files" in output) || !Array.isArray(output.files)) return false;
  return (!("gaps" in output) || Array.isArray(output.gaps) && output.gaps.every((gap) => typeof gap === "string")) && output.files.length > 0 && output.files.every((file) =>
    file && Object.hasOwn(labels, file.name) && typeof file.gzip === "string" && typeof file.embedsFonts === "boolean");
}

let fontStyles: Promise<string> | undefined;
async function decode(file: DownloadFile) {
  const stream = new Blob([Uint8Array.from(atob(file.gzip), (character) => character.charCodeAt(0))])
    .stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  if (!file.embedsFonts) return text;
  fontStyles ??= fetch("/belongs-to-fonts.css").then((response) => {
    if (!response.ok) throw new Error("The fonts could not be added. Try opening the page again.");
    return response.text();
  }).catch((error) => { fontStyles = undefined; throw error; });
  const fonts = await fontStyles;
  return text.replace("/* BELONGS_TO_EMBED_FONTS */", () => fonts);
}

function DrawingPreview({ title, html, onRetry }: { title: string; html: string; onRetry: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const hasReadySignal = html.includes(previewReady);
  useLayoutEffect(() => {
    if (!hasReadySignal) return;
    const timer = window.setTimeout(() => setStatus("failed"), 15_000);
    function loaded(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data !== previewReady && event.data?.type !== previewReady) return;
      const next = event.data?.height;
      if (typeof next === "number" && Number.isFinite(next) && next > 0) setHeight(Math.min(16_000, Math.ceil(next + 48)));
      window.clearTimeout(timer);
      setStatus("ready");
    }
    window.addEventListener("message", loaded);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", loaded);
    };
  }, [hasReadySignal]);
  return <div className="preview-frame" data-ready={status === "ready"}>
    <iframe ref={frame} className="preview" title={title} sandbox="allow-scripts" srcDoc={html} style={height ? { height } : undefined}
      onLoad={hasReadySignal ? undefined : () => setStatus("ready")}
      aria-hidden={status !== "ready"} tabIndex={status === "ready" ? undefined : -1} />
    {status === "loading" && <p className="preview-status" role="status">Opening {title}</p>}
    {status === "failed" && <div className="preview-status" role="alert">
      The preview could not be opened. <button className="btn btn-quiet btn-sm" onClick={onRetry}>Retry preview</button>
    </div>}
  </div>;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawingImage(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const svg = doc.querySelector<SVGSVGElement>("svg.bt-figure");
  const viewBox = svg?.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (!svg || !viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error("This drawing could not be exported.");
  }
  const css = [...doc.querySelectorAll("style")].map((style) => style.textContent).join("\n");
  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `${css}\nsvg.bt-figure{background:var(--bt-plate)}`;
  svg.prepend(style);
  svg.setAttribute("width", String(viewBox[2]));
  svg.setAttribute("height", String(viewBox[3]));
  return { blob: new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), width: viewBox[2], height: viewBox[3] };
}

async function asPng({ blob, width, height }: ReturnType<typeof drawingImage>) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(2, 4096 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not make the PNG.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((data) => data ? resolve(data) : reject(new Error("The PNG could not be saved."))));
  } finally { URL.revokeObjectURL(url); }
}

async function printImage(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const page = document.createElement("section");
  page.className = "print-me print-figure";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const image = new Image();
  image.alt = title;
  image.src = url;
  page.append(heading, image);
  try {
    await image.decode();
    document.body.append(page);
    try { window.print(); } finally { page.remove(); }
  } finally { URL.revokeObjectURL(url); }
}

const order = ["at-a-death.html", "whose-name.html", "qsbs.html", "what-to-do.html"];

function Figure({ file }: { file: DownloadFile }) {
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = labels[file.name];
  const drawing = file.name !== "what-to-do.html";
  const figure = html?.match(/class="bt-fig"><b>Fig\. (\d+)<\/b>/)?.[1];
  useEffect(() => {
    let current = true;
    setError("");
    void decode(file).then(
      (text) => { if (current) setHtml(text); },
      () => { if (current) setError("The preview could not be opened."); },
    );
    return () => { current = false; };
  }, [file, retry]);
  useLayoutEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);

  async function save(format: "svg" | "png" | "pdf" | "html") {
    if (!html || exporting) return;
    setError("");
    setExporting(true);
    try {
      const name = file.name.replace(/\.html$/, "");
      if (format === "html") download(file.name, new Blob([html], { type: "text/html; charset=utf-8" }));
      else {
        const image = drawingImage(html);
        if (format === "svg") download(name + ".svg", image.blob);
        else if (format === "png") download(name + ".png", await asPng(image));
        else await printImage(image.blob, title);
      }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The download could not be made."); }
    finally { setExporting(false); }
  }

  return <figure className="fig">
    <figcaption className="fig-bar"><span className="ttl">{figure && <span>FIG. {figure}</span>}{title}</span>
      <button className="fbtn" disabled={!html} onClick={() => setExpanded(true)}><Expand />Expand</button>
      {drawing ? (["svg", "png", "pdf"] as const).map((format) =>
        <button key={format} className="fbtn" disabled={!html || exporting} onClick={() => void save(format)}><Download />{format.toUpperCase()}</button>)
        : <button className="fbtn" disabled={!html || exporting} onClick={() => void save("html")}><Download />HTML</button>}
    </figcaption>
    {html ? <DrawingPreview key={retry} title={title} html={html} onRetry={() => setRetry((value) => value + 1)} />
      : <p className="preview-status">Opening {title}</p>}
    {error && <div className="preview-status" role="alert">{error}
      {!html && <button className="btn btn-quiet btn-sm" onClick={() => setRetry((value) => value + 1)}>Retry preview</button>}</div>}
    {expanded && html && <dialog ref={dialog} className="expand" aria-label={title} onClose={() => setExpanded(false)}>
      <button type="button" className="xbtn" aria-label="Close" autoFocus onClick={() => dialog.current?.close()}><X /></button>
      <div className="expand-in"><div className="fig"><DrawingPreview title={title} html={html} onRetry={() => setExpanded(false)} /></div></div>
    </dialog>}
  </figure>;
}

export function ReviewPacket({ files }: { files: DownloadFile[] }) {
  const pages = files.filter((file) => order.includes(file.name)).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const model = files.find((file) => file.name === "household.json");
  return <section className="figs" aria-label="Drawings">
    {pages.map((file) => <Figure key={file.name} file={file} />)}
    {model && <ModelDownload file={model} />}
  </section>;
}

function ModelDownload({ file }: { file: DownloadFile }) {
  const [error, setError] = useState(false);
  return <div><button type="button" className="fbtn" onClick={() => void decode(file).then(
    (text) => download(file.name, new Blob([text], { type: "application/json" })),
    () => setError(true),
  )}><Download />Model and citations</button>{error && <p role="alert">The model could not be downloaded.</p>}</div>;
}
