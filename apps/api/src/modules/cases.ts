import type { CaseListQuery } from "@crowdshield/contracts";
import {
  campaign,
  caseEvidence,
  cashoutEvent,
  entity,
  entityScore,
  fundHop,
  incidentEvent,
  leReferral,
  observation,
  scamCase,
  source,
} from "@crowdshield/db";
import type { DbOrTx } from "@crowdshield/graph";
import { Controller, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, isAdmin, type Principal, requireUser } from "../common/auth.js";
import { MlClient } from "../common/ml.js";
import { Query, Route, UuidParam } from "../common/route.js";
import { type Db, InjectDb } from "../infra.js";

const num = (v: string | null) => (v === null ? null : Number(v));
const iso = (d: Date | null) => d?.toISOString() ?? null;
export const masked = (e: {
  id: number;
  type: string;
  displayMasked: string;
  protected: boolean;
}) => ({
  id: e.id,
  type: e.type,
  masked: e.displayMasked,
  protected: e.protected,
});

/** Case summaries (with their entities and scores) for a list of case ids, in the given order. */
export async function caseSummaries(db: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  const cases = await db
    .select({
      c: scamCase,
      sourceKind: source.kind,
      camp: { id: campaign.id, label: campaign.label },
    })
    .from(scamCase)
    .innerJoin(source, eq(source.id, scamCase.sourceId))
    .leftJoin(campaign, eq(campaign.id, scamCase.campaignId))
    .where(inArray(scamCase.id, ids));
  const obs = await db
    .select({
      caseId: observation.caseId,
      role: observation.role,
      e: entity,
      risk: entityScore.risk,
      tier: entityScore.tier,
    })
    .from(observation)
    .innerJoin(entity, eq(entity.id, observation.entityId))
    .leftJoin(entityScore, eq(entityScore.entityId, entity.id))
    .where(inArray(observation.caseId, ids));
  const byId = new Map(cases.map((r) => [r.c.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      {
        id: r.c.id,
        scamType: r.c.scamType,
        source: r.sourceKind,
        verification: r.c.verification,
        lossMyr: num(r.c.lossMyr),
        nearMiss: r.c.nearMiss,
        reportedAt: r.c.reportedAt.toISOString(),
        victimState: r.c.victimState,
        campaign: r.camp?.id ? r.camp : null,
        nsrcRef: r.c.nsrcRef,
        entities: obs
          .filter((o) => o.caseId === id)
          .map((o) => ({ ...masked(o.e), role: o.role, risk: o.risk, tier: o.tier })),
      },
    ];
  });
}

