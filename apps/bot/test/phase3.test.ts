// Screenshots, story classification and web follow-ups (Phase 3), with fake ML / API / storage.
import type { ApiClient, Verdict } from "@crowdshield/contracts";
import { describe, expect, it } from "vitest";
import type { OutMessage } from "../src/channel.js";
import { type Deps, handle, newSession } from "../src/flow.js";
import type { EvidenceStore, Ml } from "../src/services.js";

const verdict = (masked: string, tier: Verdict["tier"]): Verdict => ({
  entity: { id: 1, type: "phone", masked, protected: false },
  risk: tier === "confirmed" ? 99 : 0,
  tier,
  tierLabel: { en: tier, ms: tier },
  confidence: null,
  topScamTypes: [],
  nCases: 0,
  independentSources: 0,
  lastReportedAt: null,
  explanation: [],
  action: { en: "Act.", ms: "Bertindak." },
  campaign: null,
  computedAt: null,
});

function setup() {
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {};
  const api = {
    async call(
      id: string,
      args: {
        query?: { value: string };
        body?: { value?: string; url?: string; name?: string; text?: string };
      } = {},
    ) {
      calls.push(id);
      bodies[id] = args.body;
      if (id === "lookup")
        return args.query!.value === "+601123454821"
          ? verdict("+60 11-***-4821", "confirmed")
          : verdict("x", "no_known_risk");
      if (id === "webLeads")
        return {
          query: "q",
          relevantCount: 1,
          cached: false,
          fetchedAt: "",
          leads: [
            {
              title: "Forum: beware this account",
              url: "https://forum.my/t/1",
              snippet: "",
              publishedAt: null,
              scamType: null,
              relevant: true,
            },
          ],
        };
      if (id === "urlCheck")
        return {
          url: "u",
          fetched: true,
          title: "LHDN",
          cached: false,
          fetchedAt: "",
          pageCheck: {
            impersonates: "LHDN",
            hasLoginForm: true,
            asksForOtpOrCard: true,
            hasApkDownload: false,
            suspicious: true,
            summary: { en: "Fake refund page.", ms: "Halaman palsu." },
          },
        };
      if (id === "campaignMatch")
        return {
          campaign: /polis|police/i.test(String((args.body as { text?: string }).text))
            ? { id: 1, label: "Fake PDRM/BNM officer calls", reports24h: 12, scamType: null }
            : null,
          similarity: 0.8,
        };
      if (id === "investmentCheck")
        return { query: "q", relevantCount: 0, cached: false, fetchedAt: "", leads: [] };
      if (id === "createReport")
        return {
          caseId: "c1",
          duplicateOf: null,
          campaign: {
            id: 1,
            label: "Fake PDRM/BNM officer calls",
            reports24h: 13,
            similarity: 0.8,
          },
          verdicts: [],
          callSheet: { title: { en: "", ms: "" }, lines: [], reminder: { en: "", ms: "" } },
        };
      throw new Error(id);
    },
  } as unknown as ApiClient;
  const ml: Ml = {
    screenshot: async () => ({
      text: "Saya Inspektor Lim. Pindah ke Public Bank 6471 2093 5518 sekarang. Hubungi 011-2345 4821.",
      scam_type: "macau_impersonation",
      language: "ms",
      urgency: true,
      impersonating: "PDRM",
      summary: {
        en: "A fake police officer demands a transfer.",
        ms: "Pegawai polis palsu meminta pemindahan.",
      },
      needs_review: false,
    }),
    classify: async (text) => ({
      scam_type: text.includes("parcel")
        ? "parcel"
        : /polis/i.test(text)
          ? "macau_impersonation"
          : "not_a_scam",
      impersonating: null,
      summary: { en: "A courier fee message.", ms: "Mesej yuran kurier." },
      needs_review: false,
      trace: {
        calls: [{ kind: "model", model: "nvidia/Nemotron-3-Ultra-550b-a55b", ms: 980 }],
        totalMs: 991,
        cached: false,
      },
    }),
  };
  const stored: string[] = [];
  const evidence: EvidenceStore = {
    put: async () => {
      stored.push("x");
      return { storageUri: "s3://evidence/telegram/2026-10-20/a.jpg", sha256: "ab" };
    },
  };
  const tasks: (() => Promise<OutMessage[]>)[] = [];
  const deps: Deps = {
    api,
    userId: "42",
    channel: "telegram",
    ml,
    evidence,
    defer: (t) => tasks.push(t),
  };
  const followUps = async () => (await Promise.all(tasks.splice(0).map((t) => t()))).flat();
  return { deps, calls, bodies, stored, followUps };
}

const photo = {
  kind: "photo" as const,
  load: async () => ({ data: Buffer.from("img"), mime: "image/jpeg" }),
};
const html = (out: OutMessage[]) => out.map((m) => m.html).join("\n---\n");

