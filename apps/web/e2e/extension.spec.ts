/// <reference types="chrome" />
import { chromium, expect, type Page, test, type Worker } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// CrowdShield Guard in a real browser: Playwright's Chromium (it still loads unpacked extensions)
// with the test build (`EXT_TEST=1 node build.mjs`, watch sites pre-granted), against the local API.
const EXT = fileURLToPath(new URL("../../extension/dist-test", import.meta.url));
const SHOT = readFileSync(fileURLToPath(new URL("../public/demo/scam-chat.png", import.meta.url)));
const API = process.env.API_URL ?? "http://localhost:4020";

const CHAT = `<!doctype html><html><body style="font:16px sans-serif;padding:24px;background:#efeae2">
<div class="msg">Encik, akaun anda disiasat. Pindah ke Maybank 5123 4567 8812 sekarang.</div>
<div class="msg">Mak, ni nombor baru adik. Phone lama rosak. Boleh pindahkan RM800 dulu? Urgent</div>
</body></html>`;

let ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
let sw: Worker;

test.beforeAll(async () => {
  ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", // new headless mode, which runs extensions
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await sw.evaluate((api) => chrome.storage.sync.set({ apiBase: api }), API);
  // stand-ins for the real sites: content scripts match by URL
  await ctx.route("https://web.whatsapp.com/**", (r) =>
    r.fulfill({ contentType: "text/html", body: CHAT }),
  );
  await ctx.route("https://example.test/**", (r) =>
    r.request().url().endsWith(".png")
      ? r.fulfill({ contentType: "image/png", body: SHOT })
      : r.fulfill({
          contentType: "text/html",
          body: `<!doctype html><body style="margin:0;background:#fff"><img id="shot" src="/shot.png" style="width:400px"></body>`,
        }),
  );
});
test.afterAll(() => ctx?.close());

const panel = (page: Page) => page.locator("#crowdshield-guard-panel");

test("watch mode flags a scam account and a 'new number' money request inside a chat", async () => {
  await sw.evaluate(() => chrome.storage.sync.set({ watch: { whatsapp: true } }));
  await expect
    .poll(() =>
      sw.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id),
      ),
    )
    .toContain("watch-whatsapp");
  const page = await ctx.newPage();
  await page.goto("https://web.whatsapp.com/");
  await expect(page.locator("#crowdshield-guard-pill")).toContainText("1 scam-linked number here");
  await expect(panel(page)).toContainText("Possible impersonation scam");
  expect(await page.evaluate(() => CSS.highlights.has("crowdshield-confirmed"))).toBe(true);
  // tapping the pill lists the verdict
  await page.locator("#crowdshield-guard-pill button").click();
  await expect(panel(page)).toContainText("MBB ****8812");
  await expect(panel(page)).toContainText("Confirmed scam");
  await page.screenshot({ path: test.info().outputPath("watch.png") });
});

test("snip: drag over a screenshot and Nemotron reads it", async () => {
  const page = await ctx.newPage();
  await page.goto("https://example.test/chat");
  await page.locator("#shot").waitFor();
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://example.test/*" });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ["inpage.js"] });
    await chrome.tabs.sendMessage(tab!.id!, { type: "snip-start" });
  });
  const box = (await page.locator("#shot").boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 5 });
  await page.mouse.up();
  await expect(panel(page)).toContainText("What the screenshot shows", { timeout: 60_000 });
  await expect(panel(page)).toContainText(/AI: (Nemotron 3\.5 Super VL|cached result)/);
  await page.screenshot({ path: test.info().outputPath("snip.png") });
});

test("the toolbar popup's Snip button puts the selection overlay on the page", async () => {
  const page = await ctx.newPage();
  await page.goto("https://example.test/chat");
  const { id, tabId } = await sw.evaluate(async () => ({
    id: chrome.runtime.id,
    tabId: (await chrome.tabs.query({ url: "https://example.test/*" })).at(-1)!.id!,
  }));
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await popup.getByRole("button", { name: "Snip an area and check it" }).click();
  await expect(page.getByText("Drag over the message to check")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Drag over the message to check")).toBeHidden();
});
