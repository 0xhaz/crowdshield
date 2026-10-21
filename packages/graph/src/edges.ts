import { edge, observation } from "@crowdshield/db";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "./types.js";

/** Default propagation strength per edge kind (illustrative, tune on outcomes like the source weights). */
export const EDGE_ALPHA = {
  co_case: 0.5, // used together in one scam (scoring.py worked example)
  money_flow: 0.7, // received money from a risky account
  same_campaign: 0.3,
  same_device: 0.6,
  redirects_to: 0.8,
} as const;
export type EdgeKind = keyof typeof EDGE_ALPHA;

/** Directed kinds keep src → dst; the rest are stored once with src < dst. */
const DIRECTED: ReadonlySet<EdgeKind> = new Set(["money_flow", "redirects_to"]);

export async function upsertEdge(
  db: DbOrTx,
  kind: EdgeKind,
  a: number,
  b: number,
  options: { amountMyr?: number; at?: Date; alpha?: number } = {},
): Promise<void> {
  if (a === b) return;
  const [srcId, dstId] = DIRECTED.has(kind) || a < b ? [a, b] : [b, a];
  const at = options.at ?? new Date();
  await db
    .insert(edge)
    .values({
      srcId,
      dstId,
      kind,
      alpha: options.alpha ?? EDGE_ALPHA[kind],
      amountMyr: options.amountMyr?.toFixed(2),
      lastSeen: at,
    })
    .onConflictDoUpdate({
      target: [edge.srcId, edge.dstId, edge.kind],
      set: {
        nCases: sql`${edge.nCases} + 1`,
        amountMyr: sql`coalesce(${edge.amountMyr}, 0) + coalesce(excluded.amount_myr, 0)`,
        lastSeen: sql`greatest(${edge.lastSeen}, excluded.last_seen)`,
      },
    });
}

/** Links every pair of entities observed in one case with a co_case edge (impersonated officials excluded). */
export async function linkCaseEntities(db: DbOrTx, caseId: string, at?: Date): Promise<number[]> {
  const rows = await db
    .selectDistinct({ entityId: observation.entityId })
    .from(observation)
    .where(and(eq(observation.caseId, caseId), ne(observation.role, "impersonated_official")));
  const ids = rows.map((r) => r.entityId).sort((x, y) => x - y);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++)
      await upsertEdge(db, "co_case", ids[i]!, ids[j]!, { at });
  }
  return ids;
}
