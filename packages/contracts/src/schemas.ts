// Request/response schemas for the CrowdShield API (/v1). Shared by the API (validation),
// the web app and the bot (typed client), and the OpenAPI document.
import { z } from "zod";

export const POLICY_VERSION = "policy-2026-10-demo";

// ---------- enums (mirror the database enums in @crowdshield/db) ----------
export const EntityType = z.enum([
  "phone",
  "whatsapp",
  "telegram",
  "bank_account",
  "ewallet",
  "url",
  "domain",
  "app",
  "social_profile",
  "crypto_wallet",
]);
export const ScamType = z.enum([
  "macau_impersonation",
  "investment",
  "parcel",
  "job_task",
  "love_romance",
  "ecommerce",
  "loan",
  "phishing_link",
  "malware_apk",
  "account_takeover",
  "bec_supplier",
  "other",
]);
export const SourceKind = z.enum([
  "pdrm_semakmule",
  "nsrc_case",
  "bank_confirmed",
  "regulator_alert",
  "threat_feed",
  "user_report_verified",
  "user_report",
  "news_extraction",
  "model_inference",
]);
export const EntityRole = z.enum([
  "caller",
  "messenger",
  "payee_account",
  "link_sent",
  "app_installed",
  "profile_used",
  "wallet_used",
  "impersonated_official",
]);
export const Tier = z.enum([
  "no_known_risk",
  "reported",
  "caution",
  "high",
  "confirmed",
  "protected_official",
]);
export const Confidence = z.enum(["low", "medium", "high"]);
export const UserRole = z.enum([
  "bank_analyst",
  "bank_supervisor",
  "sme_owner",
  "sme_member",
  "admin",
]);
export const AlertStatus = z.enum([
  "open",
  "in_review",
  "held",
  "released",
  "frozen",
  "confirmed_mule",
  "cleared",
]);
export const AlertAction = z.enum([
  "hold",
  "release",
  "callback",
  "freeze",
  "confirm_mule",
  "clear",
  "report_nsrc",
  "report_nfp",
]);
export const PaymentRail = z.enum([
  "duitnow",
  "ibg",
  "fpx",
  "instant_transfer",
  "ewallet",
  "card",
  "crypto",
  "cash",
]);
export const AgeBand = z.enum(["<25", "25-39", "40-59", "60+"]);
export const Channel = z.enum(["web", "whatsapp", "telegram", "email"]);

export const Text = z.object({ en: z.string(), ms: z.string() });
export const Timestamp = z.string().describe("ISO 8601 timestamp");
export const Money = z.number().nonnegative().describe("Amount in MYR");

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ErrorBody = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  issues: z.array(z.unknown()).optional(),
});

// ---------- identifiers and verdicts ----------
export const IdentifierInput = z.object({
  type: EntityType,
  value: z.string().min(1).max(500),
  bank: z.string().max(60).optional().describe("bank_account: bank code/name if not in value"),
  provider: z.string().max(60).optional().describe("ewallet: provider if not in value"),
  platform: z.string().max(40).optional().describe("social_profile: platform if not a URL"),
});

export const MaskedEntity = z.object({
  id: z.number().int().nullable().describe("null when the graph has no record"),
  type: EntityType,
  masked: z.string(),
  protected: z.boolean(),
});

export const Verdict = z.object({
  entity: MaskedEntity,
  risk: z.number().int().min(0).max(100),
  tier: Tier,
  tierLabel: Text,
  confidence: Confidence.nullable(),
  topScamTypes: z.array(ScamType),
  nCases: z.number().int(),
  independentSources: z.number().int(),
  lastReportedAt: Timestamp.nullable(),
  explanation: z.array(
    z.object({
      line: Text,
      source: z.string(),
      count: z.number().int(),
      links: z.array(z.string()).optional(),
    }),
  ),
  action: Text,
  campaign: z
    .object({ id: z.number().int(), label: z.string(), reports24h: z.number().int() })
    .nullable(),
  computedAt: Timestamp.nullable(),
});

