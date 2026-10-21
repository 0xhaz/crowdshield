// Scam intelligence graph, ported from schema.sql (PostgreSQL 16 + pgvector + pgcrypto + pg_trgm).
// Identifiers are stored as keyed hashes for lookup; raw values are encrypted and only
// decrypted for authorised investigators.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
  smallserial,
  text,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { org } from "./orgs.js";
import {
  bytea,
  entityRole,
  entityStatus,
  entityType,
  inList,
  RISK_TIERS,
  scamType,
  sourceKind,
  tstz,
} from "./types.js";

export const VERIFICATION_LEVELS = [
  "unverified",
  "evidence_attached",
  "reviewed",
  "confirmed",
  "rejected",
] as const;
export const REPORTER_KINDS = [
  "consumer",
  "bank",
  "ewallet",
  "telco",
  "agency",
  "sme",
  "system",
] as const;
export const EVIDENCE_KINDS = ["screenshot", "audio", "transcript", "receipt", "document"] as const;
export const EDGE_KINDS = [
  "co_case",
  "money_flow",
  "same_campaign",
  "same_device",
  "redirects_to",
] as const;
export const AGE_BANDS = ["<25", "25-39", "40-59", "60+"] as const;

export const source = pgTable(
  "source",
  {
    id: smallserial().primaryKey(),
    kind: sourceKind().notNull(),
    name: text().notNull(), // e.g. 'Maybank fraud ops', 'OpenPhish'
    baseWeight: real().notNull(),
    active: boolean().notNull().default(true),
  },
  (t) => [check("source_base_weight_check", sql`${t.baseWeight} BETWEEN 0 AND 1`)],
);

export const reporter = pgTable(
  "reporter",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    orgId: uuid().references(() => org.id), // institutional reporters
    phoneVerified: boolean().notNull().default(false),
    trust: real().notNull().default(0.3),
    reportsTotal: integer().notNull().default(0),
    reportsUpheld: integer().notNull().default(0),
    reportsRejected: integer().notNull().default(0),
    deviceFingerprintHash: bytea(), // sybil detection
    externalRefHash: bytea().unique(), // HMAC of channel + channel user id (bot users); never stored raw
    createdAt: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("reporter_kind_check", sql`${t.kind} IN (${inList(REPORTER_KINDS)})`),
    check("reporter_trust_check", sql`${t.trust} BETWEEN 0 AND 1`),
  ],
);

export const entity = pgTable(
  "entity",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    type: entityType().notNull(),
    lookupHash: bytea().notNull(), // HMAC-SHA256(pepper, normalised value)
    valueEnc: bytea(), // pgp_sym_encrypt(normalised value, key); KMS envelope encryption later
    displayMasked: text().notNull(), // '+60 12-***-4567', 'MBB ****8812', 'bit.ly/…'
    attrs: jsonb().notNull().default({}), // bank_code, telco prefix, domain age, apk package…
    status: entityStatus().notNull().default("suspected"),
    protected: boolean().notNull().default(false), // official numbers/accounts that scammers spoof
    firstSeen: tstz().defaultNow().notNull(),
    lastSeen: tstz().defaultNow().notNull(),
  },
  (t) => [unique("entity_type_lookup_hash_key").on(t.type, t.lookupHash)],
);

// ---------- cases (incidents) ----------
export const scamCase = pgTable(
  "scam_case",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: smallint()
      .notNull()
      .references(() => source.id),
    reporterId: uuid().references(() => reporter.id),
    orgId: uuid().references(() => org.id), // bank/SME that owns the case, if any
    externalRef: text(), // NSRC/bank case number
    scamType: scamType(),
    lossMyr: numeric({ precision: 14, scale: 2 }),
    occurredAt: tstz(),
    reportedAt: tstz().defaultNow().notNull(),
    language: text(), // ms, en, zh, ta, mixed
    narrativeRedacted: text(), // PII stripped before any model call
    verification: text().notNull().default("unverified"),
    campaignId: bigint({ mode: "number" }).references(() => campaign.id),
    // NSRC / police references and near-miss flag
    nsrcRef: text(),
    policeReportNo: text(),
    nearMiss: boolean().notNull().default(false), // scam attempted, no money lost
    shareConsentAt: tstz(), // explicit consent to share with NSRC/PDRM
    // Victim location kept coarse (state/district) for hotspot analytics; never street-level
    victimState: text(),
    victimDistrict: text(),
    victimAgeBand: text(),
  },
  (t) => [
    check(
      "scam_case_verification_check",
      sql`${t.verification} IN (${inList(VERIFICATION_LEVELS)})`,
    ),
    check("scam_case_victim_age_band_check", sql`${t.victimAgeBand} IN (${inList(AGE_BANDS)})`),
    index("scam_case_campaign_id_idx").on(t.campaignId),
  ],
);