describe("screenshots", () => {
  it("reads a screenshot, names the pattern, checks every identifier in it, and keeps it as evidence", async () => {
    const { deps, stored, followUps } = setup();
    const s = newSession("en");
    const out = await handle(photo, s, deps);
    expect(out[0]!.html).toContain("📷 <b>What I see</b>");
    expect(out[0]!.html).toContain("fake police / BNM officer (Macau scam)");
    expect(out[0]!.html).toContain("Police and BNM never ask you to transfer money");
    expect(out).toHaveLength(3); // header + two cards (account, phone) in message order
    expect(s.lastChecked.map((f) => f.value)).toEqual(["PBB:647120935518", "+601123454821"]);
    expect(stored).toHaveLength(1);
    expect(s.pendingEvidence).toEqual([
      { kind: "screenshot", storageUri: "s3://evidence/telegram/2026-10-20/a.jpg" },
    ]);
    // the unknown account gets a web follow-up; the confirmed caller doesn't need one
    const more = await followUps();
    expect(more).toHaveLength(1);
    expect(more[0]!.html).toContain("🌐 <b>Web check</b>");
    expect(more[0]!.html).toContain('<a href="https://forum.my/t/1">');
  });

  it("attaches the screenshot to the next report as evidence", async () => {
    const { deps, bodies } = setup();
    const s = newSession("en");
    await handle(photo, s, deps);
    await handle({ kind: "button", data: "report:0" }, s, deps); // the account card
    for (const ev of [
      { kind: "button", data: "rt:macau_impersonation" },
      { kind: "button", data: "done" },
      { kind: "button", data: "lost:n" },
      { kind: "button", data: "skip" },
      { kind: "button", data: "consent:y" },
    ] as const) {
      await handle(ev, s, deps);
    }
    // "Report this" on the account card reports everything from that screenshot, account first
    expect(
      (bodies.createReport as { identifiers: { value: string; role: string }[] }).identifiers,
    ).toEqual([
      { type: "bank_account", value: "PBB:647120935518", role: "payee_account" },
      { type: "phone", value: "+601123454821", role: "caller" },
    ]);
    expect((bodies.createReport as { evidence: unknown[] }).evidence).toEqual([
      { kind: "screenshot", storageUri: "s3://evidence/telegram/2026-10-20/a.jpg" },
    ]);
    expect(s.pendingEvidence).toBeUndefined();
  });

  it("during a report, a screenshot adds its identifiers to the report", async () => {
    const { deps } = setup();
    const s = newSession("en");
    await handle({ kind: "command", name: "report", arg: "" }, s, deps);
    await handle({ kind: "button", data: "rt:macau_impersonation" }, s, deps);
    const out = await handle(photo, s, deps);
    expect(html(out)).toContain("kept as evidence");
    expect(s.report!.identifiers.map((i) => i.role)).toEqual(["payee_account", "caller"]);
  });
});

describe("stories and web checks", () => {
  it("classifies a story with no identifiers", async () => {
    const { deps } = setup();
    const s = newSession("en");
    expect(
      html(
        await handle(
          { kind: "text", text: "I got an SMS saying my parcel is held until I pay a fee" },
          s,
          deps,
        ),
      ),
    ).toMatch(/Looks like.*fake parcel/s);
    expect(
      html(
        await handle(
          { kind: "text", text: "Hi, are we still meeting for lunch tomorrow at 1pm?" },
          s,
          deps,
        ),
      ),
    ).toMatch(/doesn't look like a known scam/);
  });

  it("checks a link's page without the user opening it", async () => {
    const { deps, bodies, followUps } = setup();
    const s = newSession("en");
    await handle(
      { kind: "text", text: "Claim your refund at https://lhdn-refund-my.com/claim" },
      s,
      deps,
    );
    const more = await followUps();
    expect(bodies.urlCheck).toEqual({ url: "lhdn-refund-my.com/claim" });
    expect(more[0]!.html).toContain("Looks like a fake LHDN page");
    expect(more[0]!.html).toContain("asks for a login, OTP or card details");
  });

  it("/invest checks regulator lists and never calls a scheme safe", async () => {
    const { deps } = setup();
    const out = await handle(
      { kind: "command", name: "invest", arg: "Qorvanta" },
      newSession("en"),
      deps,
    );
    expect(html(out)).toContain("<b>Qorvanta</b>");
    expect(html(out)).toMatch(/That isn't approval/);
  });
});

describe("examples, campaigns and the AI trace", () => {
  it("/start offers one-tap examples that run a real check", async () => {
    const { deps, calls } = setup();
    const s = newSession("en");
    const start = await handle({ kind: "command", name: "start", arg: "" }, s, deps);
    const data = start.flatMap((m) => m.buttons?.flat() ?? []).map((b) => b.data);
    expect(data).toEqual(["ex:0", "ex:1", "ex:2", "ex:3", "report:new"]);
    const out = await handle({ kind: "button", data: "ex:0" }, s, deps);
    expect(html(out)).toContain("Example: <code>011-2345 4821</code>");
    expect(calls).toContain("lookup");
  });

  it("a story names the pattern, the known scam wave and the model that read it", async () => {
    const { deps } = setup();
    const s = newSession("en");
    const out = html(await handle({ kind: "button", data: "ex:3" }, s, deps));
    expect(out).toMatch(/Known scam wave:<\/b> Fake PDRM\/BNM officer calls\. 12 report/);
    expect(out).toContain("🤖 Nemotron 3 Ultra · 1.0 s");
  });

  it("sends the message that started a report as its script, and shows the campaign it joined", async () => {
    const { deps, bodies, followUps } = setup();
    const s = newSession("en");
    const text =
      "Polis call: pindah ke Public Bank 6471 2093 5518 sekarang, jangan beritahu sesiapa.";
    await handle({ kind: "text", text }, s, deps);
    expect((await followUps()).map((m) => m.html).join()).toContain("Known scam wave");
    await handle({ kind: "button", data: "report:0" }, s, deps);
    await handle({ kind: "button", data: "rt:macau_impersonation" }, s, deps);
    await handle({ kind: "button", data: "done" }, s, deps);
    await handle({ kind: "button", data: "lost:n" }, s, deps);
    await handle({ kind: "button", data: "skip" }, s, deps);
    const out = await handle({ kind: "button", data: "consent:y" }, s, deps);
    expect((bodies.createReport as { scriptText?: string }).scriptText).toBe(text);
    expect(html(out)).toContain("13 report(s) in the last 24 hours");
    expect(s.lastText).toBeUndefined();
  });
});
