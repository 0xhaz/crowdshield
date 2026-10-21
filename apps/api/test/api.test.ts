// End-to-end: the demo script (workplan §0) against the real API process.
import { ApiError, routes } from "@crowdshield/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, BASE, bot, mlCalls, PARTNER_KEY, startApi } from "./harness.js";
import { createClient } from "@crowdshield/contracts";

let api: Awaited<ReturnType<typeof startApi>>;
beforeAll(async () => {
  api = await startApi();
});
afterAll(() => api?.stop());

const status = (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e: unknown) => (e instanceof ApiError ? e.status : 0),
  );

describe("platform", () => {
  it("is healthy and serves an OpenAPI document covering every route", async () => {
    expect(await bot().call("health")).toEqual({ ok: true, db: true, redis: true });
    const doc = (await bot().call("openapi")) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(doc.openapi).toBe("3.1.0");
    for (const r of Object.values(routes))
      expect(doc.paths[r.path.replace(/:(\w+)/g, "{$1}")]?.[r.method], r.path).toBeDefined();
  });

  it("enforces auth: anonymous, bad key, wrong role, bad login", async () => {
    const anon = (await import("@crowdshield/contracts")).createClient({ baseUrl: BASE });
    expect(
      await status(anon.call("lookup", { query: { type: "phone", value: "0123456789" } })),
    ).toBe(401);
    const badKey = (await import("@crowdshield/contracts")).createClient({
      baseUrl: BASE,
      apiKey: "nope",
    });
    expect(
      await status(badKey.call("lookup", { query: { type: "phone", value: "0123456789" } })),
    ).toBe(401);
    expect(
      await status(
        anon.call("login", { body: { email: "analyst@nusabank.demo", password: "wrong" } }),
      ),
    ).toBe(401);
    const sme = await as("owner@majuvista.demo");
    expect(await status(sme.call("listAlerts"))).toBe(403);
    expect(
      await status(
        sme.call("payeeCheck", {
          body: { payee: { type: "bank_account", value: "MBB 512345678812" }, amountMyr: 10 },
        }),
      ),
    ).toBe(403);
    const analyst = await as("analyst@nusabank.demo");
    expect(await status(analyst.call("listSuppliers"))).toBe(403);
    expect(await status(analyst.call("createReport", { body: {} as never }))).toBe(403); // service only
    expect((await analyst.call("me")).org.name).toBe("Nusa Digital Bank");
  });

  it("treats malformed or unknown ids as not found", async () => {
    const analyst = await as("analyst@nusabank.demo");
    expect(await status(analyst.call("getAlert", { params: { id: "not-a-uuid" } }))).toBe(404);
    expect(
      await status(
        analyst.call("getAlert", { params: { id: "00000000-0000-4000-8000-000000000000" } }),
      ),
    ).toBe(404);
    expect(await status(analyst.call("getEntity", { params: { id: "abc" } }))).toBe(404);
  });

  it("rejects malformed input with 400", async () => {
    expect(await status(bot().call("lookup", { query: { type: "phone", value: "hello" } }))).toBe(
      400,
    );
    expect(
      await status(bot().call("lookup", { query: { type: "bank_account", value: "12345678" } })),
    ).toBe(400);
  });
});

