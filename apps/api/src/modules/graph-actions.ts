// Analyst decisions that feed back into the graph (architecture §6: "Bank->>Graph: Outcome").
import { entity, observation, reporter, scamCase, source } from "@crowdshield/db";
import { type DbOrTx, linkCaseEntities, recomputeWithNeighbours } from "@crowdshield/graph";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { UserPrincipal } from "../common/auth.js";

@Injectable()
export class GraphActions {
  /** The org's institutional reporter row (one per bank / SME). */
  async orgReporter(tx: DbOrTx, p: UserPrincipal, kind: "bank" | "ewallet" | "sme", trust: number) {
    const [existing] = await tx
      .select({ id: reporter.id })
      .from(reporter)
      .where(and(eq(reporter.orgId, p.orgId), eq(reporter.kind, kind)));
    if (existing) return existing.id;
    const [created] = await tx
      .insert(reporter)
      .values({ kind, orgId: p.orgId, trust, phoneVerified: true })
      .returning({ id: reporter.id });
    return created!.id;
  }

  /**
   * A bank confirms an account as a mule: bank_confirmed evidence (0.90, confirmed x2), entity
   * status confirmed, optionally linked to the caller seen on the live call. Returns recomputed ids.
   */
  async confirmMule(
    tx: DbOrTx,
    p: UserPrincipal,
    entityId: number,
    opts: { callerEntityId?: number | null; note?: string } = {},
  ) {
    const now = new Date();
    const [src] = await tx
      .select({ id: source.id })
      .from(source)
      .where(eq(source.kind, "bank_confirmed"));
    const reporterId = await this.orgReporter(
      tx,
      p,
      p.orgKind === "ewallet" ? "ewallet" : "bank",
      0.9,
    );
    const [c] = await tx
      .insert(scamCase)
      .values({
        sourceId: src!.id,
        reporterId,
        orgId: p.orgId,
        verification: "confirmed",
        reportedAt: now,
        nearMiss: true,
        narrativeRedacted:
          opts.note ?? "Confirmed as a mule account by the receiving bank's fraud team.",
      })
      .returning({ id: scamCase.id });
    const rows: (typeof observation.$inferInsert)[] = [
      {
        caseId: c!.id,
        entityId,
        role: "payee_account",
        sourceId: src!.id,
        reporterId,
        observedAt: now,
      },
    ];
    if (opts.callerEntityId)
      rows.push({
        caseId: c!.id,
        entityId: opts.callerEntityId,
        role: "caller",
        sourceId: src!.id,
        reporterId,
        observedAt: now,
      });
    await tx.insert(observation).values(rows);
    await tx
      .update(entity)
      .set({ status: "confirmed", lastSeen: now })
      .where(eq(entity.id, entityId));
    await linkCaseEntities(tx, c!.id, now);
    const recomputed = new Set<number>();
    for (const r of rows)
      for (const id of (await recomputeWithNeighbours(tx, r.entityId, now)).recomputed)
        recomputed.add(id);
    return { caseId: c!.id, recomputed: [...recomputed] };
  }
}