// ---------- auth ----------
export const LoginInput = z.object({ email: z.email(), password: z.string().min(1) });
export const Me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: UserRole,
  org: z.object({ id: z.string(), name: z.string(), kind: z.string() }),
});
export const LoginResult = z.object({ token: z.string(), expiresAt: Timestamp, user: Me });

// ---------- reports (bot / app) ----------
export const ReportInput = z.object({
  reporter: z.object({
    channel: Channel,
    externalId: z
      .string()
      .min(1)
      .max(200)
      .describe("Channel user id; hashed before storage, never stored raw"),
    phoneVerified: z.boolean().default(false),
  }),
  scamType: ScamType.optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  lossMyr: Money.optional(),
  narrative: z
    .string()
    .max(4000)
    .optional()
    .describe("Must already be redacted (no names, IC, full numbers)"),
  language: z.enum(["ms", "en", "zh", "ta", "mixed"]).optional(),
  victimState: z.string().max(40).optional(),
  victimAgeBand: AgeBand.optional(),
  identifiers: z
    .array(IdentifierInput.extend({ role: EntityRole }))
    .min(1)
    .max(20),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["screenshot", "audio", "transcript", "receipt", "document"]),
        storageUri: z.string(),
      }),
    )
    .max(20)
    .default([]),
  events: z
    .array(
      z.object({
        at: z.iso.datetime({ offset: true }),
        channel: z.enum([
          "voice_call",
          "whatsapp_call",
          "sms",
          "whatsapp_msg",
          "telegram",
          "social",
          "website",
          "app_install",
          "transfer",
          "other",
        ]),
        kind: z.string().max(40),
        identifierIndex: z.number().int().min(0).optional().describe("index into identifiers"),
        durationSec: z.number().int().optional(),
        detail: z.string().max(1000).optional(),
      }),
    )
    .max(50)
    .default([]),
  transfers: z
    .array(
      z.object({
        at: z.iso.datetime({ offset: true }),
        amountMyr: Money,
        rail: PaymentRail.optional(),
        toIdentifierIndex: z.number().int().min(0),
        txnRef: z.string().max(60).optional(),
        senderBank: z.string().max(20).optional(),
      }),
    )
    .max(20)
    .default([]),
  shareConsent: z.boolean().describe("Explicit consent to share with NSRC/PDRM"),
});

export const CallSheet = z.object({
  title: Text,
  lines: z.array(z.object({ label: Text, value: z.string() })),
  reminder: Text,
});

export const ReportResult = z.object({
  caseId: z.string(),
  duplicateOf: z
    .string()
    .nullable()
    .describe("Earlier case from the same reporter with the same identifiers"),
  verdicts: z.array(Verdict),
  callSheet: CallSheet,
});

export const NsrcRefInput = z
  .object({
    nsrcRef: z.string().min(3).max(60).optional(),
    policeReportNo: z.string().min(3).max(60).optional(),
  })
  .refine((v) => v.nsrcRef || v.policeReportNo, "nsrcRef or policeReportNo required");

// ---------- bank: payee check and alerts ----------
export const PayeeCheckInput = z.object({
  payee: IdentifierInput.describe("bank_account or ewallet being paid"),
  amountMyr: Money,
  rail: PaymentRail.default("duitnow"),
  callSignal: z
    .object({
      active: z
        .boolean()
        .describe("Customer is on a call right now (from the app SDK, with consent)"),
      caller: IdentifierInput.optional().describe("The number on the call, if known"),
    })
    .optional(),
});

export const RecommendedAction = z.enum([
  "proceed",
  "warn",
  "cooling_off",
  "hold_and_callback",
  "block_and_report",
]);

export const PayeeCheckResult = z.object({
  payee: Verdict,
  caller: Verdict.nullable(),
  combinedRisk: z.number().int().min(0).max(100),
  combinedTier: Tier,
  recommendedAction: RecommendedAction,
  customerWarning: Text,
  alertId: z.string().nullable(),
  policyVersion: z.string(),
});