describe("consumer lookup (demo step 1)", () => {
  it("returns the verdict card for the Macau caller", async () => {
    const v = await bot().call("lookup", { query: { type: "phone", value: "+60 11-2345 4821" } });
    expect(v).toMatchObject({
      entity: { masked: "+60 11-***-4821", protected: false },
      tier: "confirmed",
      tierLabel: { ms: "Scam disahkan" },
      topScamTypes: ["macau_impersonation"],
      action: { en: "Hang up. Police and BNM never ask you to transfer money." },
      campaign: { label: expect.stringContaining("Macau") },
    });
    expect(v.explanation.map((e) => e.source)).toEqual(
      expect.arrayContaining(["user_report", "nsrc_case"]),
    );
    expect(JSON.stringify(v)).not.toContain("601123454821"); // never the raw value
  });

  it("never says safe for an unknown number", async () => {
    const v = await bot().call("lookup", { query: { type: "phone", value: "013-888 2741" } });
    expect(v).toMatchObject({
      entity: { id: null, masked: "+60 13-***-2741" },
      tier: "no_known_risk",
      risk: 0,
      tierLabel: { en: "No reports found" },
    });
    expect(v.action.en).toMatch(/doesn't mean it is safe/);
  });

  it("tells users an official number may be spoofed", async () => {
    const v = await bot().call("lookup", { query: { type: "phone", value: "1-300-88-5465" } });
    expect(v).toMatchObject({
      tier: "protected_official",
      entity: { protected: true },
      action: { en: "Hang up and call back on the official number." },
    });
  });
});

describe("report → payee check → confirm mule (demo steps 1–4)", () => {
  const muleAccount = { type: "bank_account" as const, value: "Public Bank 6471 2093 5518" };
  let caseId = "";

  it("a bot report links the caller to a new account and returns the 997 call sheet", async () => {
    const res = await bot().call("createReport", {
      idempotencyKey: "report-demo-0001",
      body: {
        reporter: { channel: "whatsapp", externalId: "60123456700", phoneVerified: true },
        scamType: "macau_impersonation",
        lossMyr: 12000,
        language: "ms",
        victimState: "Selangor",
        victimAgeBand: "60+",
        occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        shareConsent: true,
        narrative: "Pegawai polis palsu minta pindah wang ke akaun selamat.",
        identifiers: [
          { type: "phone", value: "011-2345 4821", role: "caller" },
          { ...muleAccount, role: "payee_account" },
        ],
        transfers: [
          {
            at: new Date(Date.now() - 1_800_000).toISOString(),
            amountMyr: 12000,
            rail: "duitnow",
            toIdentifierIndex: 1,
            txnRef: "DN2026102000012345",
          },
        ],
      },
    });
    caseId = res.caseId;
    expect(res.duplicateOf).toBeNull();
    const mule = res.verdicts[1]!;
    expect(mule.entity.masked).toBe("PBB ****5518");
    expect(["caution", "high"]).toContain(mule.tier); // inherits risk from the confirmed caller
    const sheet = res.callSheet.lines.map((l) => `${l.label.en}: ${l.value}`).join("\n");
    expect(res.callSheet.title.en).toBe("Call NSRC 997 now");
    expect(sheet).toContain("PBB:647120935518"); // full account for NSRC, returned to the victim only
    expect(sheet).toContain("DN2026102000012345");
    expect(sheet).toContain("RM 12,000.00");
  });

  it("is idempotent and de-duplicates the same reporter", async () => {
    const again = await bot().call("createReport", {
      idempotencyKey: "report-demo-0001",
      body: {
        reporter: { channel: "whatsapp", externalId: "x" },
        identifiers: [{ type: "phone", value: "0123456789", role: "caller" }],
        shareConsent: false,
      },
    });
    expect(again.caseId).toBe(caseId);
    const dup = await bot().call("createReport", {
      body: {
        reporter: { channel: "whatsapp", externalId: "60123456700" },
        shareConsent: true,
        identifiers: [
          { type: "phone", value: "+60112345 4821", role: "caller" },
          { ...muleAccount, role: "payee_account" },
        ],
      },
    });
    expect(dup.duplicateOf).toBe(caseId);
  });

  it("the NSRC reference the victim brings back upgrades the case", async () => {
    const c = await bot().call("addNsrcRef", {
      params: { id: caseId },
      body: { nsrcRef: "NSRC-2026-10-200111" },
    });
    expect(c).toMatchObject({ nsrcRef: "NSRC-2026-10-200111", verification: "reviewed" });
  });

  let alertId = "";
  it("the bank's payee check joins the account with the live call and raises an alert", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const res = await analyst.call("payeeCheck", {
      body: {
        payee: muleAccount,
        amountMyr: 25000,
        rail: "duitnow",
        callSignal: { active: true, caller: { type: "phone", value: "011-2345 4821" } },
      },
    });
    expect(res.caller).toMatchObject({ tier: "confirmed" });
    expect(res.combinedRisk).toBeGreaterThan(res.payee.risk);
    // payee only inherits risk so far; the confirmed caller on the line lifts it to "hold and call back"
    expect(res.combinedTier).toBe("high");
    expect(res.recommendedAction).toBe("hold_and_callback");
    expect(res.customerWarning.en).toMatch(/Hang up before you pay/);
    expect(res.alertId).toBeTruthy();
    alertId = res.alertId!;

    const quiet = await analyst.call("payeeCheck", {
      body: { payee: { type: "bank_account", value: "Maybank 5144 0912 7730" }, amountMyr: 800 },
    });
    expect(quiet).toMatchObject({
      combinedTier: "no_known_risk",
      recommendedAction: "proceed",
      alertId: null,
    });
  });

  it("confirming the mule feeds back: the account is now a confirmed scam for everyone", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const list = await analyst.call("listAlerts", { query: { status: "open" } });
    expect(list.items.map((a) => a.id)).toContain(alertId);
    const before = await bot().call("lookup", { query: muleAccount }); // warm the cache
    expect(before.tier).not.toBe("confirmed");

    const after = await analyst.call("alertAction", {
      params: { id: alertId },
      body: { action: "confirm_mule", note: "Opened 9 days ago; 14 inbound from strangers." },
    });
    expect(after).toMatchObject({ status: "confirmed_mule", verdict: { tier: "confirmed" } });
    expect(after.interventions.map((i) => i.action)).toContain("confirm_mule");

    const v = await bot().call("lookup", { query: muleAccount }); // cache was invalidated
    expect(v.tier).toBe("confirmed");
    expect(v.explanation.map((e) => e.source)).toContain("bank_confirmed");
  });
});

