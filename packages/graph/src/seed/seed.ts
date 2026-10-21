// Demo seed: synthetic Malaysian scam scenarios (workplan §3 Phase 1).
// All identifiers are made up and shown masked everywhere. Times are relative to `now`
// so the demo data is always "recent". Deterministic: same RNG seed → same data.
import {
  alert,
  appeal,
  appUser,
  campaign,
  caseEvidence,
  cashoutEvent,
  entity,
  entityScore,
  fundHop,
  incidentEvent,
  intervention,
  leReferral,
  observation,
  org,
  reporter,
  scamCase,
  source,
  supplier,
} from "@crowdshield/db";
import {
  lookupHash,
  normalise,
  normaliseSsmNo,
  normaliseTin,
  type IdentifierType,
} from "@crowdshield/normalise";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth.js";
import { refreshCampaignStats } from "../campaigns.js";
import { linkCaseEntities, upsertEdge } from "../edges.js";
import { upsertEntity } from "../entities.js";
import { recomputeAll } from "../recompute.js";
import type { DbOrTx, Secrets } from "../types.js";

type ScamType = NonNullable<(typeof scamCase.$inferInsert)["scamType"]>;
type Role = (typeof observation.$inferInsert)["role"];
type SourceKind = (typeof source.$inferSelect)["kind"];

const POLICY_VERSION = "policy-2026-10-demo";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Identifiers the demo script uses (workplan §0). Raw values: never show these unmasked in the UI. */
export const DEMO = {
  macauCaller: { type: "phone", raw: "011-2345 4821" },
  macauOfficerWhatsapp: { type: "whatsapp", raw: "017-208 3391" },
  macauMule1: { type: "bank_account", raw: "Maybank 5123 4567 8812" },
  macauMule2: { type: "bank_account", raw: "CIMB 8001 2345 6677" },
  becPersonalAccount: { type: "bank_account", raw: "Hong Leong Bank 2290 1847 3365" },
  // Not seeded: the account the "officer" gives during the live demo report (step 2), then payee-checked (step 3)
  liveDemoMuleAccount: { type: "bank_account", raw: "Public Bank 6471 2093 5518" },
  parcelCaller: { type: "phone", raw: "016-773 1290" },
  parcelLink: { type: "url", raw: "https://pos-redelivery-my.top/pay?ref=MY88213" },
  investmentTelegram: { type: "telegram", raw: "@Qorvanta_Admin" },
  investmentApp: { type: "app", raw: "com.qorvanta.trade" },
  investmentDomain: { type: "domain", raw: "qorvanta-trade.com" },
  lhdnCaller1: { type: "phone", raw: "014-962 0417" },
  lhdnCaller2: { type: "phone", raw: "014-962 0583" },
  lhdnLink: { type: "url", raw: "https://lhdn-refund-my.com/claim" },
  jobWhatsapp: { type: "whatsapp", raw: "018-355 7024" },
  jobEwallet: { type: "ewallet", raw: "TNG 018-355 7024" },
  clearedNumber: { type: "phone", raw: "012-660 4415" },
  twoReportsNumber: { type: "phone", raw: "019-427 8836" },
  // BNMTELELINK as published by BNM; verify against bnm.gov.my before the demo (Tavily refresh, Phase 3b)
  protectedOfficial: { type: "phone", raw: "1-300-88-5465" },
  unknownNumber: { type: "phone", raw: "013-888 2741" }, // never seeded: shows "No reports found"
} as const satisfies Record<string, { type: IdentifierType; raw: string }>;

export const DEMO_USERS = [
  { email: "admin@crowdshield.local", name: "CrowdShield Admin", role: "admin", org: "platform" },
  { email: "analyst@nusabank.demo", name: "Aisyah Rahman", role: "bank_analyst", org: "bank" },
  { email: "supervisor@nusabank.demo", name: "Daniel Lim", role: "bank_supervisor", org: "bank" },
  { email: "owner@majuvista.demo", name: "Kavitha Subramaniam", role: "sme_owner", org: "sme" },
] as const;

