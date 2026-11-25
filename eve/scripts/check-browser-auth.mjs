import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [protectedUrl, localUrl] = process.argv.slice(2);
assert.ok(protectedUrl && localUrl, "Usage: node scripts/check-browser-auth.mjs <protected-fixture-url> <local-fixture-url>");
for (const url of [protectedUrl, localUrl]) {
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "Use local fixture targets.");
}

const playwrightPath = process.env.BELONGS_TO_PLAYWRIGHT;
const { chromium } = await import(playwrightPath ? pathToFileURL(resolve(playwrightPath)).href : "playwright");
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", chromiumSandbox: true });
const fixturePassword = "round10-fictional-fixture";
const isEveRequest = (request) => new URL(request.url()).pathname.startsWith("/eve/v1/");
const isStart = (response) => response.request().method() === "POST"
  && new URL(response.url()).pathname === "/eve/v1/session";

try {
  const protectedPage = await browser.newPage();
  const requests = [];
  protectedPage.on("request", (request) => {
    if (isEveRequest(request)) requests.push(request);
  });
  await protectedPage.goto(protectedUrl);
  const password = protectedPage.getByLabel("Family password");
  const ellery = protectedPage.getByRole("button", { name: "Ellery", exact: true });
  const folder = protectedPage.locator('input[type="file"]');
  await password.waitFor();
  assert.equal(await folder.isDisabled(), true);
  for (const family of ["Ellery", "Okafor", "Park"]) {
    assert.equal(await protectedPage.getByRole("button", { name: family, exact: true }).isDisabled(), true);
  }
  await protectedPage.locator(".drop").evaluate((target) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["Fictional fixture."], "sample.md"));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });
  assert.equal(requests.length, 0);

  await password.fill("wrong-fixture-password");
  assert.equal(await folder.isEnabled(), true);
  const [rejected] = await Promise.all([protectedPage.waitForResponse(isStart), ellery.click()]);
  assert.equal(rejected.status(), 401);
  assert.doesNotMatch((await rejected.headerValue("www-authenticate")) ?? "", /\bbasic\b/i);
  const alert = protectedPage.getByRole("alert").filter({ hasText: "That password didn't work." });
  await alert.waitFor();
  assert.equal(await alert.innerText(), "That password didn't work.");
  assert.equal(await ellery.isDisabled(), true);
  assert.equal(await folder.isDisabled(), true);

  await password.fill(fixturePassword);
  const [accepted] = await Promise.all([protectedPage.waitForResponse(isStart), ellery.click()]);
  assert.equal(accepted.ok(), true);
  await protectedPage.locator(".question").first().waitFor({ timeout: 60_000 });
  assert.equal(await protectedPage.getByText("That password didn't work.", { exact: true }).count(), 0);
  for (const request of requests) assert.match((await request.headerValue("authorization")) ?? "", /^Basic /);
  await protectedPage.close();
  console.log("Protected fixture passed. The empty page sent no Eve requests, a wrong password returned an inline 401, and the correct password received a chat question.");

  const localPage = await browser.newPage();
  await localPage.goto(localUrl);
  const localEllery = localPage.getByRole("button", { name: "Ellery", exact: true });
  await localEllery.waitFor();
  assert.equal(await localPage.getByLabel("Family password").count(), 0);
  assert.equal(await localPage.locator('input[type="file"]').isEnabled(), true);
  assert.equal(await localEllery.isEnabled(), true);
  const [localAccepted] = await Promise.all([localPage.waitForResponse(isStart), localEllery.click()]);
  assert.equal(localAccepted.ok(), true);
  assert.equal(await localAccepted.request().headerValue("authorization"), null);
  await localPage.locator(".question").first().waitFor({ timeout: 60_000 });
  console.log("Local fixture passed. Ellery received a chat question with no password field or header.");
} finally {
  await browser.close();
}
