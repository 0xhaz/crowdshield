import type { ApiClient, Verdict } from "@crowdshield/contracts";
import { describe, expect, it } from "vitest";
import type { OutMessage } from "../src/channel.js";
import { handle, newSession, type Session } from "../src/flow.js";

const verdict = (masked: string, tier: Verdict["tier"], over: Partial<Verdict> = {}): Verdict => ({
  entity: { id: 1, type: "phone", masked, protected: tier === "protected_official" },
  risk: {
    confirmed: 99,
    high: 70,
    caution: 45,
    reported: 16,
    no_known_risk: 0,
    protected_official: 0,
  }[tier],
  tier,
  tierLabel: {
    en: tier === "confirmed" ? "Confirmed scam" : "No reports found",
    ms: tier === "confirmed" ? "Scam disahkan" : "Tiada laporan",
  },
  confidence: tier === "no_known_risk" ? null : "high",
  topScamTypes: [],
  nCases: 0,
  independentSources: 0,
  lastReportedAt: tier === "confirmed" ? new Date(Date.now() - 2 * 3_600_000).toISOString() : null,
  explanation:
    tier === "confirmed"
      ? [
          {
            line: { en: "37 report(s) from the public", ms: "37 laporan orang awam" },
            source: "user_report",
            count: 37,
          },
        ]
      : [],
  action: { en: "Hang up. Police and BNM never ask you to transfer money.", ms: "Letak telefon." },
  campaign: null,
  computedAt: null,
  ...over,
});

function fakeApi() {
  const calls: { id: string; args: unknown }[] = [];
  const api = {
    async call(id: string, args: { query?: { value: string }; body?: unknown } = {}) {
      calls.push({ id, args });
      if (id === "lookup")
        return args.query!.value === "+601123454821"
          ? verdict("+60 11-***-4821", "confirmed")
          : verdict("+60 13-***-2741", "no_known_risk");
      if (id === "createReport") {
        return {
          caseId: "11111111-1111-1111-1111-111111111111",
          duplicateOf: null,
          verdicts: [verdict("+60 11-***-4821", "confirmed"), verdict("PBB ****5518", "caution")],
          callSheet: {
            title: { en: "Call NSRC 997 now", ms: "Hubungi NSRC 997 sekarang" },
            lines: [{ label: { en: "Total lost", ms: "Jumlah kerugian" }, value: "RM 12,000.00" }],
            reminder: { en: "NSRC answers 24/7.", ms: "24/7." },
          },
        };
      }
      if (id === "addNsrcRef") return {};
      throw new Error(`unexpected ${id}`);
    },
  } as unknown as ApiClient;
  return { api, calls };
}

const html = (out: OutMessage[]) => out.map((m) => m.html).join("\n---\n");
const buttons = (out: OutMessage[]) =>
  out.flatMap((m) => m.buttons?.flat() ?? []).map((b) => b.data);

async function run(
  s: Session,
  deps: ReturnType<typeof fakeApi>,
  ...events: Parameters<typeof handle>[0][]
) {
  let out: OutMessage[] = [];
  for (const ev of events)
    out = await handle(ev, s, { api: deps.api, userId: "42", channel: "telegram" });
  return out;
}

describe("checks", () => {
  it("replies with a verdict card for each identifier", async () => {
    const d = fakeApi();
    const s = newSession("en");
    const out = await run(s, d, { kind: "text", text: "Call from 011-2345 4821 and 013-888 2741" });
    expect(out).toHaveLength(2);
    expect(out[0]!.html).toContain("🛑 <b>CONFIRMED SCAM · Scam disahkan</b>");
    expect(out[0]!.html).toContain("<code>+60 11-***-4821</code>");
    expect(out[0]!.html).toContain("37 report(s) from the public");
    expect(out[0]!.html).toMatch(/last reported 2 hours ago/);
    expect(out[1]!.html).toContain("🔍");
    expect(buttons(out)).toEqual(["report:0", "call997", "why:0", "report:1", "call997", "why:1"]);
  });

  it("explains a result without naming reporters", async () => {
    const d = fakeApi();
    const s = newSession("ms");
    await run(s, d, { kind: "text", text: "011-2345 4821" });
    const out = await run(s, d, { kind: "button", data: "why:0" });
    expect(html(out)).toContain("37 laporan orang awam");
    expect(html(out)).toContain("Identiti pelapor tidak pernah didedahkan");
  });

  it("asks for an identifier when there is none, and handles screenshots for now", async () => {
    const d = fakeApi();
    const s = newSession("en");
    expect(html(await run(s, d, { kind: "text", text: "hello is this a scam?" }))).toMatch(
      /couldn't find/,
    );
    expect(
      html(
        await run(s, d, {
          kind: "photo",
          load: async () => ({ data: Buffer.from(""), mime: "image/jpeg" }),
        }),
      ),
    ).toMatch(/screenshots is coming/);
    expect(d.calls).toHaveLength(0);
  });

  it("switches language", async () => {
    const s = newSession("en");
    await run(s, fakeApi(), { kind: "command", name: "lang", arg: "" });
    expect(s.lang).toBe("ms");
  });
});

