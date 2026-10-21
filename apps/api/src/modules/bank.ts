// Bank / e-wallet side (architecture §4 and §6): payee check before a transfer, joined with the
// live call signal from the customer's app, then the alert queue and graded interventions.
import {
  type AlertActionInput,
  type AlertListQuery,
  type PayeeCheckInput,
  POLICY_VERSION,
  type Verdict,
} from "@crowdshield/contracts";
import { alert, entity, entityScore, intervention } from "@crowdshield/db";
import { upsertEntity } from "@crowdshield/graph";
import { SCAM_TYPE_ACTION, type Text, TIER_ACTION, TIER_LABEL } from "@crowdshield/i18n";
import { BadRequestException, Controller, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import {
  CurrentPrincipal,
  type Principal,
  requireUser,
  type UserPrincipal,
} from "../common/auth.js";
import { IdempotencyService } from "../common/idempotency.js";
import { Body, IdempotencyKey, Query, Route, UuidParam } from "../common/route.js";
import { tierForRisk, VerdictService } from "../common/verdicts.js";
import { Config } from "../config.js";
import { type Db, InjectDb } from "../infra.js";
import { masked } from "./cases.js";
import { GraphActions } from "./graph-actions.js";

type PayeeInput = z.output<typeof PayeeCheckInput>;

/**
 * Weight of the live-call signal. A flagged caller on the line while the customer pays a new payee
 * is the coaching pattern (architecture §4); an active call with an unknown number is weaker.
 */
const CALLER_WEIGHT = 0.6;
const UNKNOWN_ACTIVE_CALL = 0.25;
const ALERT_TIERS = new Set(["caution", "high", "confirmed"]);

const RECOMMENDED = {
  no_known_risk: "proceed",
  reported: "warn",
  caution: "cooling_off",
  high: "hold_and_callback",
  confirmed: "block_and_report",
} as const;

const STATUS_FOR_ACTION: Partial<Record<z.output<typeof AlertActionInput>["action"], string>> = {
  hold: "held",
  release: "released",
  callback: "in_review",
  freeze: "frozen",
  confirm_mule: "confirmed_mule",
  clear: "cleared",
};
const TERMINAL = new Set(["released", "frozen", "confirmed_mule", "cleared"]);

export async function alertSummaries(db: Db, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ a: alert, e: entity, top: entityScore.topScamTypes })
    .from(alert)
    .innerJoin(entity, eq(entity.id, alert.entityId))
    .leftJoin(entityScore, eq(entityScore.entityId, entity.id))
    .where(inArray(alert.id, ids));
  const byId = new Map(rows.map((r) => [r.a.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const a = r.a;
    return [
      {
        id: a.id,
        status: a.status,
        kind: a.kind,
        entity: masked(r.e),
        risk: a.risk,
        tier: a.tier,
        callSignal: a.callSignal,
        amountMyr: a.amountMyr === null ? null : Number(a.amountMyr),
        rail: a.rail,
        topScamTypes: r.top ?? [],
        assignedTo: a.assignedTo,
        createdAt: a.createdAt.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
      },
    ];
  });
}

