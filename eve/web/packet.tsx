import { useEffect, useRef, useState } from "react";
import { Download, Expand, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  "whose-name.html": "Whose name is it in?",
  "at-a-death.html": "What happens at a death?",
  "qsbs.html": "QSBS ledger",
  "what-to-do.html": "What to do",
  "household.json": "Model and citations",
};

type DownloadFile = { name: string; gzip: string; embedsFonts: boolean };
export function isPacket(output: unknown): output is { files: DownloadFile[] } {
  if (!output || typeof output !== "object" || !("files" in output) || !Array.isArray(output.files)) return false;
  return output.files.length > 0 && output.files.every((file) =>
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

export function ReviewPacket({ files, theme, onError }: { files: DownloadFile[]; theme: string; onError: (error: unknown) => void }) {
  const pages = files.filter((file) => file.name.endsWith(".html"));
  const [selected, setSelected] = useState(pages[0]?.name);
  const [preview, setPreview] = useState<{ name: string; html: string }>();
  const [previewError, setPreviewError] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const page = pages.find((file) => file.name === selected);
  const html = preview?.name === selected ? preview?.html : undefined;
  const themed = html?.replace('<html lang="en">', `<html lang="en" data-theme="${theme === "dark" ? "dark" : "light"}">`);

  useEffect(() => {
    if (!page) return;
    let current = true;
    setPreviewError(false);
    void decode(page).then(
      (source) => { if (current) setPreview({ name: page.name, html: source }); },
      () => { if (current) setPreviewError(true); },
    );
    return () => { current = false; };
  }, [page, previewRetry]);

  useEffect(() => {
    if (expanded) dialog.current?.showModal();
  }, [expanded]);

  async function save(file: DownloadFile) {
    const text = file.name === selected && html !== undefined ? html : await decode(file);
    const type = file.name.endsWith(".html") ? "text/html; charset=utf-8" : "application/json";
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const model = files.find((file) => file.name === "household.json");
  return (
    <section className="packet reveal" aria-label="Downloads">
      <div className="section-heading"><h3>Your pages</h3></div>
      <div className="packet-toolbar">
        <div className="paper-tabs" role="group" aria-label="Choose a page">
          {pages.map((file) => <Button key={file.name} variant="outline" aria-pressed={selected === file.name}
            onClick={() => setSelected(file.name)}>{labels[file.name]}</Button>)}
        </div>
        {page && <Button variant="outline" disabled={html === undefined} onClick={() => setExpanded(true)}><Expand /> Expand page</Button>}
      </div>
      {page && (
        <>
          {html !== undefined ? <iframe className="preview" title={labels[page.name]} sandbox="allow-scripts" srcDoc={themed} />
            : previewError ? <div className="preview-note" role="alert">
              The preview could not be opened. <Button variant="outline" onClick={() => setPreviewRetry((count) => count + 1)}>Retry preview</Button>
            </div> : <p className="preview-note" role="status">Opening {labels[page.name]}</p>}
          <div className="packet-actions">
            <Button variant="outline" onClick={() => void save(page).catch(onError)}><Download /> Download page</Button>
            {model && <Button variant="ghost" onClick={() => void save(model).catch(onError)}><Download /> Model and citations</Button>}
          </div>
          {expanded && html !== undefined && <dialog ref={dialog} className="preview-dialog" aria-labelledby="expanded-title"
            onClose={() => setExpanded(false)}>
            <div className="dialog-heading">
              <h3 id="expanded-title">{labels[page.name]}</h3>
              <Button variant="outline" autoFocus onClick={() => dialog.current?.close()}><X /> Close preview</Button>
            </div>
            <iframe title={labels[page.name]} sandbox="allow-scripts" srcDoc={themed} />
          </dialog>}
        </>
      )}
    </section>
  );
}