describe("bank dashboard, cases, entities", () => {
  it("shows the overview with campaigns and hot entities", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const d = await analyst.call("bankDashboard");
    expect(d.openAlerts).toBeGreaterThan(0);
    expect(d.frozenMyr).toBe(12000);
    expect(d.campaigns[0]!.label).toMatch(/LHDN/); // biggest spike first
    expect(d.hotEntities.length).toBeGreaterThan(0);
  });

  it("shows the NSRC case with timeline, money trail and the bank's own cash-out data", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const page = await analyst.call("listCases", {
      query: { withLoss: true, scamType: "macau_impersonation", pageSize: 50 },
    });
    const nsrc = page.items.find((c) => c.nsrcRef === "NSRC-2026-10-118274")!;
    const c = await analyst.call("getCase", { params: { id: nsrc.id } });
    expect(c.timeline.map((t) => t.kind)).toEqual([
      "first_contact",
      "transfer_to_officer",
      "pressure",
      "transfer",
      "report",
    ]);
    expect(c.moneyTrail).toHaveLength(3);
    expect(c.moneyTrail[0]).toMatchObject({
      hopNo: 1,
      amountMyr: 48000,
      to: { masked: "MBB ****8812" },
    });
    expect(c.cashouts).toHaveLength(1);
    expect(JSON.stringify(c)).not.toMatch(/value_enc|lookup_hash/);
  });

  it("lists entities without victims, shows the graph, and handles an appeal", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const list = await analyst.call("listEntities", { query: { pageSize: 100 } });
    expect(list.items.some((e) => e.masked === "BSN ****0076")).toBe(false); // the victim's account
    const mule = list.items.find((e) => e.masked === "MBB ****8812")!;
    const graph = await analyst.call("getNeighbours", { params: { id: mule.id! } });
    expect(graph.edges.some((e) => e.kind === "money_flow")).toBe(true);

    const two = list.items.find((e) => e.masked === "+60 19-***-8836")!;
    const appeal = await bot().call("createAppeal", {
      params: { id: two.id! },
      body: {
        reason: "This is my new number since September; I am not a scammer.",
        claimantVerified: true,
      },
    });
    const supervisor = await as("supervisor@nusabank.demo");
    expect(
      await status(
        analyst.call("decideAppeal", { params: { id: appeal.id }, body: { decision: "upheld" } }),
      ),
    ).toBe(403);
    await supervisor.call("decideAppeal", {
      params: { id: appeal.id },
      body: { decision: "upheld" },
    });
    const d = await analyst.call("getEntity", { params: { id: two.id! } });
    expect(d.entity.status).toBe("cleared");
    expect(d.score!.clearing).toBe(0.1);
    expect(d.verdict.risk).toBeLessThan(5);
  });
});

