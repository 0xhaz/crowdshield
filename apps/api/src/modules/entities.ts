import type {
  AppealDecisionInput,
  AppealInput,
  EntityActionInput,
  EntityListQuery,
  PageQuery,
} from "@crowdshield/contracts";
import { POLICY_VERSION } from "@crowdshield/contracts";
import {
  alert,
  appeal,
  auditLog,
  campaign,
  edge,
  entity,
  entityScore,
  fundHop,
  intervention,
  observation,
  scamCase,
} from "@crowdshield/db";
import { recomputeWithNeighbours } from "@crowdshield/graph";
import { Controller, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, type Principal, requireUser } from "../common/auth.js";
import { Body, IdParam, Query, Route, UuidParam } from "../common/route.js";
import { VerdictService } from "../common/verdicts.js";
import { type Db, InjectDb } from "../infra.js";
import { alertSummaries } from "./bank.js";
import { caseSummaries, masked } from "./cases.js";
import { GraphActions } from "./graph-actions.js";

const NOT_VICTIM = sql`NOT coalesce((${entity.attrs} ->> 'victim_account')::boolean, false)`;

export async function entitySummaries(db: Db, where: SQL | undefined, limit: number, offset = 0) {
  const rows = await db
    .select({ e: entity, s: entityScore })
    .from(entity)
    .innerJoin(entityScore, eq(entityScore.entityId, entity.id))
    .where(and(NOT_VICTIM, where))
    .orderBy(desc(entityScore.risk), desc(entity.lastSeen))
    .limit(limit)
    .offset(offset);
  return rows.map(({ e, s }) => ({
    ...masked(e),
    status: e.status,
    risk: s.risk,
    tier: s.tier,
    nCases: s.nCases,
    topScamTypes: s.topScamTypes,
    lastSeen: e.lastSeen.toISOString(),
  }));
}

type CampaignSummary = {
  summary: { en: string; ms: string };
  keyPhrases: string[];
  warning: { en: string; ms: string };
};

/** Campaigns by spike; detected ones awaiting review first. Dismissed ones only on request. */
export async function campaignList(db: Db, limit = 20, withDismissed = false) {
  const rows = await db
    .select({
      c: campaign,
      total: sql<number>`(SELECT count(*)::int FROM scam_case sc WHERE sc.campaign_id = "campaign"."id")`,
    })
    .from(campaign)
    .where(withDismissed ? undefined : ne(campaign.status, "dismissed"))
    .orderBy(
      desc(sql`${campaign.status} = 'candidate'`),
      desc(campaign.spikeZ),
      desc(campaign.lastSeen),
    )
    .limit(limit);
  return rows.map(({ c, total }) => {
    const s = c.summary as CampaignSummary | null;
    return {
      id: c.id,
      label: c.label,
      scamType: c.scamType,
      firstSeen: c.firstSeen.toISOString(),
      lastSeen: c.lastSeen.toISOString(),
      reports24h: c.reports24h,
      baselineDaily: c.baselineDaily,
      spikeZ: c.spikeZ,
      status: c.status,
      totalCases: total,
      origin: c.origin,
      summary: s?.summary ?? null,
      keyPhrases: s?.keyPhrases ?? [],
      warning: s?.warning ?? null,
    };
  });
}

