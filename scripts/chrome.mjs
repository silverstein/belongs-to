// Minimal headless Chrome driver over the DevTools protocol, using only Node
// built-ins (Node 22+ has a global WebSocket). Used by render, check and
// measure scripts so the kit never needs an npm install.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const agentBrowser = join(homedir(), ".agent-browser/browsers");
  if (existsSync(agentBrowser)) {
    for (const dir of readdirSync(agentBrowser).sort().reverse()) candidates.push(join(agentBrowser, dir, "chrome"));
  }
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({ width = 1440, height = 1000, scale = 2 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "belongs-to-chrome-"));
  const proc = spawn(chromePath(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start in 20s")), 20000);
    proc.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    proc.on("exit", (code) => reject(new Error(`Chrome exited early (${code})`)));
  });

  const browser = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { browser.onopen = resolve; browser.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  browser.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) listener(message);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

  const errors = [];
  listeners.push((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  });

  const api = {
    errors,
    async goto(url) {
      const loaded = new Promise((resolve) => listeners.push((message) => { if (message.sessionId === sessionId && message.method === "Page.loadEventFired") resolve(); }));
      await page("Page.navigate", { url });
      await loaded;
      await api.eval("document.fonts.ready.then(() => true)");
      await sleep(150);
    },
    async eval(expression) {
      const result = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    async viewport(w, h, s = scale) {
      await page("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: s, mobile: false });
      await sleep(100);
    },
    async theme(scheme) {
      await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      await sleep(100);
    },
    async screenshot(clip) {
      const params = { format: "png", captureBeyondViewport: true };
      if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 };
      const { data } = await page("Page.captureScreenshot", params);
      return Buffer.from(data, "base64");
    },
    async close() {
      const exited = new Promise((resolve) => (proc.exitCode !== null ? resolve() : proc.once("exit", resolve)));
      // Chrome may exit before it answers Browser.close; never wait on that reply alone.
      try { await Promise.race([send("Browser.close"), sleep(1500)]); } catch {}
      browser.close();
      await Promise.race([exited, sleep(3000)]);
      try { proc.kill("SIGKILL"); } catch {}
      await Promise.race([exited, sleep(2000)]);
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    },
  };
  return api;
}
