// Chat and email watcher for WhatsApp Web, Telegram Web and Gmail, only on sites the user turned on.
// Everything here runs on the device: identifiers are found with the same detector as the bot, and
// only those identifiers are looked up. Message text leaves the browser only if the user taps
// "Check with AI". Risky numbers are highlighted with the CSS Highlight API, so the site's own page
// is never rewritten.
import { detectIdentifiers, type Found } from "@crowdshield/normalise";
import { installInpage } from "./inpage.js";
import { closePanel, showWarning, verdictBox } from "./panel.js";
import { looksLikeImpersonation, type Msg, RISKY, TIER_COLOR, type Verdict } from "./shared.js";

installInpage(); // snips and results work here too

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
const seen = new WeakMap<Text, string>(); // text node → the text we last scanned
const verdicts = new Map<string, Verdict | null>(); // "type:value" → verdict (null while pending)
const nodesFor = new Map<string, Set<Text>>();
const warned = new Set<string>(); // messages already flagged as impersonation

const keyOf = (f: Pick<Found, "type" | "value">) => `${f.type}:${f.value}`;

function textNodes(): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT; // not what the user is typing
      if (p.closest("#crowdshield-guard-panel, #crowdshield-guard-pill"))
        return NodeFilter.FILTER_REJECT;
      return (n.nodeValue ?? "").trim().length >= 7
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

async function scan() {
  const fresh: Found[] = [];
  for (const node of textNodes()) {
    const text = node.nodeValue ?? "";
    if (seen.get(node) === text) continue;
    seen.set(node, text);
    if (/\d{4}|https?:|www\.|\.[a-z]{2,}\//i.test(text)) {
      for (const f of detectIdentifiers(text)) {
        const k = keyOf(f);
        if (!nodesFor.has(k)) nodesFor.set(k, new Set());
        nodesFor.get(k)!.add(node);
        if (!verdicts.has(k)) {
          verdicts.set(k, null);
          fresh.push(f);
        }
      }
    }
    if (looksLikeImpersonation(text) && !warned.has(text)) {
      warned.add(text);
      warnImpersonation(text);
    }
  }
  for (let i = 0; i < fresh.length; i += 20) {
    const batch = fresh.slice(i, i + 20);
    const got: Verdict[] = await chrome.runtime.sendMessage({
      type: "lookup",
      identifiers: batch.map(({ type, value }) => ({ type, value })),
    } satisfies Msg);
    // verdicts come back in order, minus any the server couldn't parse
    for (const v of got) {
      const f = batch.find((b) => b.masked === v.entity.masked && b.type === v.entity.type) ?? null;
      if (f) verdicts.set(keyOf(f), v);
    }
  }
  paint();
}

// ---------- highlights + the "Guard" pill ----------

function paint() {
  const risky = [...verdicts.entries()].filter(([, v]) => v && RISKY.has(v.tier)) as [
    string,
    Verdict,
  ][];
  if ("highlights" in CSS) {
    for (const tier of RISKY) {
      const ranges: Range[] = [];
      for (const [k, v] of risky) {
        if (v.tier !== tier) continue;
        for (const node of nodesFor.get(k) ?? []) {
          if (!node.isConnected) continue;
          const r = document.createRange();
          r.selectNodeContents(node);
          ranges.push(r);
        }
      }
      CSS.highlights.set(`crowdshield-${tier}`, new Highlight(...ranges));
    }
  }
  pill(risky.map(([, v]) => v));
}

function ensureHighlightStyle() {
  if (document.getElementById("crowdshield-guard-style")) return;
  const s = document.createElement("style");
  s.id = "crowdshield-guard-style";
  s.textContent = [...RISKY]
    .map((t) => `::highlight(crowdshield-${t}) { background-color: ${TIER_COLOR[t]!.border}; }`)
    .join("\n");
  document.head.append(s);
}

let pillHost: HTMLElement | null = null;
function pill(risky: Verdict[]) {
  if (!risky.length) {
    pillHost?.remove();
    pillHost = null;
    return;
  }
  if (!pillHost) {
    pillHost = document.createElement("div");
    pillHost.id = "crowdshield-guard-pill";
    document.documentElement.append(pillHost);
    (pillHost as HTMLElement & { _cs?: ShadowRoot })._cs = pillHost.attachShadow({ mode: "open" });
  }
  const shadow = (pillHost as HTMLElement & { _cs?: ShadowRoot })._cs!;
  const worst = risky.some((v) => v.tier === "confirmed")
    ? "confirmed"
    : risky.some((v) => v.tier === "high")
      ? "high"
      : "caution";
  const c = TIER_COLOR[worst]!;
  const b = document.createElement("button");
  b.textContent = `🛡 CrowdShield: ${risky.length} scam-linked number${risky.length > 1 ? "s" : ""} here`;
  Object.assign(b.style, {
    position: "fixed",
    left: "16px",
    bottom: "16px",
    zIndex: "2147483646",
    background: c.bg,
    color: c.fg,
    border: `1px solid ${c.border}`,
    borderRadius: "999px",
    padding: "8px 14px",
    font: "600 13px system-ui, sans-serif",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(16,24,40,.15)",
  } satisfies Partial<CSSStyleDeclaration>);
  b.onclick = () => {
    showWarning(
      "Scam-linked numbers in this chat",
      "Don’t pay or call back these numbers or accounts.",
      [{ label: "Close", secondary: true, run: closePanel }],
    );
    const host = document.getElementById("crowdshield-guard-panel") as
      (HTMLElement & { _cs?: ShadowRoot }) | null;
    const body = host?._cs?.querySelector(".body");
    for (const v of risky) body?.append(verdictBox(v));
  };
  shadow.replaceChildren(b);
}

function warnImpersonation(text: string) {
  showWarning(
    "Possible impersonation scam",
    "This asks for money and says it’s a new or broken phone, or an emergency. Call the person on the number you already have before you pay.",
    [
      {
        label: "Check with AI",
        run: () => void chrome.runtime.sendMessage({ type: "check-text", text } satisfies Msg),
      },
      { label: "Dismiss", secondary: true, run: closePanel },
    ],
  );
}

// ---------- start ----------

ensureHighlightStyle();
let timer: ReturnType<typeof setTimeout> | undefined;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => void scan().catch(() => undefined), 800);
};
new MutationObserver(schedule).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});
schedule();
