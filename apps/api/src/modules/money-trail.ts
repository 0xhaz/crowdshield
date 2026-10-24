// Money trail from partner banks (architecture §9, partnership level 3). Banks trace and freeze
// funds among themselves through NSRC and the National Fraud Portal; they send CrowdShield the
// outcome: each hop, what was frozen, and where money was cashed out. CrowdShield links the accounts
// (money_flow edges taint downstream accounts only), so the next payee check, bot lookup or
// supplier check anywhere warns about them, and the other banks in the network get an alert.
import type { MoneyTrailInput } from "@crowdshield/contracts";
import {
  alert,
  cashoutEvent,
  entity,
  fundHop,
  observation,
  org,
  scamCase,
  source,
} from "@crowdshield/db";
import { type DbOrTx, recomputeWithNeighbours, upsertEdge, upsertEntity } from "@crowdshield/graph";
import { BadRequestException, Controller, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, type Principal, requireOrg } from "../common/auth.js";
import { IdempotencyService } from "../common/idempotency.js";
import { Body, IdempotencyKey, Route, UuidParam } from "../common/route.js";
import { VerdictService } from "../common/verdicts.js";
import { Config } from "../config.js";
import { type Db, InjectDb } from "../infra.js";

type Input = z.output<typeof MoneyTrailInput>;
type Account = Input["hops"][number]["from"];

/** Evidence weight of "a member bank traced scam money into this account" (below bank-confirmed 0.90 and
 * NSRC 0.85: the account hasn't been investigated yet). On a confirmed case it lands at "Be careful". */
const TRACE_SOURCE = {
  kind: "bank_trace",
  name: "Member bank trace: received scam money",
  baseWeight: 0.25,
};

/** Tiers worth telling the other banks about. */
const ALERT_TIERS = new Set(["reported", "caution", "high", "confirmed"]);

