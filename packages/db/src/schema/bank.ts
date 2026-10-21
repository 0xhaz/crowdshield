// Bank / e-wallet side: payee-check alerts and analyst interventions. Not in schema.sql;
// added per workplan §7.5. Every row carries org_id so per-bank RLS can be added later.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { entity, scamCase } from "./graph.js";
import { appUser, org } from "./orgs.js";
import { inList, RISK_TIERS, tstz } from "./types.js";

export const ALERT_KINDS = ["payee_check", "campaign", "mule_pattern"] as const;
export const ALERT_STATUSES = [
  "open",
  "in_review",
  "held",
  "released",
  "frozen",
  "confirmed_mule",
  "cleared",
] as const;
export const INTERVENTION_ACTIONS = [
  "warn",
  "hold",
  "release",
  "callback",
  "freeze",
  "confirm_mule",
  "clear",
  "report_nsrc",
  "report_nfp",
] as const;

export const alert = pgTable(
  "alert",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    kind: text().notNull().default("payee_check"),
    entityId: bigint({ mode: "number" })
      .notNull()
      .references(() => entity.id),
    caseId: uuid().references(() => scamCase.id),
    risk: smallint().notNull(),
    tier: text().notNull(),
    callSignal: boolean().notNull().default(false), // customer on an active (flagged) call: the call-to-transfer link
    amountMyr: numeric({ precision: 14, scale: 2 }),
    rail: text(),
    request: jsonb(), // redacted payee-check request (no raw identifiers)
    verdict: jsonb(), // verdict returned at check time, for the audit trail
    status: text().notNull().default("open"),
    assignedTo: uuid().references(() => appUser.id),
    createdAt: tstz().defaultNow().notNull(),
    resolvedAt: tstz(),
  },
  (t) => [
    check("alert_kind_check", sql`${t.kind} IN (${inList(ALERT_KINDS)})`),
    check("alert_tier_check", sql`${t.tier} IN (${inList(RISK_TIERS)})`),
    check("alert_status_check", sql`${t.status} IN (${inList(ALERT_STATUSES)})`),
    check("alert_risk_check", sql`${t.risk} BETWEEN 0 AND 100`),
    index("alert_org_id_status_created_at_idx").on(t.orgId, t.status, t.createdAt.desc()),
    index("alert_entity_id_idx").on(t.entityId),
  ],
);

export const intervention = pgTable(
  "intervention",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    alertId: uuid().references(() => alert.id),
    caseId: uuid().references(() => scamCase.id),
    entityId: bigint({ mode: "number" }).references(() => entity.id),
    action: text().notNull(),
    actor: uuid().references(() => appUser.id),
    note: text(),
    policyVersion: text().notNull(),
    at: tstz().defaultNow().notNull(),
  },
  (t) => [
    check("intervention_action_check", sql`${t.action} IN (${inList(INTERVENTION_ACTIONS)})`),
    check(
      "intervention_target_check",
      sql`${t.alertId} IS NOT NULL OR ${t.caseId} IS NOT NULL OR ${t.entityId} IS NOT NULL`,
    ),
    index("intervention_alert_id_idx").on(t.alertId),
    index("intervention_case_id_idx").on(t.caseId),
  ],
);