describe("web intelligence (Tavily via the ML gateway)", () => {
  it("returns web leads for an unknown identifier, sending only its canonical value", async () => {
    const r = await bot().call("webLeads", { body: { type: "phone", value: "013-888 2741" } });
    expect(r).toMatchObject({
      relevantCount: 1,
      cached: false,
      leads: [{ relevant: true, scamType: "investment", publishedAt: null }, { relevant: false }],
    });
    expect(mlCalls.at(-1)).toEqual({
      path: "/v1/web/identifier",
      body: { type: "phone", value: "+60138882741" },
    });
  });

  it("checks a link's page and an investment name", async () => {
    const u = await bot().call("urlCheck", {
      body: { url: "https://www.LHDN-refund-my.com/claim?utm_source=sms" },
    });
    expect(u).toMatchObject({
      fetched: true,
      pageCheck: { impersonates: "LHDN", asksForOtpOrCard: true, suspicious: true },
    });
    expect(mlCalls.at(-1)!.body).toEqual({ url: "lhdn-refund-my.com/claim" });
    expect(
      (await bot().call("investmentCheck", { body: { name: "Qorvanta" } })).relevantCount,
    ).toBe(1);
  });
});

describe("Semak supplier (demo step 5)", () => {
  it("lists the business's suppliers", async () => {
    const sme = await as("owner@majuvista.demo");
    const s = await sme.call("listSuppliers");
    expect(s.map((x) => x.name)).toEqual([
      "Binqora Bekalan Enterprise",
      "Cemvora Trading Sdn Bhd",
      "Keluvra Steel Supplies Sdn Bhd",
    ]);
    expect(s[2]!.accountMasked).toBe("PBB ****4457");
  });

  it("passes a normal invoice from a known supplier", async () => {
    const sme = await as("owner@majuvista.demo");
    const r = await sme.call("supplierCheck", {
      body: {
        invoice: {
          supplierName: "Cemvora Trading Sdn Bhd",
          ssmNo: "201501007731",
          tin: "C2391175508",
          bank: "Maybank",
          account: "5144 0912 7730",
          amountMyr: 18400,
          einvoiceUuid: "F9D425P6DS7D8IU",
          emailFrom: "billing@cemvora.my",
        },
      },
    });
    expect(r.risk).toBe("low");
    expect(r.bankDetailChanged).toBe(false);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.actions[0]!.en).toMatch(/not a guarantee/);
  });

  it("catches the BEC bank-detail change, holds the payment, and reports the fake account", async () => {
    const sme = await as("owner@majuvista.demo");
    const r = await sme.call("supplierCheck", {
      body: {
        channel: "whatsapp",
        invoice: {
          supplierName: "Keluvra Steel Supplies Sdn Bhd",
          ssmNo: "201901023456",
          tin: "C2584563200",
          bank: "Hong Leong Bank",
          account: "2290 1847 3365",
          amountMyr: 86500,
          invoiceNo: "SS-2026-1187",
          emailFrom: "accounts@keluvra-steel-my.com",
          phone: "016-221 0934",
          bankChangeLanguage: true,
          urgencyLanguage: true,
        },
      },
    });
    const byKey = Object.fromEntries(r.checks.map((c) => [c.key, c]));
    expect(r).toMatchObject({
      risk: "high",
      bankDetailChanged: true,
      supplier: { name: "Keluvra Steel Supplies Sdn Bhd" },
    });
    expect(byKey.ssm!.status).toBe("pass"); // the real company is fine…
    expect(byKey.history).toMatchObject({
      status: "fail",
      reason: { en: expect.stringContaining("PBB ****4457") },
    });
    expect(byKey.account_name).toMatchObject({
      status: "fail",
      reason: { en: expect.stringContaining("individual") },
    });
    expect(byKey.graph).toMatchObject({
      status: "fail",
      reason: { en: expect.stringContaining("HLB ****3365") },
    }); // linked to the mule ring
    expect(byKey.email_domain).toMatchObject({
      status: "fail",
      reason: { en: expect.stringContaining("keluvra-steel.com.my") },
    });
    expect(byKey.official_contact).toMatchObject({
      status: "warn",
      source: "Your supplier records",
      reason: { en: expect.stringContaining("isn't the number in your records (+60351218800)") },
    });
    expect(r.officialContact).toEqual({
      phone: "03-5121 8800",
      sourceUrl: "https://keluvra-steel.com.my/contact",
    });
    expect(r.holdId).toBeTruthy();

    const holds = await sme.call("listHolds");
    const hold = holds.find((h) => h.id === r.holdId)!;
    expect(hold).toMatchObject({
      status: "on_hold",
      newAccountMasked: "HLB ****3365",
      supplier: { callbackPhone: "+60351218800" },
    });
    expect(
      await status(
        sme.call("decideHold", { params: { id: hold.id }, body: { decision: "verified" } }),
      ),
    ).toBe(400); // callback first
    await sme.call("updateHoldChecklist", {
      params: { id: hold.id },
      body: { step: "callback", done: true },
    });
    const decided = await sme.call("decideHold", {
      params: { id: hold.id },
      body: {
        decision: "rejected",
        note: "Keluvra Steel confirmed by phone they never changed banks.",
      },
    });
    expect(decided.status).toBe("rejected");

    const v = await bot().call("lookup", {
      query: { type: "bank_account", value: "HLB 2290 1847 3365" },
    });
    expect(v.topScamTypes).toContain("bec_supplier"); // the bank side now sees it too
  });

  it("warns about a newly registered supplier", async () => {
    const sme = await as("owner@majuvista.demo");
    const r = await sme.call("supplierCheck", {
      body: {
        invoice: {
          supplierName: "Glovexa Supply Sdn Bhd",
          ssmNo: "202608047712",
          tin: "C60011234500",
          bank: "Maybank",
          account: "5621 0098 4410",
          amountMyr: 42000,
        },
      },
    });
    const byKey = Object.fromEntries(r.checks.map((c) => [c.key, c]));
    expect(byKey.ssm).toMatchObject({
      status: "warn",
      reason: { en: expect.stringContaining("registered only") },
    });
    expect(byKey.account_name!.status).toBe("fail");
    expect(byKey.official_contact!.status).toBe("unavailable"); // no official website found
    expect(r.risk).toBe("high");
    expect(r.actions.map((a) => a.en).join(" ")).toMatch(/pay in stages/);
  });

  it("summarises it all on the SME dashboard", async () => {
    const sme = await as("owner@majuvista.demo");
    const d = await sme.call("smeDashboard");
    expect(d.suppliersByStatus.verified).toBe(3);
    expect(d.checksThisMonth).toBe(3);
    expect(d.flaggedChecks).toHaveLength(2);
  });
});