export const AlertSummary = z.object({
  id: z.string(),
  status: AlertStatus,
  kind: z.string(),
  entity: MaskedEntity,
  risk: z.number().int(),
  tier: Tier,
  callSignal: z.boolean(),
  amountMyr: z.number().nullable(),
  rail: z.string().nullable(),
  topScamTypes: z.array(ScamType),
  assignedTo: z.string().nullable(),
  createdAt: Timestamp,
  resolvedAt: Timestamp.nullable(),
});
export const AlertListQuery = PageQuery.extend({
  status: AlertStatus.optional(),
  tier: Tier.optional(),
});
export const Intervention = z.object({
  id: z.number().int(),
  action: z.string(),
  actor: z.string().nullable(),
  note: z.string().nullable(),
  at: Timestamp,
});
export const AlertDetail = AlertSummary.extend({
  verdict: Verdict,
  interventions: z.array(Intervention),
});
export const AlertActionInput = z.object({
  action: AlertAction,
  note: z.string().max(1000).optional(),
});

// ---------- cases ----------
export const CaseSummary = z.object({
  id: z.string(),
  scamType: ScamType.nullable(),
  source: SourceKind,
  verification: z.string(),
  lossMyr: z.number().nullable(),
  nearMiss: z.boolean(),
  reportedAt: Timestamp,
  victimState: z.string().nullable(),
  campaign: z.object({ id: z.number().int(), label: z.string() }).nullable(),
  entities: z.array(
    MaskedEntity.extend({
      role: EntityRole,
      tier: Tier.nullable(),
      risk: z.number().int().nullable(),
    }),
  ),
  nsrcRef: z.string().nullable(),
});
export const CaseListQuery = PageQuery.extend({
  scamType: ScamType.optional(),
  campaignId: z.coerce.number().int().optional(),
  entityId: z.coerce.number().int().optional(),
  withLoss: z.coerce.boolean().optional(),
});
export const CaseDetail = CaseSummary.extend({
  narrative: z.string().nullable(),
  language: z.string().nullable(),
  occurredAt: Timestamp.nullable(),
  victimAgeBand: AgeBand.nullable(),
  policeReportNo: z.string().nullable(),
  timeline: z.array(
    z.object({
      at: Timestamp,
      channel: z.string(),
      kind: z.string(),
      entity: MaskedEntity.nullable(),
      durationSec: z.number().nullable(),
      detail: z.string().nullable(),
    }),
  ),
  moneyTrail: z.array(
    z.object({
      hopNo: z.number().int(),
      from: MaskedEntity,
      to: MaskedEntity.nullable(),
      amountMyr: z.number(),
      frozenMyr: z.number(),
      at: Timestamp,
      rail: z.string().nullable(),
      txnRef: z.string().nullable(),
      senderBank: z.string().nullable(),
      receiverBank: z.string().nullable(),
    }),
  ),
  cashouts: z
    .array(
      z.object({
        at: Timestamp,
        method: z.string(),
        locationRef: z.string().nullable(),
        state: z.string().nullable(),
        amountMyr: z.number().nullable(),
      }),
    )
    .describe("Only for the reporting bank and law enforcement"),
  referrals: z.array(
    z.object({
      agency: z.string(),
      externalRef: z.string().nullable(),
      status: z.string(),
      sentAt: Timestamp,
      recoveredMyr: z.number(),
    }),
  ),
  evidence: z.array(z.object({ id: z.number().int(), kind: z.string(), storageUri: z.string() })),
});

