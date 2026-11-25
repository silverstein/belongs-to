export function evidenceUploadNames(filenames) {
  return new Map([...filenames].sort().map((filename, index) => [
    filename,
    `document-${String(index + 1).padStart(2, "0")}.md`,
  ]));
}
