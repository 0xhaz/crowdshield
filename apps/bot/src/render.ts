import type { Verdict } from "@crowdshield/contracts";
import type { Button, Lang, OutMessage } from "./channel.js";
import { esc } from "./channel.js";
import { COPY, tr } from "./copy.js";

const ICON: Record<Verdict["tier"], string> = {
  confirmed: "🛑",
  high: "⚠️",
  caution: "🟠",
  reported: "ℹ️",
  no_known_risk: "🔍",
  protected_official: "📞🛡️",
};

export function ago(iso: string, lang: Lang, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  const [n, unit] =
    mins < 60
      ? [mins, ["minute", "minit"]]
      : mins < 2880
        ? [Math.round(mins / 60), ["hour", "jam"]]
        : [Math.round(mins / 1440), ["day", "hari"]];
  return lang === "ms" ? `${n} ${unit[1]} lalu` : `${n} ${unit[0]}${n === 1 ? "" : "s"} ago`;
}

/** The verdict card (techstacks §11): icon + both tier labels, masked value, one reason, one action, buttons. */
export function verdictCard(v: Verdict, lang: Lang, index: number): OutMessage {
  const lines = [
    `${ICON[v.tier]} <b>${esc(v.tierLabel.en.toUpperCase())} · ${esc(v.tierLabel.ms)}</b>`,
    `<code>${esc(v.entity.masked)}</code>`,
  ];
  const reasons = v.explanation
    .filter((e) => !e.source.startsWith("graph:"))
    .slice(0, 2)
    .map((e) => esc(e.line[lang]));
  if (reasons.length) lines.push(reasons.join(" · "));
  if (v.campaign && v.tier !== "no_known_risk")
    lines.push(`${tr(COPY.campaign, lang)}: ${esc(v.campaign.label)}`);
  lines.push("", `<b>${tr(COPY.whatToDo, lang)}:</b> ${esc(v.action[lang])}`);
  const meta: string[] = [];
  if (v.confidence) meta.push(`${tr(COPY.confidence, lang)}: ${v.confidence}`);
  if (v.lastReportedAt) meta.push(`${tr(COPY.lastReported, lang)} ${ago(v.lastReportedAt, lang)}`);
  if (meta.length) lines.push(`<i>${meta.join(" · ")}</i>`);

  const row: Button[] = [];
  if (v.tier !== "protected_official")
    row.push({ label: tr(COPY.btnReport, lang), data: `report:${index}` });
  row.push({ label: tr(COPY.btn997, lang), data: "call997" });
  return {
    html: lines.join("\n"),
    buttons: [row, [{ label: tr(COPY.btnWhy, lang), data: `why:${index}` }]],
  };
}

export function whyMessage(v: Verdict, lang: Lang): OutMessage {
  if (!v.explanation.length)
    return { html: `${tr(COPY.whyTitle, lang)}\n\n${tr(COPY.whyNone, lang)}` };
  const lines = v.explanation.map((e) => `• ${esc(e.line[lang])}`);
  return {
    html: [
      `${tr(COPY.whyTitle, lang)}: <code>${esc(v.entity.masked)}</code>`,
      "",
      ...lines,
      "",
      `<i>${tr(COPY.whyPrivacy, lang)}</i>`,
    ].join("\n"),
  };
}

export function callSheetMessage(
  sheet: {
    title: { en: string; ms: string };
    lines: { label: { en: string; ms: string }; value: string }[];
    reminder: { en: string; ms: string };
  },
  lang: Lang,
): OutMessage {
  return {
    html: [
      `📋 <b>${esc(sheet.title[lang])}</b>`,
      "",
      ...sheet.lines.map((l) => `<b>${esc(l.label[lang])}:</b> ${esc(l.value)}`),
      "",
      `<i>${esc(sheet.reminder[lang])}</i>`,
    ].join("\n"),
  };
}

type Leads = { leads: { title: string; url: string; relevant: boolean }[]; relevantCount: number };
const linkList = (leads: Leads["leads"]) =>
  leads
    .filter((l) => l.relevant)
    .slice(0, 3)
    .map((l) => `• <a href="${esc(l.url)}">${esc(l.title || l.url)}</a>`);

/** Follow-up for an identifier the graph doesn't know: only sent when there are relevant leads. */
export function webLeadsMessage(masked: string, r: Leads, lang: Lang): OutMessage | null {
  if (!r.relevantCount) return null;
  return {
    html: [
      `${tr(COPY.webTitle, lang)} <code>${esc(masked)}</code>: ${tr(COPY.webFound, lang).replace("{n}", String(r.relevantCount))}`,
      ...linkList(r.leads),
    ].join("\n"),
  };
}

export function urlCheckMessage(
  masked: string,
  r: {
    fetched: boolean;
    pageCheck: {
      impersonates: string | null;
      hasLoginForm: boolean;
      asksForOtpOrCard: boolean;
      hasApkDownload: boolean;
      suspicious: boolean;
      summary: { en: string; ms: string };
    } | null;
  },
  lang: Lang,
): OutMessage {
  const head = `${tr(COPY.linkTitle, lang)}\n<code>${esc(masked)}</code>`;
  const pc = r.pageCheck;
  if (!r.fetched || !pc) return { html: `${head}\n${tr(COPY.linkUnreachable, lang)}` };
  if (!pc.suspicious) return { html: `${head}\n${tr(COPY.linkOk, lang)}` };
  const lines = [head];
  lines.push(
    pc.impersonates
      ? tr(COPY.linkFake, lang).replace("{who}", esc(pc.impersonates))
      : `⚠️ ${esc(pc.summary[lang])}`,
  );
  if (pc.hasLoginForm || pc.asksForOtpOrCard) lines.push(tr(COPY.linkAsksLogin, lang));
  if (pc.hasApkDownload) lines.push(tr(COPY.linkApk, lang));
  lines.push(`<b>${tr(COPY.linkDontOpen, lang)}</b>`);
  return { html: lines.join("\n") };
}

export function investmentMessage(name: string, r: Leads, lang: Lang): OutMessage {
  const head = `${tr(COPY.investTitle, lang)}: <b>${esc(name)}</b>`;
  if (!r.relevantCount) return { html: `${head}\n${tr(COPY.investNone, lang)}` };
  return { html: [`${head}\n${tr(COPY.investFound, lang)}`, ...linkList(r.leads)].join("\n") };
}