// ---------- entities ----------
export const EntityListQuery = PageQuery.extend({
  tier: Tier.optional(),
  type: EntityType.optional(),
  minRisk: z.coerce.number().int().min(0).max(100).optional(),
});
export const EntitySummary = MaskedEntity.extend({
  status: z.string(),
  risk: z.number().int(),
  tier: Tier,
  nCases: z.number().int(),
  topScamTypes: z.array(ScamType),
  lastSeen: Timestamp,
});
export const EntityDetail = z.object({
  entity: EntitySummary.extend({ attrs: z.record(z.string(), z.unknown()), firstSeen: Timestamp }),
  verdict: Verdict,
  score: z
    .object({
      pDirect: z.number(),
      pGraph: z.number(),
      clearing: z.number(),
      modelVersion: z.string(),
    })
    .nullable(),
  cases: z.array(CaseSummary),
  appeals: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      reason: z.string(),
      createdAt: Timestamp,
      decidedAt: Timestamp.nullable(),
    }),
  ),
});
export const Neighbours = z.object({
  nodes: z.array(MaskedEntity.extend({ risk: z.number().int(), tier: Tier })),
  edges: z.array(
    z.object({
      src: z.number().int(),
      dst: z.number().int(),
      kind: z.string(),
      alpha: z.number(),
      nCases: z.number().int(),
      amountMyr: z.number().nullable(),
    }),
  ),
});
export const EntityActionInput = z.object({
  action: z.enum(["confirm_mule", "freeze", "clear"]),
  note: z.string().max(1000).optional(),
});
export const AppealInput = z.object({
  reason: z.string().min(10).max(2000),
  claimantVerified: z.boolean().default(false),
});
export const AppealDecisionInput = z.object({
  decision: z.enum(["upheld", "rejected"]),
  note: z.string().max(1000).optional(),
});

// ---------- dashboards and campaigns ----------
export const Campaign = z.object({
  id: z.number().int(),
  label: z.string(),
  scamType: ScamType.nullable(),
  firstSeen: Timestamp,
  lastSeen: Timestamp,
  reports24h: z.number().int(),
  baselineDaily: z.number(),
  spikeZ: z.number(),
  status: z.string(),
  totalCases: z.number().int(),
});
export const BankDashboard = z.object({
  openAlerts: z.number().int(),
  alertsByTier: z.record(z.string(), z.number().int()),
  alertsByStatus: z.record(z.string(), z.number().int()),
  callSignalAlerts24h: z.number().int(),
  frozenMyr: z.number(),
  recentAlerts: z.array(AlertSummary),
  campaigns: z.array(Campaign),
  hotEntities: z.array(EntitySummary),
});