@Injectable()
export class BankService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: Config,
    private readonly verdicts: VerdictService,
    private readonly actions: GraphActions,
    private readonly audit: AuditService,
  ) {}

  async payeeCheck(input: PayeeInput, p: UserPrincipal) {
    if (!["bank_account", "ewallet"].includes(input.payee.type)) {
      throw new BadRequestException("payee must be a bank_account or ewallet");
    }
    const payee = await this.verdicts.lookup(input.payee);
    const active = input.callSignal?.active ?? false;
    const caller =
      active && input.callSignal?.caller
        ? await this.verdicts.lookup(input.callSignal.caller)
        : null;

    // The join no single party can make (architecture §6): payee risk combined with the call
    const callerFactor = !active
      ? 0
      : caller
        ? caller.tier === "protected_official"
          ? 1
          : caller.risk / 100
        : UNKNOWN_ACTIVE_CALL;
    const combinedRisk = Math.round(
      100 * (1 - (1 - payee.risk / 100) * (1 - CALLER_WEIGHT * callerFactor)),
    );
    const combinedTier =
      payee.tier === "protected_official" ? "protected_official" : tierForRisk(combinedRisk);
    const recommendedAction =
      combinedTier === "protected_official" ? "warn" : RECOMMENDED[combinedTier];
    const customerWarning = this.warning(payee, caller, active, combinedTier);

    let alertId: string | null = null;
    if (ALERT_TIERS.has(combinedTier)) {
      // A payee checked during a flagged call is itself a lead, so it gets an entity even if new
      const entityId =
        payee.entity.id ??
        (
          await upsertEntity(
            this.db,
            this.config.secrets,
            input.payee.type,
            input.payee.value,
            input.payee,
          )
        ).id;
      const [a] = await this.db
        .insert(alert)
        .values({
          orgId: p.orgId,
          kind: "payee_check",
          entityId,
          risk: combinedRisk,
          tier: combinedTier,
          callSignal: active,
          amountMyr: input.amountMyr.toFixed(2),
          rail: input.rail,
          request: {
            payee: payee.entity.masked,
            amountMyr: input.amountMyr,
            rail: input.rail,
            callActive: active,
            callerMasked: caller?.entity.masked ?? null,
            callerEntityId: caller?.entity.id ?? null,
          },
          verdict: {
            payee: { risk: payee.risk, tier: payee.tier },
            caller: caller && { risk: caller.risk, tier: caller.tier },
            combinedRisk,
            combinedTier,
            recommendedAction,
          },
        })
        .returning({ id: alert.id });
      alertId = a!.id;
    }
    await this.audit.log(p, "payee_check", payee.entity.id, {
      combinedRisk,
      combinedTier,
      callActive: active,
      alertId,
    });
    return {
      payee,
      caller,
      combinedRisk,
      combinedTier,
      recommendedAction,
      customerWarning,
      alertId,
      policyVersion: POLICY_VERSION,
    };
  }

  private warning(
    payee: Verdict,
    caller: Verdict | null,
    active: boolean,
    tier: keyof typeof TIER_ACTION,
  ): Text {
    if (active && caller && ["high", "confirmed"].includes(caller.tier)) {
      return {
        en: `You are on a call with a number reported for scams (${TIER_LABEL[caller.tier as "high"].en.toLowerCase()}). Hang up before you pay. Police and BNM never ask you to move money.`,
        ms: `Anda sedang dalam panggilan dengan nombor yang dilaporkan untuk scam (${TIER_LABEL[caller.tier as "high"].ms.toLowerCase()}). Letak telefon sebelum membayar. Polis dan BNM tidak pernah meminta anda memindahkan wang.`,
      };
    }
    if (["high", "confirmed"].includes(tier)) {
      const specific = payee.topScamTypes.map((t) => SCAM_TYPE_ACTION[t]).find(Boolean);
      if (specific) return specific;
    }
    return TIER_ACTION[tier];
  }

  async list(q: z.output<typeof AlertListQuery>, p: UserPrincipal) {
    const where: SQL[] = [eq(alert.orgId, p.orgId)];
    if (q.status) where.push(eq(alert.status, q.status));
    if (q.tier) where.push(eq(alert.tier, q.tier));
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(alert)
      .where(and(...where))) as [{ total: number }];
    const ids = await this.db
      .select({ id: alert.id })
      .from(alert)
      .where(and(...where))
      .orderBy(
        sql`CASE ${alert.status} WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END`,
        desc(alert.risk),
        desc(alert.createdAt),
      )
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return {
      items: await alertSummaries(
        this.db,
        ids.map((r) => r.id),
      ),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(id: string, p: UserPrincipal) {
    const [summary] = await alertSummaries(this.db, [id]);
    const [a] = await this.db
      .select({ orgId: alert.orgId, entityId: alert.entityId })
      .from(alert)
      .where(eq(alert.id, id));
    if (!summary || a!.orgId !== p.orgId) throw new NotFoundException("Alert not found");
    const interventions = await this.db
      .select()
      .from(intervention)
      .where(eq(intervention.alertId, id))
      .orderBy(intervention.at);
    return {
      ...summary,
      verdict: await this.verdicts.forEntity(a!.entityId),
      interventions: interventions.map((i) => ({
        id: i.id,
        action: i.action,
        actor: i.actor,
        note: i.note,
        at: i.at.toISOString(),
      })),
    };
  }

  async act(id: string, input: z.output<typeof AlertActionInput>, p: UserPrincipal) {
    const [a] = await this.db
      .select()
      .from(alert)
      .where(and(eq(alert.id, id), eq(alert.orgId, p.orgId)));
    if (!a) throw new NotFoundException("Alert not found");
    const recomputed = await this.db.transaction(async (tx) => {
      let ids: number[] = [];
      let caseId: string | undefined;
      if (input.action === "confirm_mule") {
        const callerEntityId =
          (a.request as { callerEntityId?: number | null } | null)?.callerEntityId ?? null;
        const r = await this.actions.confirmMule(tx, p, a.entityId, {
          callerEntityId,
          note: input.note,
        });
        ids = r.recomputed;
        caseId = r.caseId;
      }
      const status = STATUS_FOR_ACTION[input.action];
      await tx
        .update(alert)
        .set({
          ...(status ? { status } : {}),
          ...(status && TERMINAL.has(status) ? { resolvedAt: new Date() } : {}),
          ...(caseId ? { caseId } : {}),
          assignedTo: a.assignedTo ?? p.userId,
        })
        .where(eq(alert.id, id));
      await tx.insert(intervention).values({
        orgId: p.orgId,
        alertId: id,
        entityId: a.entityId,
        caseId: caseId ?? a.caseId,
        action: input.action,
        actor: p.userId,
        note: input.note,
        policyVersion: POLICY_VERSION,
      });
      await this.audit.log(p, `alert_${input.action}`, a.entityId, { alertId: id }, tx);
      return ids;
    });
    await this.verdicts.invalidate(recomputed);
    return this.get(id, p);
  }
}

@Controller()
export class BankController {
  constructor(
    private readonly bank: BankService,
    private readonly idem: IdempotencyService,
  ) {}

  @Route("payeeCheck")
  payeeCheck(
    @Body() input: PayeeInput,
    @CurrentPrincipal() p: Principal,
    @IdempotencyKey() key?: string,
  ) {
    const user = requireUser(p);
    return this.idem.run(`payee:${user.orgId}`, key, () => this.bank.payeeCheck(input, user));
  }

  @Route("listAlerts")
  list(@Query() q: z.output<typeof AlertListQuery>, @CurrentPrincipal() p: Principal) {
    return this.bank.list(q, requireUser(p));
  }

  @Route("getAlert")
  get(@UuidParam() id: string, @CurrentPrincipal() p: Principal) {
    return this.bank.get(id, requireUser(p));
  }

  @Route("alertAction")
  act(
    @UuidParam() id: string,
    @Body() input: z.output<typeof AlertActionInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.bank.act(id, input, requireUser(p));
  }
}
