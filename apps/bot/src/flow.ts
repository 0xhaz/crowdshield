// The Semak dulu conversation, independent of any chat channel: an event plus the session in,
// messages out. Deterministic: models only read screenshots and classify free text; identifiers are
// always matched by the shared normaliser and scored by the graph.
import { ApiError, type ApiClient, type ReportInput, type Verdict } from "@crowdshield/contracts";
import type { IdentifierType } from "@crowdshield/normalise";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { SCAM_TYPE_ACTION, SCAM_TYPE_LABEL, type ScamTypeKey } from "@crowdshield/i18n";
import type { Button, InEvent, Lang, Media, OutMessage } from "./channel.js";
import { esc } from "./channel.js";
import { COPY, REPORT_SCAM_TYPES, STATES, tr } from "./copy.js";
import { defaultRole, detectIdentifiers, type Found } from "./detect.js";
import {
  callSheetMessage,
  investmentMessage,
  urlCheckMessage,
  verdictCard,
  webLeadsMessage,
  whyMessage,
} from "./render.js";
import type { EvidenceStore, Ml } from "./services.js";

type Role = z.input<typeof ReportInput>["identifiers"][number]["role"];
type ScamType = NonNullable<z.input<typeof ReportInput>["scamType"]>;
type Step =
  | "scamType"
  | "identifiers"
  | "lost"
  | "amount"
  | "payee"
  | "when"
  | "txnRef"
  | "state"
  | "consent";

export interface ReportDraft {
  id: string;
  step: Step;
  scamType?: ScamType;
  identifiers: { type: IdentifierType; value: string; masked: string; role: Role }[];
  lossMyr?: number;
  payeeIndex?: number;
  transferAt?: string;
  txnRef?: string;
  state?: string;
}

export interface Session {
  lang: Lang;
  lastChecked: Found[];
  report?: ReportDraft;
  awaitNsrcCaseId?: string;
  /** Screenshots received since the last report: attached to the next report as evidence. */
  pendingEvidence?: { kind: "screenshot" | "document"; storageUri: string }[];
}

export interface Deps {
  api: ApiClient;
  /** Channel user id; the API hashes it, it's never stored raw. */
  userId: string;
  channel: "telegram" | "whatsapp";
  now?: () => Date;
  ml?: Ml;
  evidence?: EvidenceStore;
  /** Schedules a follow-up sent after the instant reply (web checks take a few seconds). */
  defer?: (task: () => Promise<OutMessage[]>) => void;
}

export const newSession = (lang: Lang): Session => ({ lang, lastChecked: [] });

const t = (s: Session, key: keyof typeof COPY) => tr(COPY[key], s.lang);
const btn = (label: string, data: string): Button => ({ label, data });
const rows = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const reportButton = (s: Session): Button[][] => [[btn(t(s, "btnReportScam"), "report:new")]];