// ---------- SME: suppliers, checks, holds ----------
export const Supplier = z.object({
  id: z.string(),
  name: z.string(),
  ssmNo: z.string().nullable(),
  tin: z.string().nullable(),
  bankCode: z.string().nullable(),
  accountMasked: z.string().nullable(),
  accountHolderName: z.string().nullable(),
  callbackPhone: z.string().nullable(),
  emailDomain: z.string().nullable(),
  status: z.string(),
  lastCheckAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export const SupplierInput = z.object({
  name: z.string().min(2).max(200),
  ssmNo: z.string().max(20).optional(),
  tin: z.string().max(20).optional(),
  bank: z.string().max(60).optional(),
  account: z.string().max(40).optional(),
  accountHolderName: z.string().max(200).optional(),
  callbackPhone: z.string().max(30).optional(),
  emailDomain: z.string().max(200).optional(),
});
export const ExtractedInvoice = z.object({
  supplierName: z.string().max(200).optional(),
  ssmNo: z.string().max(20).optional(),
  tin: z.string().max(20).optional(),
  bank: z.string().max(60).optional(),
  account: z.string().max(40).optional(),
  accountHolderName: z.string().max(200).optional(),
  amountMyr: Money.optional(),
  invoiceNo: z.string().max(60).optional(),
  einvoiceUuid: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  emailFrom: z.string().max(200).optional(),
  replyTo: z.string().max(200).optional(),
  bankChangeLanguage: z.boolean().default(false).describe("Text says the bank account changed"),
  urgencyLanguage: z.boolean().default(false),
});
export const SupplierCheckInput = z.object({
  supplierId: z.string().optional().describe("Known supplier, if the business picked one"),
  channel: Channel.default("web"),
  evidenceUri: z.string().optional(),
  invoice: ExtractedInvoice,
});
export const CheckKey = z.enum([
  "ssm",
  "tin",
  "einvoice",
  "account_name",
  "graph",
  "history",
  "email_domain",
  "official_contact",
  "web_reputation",
]);
export const SupplierCheckResult = z.object({
  checkId: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }).nullable(),
  risk: z.enum(["low", "caution", "high"]),
  checks: z.array(
    z.object({
      key: CheckKey,
      status: z.enum(["pass", "fail", "warn", "unavailable"]),
      reason: Text,
      source: z.string(),
      links: z.array(z.string()).optional(),
    }),
  ),
  bankDetailChanged: z.boolean(),
  holdId: z.string().nullable(),
  actions: z.array(Text),
  officialContact: z
    .object({ phone: z.string().optional(), email: z.string().optional(), sourceUrl: z.string() })
    .nullable(),
});
export const InvoiceCheckSummary = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }).nullable(),
  supplierName: z.string().nullable(),
  risk: z.enum(["low", "caution", "high"]).nullable(),
  bankDetailChanged: z.boolean(),
  amountMyr: z.number().nullable(),
  channel: z.string(),
  createdAt: Timestamp,
  holdStatus: z.string().nullable(),
});
export const HoldChecklistItem = z.object({
  step: z.string(),
  label: Text,
  done: z.boolean(),
  at: Timestamp.nullable(),
  by: z.string().nullable(),
});
export const Hold = z.object({
  id: z.string(),
  invoiceCheckId: z.string(),
  status: z.enum(["on_hold", "verified", "rejected"]),
  supplier: z
    .object({ id: z.string(), name: z.string(), callbackPhone: z.string().nullable() })
    .nullable(),
  newAccountMasked: z.string().nullable(),
  amountMyr: z.number().nullable(),
  checklist: z.array(HoldChecklistItem),
  createdAt: Timestamp,
  decidedAt: Timestamp.nullable(),
});
export const HoldChecklistInput = z.object({ step: z.string(), done: z.boolean() });
export const HoldDecisionInput = z.object({
  decision: z.enum(["verified", "rejected"]),
  note: z.string().max(1000).optional(),
});
export const SmeDashboard = z.object({
  suppliersByStatus: z.record(z.string(), z.number().int()),
  openHolds: z.number().int(),
  checksThisMonth: z.number().int(),
  flaggedChecks: z.array(InvoiceCheckSummary),
  campaigns: z.array(Campaign),
});

// ---------- web intelligence (Tavily via the ML gateway): leads with citations, never confirmation ----------
export const WebLead = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedAt: z.string().nullable(),
  scamType: ScamType.nullable(),
  relevant: z.boolean(),
});
export const WebLeads = z.object({
  query: z.string().describe("Only the identifier or a public name, never personal data"),
  leads: z.array(WebLead),
  relevantCount: z.number().int(),
  cached: z.boolean(),
  fetchedAt: Timestamp,
});
export const UrlCheckInput = z.object({ url: z.string().min(4).max(2000) });
export const UrlCheckResult = z.object({
  url: z.string(),
  fetched: z.boolean().describe("false if the page could not be fetched (taken down, blocks bots)"),
  title: z.string().nullable(),
  pageCheck: z
    .object({
      impersonates: z.string().nullable(),
      hasLoginForm: z.boolean(),
      asksForOtpOrCard: z.boolean(),
      hasApkDownload: z.boolean(),
      suspicious: z.boolean(),
      summary: Text,
    })
    .nullable(),
  cached: z.boolean(),
  fetchedAt: Timestamp,
});
export const InvestmentCheckInput = z.object({ name: z.string().min(2).max(200) });

export type Verdict = z.infer<typeof Verdict>;
export type Me = z.infer<typeof Me>;