describe("partner bank API (customer banking app)", () => {
  const partner = () => createClient({ baseUrl: BASE, apiKey: PARTNER_KEY });

  it("runs the payee check with the bank's partner key, and nothing else", async () => {
    const r = await partner().call("payeeCheck", {
      body: {
        payee: { type: "bank_account", value: "Public Bank 6471 2093 5518" },
        amountMyr: 500,
      },
    });
    expect(r.payee.entity.masked).toBe("PBB ****5518");
    expect(await status(partner().call("listAlerts", { query: {} as never }))).toBe(403);
    expect(await status(partner().call("listCases", { query: {} as never }))).toBe(403);
    const bad = createClient({ baseUrl: BASE, apiKey: "not-a-real-partner-key-000000" });
    expect(await status(bad.call("payeeCheck", { body: {} as never }))).toBe(401);
  });
});

describe("case brief (Nemotron Ultra)", () => {
  it("sends only masked identifiers with citable ids, and returns the brief with its trace", async () => {
    const analyst = await as("analyst@nusabank.demo");
    const { items } = await analyst.call("listCases", { query: { withLoss: true } as never });
    const c = items.find((x) => x.entities.length)!;
    const brief = await analyst.call("caseBrief", { params: { id: c.id } });
    expect(brief.headline.en).toContain("Mule");
    expect(brief.trace.calls[0]).toMatchObject({ reasoning: true });
    const sent = mlCalls.findLast((m) => m.path === "/v1/brief")!.body.case as {
      identifiers: { id: string; masked: string }[];
    };
    expect(sent.identifiers[0]!.id).toMatch(/^entity:\d+$/);
    const json = JSON.stringify(sent);
    expect(json).toContain("PBB ****5518");
    for (const raw of ["647120935518", "1123454821"]) expect(json).not.toContain(raw); // full account / phone
    const sme = await as("owner@majuvista.demo");
    expect(await status(sme.call("caseBrief", { params: { id: c.id } }))).toBe(403);
  });
});

