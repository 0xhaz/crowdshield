// Injected on demand (toolbar, shortcut or right-click), only into the tab the user acted on.
// Draws the snip rectangle and shows results; the service worker does the capture and the API call.
import { closePanel, showBusy, showError, showResult } from "./panel.js";
import type { Msg } from "./shared.js";

declare global {
  interface Window {
    __crowdshieldInpage?: boolean;
  }
}

function snip() {
  closePanel();
  const shade = document.createElement("div");
  const box = document.createElement("div");
  const hint = document.createElement("div");
  Object.assign(shade.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    background: "rgba(16,24,40,.35)",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(box.style, {
    position: "fixed",
    border: "2px solid #0B4FD9",
    background: "rgba(11,79,217,.08)",
    boxShadow: "0 0 0 9999px rgba(16,24,40,.35)",
    display: "none",
    zIndex: "2147483647",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(hint.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#101828",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: "999px",
    font: "600 14px system-ui, sans-serif",
    zIndex: "2147483647",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  hint.textContent = "Drag over the message to check · Esc to cancel";
  document.documentElement.append(shade, box, hint);

  let start: { x: number; y: number } | null = null;
  const done = () => {
    shade.remove();
    box.remove();
    hint.remove();
    window.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") done();
  };
  window.addEventListener("keydown", onKey, true);

  shade.addEventListener("mousedown", (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    shade.style.background = "transparent";
    box.style.display = "block";
  });
  shade.addEventListener("mousemove", (e) => {
    if (!start) return;
    Object.assign(box.style, {
      left: `${Math.min(start.x, e.clientX)}px`,
      top: `${Math.min(start.y, e.clientY)}px`,
      width: `${Math.abs(e.clientX - start.x)}px`,
      height: `${Math.abs(e.clientY - start.y)}px`,
    });
  });
  shade.addEventListener("mouseup", (e) => {
    if (!start) return;
    const rect = {
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x),
      h: Math.abs(e.clientY - start.y),
    };
    done();
    if (rect.w < 24 || rect.h < 16) return; // a click, not a snip
    // wait two frames so the overlay is gone from the capture
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void chrome.runtime.sendMessage({
          type: "snip-rect",
          rect,
          dpr: window.devicePixelRatio,
        } satisfies Msg);
      }),
    );
  });
}

/** One listener per page, whether this was injected on demand or loaded with the chat watcher. */
export function installInpage() {
  if (window.__crowdshieldInpage) return;
  window.__crowdshieldInpage = true;
  chrome.runtime.onMessage.addListener((m: Msg) => {
    if (m.type === "snip-start") snip();
    else if (m.type === "show-busy") showBusy(m.label);
    else if (m.type === "show-result") showResult(m.result);
    else if (m.type === "show-error") showError(m.message);
  });
}

installInpage();
