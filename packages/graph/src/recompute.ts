// Score recompute: reads an entity's evidence and one-hop neighbours, scores it with
// @crowdshield/scoring and writes entity_score. Online path = this entity + its neighbours;
// the nightly GPU job (later) does full two-hop propagation.
import {
  appeal,
  entity,
  entityScore,
  observation,
  reporter,
  scamCase,
  source,
} from "@crowdshield/db";
import {
  MODEL_VERSION,
  type EntityType,
  type Neighbour,
  type Observation,
  score,
  type Verification,
} from "@crowdshield/scoring";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "./types.js";

export interface Explanation {
  sources: { kind: string; name: string; count: number; lastSeen: string }[];
  graph: { kind: string; alpha: number; neighbourId: number; masked: string; pDirect: number }[];
  appealUpheld: boolean;
}

interface NeighbourRow extends Record<string, unknown> {
  kind: string;
  alpha: number;
  neighbour_id: string;
  masked: string;
  p_direct: number;
}

async function loadNeighbours(db: DbOrTx, entityId: number): Promise<NeighbourRow[]> {
  // Money only taints downstream: for money_flow, this entity inherits from its src (who paid it),
  // never from accounts it paid, so victims don't inherit risk from the mules they paid.
  // Zero-risk neighbours are dropped: they add nothing to p_graph and would lift the user-only cap.
  const rows = await db.execute<NeighbourRow>(sql`
    SELECT e.kind, e.alpha, n.id AS neighbour_id, n.display_masked AS masked, s.p_direct
    FROM edge e
    JOIN entity n ON n.id = CASE WHEN e.src_id = ${entityId} THEN e.dst_id ELSE e.src_id END
    JOIN entity_score s ON s.entity_id = n.id
    WHERE (e.src_id = ${entityId} OR e.dst_id = ${entityId})
      AND NOT (e.kind = 'money_flow' AND e.src_id = ${entityId})
      AND NOT n.protected
      AND s.p_direct > 0
    ORDER BY e.alpha * s.p_direct DESC`);
  return [...rows];
}

export async function recomputeEntity(db: DbOrTx, entityId: number, now = new Date()) {
  const [ent] = await db
    .select({ type: entity.type, protected: entity.protected })
    .from(entity)
    .where(eq(entity.id, entityId));
  if (!ent) throw new Error(`entity ${entityId} not found`);

  const obsRows = await db
    .select({
      caseId: observation.caseId,
      reporterId: observation.reporterId,
      observedAt: observation.observedAt,
      sourceKind: source.kind,
      sourceName: source.name,
      sourceWeight: source.baseWeight,
      trust: reporter.trust,
      device: reporter.deviceFingerprintHash,
      verification: scamCase.verification,
      scamType: scamCase.scamType,
    })
    .from(observation)
    .innerJoin(source, eq(source.id, observation.sourceId))
    .innerJoin(scamCase, eq(scamCase.id, observation.caseId))
    .leftJoin(reporter, eq(reporter.id, observation.reporterId))
    // being impersonated (a spoofed official number) is not evidence against the entity
    .where(and(eq(observation.entityId, entityId), ne(observation.role, "impersonated_official")));

  const observations: Observation[] = obsRows.map((o) => ({
    sourceKind: o.sourceKind,
    sourceWeight: o.sourceWeight,
    reporterTrust: o.trust ?? 1,
    verification: o.verification as Verification,
    observedAt: o.observedAt,
    caseId: o.caseId,
    reporterId: o.reporterId,
    // reporters sharing a device fingerprint are one suspected sybil cluster: one vote
    sybilCluster: o.device ? `dev:${o.device.toString("hex")}` : null,
  }));

  const neighbourRows = await loadNeighbours(db, entityId);
  const neighbours: Neighbour[] = neighbourRows.map((n) => [n.alpha, n.p_direct]);

  const [upheld] = await db
    .select({ id: appeal.id })
    .from(appeal)
    .where(and(eq(appeal.entityId, entityId), eq(appeal.status, "upheld")))
    .limit(1);
  const appealUpheld = Boolean(upheld);

  const result = score(
    { type: ent.type as EntityType, protected: ent.protected },
    observations,
    neighbours,
    { appealUpheld, now },
  );

  // Aggregates only: never reporter identities
  const bySource = new Map<string, Explanation["sources"][number]>();
  for (const o of obsRows) {
    const s = bySource.get(o.sourceKind) ?? {
      kind: o.sourceKind,
      name: o.sourceName,
      count: 0,
      lastSeen: o.observedAt.toISOString(),
    };
    s.count += 1;
    if (o.observedAt.toISOString() > s.lastSeen) s.lastSeen = o.observedAt.toISOString();
    bySource.set(o.sourceKind, s);
  }
  const explanation: Explanation = {
    sources: [...bySource.values()].sort((a, b) => b.count - a.count),
    graph: neighbourRows.slice(0, 5).map((n) => ({
      kind: n.kind,
      alpha: n.alpha,
      neighbourId: Number(n.neighbour_id),
      masked: n.masked,
      pDirect: n.p_direct,
    })),
    appealUpheld,
  };

  const scamTypeCounts = new Map<string, number>();
  for (const o of obsRows)
    if (o.scamType) scamTypeCounts.set(o.scamType, (scamTypeCounts.get(o.scamType) ?? 0) + 1);
  const topScamTypes = [...scamTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  const isProtected = result.tier === "protected_official";
  const row = {
    entityId,
    pDirect: isProtected ? 0 : result.pDirect,
    pGraph: isProtected ? 0 : result.pGraph,
    clearing: appealUpheld ? 0.1 : 1,
    risk: result.risk,
    tier: result.tier,
    confidence: isProtected ? "high" : result.confidence,
    topScamTypes: topScamTypes as (typeof entityScore.$inferInsert)["topScamTypes"],
    nCases: new Set(obsRows.map((o) => o.caseId)).size,
    nIndependentReporters: isProtected ? 0 : result.independentSources,
    explanation,
    modelVersion: MODEL_VERSION,
    computedAt: now,
  };
  await db
    .insert(entityScore)
    .values(row)
    .onConflictDoUpdate({ target: entityScore.entityId, set: { ...row, entityId: undefined } });
  return row;
}

/** Online path after new evidence: the entity, then its one-hop neighbours (their p_graph depends on it). */
export async function recomputeWithNeighbours(db: DbOrTx, entityId: number, now = new Date()) {
  const self = await recomputeEntity(db, entityId, now);
  const rows = await db.execute<{ id: string }>(sql`
    SELECT dst_id AS id FROM edge WHERE src_id = ${entityId}
    UNION SELECT src_id FROM edge WHERE dst_id = ${entityId} AND kind <> 'money_flow'`);
  const neighbourIds = [...rows].map((r) => Number(r.id));
  for (const id of neighbourIds) await recomputeEntity(db, id, now);
  return { self, recomputed: [entityId, ...neighbourIds] };
}

/** Full recompute. p_direct doesn't depend on the graph, so two passes give every entity fresh neighbours. */
export async function recomputeAll(db: DbOrTx, now = new Date()): Promise<number> {
  const ids = (await db.select({ id: entity.id }).from(entity)).map((r) => r.id);
  for (let pass = 0; pass < 2; pass++) for (const id of ids) await recomputeEntity(db, id, now);
  return ids.length;
}