@Controller()
export class EntitiesController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly verdicts: VerdictService,
    private readonly actions: GraphActions,
    private readonly audit: AuditService,
  ) {}

  @Route("listEntities")
  async list(@Query() q: z.output<typeof EntityListQuery>) {
    const where: SQL[] = [];
    if (q.tier) where.push(eq(entityScore.tier, q.tier));
    if (q.type) where.push(eq(entity.type, q.type));
    if (q.minRisk !== undefined) where.push(gte(entityScore.risk, q.minRisk));
    const cond = where.length ? and(...where) : undefined;
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(entity)
      .innerJoin(entityScore, eq(entityScore.entityId, entity.id))
      .where(and(NOT_VICTIM, cond))) as [{ total: number }];
    const items = await entitySummaries(this.db, cond, q.pageSize, (q.page - 1) * q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Route("getEntity")
  async get(@IdParam(true) id: number, @CurrentPrincipal() p: Principal) {
    const detail = await this.detail(id);
    await this.audit.log(p, "entity_view", id);
    return detail;
  }

  @Route("getNeighbours")
  async neighbours(@IdParam(true) id: number) {
    await this.mustExist(id);
    const edges = await this.db
      .select()
      .from(edge)
      .where(or(eq(edge.srcId, id), eq(edge.dstId, id)))
      .limit(100);
    const ids = [...new Set([id, ...edges.flatMap((e) => [e.srcId, e.dstId])])];
    const nodes = await this.db
      .select({ e: entity, risk: entityScore.risk, tier: entityScore.tier })
      .from(entity)
      .leftJoin(entityScore, eq(entityScore.entityId, entity.id))
      .where(inArray(entity.id, ids));
    return {
      nodes: nodes.map((n) => ({
        ...masked(n.e),
        risk: n.risk ?? 0,
        tier: (n.tier ?? "no_known_risk") as "no_known_risk",
      })),
      edges: edges.map((e) => ({
        src: e.srcId,
        dst: e.dstId,
        kind: e.kind,
        alpha: e.alpha,
        nCases: e.nCases,
        amountMyr: e.amountMyr === null ? null : Number(e.amountMyr),
      })),
    };
  }

  @Route("entityAction")
  async action(
    @IdParam(true) id: number,
    @Body() input: z.output<typeof EntityActionInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    await this.mustExist(id);
    const recomputed = await this.db.transaction(async (tx) => {
      let ids: number[] = [];
      if (input.action === "confirm_mule")
        ids = (await this.actions.confirmMule(tx, user, id, { note: input.note })).recomputed;
      if (input.action === "clear")
        await tx.update(entity).set({ status: "cleared" }).where(eq(entity.id, id));
      await tx.insert(intervention).values({
        orgId: user.orgId,
        entityId: id,
        action: input.action,
        actor: user.userId,
        note: input.note,
        policyVersion: POLICY_VERSION,
      });
      await this.audit.log(p, `entity_${input.action}`, id, {}, tx);
      return ids;
    });
    await this.verdicts.invalidate(recomputed);
    return this.detail(id);
  }

  @Route("createAppeal")
  async createAppeal(
    @IdParam(true) id: number,
    @Body() input: z.output<typeof AppealInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    await this.mustExist(id);
    const [a] = await this.db
      .insert(appeal)
      .values({ entityId: id, reason: input.reason, claimantVerified: input.claimantVerified })
      .returning();
    await this.audit.log(p, "appeal_created", id, { appealId: a!.id });
    return { id: a!.id, status: a!.status };
  }

  @Route("decideAppeal")
  async decideAppeal(
    @UuidParam() appealId: string,
    @Body() input: z.output<typeof AppealDecisionInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    const result = await this.db.transaction(async (tx) => {
      const [a] = await tx
        .update(appeal)
        .set({ status: input.decision, decidedBy: user.userId, decidedAt: new Date() })
        .where(and(eq(appeal.id, appealId), eq(appeal.status, "open")))
        .returning();
      if (!a) throw new NotFoundException("No open appeal with that id");
      if (input.decision === "upheld")
        await tx.update(entity).set({ status: "cleared" }).where(eq(entity.id, a.entityId));
      const { recomputed } = await recomputeWithNeighbours(tx, a.entityId);
      await this.audit.log(
        p,
        "appeal_decision",
        a.entityId,
        { appealId, decision: input.decision },
        tx,
      );
      return { a, recomputed };
    });
    await this.verdicts.invalidate(result.recomputed);
    return { id: result.a.id, status: result.a.status };
  }

  @Route("listCampaigns")
  campaigns() {
    return campaignList(this.db);
  }

  @Route("bankDashboard")
  async bankDashboard(@CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const mine = eq(alert.orgId, user.orgId);
    const [byTier, byStatus, [calls], [frozen], recentIds, campaigns, hotEntities] =
      await Promise.all([
        this.db
          .select({ k: alert.tier, n: sql<number>`count(*)::int` })
          .from(alert)
          .where(and(mine, inArray(alert.status, ["open", "in_review"])))
          .groupBy(alert.tier),
        this.db
          .select({ k: alert.status, n: sql<number>`count(*)::int` })
          .from(alert)
          .where(mine)
          .groupBy(alert.status),
        this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(alert)
          .where(
            and(
              mine,
              eq(alert.callSignal, true),
              sql`${alert.createdAt} > now() - interval '24 hours'`,
            ),
          ),
        this.db
          .select({ n: sql<string>`coalesce(sum(${fundHop.frozenMyr}), 0)` })
          .from(fundHop)
          .where(eq(fundHop.reportedByOrg, user.orgId)),
        this.db
          .select({ id: alert.id })
          .from(alert)
          .where(mine)
          .orderBy(desc(alert.createdAt))
          .limit(10),
        campaignList(this.db, 5),
        entitySummaries(this.db, gte(entityScore.risk, 60), 5),
      ]);
    const alertsByTier = Object.fromEntries(byTier.map((r) => [r.k, r.n]));
    const alertsByStatus = Object.fromEntries(byStatus.map((r) => [r.k, r.n]));
    return {
      openAlerts: (alertsByStatus.open ?? 0) + (alertsByStatus.in_review ?? 0),
      alertsByTier,
      alertsByStatus,
      callSignalAlerts24h: calls?.n ?? 0,
      frozenMyr: Number(frozen?.n ?? 0),
      recentAlerts: await alertSummaries(
        this.db,
        recentIds.map((r) => r.id),
      ),
      campaigns,
      hotEntities,
    };
  }

  @Route("audit")
  async auditLog(
    @Query() q: z.output<typeof PageQuery> & { entityId?: number },
    @CurrentPrincipal() p: Principal,
  ) {
    const user = requireUser(p);
    const cond = and(
      user.role === "admin" ? undefined : eq(auditLog.orgId, user.orgId),
      q.entityId ? eq(auditLog.entityId, q.entityId) : undefined,
    );
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(cond)) as [{ total: number }];
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(cond)
      .orderBy(desc(auditLog.at))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return {
      items: rows.map((r) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        entityId: r.entityId,
        detail: r.detail,
        policyVersion: r.policyVersion,
        at: r.at.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async mustExist(id: number) {
    const [e] = await this.db.select({ id: entity.id }).from(entity).where(eq(entity.id, id));
    if (!e) throw new NotFoundException("Entity not found");
  }

  private async detail(id: number) {
    const [row] = await this.db
      .select({ e: entity, s: entityScore })
      .from(entity)
      .leftJoin(entityScore, eq(entityScore.entityId, entity.id))
      .where(eq(entity.id, id));
    if (!row) throw new NotFoundException("Entity not found");
    const caseIds = await this.db
      .selectDistinct({ id: observation.caseId, at: scamCase.reportedAt })
      .from(observation)
      .innerJoin(scamCase, eq(scamCase.id, observation.caseId))
      .where(eq(observation.entityId, id))
      .orderBy(desc(scamCase.reportedAt))
      .limit(50);
    const appeals = await this.db
      .select()
      .from(appeal)
      .where(eq(appeal.entityId, id))
      .orderBy(desc(appeal.createdAt));
    const { e, s } = row;
    return {
      entity: {
        ...masked(e),
        status: e.status,
        risk: s?.risk ?? 0,
        tier: s?.tier ?? "no_known_risk",
        nCases: s?.nCases ?? 0,
        topScamTypes: s?.topScamTypes ?? [],
        lastSeen: e.lastSeen.toISOString(),
        firstSeen: e.firstSeen.toISOString(),
        attrs: e.attrs as Record<string, unknown>,
      },
      verdict: await this.verdicts.forEntity(id),
      score: s
        ? {
            pDirect: s.pDirect,
            pGraph: s.pGraph,
            clearing: s.clearing,
            modelVersion: s.modelVersion,
          }
        : null,
      cases: await caseSummaries(
        this.db,
        caseIds.map((c) => c.id),
      ),
      appeals: appeals.map((a) => ({
        id: a.id,
        status: a.status,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
    };
  }
}