const STATES = [
  "Selangor",
  "Kuala Lumpur",
  "Johor",
  "Pulau Pinang",
  "Perak",
  "Sabah",
  "Sarawak",
  "Kedah",
  "Negeri Sembilan",
  "Melaka",
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedSummary {
  orgs: number;
  users: number;
  entities: number;
  cases: number;
  demoPassword: string;
}

export async function seed(
  db: DbOrTx,
  secrets: Secrets,
  options: { now?: Date; demoPassword?: string } = {},
): Promise<SeedSummary> {
  const now = options.now ?? new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const r = rng(20261030);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const demoPassword = options.demoPassword ?? "crowdshield-demo";

  // ---------- reference data ----------
  const sources = new Map((await db.select().from(source)).map((s) => [s.kind, s.id]));
  const sourceId = (kind: SourceKind) => {
    const id = sources.get(kind);
    if (!id) throw new Error(`source ${kind} missing: run migrations first`);
    return id;
  };

  const orgRows = await db
    .insert(org)
    .values([
      { kind: "platform", name: "CrowdShield" },
      { kind: "bank", name: "Nusa Digital Bank" },
      { kind: "ewallet", name: "Dompet eWallet" },
      { kind: "sme", name: "Majuvista Hardware Sdn Bhd" },
    ])
    .returning();
  const orgs = { platform: orgRows[0]!, bank: orgRows[1]!, ewallet: orgRows[2]!, sme: orgRows[3]! };

  const users = await db
    .insert(appUser)
    .values(
      DEMO_USERS.map((u) => ({
        orgId: orgs[u.org].id,
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: hashPassword(demoPassword),
      })),
    )
    .returning();
  const analyst = users.find((u) => u.role === "bank_analyst")!;

  const [bankReporter] = await db
    .insert(reporter)
    .values({ kind: "bank", orgId: orgs.bank.id, trust: 0.9, phoneVerified: true })
    .returning();
  const [agencyReporter] = await db
    .insert(reporter)
    .values({ kind: "agency", trust: 1, phoneVerified: true })
    .returning();

  // ---------- helpers ----------
  const entityIds = new Map<string, number>();
  async function ent(
    key: keyof typeof DEMO,
    extra: { protected?: boolean; attrs?: Record<string, unknown> } = {},
  ) {
    const d = DEMO[key];
    const e = await upsertEntity(db, secrets, d.type, d.raw, { ...extra, seenAt: ago(30 * DAY) });
    entityIds.set(key, e.id);
    return e.id;
  }

  const campaigns = new Map<string, number>();
  async function camp(key: string, label: string, scamType: ScamType) {
    const [c] = await db
      .insert(campaign)
      .values({ label, scamType, firstSeen: now, lastSeen: now })
      .returning();
    campaigns.set(key, c!.id);
    return c!.id;
  }

  async function consumer(sybilDevice?: Buffer) {
    const [rep] = await db
      .insert(reporter)
      .values({
        kind: "consumer",
        phoneVerified: r() < 0.7,
        deviceFingerprintHash: sybilDevice ?? randomBytes(32),
        trust: 0.3,
        reportsTotal: 1,
      })
      .returning();
    return rep!.id;
  }

  let nCases = 0;
  async function addCase(c: {
    source: SourceKind;
    scamType: ScamType;
    campaign?: string;
    reportedAt: Date;
    verification?: string;
    reporterId?: string;
    orgId?: string;
    lossMyr?: number;
    nearMiss?: boolean;
    narrative?: string;
    language?: string;
    externalRef?: string;
    nsrcRef?: string;
    policeReportNo?: string;
    state?: string;
    ageBand?: string;
    observations: [entityId: number, role: Role][];
  }) {
    const [row] = await db
      .insert(scamCase)
      .values({
        sourceId: sourceId(c.source),
        reporterId: c.reporterId,
        orgId: c.orgId,
        scamType: c.scamType,
        campaignId: c.campaign ? campaigns.get(c.campaign) : undefined,
        lossMyr: c.lossMyr?.toFixed(2),
        occurredAt: new Date(c.reportedAt.getTime() - 2 * HOUR),
        reportedAt: c.reportedAt,
        language: c.language ?? pick(["ms", "ms", "en", "zh", "mixed"]),
        narrativeRedacted: c.narrative,
        verification: c.verification ?? "unverified",
        externalRef: c.externalRef,
        nsrcRef: c.nsrcRef,
        policeReportNo: c.policeReportNo,
        nearMiss: c.nearMiss ?? !c.lossMyr,
        victimState: c.state ?? pick(STATES),
        victimAgeBand: c.ageBand,
        shareConsentAt: c.source.startsWith("user_report") ? c.reportedAt : undefined,
      })
      .returning({ id: scamCase.id });
    const caseId = row!.id;
    for (const [entityId, role] of c.observations) {
      await db
        .insert(observation)
        .values({
          caseId,
          entityId,
          role,
          sourceId: sourceId(c.source),
          reporterId: c.reporterId,
          observedAt: c.reportedAt,
        })
        .onConflictDoNothing();
    }
    await linkCaseEntities(db, caseId, c.reportedAt);
    nCases++;
    return caseId;
  }

  // ---------- 1. Macau scam ring: fake PDRM / BNM officers ----------
  await camp("macau", "Fake PDRM/BNM officer calls (Macau scam), Oct 2026", "macau_impersonation");
  const p1 = await ent("macauCaller");
  const w1 = await ent("macauOfficerWhatsapp");
  const m1 = await ent("macauMule1");
  const m2 = await ent("macauMule2");
  const m4 = await ent("becPersonalAccount");
  const bnm = await ent("protectedOfficial", {
    protected: true,
    attrs: { official_name: "BNMTELELINK (Bank Negara Malaysia)" },
  });

  // 37 consumer reports of the caller in the last 14 days; 5 come from one device (one vote)
  const sybilDevice = randomBytes(32);
  for (let i = 0; i < 37; i++) {
    const reporterId = await consumer(i < 5 ? sybilDevice : undefined);
    const withWhatsapp = r() < 0.4;
    // evidence is modelled by the verification multiplier, as in scoring.py's worked examples
    await addCase({
      source: "user_report",
      verification: r() < 0.35 ? "evidence_attached" : "unverified",
      scamType: "macau_impersonation",
      campaign: "macau",
      reporterId,
      reportedAt: ago(r() * 14 * DAY),
      ageBand: pick(["60+", "60+", "40-59", "25-39"]),
      narrative:
        "Caller claimed to be a PDRM officer; said my IC was linked to money laundering and transferred me to a 'BNM officer' on WhatsApp.",
      observations: [
        [p1, "caller"],
        [bnm, "impersonated_official"],
        ...(withWhatsapp ? [[w1, "messenger"] as [number, Role]] : []),
      ],
    });
  }

  // The NSRC-referenced loss case with full tracing: timeline, money trail, cash-out, police hand-off
  const victimAcct = await upsertEntity(db, secrets, "bank_account", "BSN 1440 2981 0076", {
    attrs: { victim_account: true },
    seenAt: ago(3 * DAY),
  });
  const lossAt = ago(3 * DAY);
  const nsrcCase = await addCase({
    source: "nsrc_case",
    verification: "confirmed",
    scamType: "macau_impersonation",
    campaign: "macau",
    reporterId: agencyReporter!.id,
    reportedAt: lossAt,
    lossMyr: 48000,
    nearMiss: false,
    nsrcRef: "NSRC-2026-10-118274",
    policeReportNo: "IPD/KL/RPT/2026/0412987",
    externalRef: "NSRC-2026-10-118274",
    state: "Selangor",
    ageBand: "60+",
    language: "ms",
    narrative:
      "Victim (60+) called by 'PDRM officer', moved to WhatsApp video call with 'BNM officer', told to move savings to a 'safe account'.",
    observations: [
      [p1, "caller"],
      [w1, "messenger"],
      [m1, "payee_account"],
      [bnm, "impersonated_official"],
    ],
  });
  const t = (h: number) => new Date(lossAt.getTime() - h * HOUR);
  await db.insert(incidentEvent).values([
    {
      caseId: nsrcCase,
      at: t(6),
      channel: "voice_call",
      kind: "first_contact",
      entityId: p1,
      durationSec: 840,
      detailRedacted: "Caller says victim's IC linked to money-laundering case.",
    },
    {
      caseId: nsrcCase,
      at: t(5.7),
      channel: "whatsapp_call",
      kind: "transfer_to_officer",
      entityId: w1,
      durationSec: 2100,
      detailRedacted: "'BNM officer' shows fake warrant on video call.",
    },
    {
      caseId: nsrcCase,
      at: t(5),
      channel: "whatsapp_msg",
      kind: "pressure",
      entityId: w1,
      detailRedacted: "Told not to tell family; must transfer within 1 hour.",
    },
    {
      caseId: nsrcCase,
      at: t(4.5),
      channel: "transfer",
      kind: "transfer",
      entityId: m1,
      detailRedacted: "DuitNow transfer RM 48,000 to 'safe account'.",
    },
    {
      caseId: nsrcCase,
      at: t(-1),
      channel: "other",
      kind: "report",
      detailRedacted: "Victim's son called NSRC 997.",
    },
  ]);
  await db.insert(fundHop).values([
    {
      caseId: nsrcCase,
      hopNo: 1,
      fromEntity: victimAcct.id,
      toEntity: m1,
      amountMyr: "48000.00",
      at: t(4.5),
      rail: "duitnow",
      txnRef: "DN2026101800048213",
      senderBank: "BSN",
      receiverBank: "MBB",
      reportedByOrg: orgs.bank.id,
    },
    {
      caseId: nsrcCase,
      hopNo: 2,
      fromEntity: m1,
      toEntity: m2,
      amountMyr: "30000.00",
      at: t(4.2),
      rail: "ibg",
      txnRef: "IBG2026101800771904",
      senderBank: "MBB",
      receiverBank: "CIMB",
      frozenMyr: "12000.00",
      reportedByOrg: orgs.bank.id,
    },
    {
      caseId: nsrcCase,
      hopNo: 2,
      fromEntity: m1,
      toEntity: m4,
      amountMyr: "15000.00",
      at: t(4.1),
      rail: "duitnow",
      txnRef: "DN2026101800048977",
      senderBank: "MBB",
      receiverBank: "HLB",
      reportedByOrg: orgs.bank.id,
    },
  ]);
  await upsertEdge(db, "money_flow", m1, m2, { amountMyr: 30000, at: t(4.2) });
  await upsertEdge(db, "money_flow", m1, m4, { amountMyr: 15000, at: t(4.1) });
  await upsertEdge(db, "money_flow", victimAcct.id, m1, { amountMyr: 48000, at: t(4.5) });
  await db.insert(cashoutEvent).values({
    caseId: nsrcCase,
    entityId: m2,
    at: t(3.5),
    method: "crypto_exchange",
    locationRef: "Offshore exchange (USDT purchase)",
    state: "Kuala Lumpur",
    amountMyr: "18000.00",
    reportedByOrg: orgs.bank.id,
  });
  await db.insert(leReferral).values({
    caseId: nsrcCase,
    agency: "PDRM CCID",
    externalRef: "IPD/KL/RPT/2026/0412987",
    status: "investigating",
  });
  await db.insert(caseEvidence).values({
    caseId: nsrcCase,
    kind: "screenshot",
    storageUri: "s3://evidence/demo/nsrc-118274/whatsapp-warrant.png",
  });

  // Nusa Digital Bank confirms the first-hop mule after its own investigation
  await addCase({
    source: "bank_confirmed",
    verification: "confirmed",
    scamType: "macau_impersonation",
    campaign: "macau",
    reporterId: bankReporter!.id,
    orgId: orgs.bank.id,
    reportedAt: ago(2 * DAY),
    externalRef: "NUSA-FRD-2026-00931",
    narrative:
      "Account opened 6 weeks ago; 23 inbound transfers from unrelated senders in 72 h, 94% moved out within 30 min.",
    observations: [[m1, "payee_account"]],
  });
  // the bank's fraud team set the analyst status too
  await db.update(entity).set({ status: "confirmed" }).where(eq(entity.id, m1));

  // ---------- 2. Parcel redelivery-fee scam ----------
  await camp("parcel", "Fake courier redelivery fee (SMS + call)", "parcel");
  const p3 = await ent("parcelCaller");
  const u1 = await ent("parcelLink");
  const d1 = (await upsertEntity(db, secrets, "domain", "pos-redelivery-my.top")).id;
  await upsertEdge(db, "redirects_to", u1, d1);
  for (let i = 0; i < 6; i++) {
    await addCase({
      source: "user_report",
      scamType: "parcel",
      campaign: "parcel",
      reporterId: await consumer(),
      reportedAt: ago((3 + r() * 20) * DAY),
      lossMyr: r() < 0.3 ? 4.9 + Math.round(r() * 300) : undefined,
      narrative:
        "SMS said parcel held for unpaid RM 4.90 fee, link asked for card details and OTP.",
      observations: [
        [p3, "caller"],
        [u1, "link_sent"],
      ],
    });
  }
  await addCase({
    source: "threat_feed",
    verification: "reviewed",
    scamType: "phishing_link",
    campaign: "parcel",
    reportedAt: ago(9 * DAY),
    narrative: "Phishing feed: courier-brand payment page collecting card numbers and OTPs.",
    observations: [
      [d1, "link_sent"],
      [u1, "link_sent"],
    ],
  });

  // ---------- 3. Investment scam: Qorvanta ----------
  await camp("investment", "Qorvanta fake trading app (Telegram 'mentor')", "investment");
  const tg = await ent("investmentTelegram");
  const app = await ent("investmentApp");
  const d2 = await ent("investmentDomain");
  const m3 = (await upsertEntity(db, secrets, "bank_account", "RHB 2140 9988 7301")).id;
  const fb = (
    await upsertEntity(
      db,
      secrets,
      "social_profile",
      "https://www.facebook.com/qorvanta.my.official",
    )
  ).id;
  await addCase({
    source: "regulator_alert",
    verification: "confirmed",
    scamType: "investment",
    campaign: "investment",
    reportedAt: ago(40 * DAY),
    narrative: "Listed on the SC Investor Alert List: unlicensed capital market activity.",
    observations: [
      [d2, "link_sent"],
      [app, "app_installed"],
    ],
  });
  for (let i = 0; i < 5; i++) {
    await addCase({
      source: "user_report",
      verification: "evidence_attached",
      scamType: "investment",
      campaign: "investment",
      reporterId: await consumer(),
      reportedAt: ago((1 + r() * 30) * DAY),
      lossMyr: 2000 + Math.round(r() * 60000),
      ageBand: pick(["25-39", "40-59"]),
      narrative:
        "Joined Telegram group after Facebook ad; app showed 300% profit, withdrawal needed 'tax' payment first.",
      observations: [
        [tg, "messenger"],
        [app, "app_installed"],
        [m3, "payee_account"],
        [fb, "profile_used"],
      ],
    });
  }

  // ---------- 4. LHDN refund campaign: new and spiking ----------
  await camp("lhdn", "Fake LHDN tax refund call + link, Oct 2026", "phishing_link");
  const p4 = await ent("lhdnCaller1");
  const p5 = await ent("lhdnCaller2");
  const u2 = await ent("lhdnLink");
  for (let i = 0; i < 14; i++) {
    const recent = i < 12; // 12 in the last 24 h vs ~1 in the two weeks before: a spike
    await addCase({
      source: "user_report",
      scamType: "phishing_link",
      campaign: "lhdn",
      reporterId: await consumer(),
      reportedAt: recent ? ago(r() * 22 * HOUR) : ago((3 + r() * 10) * DAY),
      narrative:
        "Caller from 'LHDN' said I have a RM 1,280 tax refund; sent a link to 'claim' that asked for online banking login.",
      observations: [
        [recent && i % 2 ? p5 : p4, "caller"],
        [u2, "link_sent"],
      ],
    });
  }

  // ---------- 5. Job task scam ----------
  await camp("job", "Part-time 'like and review' job scam", "job_task");
  const w2 = await ent("jobWhatsapp");
  const e1 = await ent("jobEwallet");
  for (let i = 0; i < 4; i++) {
    await addCase({
      source: "user_report",
      scamType: "job_task",
      campaign: "job",
      reporterId: await consumer(),
      ageBand: "<25",
      reportedAt: ago((2 + r() * 25) * DAY),
      lossMyr: 150 + Math.round(r() * 3000),
      narrative:
        "Paid RM 30 per hotel review at first, then asked to 'top up' to unlock bigger tasks.",
      observations: [
        [w2, "messenger"],
        [e1, "payee_account"],
      ],
    });
  }

  // ---------- 6. Cleared: reports against a number, owner's appeal upheld ----------
  const p6 = await ent("clearedNumber");
  for (let i = 0; i < 3; i++) {
    await addCase({
      source: "user_report",
      scamType: "ecommerce",
      reporterId: await consumer(),
      reportedAt: ago((5 + r() * 10) * DAY),
      narrative: "Seller didn't send the item.",
      observations: [[p6, "caller"]],
    });
  }
  await db.insert(appeal).values({
    entityId: p6,
    claimantVerified: true,
    status: "upheld",
    decidedBy: users[0]!.id,
    reason:
      "Owner proved the number was recycled by the telco on 1 Oct; reports relate to the previous holder.",
    createdAt: ago(3 * DAY),
    decidedAt: ago(1 * DAY),
  });

  // ---------- 7. The "two user reports only" worked example ----------
  const p7 = await ent("twoReportsNumber");
  await addCase({
    source: "user_report",
    scamType: "other",
    reporterId: await consumer(),
    reportedAt: ago(2 * DAY),
    observations: [[p7, "caller"]],
  });
  await addCase({
    source: "user_report",
    verification: "evidence_attached",
    scamType: "other",
    reporterId: await consumer(),
    reportedAt: ago(1 * DAY),
    observations: [[p7, "caller"]],
  });

  // ---------- SME: Majuvista Hardware's supplier master data ----------
  const acct = (raw: string) => {
    const id = normalise("bank_account", raw);
    return {
      bankCode: id.attrs.bank_code,
      accountHash: lookupHash(id.value, secrets.pepper),
      accountMasked: id.masked,
    };
  };
  await db.insert(supplier).values([
    {
      orgId: orgs.sme.id,
      name: "Keluvra Steel Supplies Sdn Bhd",
      ssmNo: normaliseSsmNo("201901023456"),
      tin: normaliseTin("C2584563200"),
      ...acct("Public Bank 3189 2201 4457"),
      accountHolderName: "KELUVRA STEEL SUPPLIES SDN BHD",
      callbackPhone: "+60351218800",
      emailDomain: "keluvra-steel.com.my",
      status: "verified",
    },
    {
      orgId: orgs.sme.id,
      name: "Cemvora Trading Sdn Bhd",
      ssmNo: normaliseSsmNo("201501007731"),
      tin: normaliseTin("C2391175508"),
      ...acct("Maybank 5144 0912 7730"),
      accountHolderName: "CEMVORA TRADING SDN BHD",
      callbackPhone: "+60379561144",
      emailDomain: "cemvora.my",
      status: "verified",
    },
    {
      orgId: orgs.sme.id,
      name: "Binqora Bekalan Enterprise",
      ssmNo: normaliseSsmNo("202003118842"),
      tin: normaliseTin("IG21455091020"),
      ...acct("CIMB 8602 1177 3409"),
      accountHolderName: "BINQORA BEKALAN ENTERPRISE",
      callbackPhone: "+60123307781",
      emailDomain: "binqora.com",
      status: "verified",
    },
  ]);

  // ---------- scores and campaign stats ----------
  const nEntities = await recomputeAll(db, now);
  await refreshCampaignStats(db, now);

  // ---------- bank alert history for the dashboard ----------
  const scored = async (id: number) =>
    (await db.select().from(entityScore).where(eq(entityScore.entityId, id)))[0] ?? null;
  const history: {
    entityId: number;
    hoursAgo: number;
    amount: number;
    status: string;
    callSignal: boolean;
    action?: string;
  }[] = [
    {
      entityId: m1,
      hoursAgo: 50,
      amount: 48000,
      status: "frozen",
      callSignal: true,
      action: "freeze",
    },
    { entityId: m2, hoursAgo: 45, amount: 9500, status: "held", callSignal: false, action: "hold" },
    { entityId: m4, hoursAgo: 20, amount: 15000, status: "open", callSignal: false },
    { entityId: m3, hoursAgo: 12, amount: 25000, status: "in_review", callSignal: false },
    {
      entityId: e1,
      hoursAgo: 8,
      amount: 600,
      status: "released",
      callSignal: false,
      action: "release",
    },
    { entityId: m1, hoursAgo: 3, amount: 12000, status: "open", callSignal: true },
  ];
  for (const h of history) {
    const s = await scored(h.entityId);
    if (!s) continue;
    const [a] = await db
      .insert(alert)
      .values({
        orgId: orgs.bank.id,
        entityId: h.entityId,
        risk: s.risk,
        tier: s.tier,
        callSignal: h.callSignal,
        amountMyr: h.amount.toFixed(2),
        rail: "duitnow",
        status: h.status,
        createdAt: ago(h.hoursAgo * HOUR),
        verdict: { risk: s.risk, tier: s.tier, confidence: s.confidence },
        assignedTo: h.status === "open" ? null : analyst.id,
        resolvedAt: ["frozen", "released", "held"].includes(h.status)
          ? ago((h.hoursAgo - 1) * HOUR)
          : null,
      })
      .returning();
    if (h.action) {
      await db.insert(intervention).values({
        orgId: orgs.bank.id,
        alertId: a!.id,
        entityId: h.entityId,
        action: h.action,
        actor: analyst.id,
        policyVersion: POLICY_VERSION,
        at: ago((h.hoursAgo - 1) * HOUR),
        note:
          h.action === "release" ? "Customer confirmed genuine purchase by callback." : undefined,
      });
    }
  }

  return {
    orgs: orgRows.length,
    users: users.length,
    entities: nEntities,
    cases: nCases,
    demoPassword,
  };
}
