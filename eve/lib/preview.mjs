export const previewReady = "belongs-to:preview-ready";

export const previewReadyScript = `window.addEventListener("load", () => {
  if (window.parent === window) return;
  document.fonts.ready.then(() => {
    const report = () => window.parent.postMessage({ type: ${JSON.stringify(previewReady)}, height: document.body.getBoundingClientRect().height }, "*");
    new ResizeObserver(report).observe(document.body);
    report();
  });
}, { once: true });`;
