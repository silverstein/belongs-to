import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fontFaceCss } from "../../kit/fonts.mjs";

const allowed = new Set(["whose-name.html", "at-a-death.html", "qsbs.html", "what-to-do.html", "household.json"]);

export function writePacket(files, directory) {
  const names = files.map(({ name }) => name);
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !allowed.has(name))) {
    throw Error("Expected a packet with distinct, recognized filenames.");
  }
  const decoded = files.map(({ name, gzip, embedsFonts }) => {
    const text = gunzipSync(Buffer.from(gzip, "base64")).toString("utf8");
    return [name, embedsFonts ? text.replace("/* BELONGS_TO_EMBED_FONTS */", () => fontFaceCss()) : text];
  });
  mkdirSync(directory, { recursive: true });
  for (const [name, text] of decoded) writeFileSync(join(directory, name), text);
}

export function saveReviewPackets(calls, directory) {
  for (const call of calls) {
    if (call.name !== "finish_review" || (call.outcome ?? call.status) !== "completed" || !call.output?.files?.length) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(call.callId)) throw Error("Invalid review call ID.");
    const target = join(directory, call.callId);
    writePacket(call.output.files, target);
    console.log(`Saved ${call.output.files.length} packet files in ${target}`);
  }
}

if (import.meta.main) {
  const [resultPath, directory] = process.argv.slice(2);
  if (!resultPath || !directory) throw Error("Usage: node scripts/export-packet.mjs <eval-case.json> <output-directory>");
  const { result } = JSON.parse(readFileSync(resultPath, "utf8"));
  saveReviewPackets(result.derived.toolCalls, directory);
}