export async function handle(ev: InEvent, s: Session, deps: Deps): Promise<OutMessage[]> {
  const now = deps.now?.() ?? new Date();

  if (ev.kind === "command") {
    switch (ev.name) {
      case "start":
        delete s.report;
        return [{ html: t(s, "welcome"), buttons: reportButton(s) }];
      case "help":
        return [{ html: t(s, "help") }];
      case "lang":
        s.lang = s.lang === "en" ? "ms" : "en";
        return [{ html: t(s, "langSet") }];
      case "cancel":
        delete s.report;
        delete s.awaitNsrcCaseId;
        return [{ html: t(s, "cancelled") }];
      case "report":
        return startReport(s, []);
      case "check":
        return ev.arg ? check(ev.arg, s, deps) : [{ html: t(s, "help") }];
      case "invest":
        return ev.arg ? investment(ev.arg, s, deps) : [{ html: t(s, "investAsk") }];
      default:
        return [{ html: t(s, "help") }];
    }
  }

  if (ev.kind === "photo" || (ev.kind === "document" && /^image\//.test(ev.mime ?? ""))) {
    return screenshot(ev.load, s, deps);
  }
  if (ev.kind === "document") return [{ html: t(s, "photoLater") }];

  if (ev.kind === "button") return button(ev.data, s, deps, now);

  // free text
  if (s.report) return reportText(ev.text, s);
  if (s.awaitNsrcCaseId && looksLikeReference(ev.text) && !detectIdentifiers(ev.text).length) {
    return saveNsrcRef(ev.text.trim(), s, deps);
  }
  return check(ev.text, s, deps);
}

// ---------- checks ----------

async function check(text: string, s: Session, deps: Deps): Promise<OutMessage[]> {
  const found = detectIdentifiers(text);
  if (!found.length) {
    // A story with no number in it ("is this a scam?"): let the model name the pattern
    if (deps.ml && text.trim().length >= 30) return classifyStory(text, s, deps);
    return [{ html: t(s, "nothingFound") }];
  }
  return cardsFor(found, s, deps);
}

async function cardsFor(found: Found[], s: Session, deps: Deps): Promise<OutMessage[]> {
  s.lastChecked = found;
  let verdicts: Verdict[];
  try {
    verdicts = await Promise.all(found.map((f) => lookup(deps, f)));
  } catch {
    return [{ html: t(s, "checkFailed") }];
  }
  scheduleWebChecks(found, verdicts, s, deps);
  return verdicts.map((v, i) => verdictCard(v, s.lang, i));
}

/**
 * The graph answers instantly; the web is slower, so it follows as a second message:
 * links get a page check, identifiers the graph doesn't know get a Tavily search (leads only).
 */
function scheduleWebChecks(found: Found[], verdicts: Verdict[], s: Session, deps: Deps) {
  if (!deps.defer) return;
  const lang = s.lang;
  found.forEach((f, i) => {
    const v = verdicts[i]!;
    if (v.tier === "confirmed" || v.tier === "protected_official") return;
    if (f.type === "url") {
      deps.defer!(async () => [
        urlCheckMessage(
          f.masked,
          await deps.api.call("urlCheck", { body: { url: f.value } }),
          lang,
        ),
      ]);
    } else if (v.tier === "no_known_risk") {
      deps.defer!(async () => {
        const msg = webLeadsMessage(
          f.masked,
          await deps.api.call("webLeads", { body: { type: f.type, value: f.value } }),
          lang,
        );
        return msg ? [msg] : [];
      });
    }
  });
}

async function classifyStory(text: string, s: Session, deps: Deps): Promise<OutMessage[]> {
  try {
    const c = await deps.ml!.classify(text);
    if (c.needs_review || c.scam_type === "not_a_scam") return [{ html: t(s, "notAScam") }];
    return [{ html: patternLine(c.scam_type, c.summary[s.lang], s), buttons: reportButton(s) }];
  } catch {
    return [{ html: t(s, "nothingFound") }];
  }
}

function patternLine(scamType: string, summary: string, s: Session) {
  const label = SCAM_TYPE_LABEL[scamType as ScamTypeKey]?.[s.lang];
  const action = SCAM_TYPE_ACTION[scamType as ScamTypeKey]?.[s.lang];
  return [
    esc(summary),
    label ? `\n${t(s, "looksLike")}: <b>${esc(label)}</b>` : "",
    action ? `<b>${t(s, "whatToDo")}:</b> ${esc(action)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Screenshot → stored as evidence → read by Nemotron VL → the same identifier check as text. */
async function screenshot(
  load: () => Promise<Media>,
  s: Session,
  deps: Deps,
): Promise<OutMessage[]> {
  if (!deps.ml) return [{ html: t(s, "photoLater") }];
  let media: Media;
  try {
    media = await load();
  } catch {
    return [{ html: t(s, "readFailed") }];
  }
  const out: OutMessage[] = [];
  if (deps.evidence) {
    try {
      const { storageUri } = await deps.evidence.put(media, deps.channel);
      s.pendingEvidence = [
        ...(s.pendingEvidence ?? []),
        { kind: "screenshot" as const, storageUri },
      ].slice(-5);
    } catch {
      // evidence storage is best-effort; the check still runs
    }
  }
  let read;
  try {
    read = await deps.ml.screenshot(media);
  } catch {
    return [{ html: t(s, "readFailed") }];
  }
  if (read.needs_review) return [{ html: t(s, "readFailed") }];
  const found = detectIdentifiers(read.text);

  if (s.report?.step === "identifiers") {
    // Reporting: the screenshot's identifiers go into the report
    for (const f of found) {
      if (!s.report.identifiers.some((i) => i.type === f.type && i.value === f.value)) {
        s.report.identifiers.push({
          type: f.type,
          value: f.value,
          masked: f.masked,
          role: defaultRole(f.type),
        });
      }
    }
    return [{ html: t(s, "evidenceKept") }, ...askIdentifiers(s)];
  }

  const header =
    read.scam_type === "not_a_scam"
      ? esc(read.summary[s.lang])
      : patternLine(read.scam_type, read.summary[s.lang], s);
  out.push({ html: `${t(s, "iRead")}\n${header}` });
  if (!found.length) {
    out.push({
      html: t(s, "noIdsInShot"),
      buttons: read.scam_type === "not_a_scam" ? undefined : reportButton(s),
    });
    return out;
  }
  return [...out, ...(await cardsFor(found, s, deps))];
}

async function investment(name: string, s: Session, deps: Deps): Promise<OutMessage[]> {
  try {
    return [
      investmentMessage(name, await deps.api.call("investmentCheck", { body: { name } }), s.lang),
    ];
  } catch {
    return [{ html: t(s, "checkFailed") }];
  }
}

const lookup = (deps: Deps, f: Pick<Found, "type" | "value">): Promise<Verdict> =>
  deps.api.call("lookup", { query: { type: f.type, value: f.value } });

// ---------- buttons ----------

async function button(data: string, s: Session, deps: Deps, now: Date): Promise<OutMessage[]> {
  const [kind, arg = ""] = data.split(":");
  switch (kind) {
    case "call997":
      return [{ html: t(s, "call997"), buttons: reportButton(s) }];
    case "why": {
      const f = s.lastChecked[Number(arg)];
      if (!f) return [{ html: t(s, "nothingFound") }];
      try {
        return [whyMessage(await lookup(deps, f), s.lang)];
      } catch {
        return [{ html: t(s, "checkFailed") }];
      }
    }
    case "report": {
      // Identifiers forwarded together belong to the same scam: report them together, so the
      // graph links them (e.g. the account inherits risk from the confirmed caller).
      const f = arg === "new" ? undefined : s.lastChecked[Number(arg)];
      return startReport(s, f ? [f, ...s.lastChecked.filter((x) => x !== f)] : []);
    }
  }
  const r = s.report;
  if (!r) return [{ html: t(s, "help") }];
  switch (kind) {
    case "rt":
      r.scamType = arg as ScamType;
      return askIdentifiers(s);
    case "done":
      if (!r.identifiers.length) return [{ html: t(s, "needOne") }];
      return ask(s, "lost");
    case "lost":
      return arg === "y" ? ask(s, "amount") : ask(s, "state");
    case "when": {
      const hours = { h: 0.5, t: 4, y: 24, e: 72 }[arg as "h"] ?? 0;
      r.transferAt = new Date(now.getTime() - hours * 3_600_000).toISOString();
      return ask(s, "txnRef");
    }
    case "st":
      r.state = STATES[Number(arg)];
      return ask(s, "consent");
    case "skip":
      if (r.step === "payee") return ask(s, "state");
      if (r.step === "txnRef") return ask(s, "state");
      if (r.step === "state") return ask(s, "consent");
      return ask(s, r.step);
    case "consent":
      return submit(s, deps, arg === "y", now);
    default:
      return ask(s, r.step);
  }
}

// ---------- report flow: asks only for what's missing ----------

function startReport(s: Session, prefill: Found[]): OutMessage[] {
  delete s.awaitNsrcCaseId;
  s.report = {
    id: randomUUID(),
    step: "scamType",
    identifiers: prefill.map((f) => ({
      type: f.type,
      value: f.value,
      masked: f.masked,
      role: defaultRole(f.type),
    })),
  };
  return ask(s, "scamType");
}

function askIdentifiers(s: Session): OutMessage[] {
  const r = s.report!;
  r.step = "identifiers";
  const have = r.identifiers.length
    ? `\n\n${t(s, "added")}: ${r.identifiers.map((i) => `<code>${esc(i.masked)}</code>`).join(", ")}`
    : "";
  return [{ html: `${t(s, "askIdentifiers")}${have}`, buttons: [[btn(t(s, "done"), "done")]] }];
}

function ask(s: Session, step: Step): OutMessage[] {
  const r = s.report!;
  r.step = step;
  switch (step) {
    case "scamType":
      return [
        {
          html: t(s, "askScamType"),
          buttons: rows(
            REPORT_SCAM_TYPES.map(([k, label]) => btn(label[s.lang], `rt:${k}`)),
            2,
          ),
        },
      ];
    case "identifiers":
      return askIdentifiers(s);
    case "lost":
      return [
        {
          html: t(s, "askLost"),
          buttons: [[btn(t(s, "yes"), "lost:y"), btn(t(s, "no"), "lost:n")]],
        },
      ];
    case "amount":
      return [{ html: t(s, "askAmount") }];
    case "payee":
      return [{ html: t(s, "askPayee"), buttons: [[btn(t(s, "skip"), "skip")]] }];
    case "when":
      return [
        {
          html: t(s, "askWhen"),
          buttons: [
            [btn(t(s, "whenHour"), "when:h"), btn(t(s, "whenToday"), "when:t")],
            [btn(t(s, "whenYesterday"), "when:y"), btn(t(s, "whenEarlier"), "when:e")],
          ],
        },
      ];
    case "txnRef":
      return [{ html: t(s, "askTxnRef"), buttons: [[btn(t(s, "skip"), "skip")]] }];
    case "state":
      return [
        {
          html: t(s, "askState"),
          buttons: [
            ...rows(
              STATES.map((name, i) => btn(name, `st:${i}`)),
              3,
            ),
            [btn(t(s, "skip"), "skip")],
          ],
        },
      ];
    case "consent":
      return [
        {
          html: t(s, "askConsent"),
          buttons: [[btn(t(s, "shareYes"), "consent:y"), btn(t(s, "shareNo"), "consent:n")]],
        },
      ];
  }
}

function reportText(text: string, s: Session): OutMessage[] {
  const r = s.report!;
  switch (r.step) {
    case "identifiers": {
      const found = detectIdentifiers(text);
      if (!found.length)
        return [{ html: t(s, "nothingFound"), buttons: [[btn(t(s, "done"), "done")]] }];
      for (const f of found) {
        if (!r.identifiers.some((i) => i.type === f.type && i.value === f.value)) {
          r.identifiers.push({
            type: f.type,
            value: f.value,
            masked: f.masked,
            role: defaultRole(f.type),
          });
        }
      }
      return askIdentifiers(s);
    }
    case "amount": {
      const n = Number(text.replace(/rm|myr|,|\s/gi, ""));
      if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return [{ html: t(s, "badAmount") }];
      r.lossMyr = Math.round(n * 100) / 100;
      // If they already gave an account, use it; otherwise ask which account they paid
      const known = r.identifiers.findIndex((i) => i.role === "payee_account");
      if (known >= 0) {
        r.payeeIndex = known;
        return ask(s, "when");
      }
      return ask(s, "payee");
    }
    case "payee": {
      const f = detectIdentifiers(text).find(
        (x) => x.type === "bank_account" || x.type === "ewallet",
      );
      if (!f) return ask(s, "payee");
      let idx = r.identifiers.findIndex((i) => i.type === f.type && i.value === f.value);
      if (idx < 0)
        idx =
          r.identifiers.push({
            type: f.type,
            value: f.value,
            masked: f.masked,
            role: "payee_account",
          }) - 1;
      r.payeeIndex = idx;
      return ask(s, "when");
    }
    case "txnRef": {
      const ref = text.trim();
      if (!/^[A-Za-z0-9-]{4,60}$/.test(ref)) return ask(s, "txnRef");
      r.txnRef = ref;
      return ask(s, "state");
    }
    case "state": {
      const match = STATES.findIndex((st) => st.toLowerCase() === text.trim().toLowerCase());
      if (match >= 0) {
        r.state = STATES[match];
        return ask(s, "consent");
      }
      return ask(s, "state");
    }
    default:
      return ask(s, r.step);
  }
}

async function submit(s: Session, deps: Deps, consent: boolean, now: Date): Promise<OutMessage[]> {
  const r = s.report!;
  const body: z.input<typeof ReportInput> = {
    reporter: { channel: deps.channel, externalId: deps.userId },
    scamType: r.scamType,
    language: s.lang,
    lossMyr: r.lossMyr,
    occurredAt: r.transferAt,
    victimState: r.state,
    shareConsent: consent,
    identifiers: r.identifiers.map(({ type, value, role }) => ({ type, value, role })),
    evidence: s.pendingEvidence ?? [],
    transfers:
      r.lossMyr && r.payeeIndex !== undefined
        ? [
            {
              at: r.transferAt ?? now.toISOString(),
              amountMyr: r.lossMyr,
              toIdentifierIndex: r.payeeIndex,
              txnRef: r.txnRef,
            },
          ]
        : [],
  };
  try {
    // the draft id makes a double tap on "Yes, share" submit once
    const res = await deps.api.call("createReport", {
      body,
      idempotencyKey: `${deps.channel}:${deps.userId}:${r.id}`,
    });
    delete s.report;
    delete s.pendingEvidence;
    const out: OutMessage[] = [];
    if (res.duplicateOf) out.push({ html: t(s, "duplicate") });
    out.push({ html: r.lossMyr ? t(s, "thanksLoss") : t(s, "thanksNearMiss") });
    out.push({
      html: res.verdicts
        .map((v) => `• <code>${esc(v.entity.masked)}</code>: ${esc(v.tierLabel[s.lang])}`)
        .join("\n"),
    });
    if (r.lossMyr) {
      out.push(callSheetMessage(res.callSheet, s.lang));
      out.push({ html: t(s, "askNsrc") });
      s.awaitNsrcCaseId = res.caseId;
    }
    return out;
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      delete s.report;
    }
    return [{ html: t(s, "reportFailed") }];
  }
}

// ---------- NSRC reference ----------

const looksLikeReference = (text: string) =>
  /\d{3,}/.test(text) && text.trim().length <= 60 && !/\s{2,}/.test(text);

async function saveNsrcRef(text: string, s: Session, deps: Deps): Promise<OutMessage[]> {
  const caseId = s.awaitNsrcCaseId!;
  const isPolice = /RPT|IPD|BALAI|POLIS|POLICE/i.test(text);
  try {
    await deps.api.call("addNsrcRef", {
      params: { id: caseId },
      body: isPolice ? { policeReportNo: text.slice(0, 60) } : { nsrcRef: text.slice(0, 60) },
    });
    delete s.awaitNsrcCaseId;
    return [{ html: t(s, "nsrcSaved") }];
  } catch {
    return [{ html: t(s, "checkFailed") }];
  }
}
