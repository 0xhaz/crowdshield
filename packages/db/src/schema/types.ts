import { sql } from "drizzle-orm";
import { customType, pgEnum, timestamp } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ---------- reference types (schema.sql) ----------
export const entityType = pgEnum("entity_type", [
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

export const entityStatus = pgEnum("entity_status", [
  "suspected",
  "under_review",
  "confirmed",
  "cleared",
  "expired",
]);

export const scamType = pgEnum("scam_type", [
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

export const sourceKind = pgEnum("source_kind", [
  "pdrm_semakmule",
  "nsrc_case",
  "bank_confirmed",
  "bank_trace", // a member bank traced scam money into the account (via NSRC / the National Fraud Portal)
  "regulator_alert",
  "threat_feed",
  "user_report_verified",
  "user_report",
  "news_extraction",
  "model_inference",
]);

export const entityRole = pgEnum("entity_role", [
  "caller",
  "messenger",
  "payee_account",
  "link_sent",
  "app_installed",
  "profile_used",
  "wallet_used",
  "impersonated_official",
  "traced_recipient", // received money traced from the case by a bank, downstream of the victim's payee
]);

export const RISK_TIERS = [
  "no_known_risk",
  "reported",
  "caution",
  "high",
  "confirmed",
  "protected_official",
] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const tstz = () => timestamp({ withTimezone: true, mode: "date" });

/** Renders a CHECK (col IN (...)) value list from a const array, so TS types and DB constraints share one source. */
export const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", "));
