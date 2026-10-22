// Toolbar popup: start a snip, choose where the watcher runs, set the server.
import { DEFAULT_API, type Msg, WATCH_SITES } from "./shared.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

$("snip").addEventListener("click", () => {
  void chrome.runtime.sendMessage({ type: "snip-start" } satisfies Msg);
  window.close();
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
