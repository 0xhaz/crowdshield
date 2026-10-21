// Consumer reports from the bot / app (architecture §9): one call creates the case, links the
// identifiers in the graph, recomputes their scores and returns verdicts plus the 997 call sheet.
import type { NsrcRefInput, ReportInput, Verdict } from "@crowdshield/contracts";
import {
  caseEvidence,
  incidentEvent,
  observation,
  reporter,
  scamCase,
  source,
} from "@crowdshield/db";
import {
  type DbOrTx,
  linkCaseEntities,
  recomputeWithNeighbours,
  refreshCampaignStats,
  upsertEntity,
} from "@crowdshield/graph";
import { SCAM_TYPE_LABEL, type Text } from "@crowdshield/i18n";
import { lookupHash, normalise } from "@crowdshield/normalise";
import { Controller, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, type Principal } from "../common/auth.js";
import { IdempotencyService } from "../common/idempotency.js";
import { Body, IdempotencyKey, Route, UuidParam } from "../common/route.js";
import { VerdictService } from "../common/verdicts.js";
import { Config } from "../config.js";
import { type Db, InjectDb } from "../infra.js";
import { caseSummaries } from "./cases.js";

type Input = z.output<typeof ReportInput>;
const DUPLICATE_WINDOW_DAYS = 7;

