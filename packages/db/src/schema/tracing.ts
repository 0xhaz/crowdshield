// Post-incident tracing (architecture §9), ported from schema.sql.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { caseEvidence, entity, scamCase } from "./graph.js";
import { org } from "./orgs.js";
import { bytea, inList, tstz } from "./types.js";

export const INCIDENT_CHANNELS = [
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
] as const;
export const PAYMENT_RAILS = [
  "duitnow",
  "ibg",
  "fpx",
  "instant_transfer",
  "ewallet",
  "card",
  "crypto",
  "cash",
] as const;
export const CASHOUT_METHODS = [
  "atm",
  "branch",
  "crypto_exchange",
  "money_changer",
  "merchant",
  "overseas_transfer",
] as const;
export const REFERRAL_STATUSES = [
  "sent",
  "acknowledged",
  "investigating",
  "charged",
  "closed",
] as const;

// Timeline of everything that happened in a case, from the victim's side.
export const incidentEvent = pgTable(
  "incident_event",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    at: tstz().notNull(), // exact time from call log / chat / bank record
    channel: text().notNull(),
    kind: text().notNull(), // first_contact, transfer_to_officer, pressure, link_clicked, transfer, report…
    entityId: bigint({ mode: "number" }).references(() => entity.id),
    durationSec: integer(),
    detailRedacted: text(),
    evidenceId: bigint({ mode: "number" }).references(() => caseEvidence.id),
  },
  (t) => [
    check("incident_event_channel_check", sql`${t.channel} IN (${inList(INCIDENT_CHANNELS)})`),
    index("incident_event_case_id_at_idx").on(t.caseId, t.at),
  ],
);

// Money trail across accounts (bank-supplied, consortium members / National Fraud Portal).
export const fundHop = pgTable(
  "fund_hop",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    hopNo: smallint().notNull(), // 1 = victim -> first mule
    fromEntity: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    toEntity: bigint({ mode: "number" }).references(() => entity.id),
    amountMyr: numeric({ precision: 14, scale: 2 }).notNull(),
    at: tstz().notNull(),
    rail: text(),
    txnRef: text(), // bank/DuitNow transaction reference: needed for NSRC/NFP tracing
    senderBank: text(),
    receiverBank: text(),
    frozenMyr: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    reportedByOrg: uuid().references(() => org.id),
  },
  (t) => [
    check("fund_hop_rail_check", sql`${t.rail} IN (${inList(PAYMENT_RAILS)})`),
    index("fund_hop_case_id_hop_no_idx").on(t.caseId, t.hopNo),
  ],
);

// Where money left the system. Restricted: visible to the reporting bank and law enforcement only.
export const cashoutEvent = pgTable(
  "cashout_event",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    entityId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    at: tstz().notNull(),
    method: text().notNull(),
    locationRef: text(), // ATM ID / branch code / exchange name, as supplied by the bank
    state: text(),
    amountMyr: numeric({ precision: 14, scale: 2 }),
    accessLevel: text().notNull().default("law_enforcement"),
    reportedByOrg: uuid().references(() => org.id),
  },
  (t) => [check("cashout_event_method_check", sql`${t.method} IN (${inList(CASHOUT_METHODS)})`)],
);

// Hand-off to PDRM / NSRC and what came back.
export const leReferral = pgTable(
  "le_referral",
  {
    id: uuid().primaryKey().defaultRandom(),
    caseId: uuid()
      .notNull()
      .references(() => scamCase.id, { onDelete: "cascade" }),
    agency: text().notNull(), // NSRC 997, PDRM CCID, MCMC, BNM
    externalRef: text(), // police report no. / NSRC ref
    sentAt: tstz().notNull().defaultNow(),
    evidencePackUri: text(), // signed, hashed bundle
    packSha256: bytea(),
    status: text().notNull().default("sent"),
    recoveredMyr: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [check("le_referral_status_check", sql`${t.status} IN (${inList(REFERRAL_STATUSES)})`)],
);
