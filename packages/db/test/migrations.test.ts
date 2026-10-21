// Integration test: applies all migrations to the test database (needs `pnpm infra:up`).
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRootEnv, requireEnv } from "../src/env.js";
import { runMigrations } from "../src/migrate.js";

loadRootEnv();
const url = requireEnv("DATABASE_URL_TEST");
const sql = postgres(url, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  await sql.unsafe(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  await runMigrations(url);
});
afterAll(() => sql.end());

describe("migrations", () => {
  it("creates the extensions", async () => {
    const rows = await sql`SELECT extname FROM pg_extension ORDER BY extname`;
    expect(rows.map((r) => r.extname)).toEqual(
      expect.arrayContaining(["pgcrypto", "pg_trgm", "vector"]),
    );
  });

  it("creates the 16 schema.sql tables and the 7 new ones", async () => {
    const rows = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const tables = rows.map((r) => r.tablename).sort();
    expect(tables).toEqual([
      "alert",
      "app_user",
      "appeal",
      "audit_log",
      "campaign",
      "case_evidence",
      "cashout_event",
      "edge",
      "entity",
      "entity_score",
      "fund_hop",
      "incident_event",
      "intervention",
      "invoice_check",
      "le_referral",
      "observation",
      "org",
      "payment_hold",
      "reporter",
      "scam_case",
      "script_snippet",
      "source",
      "supplier",
    ]);
  });

  it("seeds the default source weights", async () => {
    const rows = await sql`SELECT kind, base_weight FROM source ORDER BY base_weight DESC`;
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ kind: "pdrm_semakmule", base_weight: 0.95 });
    expect(rows.at(-1)).toMatchObject({ kind: "model_inference", base_weight: 0 });
  });

  it("links campaign_id to campaign (workplan §7.4)", async () => {
    const rows = await sql`
      SELECT conrelid::regclass::text AS tbl FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'campaign'::regclass ORDER BY 1`;
    expect(rows.map((r) => r.tbl)).toEqual(["scam_case", "script_snippet"]);
  });

  it("enforces identifier uniqueness and check constraints", async () => {
    const hash = Buffer.from("ab", "hex");
    await sql`INSERT INTO entity (type, lookup_hash, display_masked) VALUES ('phone', ${hash}, '+60 12-***-4567')`;
    await expect(
      sql`INSERT INTO entity (type, lookup_hash, display_masked) VALUES ('phone', ${hash}, 'dup')`,
    ).rejects.toThrow(/entity_type_lookup_hash_key/);
    await expect(sql`INSERT INTO org (kind, name) VALUES ('bakery', 'x')`).rejects.toThrow(
      /org_kind_check/,
    );
  });

  it("supports vector similarity and trigram search", async () => {
    const [vec] = await sql`SELECT ${"[1,0,0]"}::vector <=> ${"[0,1,0]"}::vector AS d`;
    expect(vec?.d).toBeCloseTo(1);
    const [trgm] = await sql`SELECT similarity('maybank2u.com', 'maybank2u-secure.com') AS s`;
    expect(trgm?.s).toBeGreaterThan(0.4);
  });
});
