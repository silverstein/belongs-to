export const markShapes = {
  confirmed: '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.5 8 2.2 2.3 4.6-4.9" fill="none" stroke="var(--sheet)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  found: '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/>',
  told: '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray=".25 2.45" stroke-linecap="round"/>',
  missing: '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  failed: '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m5.9 5.9 4.2 4.2m0-4.2-4.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
};

export const markLabels = {
  confirmed: "Confirmed on the page",
  found: "Found, needs checking",
  told: "Told by the family",
  missing: "Missing",
};

export function markHtml(kind) {
  return `<svg class="record-mark" data-kind="${kind}" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">${markShapes[kind]}</svg>`;
}