@Injectable()
export class MoneyTrailService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: Config,
    private readonly verdicts: VerdictService,
    private readonly audit: AuditService,
  ) {}

  private async resolve(tx: DbOrTx, a: Account, seenAt: Date): Promise<number> {
    if ("entityId" in a) {
      const [e] = await tx.select({ id: entity.id }).from(entity).where(eq(entity.id, a.entityId));
      if (!e) throw new BadRequestException(`Unknown account entity ${a.entityId}`);
      return e.id;
    }
    return (await upsertEntity(tx, this.config.secrets, a.type, a.value, { ...a, seenAt })).id;
  }

  /** Created on first use (outside the main transaction): see migration 0005. */
  private async traceSourceId(): Promise<number> {
    await this.db.execute(sql`
      INSERT INTO ${source} (kind, name, base_weight)
      SELECT ${TRACE_SOURCE.kind}, ${TRACE_SOURCE.name}, ${TRACE_SOURCE.baseWeight}
      WHERE NOT EXISTS (SELECT 1 FROM ${source} WHERE kind = ${TRACE_SOURCE.kind})`);
    const [row] = await this.db
      .select({ id: source.id })
      .from(source)
      .where(eq(source.kind, TRACE_SOURCE.kind as never));
    return row!.id;
  }

  async add(caseId: string, input: Input, p: Principal) {
    const { orgId } = requireOrg(p);
    const traceSource = await this.traceSourceId();
    const [c] = await this.db
      .select({ id: scamCase.id })
      .from(scamCase)
      .where(eq(scamCase.id, caseId));
    if (!c) throw new NotFoundException("Case not found");

    const result = await this.db.transaction(async (tx) => {
      const touched = new Set<number>();
      const received = new Map<number, { amount: number; from: number; rail?: string }>();
      let hopsAdded = 0;
      let hopsSkipped = 0;

      const known = new Set(
        (await tx.select({ ref: fundHop.txnRef }).from(fundHop).where(eq(fundHop.caseId, caseId)))
          .map((r) => r.ref)
          .filter(Boolean),
      );

      for (const h of input.hops) {
        if (h.txnRef && known.has(h.txnRef)) {
          hopsSkipped++;
          continue;
        }
        const at = new Date(h.at);
        const from = await this.resolve(tx, h.from, at);
        const to = h.to ? await this.resolve(tx, h.to, at) : null;
        if (to === from) throw new BadRequestException("A hop can't go from an account to itself");
        await tx.insert(fundHop).values({
          caseId,
          hopNo: h.hopNo,
          fromEntity: from,
          toEntity: to,
          amountMyr: h.amountMyr.toFixed(2),
          at,
          rail: h.rail,
          txnRef: h.txnRef,
          senderBank: h.senderBank,
          receiverBank: h.receiverBank,
          frozenMyr: h.frozenMyr.toFixed(2),
          reportedByOrg: orgId,
        });
        if (h.txnRef) known.add(h.txnRef);
        hopsAdded++;
        touched.add(from);
        if (to !== null) {
          // directed: risk flows to the account that received the money, never back to the sender
          await upsertEdge(tx, "money_flow", from, to, { amountMyr: h.amountMyr, at });
          // the bank's trace is evidence in its own right, so risk doesn't depend on how far down
          // the trail the account is (graph propagation is one hop)
          await tx
            .insert(observation)
            .values({
              caseId,
              entityId: to,
              role: "traced_recipient",
              sourceId: traceSource,
              observedAt: at,
            })
            .onConflictDoNothing();
          touched.add(to);
          const prev = received.get(to);
          received.set(to, {
            amount: (prev?.amount ?? 0) + h.amountMyr,
            from,
            rail: h.rail,
          });
        }
      }

      for (const co of input.cashouts) {
        const at = new Date(co.at);
        await tx.insert(cashoutEvent).values({
          caseId,
          entityId: await this.resolve(tx, co.from, at),
          at,
          method: co.method,
          locationRef: co.locationRef,
          state: co.state,
          amountMyr: co.amountMyr?.toFixed(2),
          reportedByOrg: orgId, // restricted to the reporting bank and law enforcement
        });
      }

      const recomputed = new Set<number>();
      for (const id of touched)
        for (const r of (await recomputeWithNeighbours(tx, id)).recomputed) recomputed.add(r);
      return { hopsAdded, hopsSkipped, received, recomputed: [...recomputed] };
    });

    await this.verdicts.invalidate(result.recomputed);
    const traced = [];
    for (const id of result.received.keys()) traced.push(await this.verdicts.forEntity(id));

    // Every other bank and e-wallet in the network hears about risky accounts the money reached
    const others = await this.db
      .select({ id: org.id })
      .from(org)
      .where(and(inArray(org.kind, ["bank", "ewallet"]), ne(org.id, orgId)));
    const rows = traced
      .filter((v) => ALERT_TIERS.has(v.tier) && v.entity.id !== null)
      .flatMap((v) => {
        const r = result.received.get(v.entity.id!)!;
        return others.map((o) => ({
          orgId: o.id,
          kind: "mule_pattern",
          entityId: v.entity.id!,
          caseId,
          risk: v.risk,
          tier: v.tier,
          amountMyr: r.amount.toFixed(2),
          rail: r.rail,
          request: { traced: v.entity.masked, amountMyr: r.amount, source: "money_trail" },
          verdict: v,
        }));
      });
    if (rows.length) await this.db.insert(alert).values(rows);

    await this.audit.log(p, "money_trail_added", null, {
      caseId,
      hops: result.hopsAdded,
      cashouts: input.cashouts.length,
      alerts: rows.length,
    });
    return {
      hopsAdded: result.hopsAdded,
      hopsSkipped: result.hopsSkipped,
      cashoutsAdded: input.cashouts.length,
      traced,
      alertsRaised: rows.length,
    };
  }
}

@Controller()
export class MoneyTrailController {
  constructor(
    private readonly trail: MoneyTrailService,
    private readonly idem: IdempotencyService,
  ) {}

  @Route("addMoneyTrail")
  add(
    @UuidParam() id: string,
    @Body() input: Input,
    @CurrentPrincipal() p: Principal,
    @IdempotencyKey() key?: string,
  ) {
    const { orgId } = requireOrg(p);
    return this.idem.run(`trail:${orgId}:${id}`, key, () => this.trail.add(id, input, p));
  }
}