@Controller()
export class CasesController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly ml: MlClient,
    private readonly audit: AuditService,
  ) {}

  @Route("listCases")
  async list(@Query() q: z.output<typeof CaseListQuery>) {
    const where: SQL[] = [];
    if (q.scamType) where.push(eq(scamCase.scamType, q.scamType));
    if (q.campaignId) where.push(eq(scamCase.campaignId, q.campaignId));
    if (q.withLoss) where.push(isNotNull(scamCase.lossMyr));
    if (q.entityId)
      where.push(
        sql`${scamCase.id} IN (SELECT case_id FROM observation WHERE entity_id = ${q.entityId})`,
      );
    const cond = where.length ? and(...where) : undefined;
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(scamCase)
      .where(cond)) as [{ total: number }];
    const rows = await this.db
      .select({ id: scamCase.id })
      .from(scamCase)
      .where(cond)
      .orderBy(desc(scamCase.reportedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return {
      items: await caseSummaries(
        this.db,
        rows.map((r) => r.id),
      ),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Route("getCase")
  get(@UuidParam() id: string, @CurrentPrincipal() p: Principal) {
    return caseDetail(this.db, id, p);
  }

  @Route("caseBrief")
  async brief(@UuidParam() id: string, @CurrentPrincipal() p: Principal) {
    const d = await caseDetail(this.db, id, p);
    const out = await this.ml.post<Record<string, unknown>>(
      "/v1/brief",
      { case: briefInput(d) },
      180_000,
    );
    await this.audit.log(p, "case_brief", null, { caseId: id });
    return out;
  }
}

/** Full case for the bank's fraud team (cash-outs restricted to the reporting bank). */
export async function caseDetail(db: Db, id: string, p: Principal) {
  const user = requireUser(p);
  const [summary] = await caseSummaries(db, [id]);
  if (!summary) throw new NotFoundException("Case not found");
  const [c] = await db.select().from(scamCase).where(eq(scamCase.id, id));
  const fromE = alias(entity, "from_e");
  const toE = alias(entity, "to_e");
  const hops = await db
    .select({
      h: fundHop,
      fromId: fromE.id,
      fromType: fromE.type,
      fromMasked: fromE.displayMasked,
      fromProtected: fromE.protected,
      toId: toE.id,
      toType: toE.type,
      toMasked: toE.displayMasked,
      toProtected: toE.protected,
    })
    .from(fundHop)
    .innerJoin(fromE, eq(fromE.id, fundHop.fromEntity))
    .leftJoin(toE, eq(toE.id, fundHop.toEntity))
    .where(eq(fundHop.caseId, id))
    .orderBy(fundHop.hopNo, fundHop.at);
  const [timeline, cashouts, referrals, evidence] = await Promise.all([
    db
      .select({ ev: incidentEvent, e: entity })
      .from(incidentEvent)
      .leftJoin(entity, eq(entity.id, incidentEvent.entityId))
      .where(eq(incidentEvent.caseId, id))
      .orderBy(incidentEvent.at),
    // Restricted: the reporting bank and law enforcement only (architecture §9)
    db
      .select()
      .from(cashoutEvent)
      .where(
        and(
          eq(cashoutEvent.caseId, id),
          isAdmin(p) ? undefined : eq(cashoutEvent.reportedByOrg, user.orgId),
        ),
      ),
    db.select().from(leReferral).where(eq(leReferral.caseId, id)),
    db.select().from(caseEvidence).where(eq(caseEvidence.caseId, id)),
  ]);
  return {
    ...summary,
    narrative: c!.narrativeRedacted,
    language: c!.language,
    occurredAt: iso(c!.occurredAt),
    victimAgeBand: c!.victimAgeBand,
    policeReportNo: c!.policeReportNo,
    timeline: timeline.map((t) => ({
      at: t.ev.at.toISOString(),
      channel: t.ev.channel,
      kind: t.ev.kind,
      entity: t.e ? masked(t.e) : null,
      durationSec: t.ev.durationSec,
      detail: t.ev.detailRedacted,
    })),
    moneyTrail: hops.map((h) => ({
      hopNo: h.h.hopNo,
      from: { id: h.fromId, type: h.fromType, masked: h.fromMasked, protected: h.fromProtected },
      to: h.toId
        ? { id: h.toId, type: h.toType!, masked: h.toMasked!, protected: h.toProtected! }
        : null,
      amountMyr: Number(h.h.amountMyr),
      frozenMyr: Number(h.h.frozenMyr),
      at: h.h.at.toISOString(),
      rail: h.h.rail,
      txnRef: h.h.txnRef,
      senderBank: h.h.senderBank,
      receiverBank: h.h.receiverBank,
    })),
    cashouts: cashouts.map((x) => ({
      at: x.at.toISOString(),
      method: x.method,
      locationRef: x.locationRef,
      state: x.state,
      amountMyr: num(x.amountMyr),
    })),
    referrals: referrals.map((x) => ({
      agency: x.agency,
      externalRef: x.externalRef,
      status: x.status,
      sentAt: x.sentAt.toISOString(),
      recoveredMyr: Number(x.recoveredMyr),
    })),
    evidence: evidence.map((x) => ({ id: x.id, kind: x.kind, storageUri: x.storageUri })),
  };
}

/**
 * What Nemotron sees for a case brief: masked identifiers and redacted text only, every item with
 * an id ("event:2", "hop:1", "entity:5") that the brief must cite.
 */
export function briefInput(d: Awaited<ReturnType<typeof caseDetail>>) {
  return {
    case: {
      scamType: d.scamType,
      reportedAt: d.reportedAt,
      occurredAt: d.occurredAt,
      lossMyr: d.lossMyr,
      nearMiss: d.nearMiss,
      verification: d.verification,
      source: d.source,
      victimState: d.victimState,
      victimAgeBand: d.victimAgeBand,
      campaign: d.campaign?.label ?? null,
      nsrcRef: d.nsrcRef ? "provided" : null,
      policeReport: d.policeReportNo ? "provided" : null,
    },
    narrative: d.narrative,
    identifiers: d.entities.map((e) => ({
      id: `entity:${e.id}`,
      type: e.type,
      masked: e.masked,
      role: e.role,
      risk: e.risk,
      tier: e.tier,
      official: e.protected,
    })),
    timeline: d.timeline.map((t, i) => ({
      id: `event:${i + 1}`,
      at: t.at,
      channel: t.channel,
      kind: t.kind,
      identifier: t.entity ? `entity:${t.entity.id}` : null,
      durationSec: t.durationSec,
      detail: t.detail,
    })),
    moneyTrail: d.moneyTrail.map((h, i) => ({
      id: `hop:${i + 1}`,
      hopNo: h.hopNo,
      from: `entity:${h.from.id} (${h.from.masked})`,
      to: h.to ? `entity:${h.to.id} (${h.to.masked})` : "unknown",
      amountMyr: h.amountMyr,
      frozenMyr: h.frozenMyr,
      at: h.at,
      rail: h.rail,
      senderBank: h.senderBank,
      receiverBank: h.receiverBank,
    })),
    cashouts: d.cashouts.map((c, i) => ({ id: `cashout:${i + 1}`, ...c })),
    referrals: d.referrals.map((r, i) => ({
      id: `referral:${i + 1}`,
      agency: r.agency,
      status: r.status,
      sentAt: r.sentAt,
      recoveredMyr: r.recoveredMyr,
    })),
    evidence: d.evidence.map((e, i) => ({ id: `evidence:${i + 1}`, kind: e.kind })),
  };
}