export const caseEvidence = pgTable(
  "case_evidence",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    storageUri: text().notNull(), // encrypted object store in MY
    sha256: bytea(), // hash of the original file at upload (evidence integrity)
    extracted: jsonb(), // VL/ASR output: entities, script text
  },
  (t) => [check("case_evidence_kind_check", sql`${t.kind} IN (${inList(EVIDENCE_KINDS)})`)],
);

// observation = "this entity played this role in this case" (the evidence edge)
export const observation = pgTable(
  "observation",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    entityId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    role: entityRole().notNull(),
    sourceId: smallint()
      .notNull()
      .references(() => source.id),
    reporterId: uuid().references(() => reporter.id),
    observedAt: tstz().defaultNow().notNull(),
    weight: real(), // computed at insert, see scoring
  },
  (t) => [
    unique("observation_case_id_entity_id_role_key").on(t.caseId, t.entityId, t.role),
    index("observation_entity_id_observed_at_idx").on(t.entityId, t.observedAt.desc()),
  ],
);

// ---------- derived entity-to-entity edges ----------
export const edge = pgTable(
  "edge",
  {
    srcId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    dstId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    kind: text().notNull(),
    alpha: real().notNull(), // propagation strength 0..1
    nCases: integer().notNull().default(1),
    amountMyr: numeric({ precision: 14, scale: 2 }), // money_flow only (bank-supplied)
    lastSeen: tstz().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.srcId, t.dstId, t.kind] }),
    check("edge_kind_check", sql`${t.kind} IN (${inList(EDGE_KINDS)})`),
    check("edge_alpha_check", sql`${t.alpha} BETWEEN 0 AND 1`),
    index("edge_dst_id_idx").on(t.dstId),
  ],
);

// ---------- scripts and campaigns ----------
export const campaign = pgTable("campaign", {
  id: bigserial({ mode: "number" }).primaryKey(),
  label: text().notNull(), // 'Fake LHDN refund call, Oct 2026'
  scamType: scamType(),
  firstSeen: tstz().notNull(),
  lastSeen: tstz().notNull(),
  reports24h: integer("reports_24h").notNull().default(0), // explicit: snake_case casing would give "reports24h"
  baselineDaily: real().notNull().default(0),
  spikeZ: real().notNull().default(0),
  status: text().notNull().default("active"),
});

export const scriptSnippet = pgTable(
  "script_snippet",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid().references(() => scamCase.id, { onDelete: "cascade" }),
    textRedacted: text().notNull(),
    language: text(),
    embedding: vector({ dimensions: 1024 }), // e.g. Qwen3-Embedding via Token Factory
    campaignId: bigint({ mode: "number" }).references(() => campaign.id),
  },
  (t) => [
    index("script_snippet_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("script_snippet_campaign_id_idx").on(t.campaignId),
  ],
);

// ---------- scores (precomputed for <50 ms lookups) ----------
export const entityScore = pgTable(
  "entity_score",
  {
    entityId: bigint({ mode: "number" })
      .primaryKey()
      .references(() => entity.id),
    pDirect: real().notNull(),
    pGraph: real().notNull(),
    clearing: real().notNull().default(1),
    risk: smallint().notNull(),
    tier: text().notNull(),
    confidence: text().notNull(),
    topScamTypes: scamType()
      .array()
      .notNull()
      .default(sql`'{}'`),
    nCases: integer().notNull().default(0),
    nIndependentReporters: integer().notNull().default(0),
    explanation: jsonb().notNull(), // top evidence lines, never reporter identities
    modelVersion: text().notNull(),
    computedAt: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("entity_score_risk_check", sql`${t.risk} BETWEEN 0 AND 100`),
    check("entity_score_tier_check", sql`${t.tier} IN (${inList(RISK_TIERS)})`),
    check("entity_score_confidence_check", sql`${t.confidence} IN ('low', 'medium', 'high')`),
  ],
);

// ---------- appeals and audit ----------
export const appeal = pgTable(
  "appeal",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    claimantVerified: boolean().notNull().default(false), // proved ownership (OTP to number, bank KYC letter)
    reason: text().notNull(),
    status: text().notNull().default("open"),
    decidedBy: uuid(),
    createdAt: tstz().defaultNow().notNull(),
    decidedAt: tstz(),
  },
  (t) => [check("appeal_status_check", sql`${t.status} IN ('open', 'upheld', 'rejected')`)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    actor: uuid(), // app_user.id, or null for system
    orgId: uuid().references(() => org.id),
    action: text().notNull(), // lookup, decrypt_value, status_change, appeal_decision…
    entityId: bigint({ mode: "number" }),
    detail: jsonb(),
    policyVersion: text().notNull(),
    at: tstz().defaultNow().notNull(),
  },
  (t) => [index("audit_log_entity_id_at_idx").on(t.entityId, t.at.desc())],
);
