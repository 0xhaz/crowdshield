// SME side, "Semak supplier" (architecture §5). Not in schema.sql; added per workplan §7.5.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { appUser, org } from "./orgs.js";
import { bytea, inList, tstz } from "./types.js";

export const SUPPLIER_STATUSES = ["unverified", "verified", "flagged", "blocked"] as const;
export const CHECK_CHANNELS = ["web", "whatsapp", "telegram", "email"] as const;
export const SUPPLIER_RISKS = ["low", "caution", "high"] as const;
export const HOLD_STATUSES = ["on_hold", "verified", "rejected"] as const;

// The business's own supplier master data: the baseline for "new bank account for a known supplier".
export const supplier = pgTable(
  "supplier",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    name: text().notNull(),
    ssmNo: text(), // SSM registration number (normalised)
    tin: text(), // LHDN tax ID
    bankCode: text(),
    accountHash: bytea(), // HMAC of the usual bank account (same scheme as entity.lookup_hash)
    accountMasked: text(),
    accountHolderName: text(),
    callbackPhone: text(), // from the business's own records; never the number in a bank-change email
    emailDomain: text(),
    status: text().notNull().default("unverified"),
    createdAt: tstz().defaultNow().notNull(),
    updatedAt: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("supplier_status_check", sql`${t.status} IN (${inList(SUPPLIER_STATUSES)})`),
    unique("supplier_org_id_ssm_no_key").on(t.orgId, t.ssmNo),
    index("supplier_org_id_tin_idx").on(t.orgId, t.tin),
    index("supplier_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const invoiceCheck = pgTable(
  "invoice_check",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    supplierId: uuid().references(() => supplier.id),
    submittedBy: uuid().references(() => appUser.id),
    channel: text().notNull(),
    evidenceUri: text(), // original invoice/email in object storage
    extracted: jsonb(), // supplier name, SSM no., TIN, bank account (masked), amounts, e-invoice UUID…
    result: jsonb(), // SupplierCheckResult: per-check pass/fail/warn with reasons
    risk: text(),
    bankDetailChanged: boolean().notNull().default(false),
    amountMyr: numeric({ precision: 14, scale: 2 }),
    createdAt: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("invoice_check_channel_check", sql`${t.channel} IN (${inList(CHECK_CHANNELS)})`),
    check("invoice_check_risk_check", sql`${t.risk} IN (${inList(SUPPLIER_RISKS)})`),
    index("invoice_check_org_id_created_at_idx").on(t.orgId, t.createdAt.desc()),
  ],
);

// Payment hold on a bank-detail change, with the callback checklist (architecture §5 flow step 4).
export const paymentHold = pgTable(
  "payment_hold",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    invoiceCheckId: uuid()
      .notNull()
      .unique()
      .references(() => invoiceCheck.id, { onDelete: "cascade" }),
    status: text().notNull().default("on_hold"),
    checklist: jsonb().notNull().default([]), // [{ step, done, at, by }]
    decidedBy: uuid().references(() => appUser.id),
    decidedAt: tstz(),
    createdAt: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("payment_hold_status_check", sql`${t.status} IN (${inList(HOLD_STATUSES)})`),
    index("payment_hold_org_id_status_idx").on(t.orgId, t.status),
  ],
);