describe("campaign detection (embeddings + Nemotron labels)", () => {
  const kwsp = (n: number) =>
    `Saya pegawai KWSP. Permohonan pengeluaran KWSP anda diluluskan tetapi akaun anda dibekukan. Sila pindah RM${n} ke akaun selamat hari ini untuk pengesahan.`;
  const report = (i: number) =>
    bot().call("createReport", {
      body: {
        reporter: { channel: "telegram", externalId: `kwsp-victim-${i}` },
        scamType: "macau_impersonation",
        scriptText: kwsp(1000 * i),
        identifiers: [{ type: "phone", value: `011-5550 10${10 + i}`, role: "caller" }],
        shareConsent: true,
      },
    });
  const caseIds: string[] = [];
  let campaignId = 0;

  it("backfills scripts for seeded cases (service only)", async () => {
    expect((await bot().call("backfillScripts")).embedded).toBeGreaterThan(0);
    expect((await bot().call("backfillScripts")).embedded).toBe(0);
    const analyst = await as("analyst@nusabank.demo");
    expect(await status(analyst.call("backfillScripts"))).toBe(403);
  });

  it("turns three similar unmatched reports into a candidate campaign for review", async () => {
    for (let i = 1; i <= 3; i++) caseIds.push((await report(i)).caseId);
    const analyst = await as("analyst@nusabank.demo");
    for (let i = 0; i < 50 && !campaignId; i++) {
      await analyst.call("detectCampaigns"); // detection also runs in the background after each report
      const list = await analyst.call("listCampaigns");
      for (const c of list.filter((x) => x.origin === "detected")) {
        const cases = await analyst.call("listCases", { query: { campaignId: c.id } as never });
        if (caseIds.every((id) => cases.items.some((x) => x.id === id))) campaignId = c.id;
      }
      if (!campaignId) await new Promise((r) => setTimeout(r, 100));
    }
    const c = (await analyst.call("listCampaigns")).find((x) => x.id === campaignId)!;
    expect(c).toMatchObject({
      status: "candidate",
      origin: "detected",
      label: "Fake KWSP withdrawal officer, Oct 2026",
      keyPhrases: ["pengeluaran KWSP", "akaun selamat"],
    });
    expect(c.totalCases).toBe(3);
    // the stored script is the gateway's redacted text, never the raw message
    const embedded = mlCalls.filter((m) => m.path === "/v1/embed");
    expect(embedded.length).toBeGreaterThan(0);
  });

  it("tells consumers about a campaign only once a person confirms it", async () => {
    const before = await bot().call("campaignMatch", { body: { text: kwsp(4000) } });
    expect(before.campaign).toBeNull(); // candidate: not reviewed yet
    const analyst = await as("analyst@nusabank.demo");
    const confirmed = await analyst.call("reviewCampaign", {
      params: { id: campaignId },
      body: { decision: "confirm" },
    });
    expect(confirmed.status).toBe("active");
    const after = await bot().call("campaignMatch", { body: { text: kwsp(5000) } });
    expect(after.campaign?.id).toBe(campaignId);
    expect(after.similarity).toBeGreaterThanOrEqual(0.72);
    const fourth = await report(4);
    expect(fourth.campaign).toMatchObject({ id: campaignId, label: confirmed.label });
    // an unrelated message stays unmatched
    const other = await bot().call("campaignMatch", {
      body: { text: "Tahniah! Anda menang hadiah iPhone, klik pautan untuk tuntut sekarang." },
    });
    expect(other.campaign).toBeNull();
  });

  it("dismissing a candidate releases its cases", async () => {
    const analyst = await as("analyst@nusabank.demo");
    for (let i = 10; i <= 12; i++)
      await bot().call("createReport", {
        body: {
          reporter: { channel: "telegram", externalId: `parcel-${i}` },
          scriptText: `Bungkusan anda ditahan di kastam. Bayar RM${i} cukai melalui pautan ini sebelum dipulangkan kepada pengirim kurier.`,
          identifiers: [{ type: "phone", value: `011-5551 20${i}`, role: "messenger" }],
          shareConsent: true,
        },
      });
    let cand;
    for (let i = 0; i < 50 && !cand; i++) {
      await analyst.call("detectCampaigns");
      cand = (await analyst.call("listCampaigns")).find(
        (x) => x.status === "candidate" && x.id !== campaignId,
      );
      if (!cand) await new Promise((r) => setTimeout(r, 100));
    }
    expect(cand).toBeDefined();
    if (!cand) return;
    const d = await analyst.call("reviewCampaign", {
      params: { id: cand.id },
      body: { decision: "dismiss" },
    });
    expect(d.status).toBe("dismissed");
    expect((await analyst.call("listCampaigns")).some((x) => x.id === cand.id)).toBe(false);
    const cases = await analyst.call("listCases", { query: { campaignId: cand.id } as never });
    expect(cases.total).toBe(0);
  });
});

