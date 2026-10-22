// The CrowdShield card shown on top of any page, in a shadow root (the page's CSS can't touch it,
// and it can't touch the page), built with textContent only, never innerHTML.
import { type CheckResult, TIER_COLOR, type Verdict } from "./shared.js";

const HOST_ID = "crowdshield-guard-panel";

const CSS = `
:host { all: initial; }
.card { position: fixed; right: 16px; bottom: 16px; width: 360px; max-height: 70vh; overflow: auto;
  z-index: 2147483647; background: #fff; color: #101828; border: 1px solid #EAECF0; border-radius: 16px;
  box-shadow: 0 12px 32px rgba(16,24,40,.18); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #EAECF0; }
.logo { width: 22px; height: 22px; border-radius: 6px; background: #0B4FD9; color: #fff; font-weight: 800;
  display: grid; place-items: center; font-size: 13px; }
.title { font-weight: 700; flex: 1; }
.x { all: unset; cursor: pointer; padding: 2px 8px; border-radius: 6px; color: #475467; font-size: 18px; }
.x:hover { background: #F2F4F7; }
.body { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; }
.box { border: 1px solid; border-radius: 12px; padding: 10px 12px; }
.tier { font-weight: 800; text-transform: uppercase; font-size: 12px; letter-spacing: .04em; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 15px; }
.muted { color: #475467; font-size: 13px; }
.trace { color: #3538CD; font-size: 12px; }
.btn { all: unset; cursor: pointer; background: #0B4FD9; color: #fff; border-radius: 8px; padding: 7px 12px;
  font-weight: 600; font-size: 13px; text-align: center; }
.btn.secondary { background: #fff; color: #344054; border: 1px solid #D0D5DD; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.spin { width: 16px; height: 16px; border: 2px solid #D0D5DD; border-top-color: #0B4FD9; border-radius: 50%;
  animation: s .8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
@keyframes s { to { transform: rotate(360deg); } }
details summary { cursor: pointer; color: #475467; font-size: 13px; }
pre { white-space: pre-wrap; font: 12px/1.4 system-ui, sans-serif; background: #F9FAFB; padding: 8px; border-radius: 8px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { cls?: string; text?: string; style?: Partial<CSSStyleDeclaration> } = {},
  ...children: (Node | null)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.cls) e.className = props.cls;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.style) Object.assign(e.style, props.style);
  for (const c of children) if (c) e.append(c);
  return e;
}

function root(): { shadow: ShadowRoot; body: HTMLElement } {
  let host = document.getElementById(HOST_ID) as (HTMLElement & { _cs?: ShadowRoot }) | null;
  if (!host) {
    host = document.createElement("div") as HTMLElement & { _cs?: ShadowRoot };
    host.id = HOST_ID;
    host._cs = host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
  }
  const shadow = host._cs!;
  shadow.replaceChildren();
  shadow.append(el("style", { text: CSS }));
  const close = el("button", { cls: "x", text: "×" });
  close.setAttribute("aria-label", "Close");
  close.onclick = () => host!.remove();
  const body = el("div", { cls: "body" });
  const card = el(
    "div",
    { cls: "card" },
    el(
      "div",
      { cls: "head" },
      el("div", { cls: "logo", text: "C" }),
      el("div", { cls: "title", text: "CrowdShield" }),
      close,
    ),
    body,
  );
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "CrowdShield check");
  shadow.append(card);
  return { shadow, body };
}

export function showBusy(label: string) {
  const { body } = root();
  const p = el("p", {}, el("span", { cls: "spin" }));
  p.append(label);
  body.append(p);
}

export function showError(message: string) {
  root().body.append(el("p", { text: message, style: { color: "#B42318" } }));
}

export function verdictBox(v: Verdict): HTMLElement {
  const c = TIER_COLOR[v.tier] ?? TIER_COLOR.no_known_risk!;
  const scored = v.tier !== "no_known_risk" && v.tier !== "protected_official";
  return el(
    "div",
    { cls: "box", style: { borderColor: c.border, background: c.bg } },
    el("div", {
      cls: "tier",
      text: `${v.tierLabel.en}${scored ? ` · ${v.risk}` : ""}`,
      style: { color: c.fg },
    }),
    el("div", { cls: "mono", text: v.entity.masked }),
    v.explanation[0] ? el("div", { cls: "muted", text: v.explanation[0].line.en }) : null,
    el("div", { text: `What to do: ${v.action.en}` }),
  );
}

function traceLine(t: CheckResult["trace"]) {
  if (!t) return null;
  if (!t.calls.length)
    return el("div", { cls: "trace", text: "AI: cached result (this was read before)" });
  const names = [
    ...new Set(t.calls.map((c) => (c.kind === "tavily" ? "Tavily" : modelName(c.model)))),
  ];
  return el("div", {
    cls: "trace",
    text: `AI: ${names.join(" · ")} · ${(t.totalMs / 1000).toFixed(1)} s`,
  });
}

const modelName = (id = "") =>
  /ultra/i.test(id)
    ? "Nemotron 3 Ultra"
    : /vl/i.test(id)
      ? "Nemotron 3.5 Super VL"
      : /super/i.test(id)
        ? "Nemotron 3 Super"
        : /embedding/i.test(id)
          ? "Qwen3 Embedding"
          : id;

export function showResult(r: CheckResult) {
  const { body } = root();
  if (r.campaign) {
    body.append(
      el("div", {
        cls: "box",
        text: `📣 Known scam wave: ${r.campaign.label}. ${r.campaign.reports24h} report(s) in 24 h.`,
        style: { borderColor: "#FDD3BA", background: "#FFF4ED", color: "#B93815" },
      }),
    );
  }
  if (r.pattern) {
    body.append(
      el(
        "div",
        {},
        el("div", {
          cls: "muted",
          text: r.transcript !== null ? "What the screenshot shows" : "What the message is",
        }),
        el("div", { text: r.pattern.summary.en, style: { fontSize: "15px" } }),
        r.pattern.action
          ? el("div", { text: `What to do: ${r.pattern.action.en}`, style: { fontWeight: "600" } })
          : null,
      ),
    );
  }
  for (const v of r.verdicts) body.append(verdictBox(v));
  if (!r.pattern && !r.verdicts.length && !r.campaign) {
    body.append(
      el("p", {
        text: "Nothing to check here: no number, account or link, and too little text. Try a bigger area.",
      }),
    );
  }
  if (r.transcript) {
    const d = el(
      "details",
      {},
      el("summary", { text: "Text read from your snip" }),
      el("pre", { text: r.transcript }),
    );
    body.append(d);
  }
  body.append(el("div", { cls: "muted", text: "Lost money? Call NSRC 997 now." }));
  const t = traceLine(r.trace);
  if (t) body.append(t);
}

/** A warning with actions (used by the chat watcher). */
export function showWarning(
  title: string,
  text: string,
  actions: { label: string; secondary?: boolean; run: () => void }[],
) {
  const { body } = root();
  body.append(
    el(
      "div",
      { cls: "box", style: { borderColor: "#FECDCA", background: "#FEF3F2" } },
      el("div", { cls: "tier", text: title, style: { color: "#B42318" } }),
      el("div", { text }),
    ),
  );
  const row = el("div", { cls: "row" });
  for (const a of actions) {
    const b = el("button", { cls: a.secondary ? "btn secondary" : "btn", text: a.label });
    b.onclick = a.run;
    row.append(b);
  }
  body.append(row);
}

export function closePanel() {
  document.getElementById(HOST_ID)?.remove();
}
