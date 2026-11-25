export const previewReady = "belongs-to:preview-ready";

export const previewReadyScript = `window.addEventListener("load", () => {
  if (window.parent === window) return;
  document.fonts.ready.then(() => window.parent.postMessage(${JSON.stringify(previewReady)}, "*"));
}, { once: true });`;
