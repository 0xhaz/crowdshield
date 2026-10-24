// Toolbar popup: start a snip, choose where the watcher runs, set the server.
import { DEFAULT_API, type Msg, WATCH_SITES } from "./shared.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Start the snip from here (the popup holds the activeTab grant) and only close once the overlay
// is up: closing first could drop the request while the service worker is asleep.
$("snip").addEventListener("click", async () => {
  // ?tab=<id> lets the browser tests open this page in a tab of its own and aim it at another
  const pinned = Number(new URLSearchParams(location.search).get("tab"));
  const [tab] = pinned
    ? [await chrome.tabs.get(pinned)]
    : await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    if (tab?.id === undefined) throw new Error("no tab");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["inpage.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "snip-start" } satisfies Msg);
    window.close();
  } catch {
    // chrome:// pages, the new tab page, the Web Store and PDFs can't be scripted
    $("snip-error").hidden = false;
  }
});

void chrome.commands.getAll().then((cmds) => {
  const s = cmds.find((c) => c.name === "snip")?.shortcut;
  if (s) $("shortcut").textContent = s;
});

async function renderSites() {
  const { watch = {} } = (await chrome.storage.sync.get("watch")) as {
    watch?: Record<string, boolean>;
  };
  const box = $("sites");
  box.replaceChildren();
  for (const site of WATCH_SITES) {
    const label = document.createElement("label");
    label.className = "site";
    const name = document.createElement("span");
    name.textContent = site.name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked =
      Boolean(watch[site.id]) && (await chrome.permissions.contains({ origins: [site.match] }));
    input.addEventListener("change", async () => {
      // Each site is opt-in: Chrome asks the user to allow it
      if (input.checked && !(await chrome.permissions.request({ origins: [site.match] }))) {
        input.checked = false;
        return;
      }
      if (!input.checked) await chrome.permissions.remove({ origins: [site.match] });
      await chrome.storage.sync.set({ watch: { ...watch, [site.id]: input.checked } });
      watch[site.id] = input.checked;
    });
    label.append(name, input);
    box.append(label);
  }
}
void renderSites();

const api = $("api") as HTMLInputElement;
void chrome.storage.sync.get("apiBase").then(({ apiBase }) => {
  api.value = (typeof apiBase === "string" && apiBase) || DEFAULT_API;
});
api.addEventListener("change", () => {
  const v = api.value.trim().replace(/\/+$/, "");
  void chrome.storage.sync.set({ apiBase: v === DEFAULT_API ? "" : v });
});
