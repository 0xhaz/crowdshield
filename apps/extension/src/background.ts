// Service worker: the only part that talks to the CrowdShield API (extension host permission, so no
// CORS), captures the visible tab for a snip, and keeps the chat watchers registered.
import { type CheckResult, DEFAULT_API, type Msg, type Verdict, WATCH_SITES } from "./shared.js";

async function apiBase(): Promise<string> {
  const { apiBase } = await chrome.storage.sync.get("apiBase");
  return (typeof apiBase === "string" && apiBase) || DEFAULT_API;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${await apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429)
    throw new Error("You’ve run a lot of checks. Please try again in a few minutes.");
  if (!res.ok) throw new Error("CrowdShield couldn’t check that right now. Please try again.");
  return (await res.json()) as T;
}

const send = (tabId: number, m: Msg) => chrome.tabs.sendMessage(tabId, m).catch(() => undefined);

async function inject(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["inpage.js"] });
}

async function startSnip(tabId: number) {
  try {
    await inject(tabId);
    await send(tabId, { type: "snip-start" });
  } catch {
    // chrome:// pages and the Web Store can't be scripted
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Captures the visible tab and crops it to the user's rectangle (CSS px × device pixel ratio). */
async function captureRect(
  windowId: number,
  rect: { x: number; y: number; w: number; h: number },
  dpr: number,
) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.min(Math.round(rect.w * dpr), bmp.width - sx);
  const sh = Math.min(Math.round(rect.h * dpr), bmp.height - sy);
  const scale = Math.min(1, 2000 / Math.max(sw, sh)); // enough for the vision model, small upload
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const png = await canvas.convertToBlob({ type: "image/png" });
  return toBase64(await png.arrayBuffer());
}

async function checkText(tabId: number, text: string) {
  await inject(tabId).catch(() => undefined);
  await send(tabId, { type: "show-busy", label: "Checking with CrowdShield…" });
  try {
    const result = await post<CheckResult>("/v1/public/check", { text: text.slice(0, 2000) });
    await send(tabId, { type: "show-result", result });
  } catch (e) {
    await send(tabId, { type: "show-error", message: (e as Error).message });
  }
}

chrome.runtime.onMessage.addListener((m: Msg, sender, reply) => {
  const tab = sender.tab;
  if (m.type === "snip-start") {
    // from the popup: the active tab of the current window
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([t]) => (t?.id !== undefined ? startSnip(t.id) : undefined));
  } else if (m.type === "snip-rect" && tab?.id !== undefined) {
    void (async () => {
      try {
        const imageBase64 = await captureRect(tab.windowId, m.rect, m.dpr);
        await send(tab.id!, { type: "show-busy", label: "Nemotron is reading your snip…" });
        const result = await post<CheckResult>("/v1/public/screenshot", {
          imageBase64,
          mime: "image/png",
        });
        await send(tab.id!, { type: "show-result", result });
      } catch (e) {
        await send(tab.id!, { type: "show-error", message: (e as Error).message });
      }
    })();
  } else if (m.type === "check-text" && tab?.id !== undefined) {
    void checkText(tab.id, m.text);
  } else if (m.type === "lookup") {
    post<{ verdicts: Verdict[] }>("/v1/public/lookup", { identifiers: m.identifiers }).then(
      (r) => reply(r.verdicts),
      () => reply([]),
    );
    return true; // async reply
  }
  return false;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "snip" && tab?.id !== undefined) void startSnip(tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  if (info.menuItemId === "check-selection" && info.selectionText)
    void checkText(tab.id, info.selectionText);
  if (info.menuItemId === "snip") void startSnip(tab.id);
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "check-selection",
    title: "Check “%s” with CrowdShield",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "snip",
    title: "Snip and check with CrowdShield",
    contexts: ["page", "image"],
  });
  await syncWatchers();
});
chrome.permissions.onRemoved.addListener(() => void syncWatchers());

/** Registers the chat watcher on every site the user turned on (and still has permission for). */
export async function syncWatchers() {
  const { watch = {} } = (await chrome.storage.sync.get("watch")) as {
    watch?: Record<string, boolean>;
  };
  const registered = new Set(
    (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id),
  );
  for (const site of WATCH_SITES) {
    const id = `watch-${site.id}`;
    const allowed = await chrome.permissions.contains({ origins: [site.match] });
    const want = Boolean(watch[site.id]) && allowed;
    if (want && !registered.has(id)) {
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches: [site.match],
          js: ["watch.js"],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    } else if (!want && registered.has(id)) {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    }
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.watch) void syncWatchers();
});