describe("public check (landing page, no sign-in)", () => {
  const anon = () => createClient({ baseUrl: BASE });

  it("checks identifiers in a pasted message and names the scam pattern", async () => {
    const r = await anon().call("publicCheck", {
      body: { text: "Pegawai polis: pindah wang ke Public Bank 6471 2093 5518 sekarang juga." },
    });
    expect(r.verdicts.map((v) => v.entity.masked)).toEqual(["PBB ****5518"]);
    expect(r.pattern).toMatchObject({ scamType: "macau_impersonation" });
    expect(r.pattern!.action).not.toBeNull();
    expect(r.trace!.calls.map((c) => c.kind)).toEqual(
      expect.arrayContaining(["model", "embedding"]),
    );
    const short = await anon().call("publicCheck", { body: { text: "0123456789" } });
    expect(short.pattern).toBeNull();
    expect(short.trace).toBeNull();
  });

  it("reads a screenshot, then runs the same check on its text", async () => {
    const r = await anon().call("publicScreenshot", {
      body: { imageBase64: Buffer.alloc(300, 7).toString("base64"), mime: "image/png" },
    });
    expect(r.transcript).toContain("Public Bank");
    expect(r.verdicts[0]!.entity.masked).toBe("PBB ****5518");
    expect(r.pattern!.scamType).toBe("macau_impersonation");
  });

  it("rate-limits screenshots per visitor", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push(
        await status(
          anon().call("publicScreenshot", {
            body: { imageBase64: Buffer.alloc(300, i).toString("base64"), mime: "image/png" },
          }),
        ),
      );
    expect(codes).toContain(429);
  });

  it("serves this week's scam news with sources", async () => {
    const n = await anon().call("news");
    expect(n.items[0]).toMatchObject({ lossMyr: 120000, source: "news.example.my" });
  });
});
