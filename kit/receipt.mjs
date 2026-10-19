// What the footer says about the documents: which ones the page looked at,
// and how fully each was read. The list is every document the family sent
// that could be read at all, not only the ones a drawn fact cites, because a
// note can cite a document no card does. The receipt line counts the same
// list and never says "read in full" over a document read in part.
export function documentsLookedAt(model) {
  return Object.entries(model.documents).filter(([, d]) => d.read === "read" || d.read === "partial").map(([id]) => id);
}

export function readReceipt(model, listed = documentsLookedAt(model)) {
  const docs = listed.map((id) => model.documents[id]);
  const full = docs.filter((d) => d.read === "read").length;
  const part = docs.filter((d) => d.read === "partial").length;
  const unreadable = Object.values(model.documents).filter((d) => d.read === "unreadable").length;
  const n = docs.length;
  const noun = n === 1 ? "document" : "documents";
  let text;
  if (!part) text = `${n === 1 ? "The one" : `All ${n}`} ${noun} listed under “What we looked at” ${n === 1 ? "was" : "were"} read in full`;
  else text = `${n} ${noun} listed under “What we looked at”: ${full} read in full, ${part} in part (the list says which pages)`;
  if (unreadable) text += `; ${unreadable} more we couldn’t read, listed under what’s missing`;
  return { text, open: part > 0 || unreadable > 0 };
}
