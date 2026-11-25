import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const documentName = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,116}\.(?:md|txt)$/i;

export function readPages(text) {
  const pages = new Map();
  const markers = [...text.matchAll(/^#{1,6} (?:Page (\d+)(?=\s|:|$)|Attached:)[^\r\n]*/gim)];
  if (!markers.length) return new Map([[1, text.trim()]]);

  const preamble = text.slice(0, markers[0].index).trim();
  for (const [index, marker] of markers.entries()) {
    const page = marker[1] ? Number(marker[1]) : Math.max(0, ...pages.keys()) + 1;
    if (!Number.isSafeInteger(page) || page < 1 || pages.has(page)) {
      throw new Error("Each page needs a unique positive number.");
    }
    const body = text.slice(marker.index + marker[0].length, markers[index + 1]?.index).trim();
    pages.set(page, [index === 0 ? preamble : "", marker[0], body].filter(Boolean).join("\n"));
  }
  return pages;
}

export function readFolder(directory) {
  const files = new Map();
  const entries = readdirSync(directory, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !documentName.test(entry.name)) continue;
    if (files.has(entry.name)) throw new Error("Two documents have the same name. Give each a different name and start a new review.");
    const text = readFileSync(join(entry.parentPath, entry.name), "utf8");
    if (text.includes("\u0000") || text.includes("\uFFFD")) throw new Error(`Save ${entry.name} as UTF-8 text and start a new review.`);
    files.set(entry.name, readPages(text));
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = readFolder(".eve/attachments");
    const names = JSON.parse(readFileSync(0, "utf8"));
    const inventory = [...files].map(([name, pages]) => ({ name, pages: [...pages.keys()] }));
    const bundle = (requested) => Object.fromEntries(requested.map((name) => [name, Object.fromEntries(files.get(name) ?? [])]));
    const limit = 96 * 1024;
    let json;
    if (names === null) {
      json = JSON.stringify({ documents: bundle([...files.keys()]) });
      if (Buffer.byteLength(json) > limit) json = JSON.stringify({ inventory });
    } else {
      json = JSON.stringify(names.length ? bundle(names) : inventory);
    }
    if (Buffer.byteLength(json) > limit) throw new Error("Read fewer documents in one call.");
    console.log(json);
  } catch (error) {
    console.log(JSON.stringify({ error: error.code === "ENOENT" ? "Send a folder of text documents first." : error.message }));
  }
}
