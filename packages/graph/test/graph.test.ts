// Integration tests on the test database (needs `pnpm infra:up`): seed, then check the scores
// tell the story the demo relies on, and that the online recompute path works.
import {
  createDb,
  entity,
  entityScore,
  loadRootEnv,
  observation,
  requireEnv,
  runMigrations,
  scamCase,
  source,
} from "@crowdshield/db";
import { identify } from "@crowdshield/normalise";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEMO,
  findEntity,
  linkCaseEntities,
  recomputeWithNeighbours,
  seed,
  upsertEntity,
  verifyPassword,
} from "../src/index.js";

loadRootEnv();
const url = requireEnv("DATABASE_URL_TEST");
const secrets = { pepper: "p".repeat(64), encKey: "k".repeat(64) };
const NOW = new Date("2026-10-30T02:00:00Z");
const { db, client } = createDb(url, { max: 2 });

beforeAll(async () => {
  await client.unsafe(
    "SET client_min_messages = warning; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  await runMigrations(url);
  await db.transaction((tx) => seed(tx, secrets, { now: NOW }));
});
afterAll(() => client.end());

async function scoreOf(key: keyof typeof DEMO) {
  const d = DEMO[key];
  const { entity: e } = await findEntity(db, secrets, d.type, d.raw);
  if (!e) return null;
  const [s] = await db.select().from(entityScore).where(eq(entityScore.entityId, e.id));
  return { ...s!, entityId: e.id, masked: e.masked };
}

describe("seeded scores", () => {
  it("reproduces the 'two user reports only' worked example: 16, reported", async () => {
    expect(await scoreOf("twoReportsNumber")).toMatchObject({ risk: 16, tier: "reported" });
  });

  it("confirms the Macau caller and counts the 5 same-device reports as one vote", async () => {
    const s = await scoreOf("macauCaller");
    expect(s).toMatchObject({
      tier: "confirmed",
      masked: "+60 11-***-4821",
      topScamTypes: ["macau_impersonation"],
    });
    expect(s!.nIndependentReporters).toBe(37 - 5 + 1 + 1); // consumers minus sybils, + sybil cluster, + NSRC
  });

  it("confirms the bank-confirmed mule, and taints onward mules via the money trail only", async () => {
    expect(await scoreOf("macauMule1")).toMatchObject({ tier: "confirmed" });
    const bec = await scoreOf("becPersonalAccount");
    expect(bec).toMatchObject({ tier: "caution", pDirect: 0 });
    expect(bec!.pGraph).toBeGreaterThan(0.6);
    const [victim] = await db
      .select({ risk: entityScore.risk })
      .from(entityScore)
      .innerJoin(entity, eq(entity.id, entityScore.entityId))
      .where(sql`${entity.attrs} ->> 'victim_account' = 'true'`);
    expect(victim).toEqual({ risk: 0 }); // the victim never inherits risk from the mule they paid
  });

  it("never scores the spoofed official number, and shows it in full", async () => {
    expect(await scoreOf("protectedOfficial")).toMatchObject({
      risk: 0,
      tier: "protected_official",
      masked: "+601300885465",
    });
  });

  it("applies the 0.1 clearing factor after an upheld appeal", async () => {
    const s = await scoreOf("clearedNumber");
    expect(s).toMatchObject({ clearing: 0.1, tier: "reported" });
    expect(s!.risk).toBeLessThan(5);
  });

  it("returns nothing for an unknown number", async () => {
    expect(await scoreOf("unknownNumber")).toBeNull();
  });

  it("flags the LHDN refund campaign as spiking", async () => {
    const rows = await db.execute<{ spike_z: number; reports_24h: number }>(
      sql`SELECT spike_z, reports_24h FROM campaign WHERE label LIKE 'Fake LHDN%'`,
    );
    expect(rows[0]!.reports_24h).toBe(12);
    expect(rows[0]!.spike_z).toBeGreaterThan(5);
  });

  it("seeds demo logins with verifiable password hashes", async () => {
    const rows = await db.execute<{ password_hash: string }>(
      sql`SELECT password_hash FROM app_user WHERE email = 'analyst@nusabank.demo'`,
    );
    expect(verifyPassword("crowdshield-demo", rows[0]!.password_hash)).toBe(true);
    expect(verifyPassword("wrong", rows[0]!.password_hash)).toBe(false);
  });
});

describe("privacy", () => {
  it("stores raw identifiers only encrypted, recoverable with the key", async () => {
    const { identifier, entity: e } = await findEntity(db, secrets, "phone", DEMO.macauCaller.raw);
    const rows = await db.execute<{ plain: string; leaked: boolean }>(sql`
      SELECT pgp_sym_decrypt(value_enc, ${secrets.encKey}) AS plain,
             (display_masked LIKE '%' || ${identifier.value} || '%' OR attrs::text LIKE '%' || ${identifier.value} || '%') AS leaked
      FROM entity WHERE id = ${e!.id}`);
    expect(rows[0]).toEqual({ plain: "+601123454821", leaked: false });
  });

  it("keeps reporter identities out of score explanations", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM entity_score s, reporter r WHERE s.explanation::text LIKE '%' || r.id::text || '%'`);
    expect(rows[0]!.n).toBe(0);
  });
});

describe("online recompute (demo step 2)", () => {
  it("a new report linking the Macau caller to a fresh account makes that account risky within one recompute", async () => {
    const before = await scoreOf("liveDemoMuleAccount");
    expect(before).toBeNull();

    const mule = await upsertEntity(db, secrets, "bank_account", DEMO.liveDemoMuleAccount.raw);
    const caller = await findEntity(db, secrets, "phone", DEMO.macauCaller.raw);
    const [src] = await db
      .select({ id: source.id })
      .from(source)
      .where(eq(source.kind, "user_report"));
    const [c] = await db
      .insert(scamCase)
      .values({ sourceId: src!.id, scamType: "macau_impersonation", nearMiss: true })
      .returning();
    await db.insert(observation).values([
      { caseId: c!.id, entityId: caller.entity!.id, role: "caller", sourceId: src!.id },
      { caseId: c!.id, entityId: mule.id, role: "payee_account", sourceId: src!.id },
    ]);
    await linkCaseEntities(db, c!.id);
    await recomputeWithNeighbours(db, mule.id, NOW);

    const after = await scoreOf("liveDemoMuleAccount");
    expect(after!.pGraph).toBeGreaterThan(0.45); // co_case alpha 0.5 x confirmed caller
    expect(["caution", "high"]).toContain(after!.tier);
    expect(after!.masked).toBe(
      identify("bank_account", DEMO.liveDemoMuleAccount.raw, secrets.pepper).masked,
    );
  });
});