const myr = (n: number) =>
  `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const myTime = (iso: string) =>
  new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });

@Injectable()
export class ReportsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: Config,
    private readonly verdicts: VerdictService,
    private readonly audit: AuditService,
  ) {}

  async create(input: Input, p: Principal) {
    // Validate every identifier before writing anything (400 on a bad one)
    const normalised = input.identifiers.map((i) => ({ ...i, id: normalise(i.type, i.value, i) }));
    const reporterHash = lookupHash(
      `${input.reporter.channel}:${input.reporter.externalId}`,
      this.config.pepper,
    );
    const now = new Date();

    const result = await this.db.transaction(async (tx) => {
      const [rep] = await tx
        .insert(reporter)
        .values({
          kind: "consumer",
          externalRefHash: reporterHash,
          phoneVerified: input.reporter.phoneVerified,
          reportsTotal: 1,
        })
        .onConflictDoUpdate({
          target: reporter.externalRefHash,
          set: {
            reportsTotal: sql`${reporter.reportsTotal} + 1`,
            phoneVerified: sql`${reporter.phoneVerified} OR excluded.phone_verified`,
          },
        })
        .returning({ id: reporter.id });

      const entities = [];
      for (const n of normalised) {
        entities.push(
          await upsertEntity(tx, this.config.secrets, n.type, n.value, { ...n, seenAt: now }),
        );
      }
      const entityIds = entities.map((e) => e.id);

      // Same reporter, same identifiers, recently: not a new vote, return the earlier case
      const dup = await this.findDuplicate(tx, rep!.id, entityIds, now);
      if (dup) return { caseId: dup, duplicateOf: dup, entityIds, recomputed: [] as number[] };

      const [src] = await tx
        .select({ id: source.id })
        .from(source)
        .where(eq(source.kind, "user_report"));
      const campaignId = await this.campaignFor(tx, entityIds);
      const [c] = await tx
        .insert(scamCase)
        .values({
          sourceId: src!.id,
          reporterId: rep!.id,
          scamType: input.scamType,
          campaignId,
          lossMyr: input.lossMyr?.toFixed(2),
          nearMiss: !input.lossMyr,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          reportedAt: now,
          language: input.language,
          narrativeRedacted: input.narrative,
          // evidence is modelled by the verification multiplier (scoring.py)
          verification: input.evidence.length ? "evidence_attached" : "unverified",
          victimState: input.victimState,
          victimAgeBand: input.victimAgeBand,
          shareConsentAt: input.shareConsent ? now : undefined,
        })
        .returning({ id: scamCase.id });
      const caseId = c!.id;

      await tx
        .insert(observation)
        .values(
          normalised.map((n, i) => ({
            caseId,
            entityId: entityIds[i]!,
            role: n.role,
            sourceId: src!.id,
            reporterId: rep!.id,
            observedAt: now,
          })),
        )
        .onConflictDoNothing();
      if (input.evidence.length)
        await tx.insert(caseEvidence).values(input.evidence.map((e) => ({ caseId, ...e })));
      const events = [
        ...input.events.map((e) => ({
          caseId,
          at: new Date(e.at),
          channel: e.channel,
          kind: e.kind,
          durationSec: e.durationSec,
          detailRedacted: e.detail,
          entityId: e.identifierIndex === undefined ? undefined : entityIds[e.identifierIndex],
        })),
        // consumer transfers go on the timeline; bank-supplied fund_hop rows come from banks
        ...input.transfers.map((t) => ({
          caseId,
          at: new Date(t.at),
          channel: "transfer",
          kind: "transfer",
          entityId: entityIds[t.toIdentifierIndex],
          detailRedacted: `${myr(t.amountMyr)} via ${t.rail ?? "transfer"}${t.txnRef ? `, ref ${t.txnRef}` : ""}`,
        })),
        { caseId, at: now, channel: "other", kind: "report" },
      ];
      await tx.insert(incidentEvent).values(events);

      await linkCaseEntities(tx, caseId, now);
      const recomputed = new Set<number>();
      for (const id of entityIds)
        for (const r of (await recomputeWithNeighbours(tx, id, now)).recomputed) recomputed.add(r);
      if (campaignId) await refreshCampaignStats(tx, now);
      return { caseId, duplicateOf: null, entityIds, recomputed: [...recomputed] };
    });

    await this.verdicts.invalidate(result.recomputed);
    const verdicts: Verdict[] = [];
    for (const id of result.entityIds) verdicts.push(await this.verdicts.forEntity(id));
    await this.audit.log(p, result.duplicateOf ? "report_duplicate" : "report_created", null, {
      caseId: result.caseId,
      n: result.entityIds.length,
    });
    return {
      caseId: result.caseId,
      duplicateOf: result.duplicateOf,
      verdicts,
      callSheet: this.callSheet(input, normalised),
    };
  }

  async addNsrcRef(caseId: string, input: z.output<typeof NsrcRefInput>, p: Principal) {
    const recomputed = await this.db.transaction(async (tx) => {
      const [c] = await tx
        .update(scamCase)
        .set({
          nsrcRef: input.nsrcRef,
          policeReportNo: input.policeReportNo,
          // An NSRC reference the victim got from 997 lifts the case to "reviewed" (x1.6); it becomes
          // NSRC-confirmed evidence only once NSRC itself confirms it (partnership level 1+)
          verification: sql`CASE WHEN ${scamCase.verification} IN ('unverified', 'evidence_attached') THEN 'reviewed' ELSE ${scamCase.verification} END`,
        })
        .where(eq(scamCase.id, caseId))
        .returning({ id: scamCase.id });
      if (!c) throw new NotFoundException("Case not found");
      const obs = await tx
        .select({ id: observation.entityId })
        .from(observation)
        .where(eq(observation.caseId, caseId));
      const all = new Set<number>();
      for (const o of obs)
        for (const r of (await recomputeWithNeighbours(tx, o.id)).recomputed) all.add(r);
      return [...all];
    });
    await this.verdicts.invalidate(recomputed);
    await this.audit.log(p, "report_nsrc_ref", null, { caseId });
    const [summary] = await caseSummaries(this.db, [caseId]);
    return summary!;
  }

  private async findDuplicate(tx: DbOrTx, reporterId: string, entityIds: number[], now: Date) {
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000);
    const rows = await tx
      .select({ caseId: scamCase.id, n: sql<number>`count(DISTINCT ${observation.entityId})::int` })
      .from(scamCase)
      .innerJoin(observation, eq(observation.caseId, scamCase.id))
      .where(
        and(
          eq(scamCase.reporterId, reporterId),
          gt(scamCase.reportedAt, since),
          inArray(observation.entityId, entityIds),
        ),
      )
      .groupBy(scamCase.id)
      .orderBy(desc(scamCase.reportedAt));
    return rows.find((r) => r.n === new Set(entityIds).size)?.caseId ?? null;
  }

  /** A report joins the campaign most of its identifiers already belong to (known scam, rotated identifiers). */
  private async campaignFor(tx: DbOrTx, entityIds: number[]) {
    const [row] = await tx
      .select({ id: scamCase.campaignId, n: sql<number>`count(*)::int` })
      .from(observation)
      .innerJoin(scamCase, eq(scamCase.id, observation.caseId))
      .where(and(inArray(observation.entityId, entityIds), sql`${scamCase.campaignId} IS NOT NULL`))
      .groupBy(scamCase.campaignId)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    return row?.id ?? undefined;
  }

  /**
   * Pre-filled sheet the victim reads from while calling NSRC 997 (architecture §9). It is built
   * from this request and returned to the reporter only; full values are never stored unencrypted.
   */
  private callSheet(input: Input, ids: { type: string; role: string; id: { value: string } }[]) {
    const lines: { label: Text; value: string }[] = [];
    const add = (en: string, ms: string, value: string | undefined) =>
      value && lines.push({ label: { en, ms }, value });
    add("Scam type", "Jenis scam", input.scamType ? SCAM_TYPE_LABEL[input.scamType].en : undefined);
    add("When it started", "Bila bermula", input.occurredAt ? myTime(input.occurredAt) : undefined);
    add("Total lost", "Jumlah kerugian", input.lossMyr ? myr(input.lossMyr) : undefined);
    input.transfers.forEach((t, i) => {
      const to = ids[t.toIdentifierIndex];
      add(
        `Transfer ${i + 1}`,
        `Pemindahan ${i + 1}`,
        [
          myTime(t.at),
          myr(t.amountMyr),
          t.rail?.toUpperCase(),
          to && `to ${to.id.value}`,
          t.txnRef && `ref ${t.txnRef}`,
          t.senderBank && `from ${t.senderBank}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    });
    const contacts = ids
      .filter((i) => ["caller", "messenger"].includes(i.role))
      .map((i) => `${i.id.value} (${i.type})`);
    add("Scammer's numbers / accounts", "Nombor / akaun penipu", contacts.join(", ") || undefined);
    const payees = ids.filter((i) => i.role === "payee_account").map((i) => i.id.value);
    add(
      "Accounts you were told to pay",
      "Akaun yang diminta untuk bayar",
      payees.join(", ") || undefined,
    );
    const links = ids
      .filter((i) => ["link_sent", "app_installed"].includes(i.role))
      .map((i) => i.id.value);
    add("Links / apps", "Pautan / aplikasi", links.join(", ") || undefined);
    add("Your state", "Negeri anda", input.victimState);
    return {
      title: { en: "Call NSRC 997 now", ms: "Hubungi NSRC 997 sekarang" },
      lines,
      reminder: {
        en: "NSRC answers 24/7. The faster you call, the more money can be frozen. Keep this open during the call, then send us the reference number they give you.",
        ms: "NSRC beroperasi 24/7. Lebih cepat anda menelefon, lebih banyak wang boleh dibekukan. Buka helaian ini semasa panggilan, kemudian hantar nombor rujukan yang diberi kepada kami.",
      },
    };
  }
}

@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly idem: IdempotencyService,
  ) {}

  @Route("createReport")
  create(@Body() input: Input, @CurrentPrincipal() p: Principal, @IdempotencyKey() key?: string) {
    return this.idem.run("report", key, () => this.reports.create(input, p));
  }

  @Route("addNsrcRef")
  addNsrcRef(
    @UuidParam() id: string,
    @Body() input: z.output<typeof NsrcRefInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.reports.addNsrcRef(id, input, p);
  }
}