describe("report flow", () => {
  it("from a card: asks only for what's missing, submits once, returns the 997 sheet, then captures the NSRC ref", async () => {
    const d = fakeApi();
    const s = newSession("en");
    await run(s, d, { kind: "text", text: "011-2345 4821" });
    expect(buttons(await run(s, d, { kind: "button", data: "report:0" }))).toContain(
      "rt:macau_impersonation",
    );
    expect(html(await run(s, d, { kind: "button", data: "rt:macau_impersonation" }))).toContain(
      "<code>+60 11-***-4821</code>",
    );
    await run(s, d, { kind: "button", data: "done" });
    expect(html(await run(s, d, { kind: "button", data: "lost:y" }))).toMatch(/How much/);
    expect(html(await run(s, d, { kind: "text", text: "RM12,000" }))).toMatch(/Which account/);
    expect(html(await run(s, d, { kind: "text", text: "Public Bank 6471 2093 5518" }))).toMatch(
      /When did you transfer/,
    );
    await run(s, d, { kind: "button", data: "when:h" });
    await run(s, d, { kind: "text", text: "DN2026102000012345" });
    expect(buttons(await run(s, d, { kind: "button", data: "st:11" }))).toEqual([
      "consent:y",
      "consent:n",
    ]);
    const out = await run(s, d, { kind: "button", data: "consent:y" });

    const report = d.calls.find((c) => c.id === "createReport")!.args as {
      body: Record<string, unknown>;
      idempotencyKey: string;
    };
    expect(report.idempotencyKey).toMatch(/^telegram:42:/);
    expect(report.body).toMatchObject({
      reporter: { channel: "telegram", externalId: "42" },
      scamType: "macau_impersonation",
      lossMyr: 12000,
      victimState: "Selangor",
      shareConsent: true,
      language: "en",
      identifiers: [
        { type: "phone", value: "+601123454821", role: "caller" },
        { type: "bank_account", value: "PBB:647120935518", role: "payee_account" },
      ],
      transfers: [{ amountMyr: 12000, toIdentifierIndex: 1, txnRef: "DN2026102000012345" }],
    });
    expect(html(out)).toMatch(/not your fault/);
    expect(html(out)).toContain("📋 <b>Call NSRC 997 now</b>");
    expect(html(out)).toContain("RM 12,000.00");
    expect(s.report).toBeUndefined();
    expect(s.awaitNsrcCaseId).toBe("11111111-1111-1111-1111-111111111111");

    expect(html(await run(s, d, { kind: "text", text: "NSRC-2026-10-200111" }))).toMatch(/Saved/);
    expect(d.calls.at(-1)).toMatchObject({
      id: "addNsrcRef",
      args: {
        params: { id: "11111111-1111-1111-1111-111111111111" },
        body: { nsrcRef: "NSRC-2026-10-200111" },
      },
    });
    expect(s.awaitNsrcCaseId).toBeUndefined();
  });

  it("a near-miss report skips the money questions and the call sheet", async () => {
    const d = fakeApi();
    const s = newSession("ms");
    await run(
      s,
      d,
      { kind: "command", name: "report", arg: "" },
      { kind: "button", data: "rt:parcel" },
    );
    expect(html(await run(s, d, { kind: "button", data: "done" }))).toMatch(/sekurang-kurangnya/); // needs one identifier
    await run(
      s,
      d,
      { kind: "text", text: "016-773 1290 pos-redelivery-my.top/pay" },
      { kind: "button", data: "done" },
    );
    expect(html(await run(s, d, { kind: "button", data: "lost:n" }))).toMatch(/negeri/);
    await run(s, d, { kind: "button", data: "skip" });
    const out = await run(s, d, { kind: "button", data: "consent:n" });
    const body = (
      d.calls.find((c) => c.id === "createReport")!.args as { body: Record<string, unknown> }
    ).body;
    expect(body).toMatchObject({
      shareConsent: false,
      transfers: [],
      identifiers: [{ role: "caller" }, { role: "link_sent" }],
    });
    expect(body.lossMyr).toBeUndefined();
    expect(html(out)).toMatch(/Terima kasih/);
    expect(html(out)).not.toContain("997");
    expect(s.awaitNsrcCaseId).toBeUndefined();
  });

  it("/cancel stops a report", async () => {
    const s = newSession("en");
    await run(
      s,
      fakeApi(),
      { kind: "command", name: "report", arg: "" },
      { kind: "command", name: "cancel", arg: "" },
    );
    expect(s.report).toBeUndefined();
  });
});
