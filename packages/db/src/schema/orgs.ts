// Organisations (tenants) and their users. Not in schema.sql; added per workplan §7.5.
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { inList, tstz } from "./types.js";

export const ORG_KINDS = ["bank", "ewallet", "sme", "agency", "platform"] as const;
export const USER_ROLES = [
  "bank_analyst",
  "bank_supervisor",
  "sme_owner",
  "sme_member",
  "admin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const org = pgTable(
  "org",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    name: text().notNull(),
    createdAt: tstz().defaultNow().notNull(),
  },
  (t) => [check("org_kind_check", sql`${t.kind} IN (${inList(ORG_KINDS)})`)],
);

export const appUser = pgTable(
  "app_user",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => org.id),
    email: text().notNull().unique(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    role: text().notNull(),
    createdAt: tstz().defaultNow().notNull(),
    lastLoginAt: tstz(),
  },
  (t) => [
    check("app_user_role_check", sql`${t.role} IN (${inList(USER_ROLES)})`),
    index("app_user_org_id_idx").on(t.orgId),
  ],
);
