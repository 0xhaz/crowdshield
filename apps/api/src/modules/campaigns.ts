// Scam campaigns from scripts (architecture §8): every report's message is redacted by the gateway,
// embedded (Qwen3-Embedding, 1024 dims) and stored in pgvector. A new report joins a known campaign
// when its script is close enough; unmatched scripts form a novelty pool that is clustered into
// candidate campaigns, labelled by Nemotron, and confirmed or dismissed by a person.
import type { AiTrace, CampaignReviewInput } from "@crowdshield/contracts";
import { campaign, scamCase, scriptSnippet } from "@crowdshield/db";
import { type DbOrTx, refreshCampaignStats } from "@crowdshield/graph";
import { Controller, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { actorId, CurrentPrincipal, type Principal } from "../common/auth.js";
import { MlClient } from "../common/ml.js";
import { Body, IdParam, Route } from "../common/route.js";
import { type Db, InjectDb, InjectRedis } from "../infra.js";
import { campaignList } from "./entities.js";

/** Calibrated on Qwen3-Embedding: same scam 0.65–0.80, different scams 0.26–0.66 (docs/model-choices.md). */
export const MATCH_SIMILARITY = 0.72;
export const CLUSTER_SIMILARITY = 0.68;
export const CLUSTER_MIN_REPORTS = 3;
const POOL_DAYS = 30;

type Trace = z.output<typeof AiTrace>;
type Embedded = { items: { redacted: string; embedding: number[] }[]; trace: Trace };
type Label = {
  label: string;
  scamType: string;
  summary: { en: string; ms: string };
  keyPhrases: string[];
  warning: { en: string; ms: string };
  model: string;
  promptVersion: string;
};
export type Nearest = {
  id: number;
  label: string;
  status: string;
  reports24h: number;
  scamType: string | null;
  similarity: number;
};

const vec = (v: number[]) => `[${v.join(",")}]`;
const round = (x: number) => Math.round(x * 1000) / 1000;

@Injectable()
export class CampaignService {
  private readonly log = new Logger("campaigns");
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly ml: MlClient,
    private readonly audit: AuditService,
  ) {}

  embed(texts: string[]) {
    return this.ml.post<Embedded>("/v1/embed", { texts }, 15_000);
  }

  /** Closest campaign (active or awaiting review) by its member scripts, cosine similarity. */
  async nearest(embedding: number[], db: DbOrTx = this.db): Promise<Nearest | null> {
    const rows = await db.execute<{
      id: string;
      label: string;
      status: string;
      reports_24h: number;
      scam_type: string | null;
      similarity: number;
    }>(sql`
      WITH near AS (
        SELECT s.campaign_id, 1 - (s.embedding <=> ${vec(embedding)}::vector) AS similarity
        FROM ${scriptSnippet} s
        WHERE s.campaign_id IS NOT NULL AND s.embedding IS NOT NULL
        ORDER BY s.embedding <=> ${vec(embedding)}::vector
        LIMIT 20
      )
      SELECT c.id, c.label, c.status, c.reports_24h, c.scam_type, max(near.similarity) AS similarity
      FROM near JOIN ${campaign} c ON c.id = near.campaign_id
      WHERE c.status IN ('active', 'candidate')
      GROUP BY c.id ORDER BY similarity DESC LIMIT 1`);
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      label: r.label,
      status: r.status,
      reports24h: r.reports_24h,
      scamType: r.scam_type,
      similarity: round(Number(r.similarity)),
    };
  }

  /** What a consumer is told: only reviewed (active) campaigns above the match threshold. */
  static shown(n: Nearest | null) {
    return n && n.status === "active" && n.similarity >= MATCH_SIMILARITY ? n : null;
  }

  async match(text: string) {
    const { items, trace } = await this.embed([text]);
    const n = CampaignService.shown(await this.nearest(items[0]!.embedding));
    return {
      campaign: n && { id: n.id, label: n.label, reports24h: n.reports24h, scamType: n.scamType },
      similarity: n?.similarity ?? null,
      trace,
    };
  }

  /**
   * Stores a report's script (redacted by the gateway) and joins it to a campaign: the one its
   * identifiers already gave the case, or the nearest by script. Best effort: a report never fails
   * because the embedding service is down.
   */
  async attachScript(caseId: string, text: string, language: string | undefined) {
    let embedded: Embedded;
    try {
      embedded = await this.embed([text]);
    } catch {
      return null;
    }
    const { redacted, embedding } = embedded.items[0]!;
    const result = await this.db.transaction(async (tx) => {
      const [c] = await tx
        .select({ campaignId: scamCase.campaignId })
        .from(scamCase)
        .where(eq(scamCase.id, caseId));
      const near = await this.nearest(embedding, tx);
      const byScript = near && near.similarity >= MATCH_SIMILARITY ? near : null;
      const campaignId = c?.campaignId ?? byScript?.id ?? null;
      await tx.insert(scriptSnippet).values({
        caseId,
        textRedacted: redacted,
        language,
        embedding,
        campaignId,
      });
      if (!c?.campaignId && byScript) {
        await tx.update(scamCase).set({ campaignId: byScript.id }).where(eq(scamCase.id, caseId));
        await refreshCampaignStats(tx);
      }
      return { campaignId, shown: CampaignService.shown(byScript) };
    });
    if (result.campaignId === null) void this.detectSoon();
    const n = result.shown;
    return n && { id: n.id, label: n.label, reports24h: n.reports24h, similarity: n.similarity };
  }

  /** Runs detection in the background after a new unmatched script (one run at a time). */
  async detectSoon() {
    try {
      await this.detect();
    } catch (e) {
      this.log.warn(`detection failed: ${(e as Error).message}`);
    }
  }

  /**
   * Clusters the novelty pool (scripts without a campaign, last 30 days): greedy, densest script
   * first, members at cosine ≥ 0.68. Each cluster of 3+ reports becomes a candidate campaign
   * labelled by Nemotron (summary, repeated phrases, draft warning) for a person to review.
   */
  async detect(p?: Principal) {
    const lock = await this.redis
      .set("lock:campaign-detect", "1", "EX", 120, "NX")
      .catch(() => "OK");
    if (lock !== "OK") return { checked: 0, created: [] };
    try {
      const pool = await this.db.execute<{ id: string; case_id: string | null; text: string }>(sql`
        SELECT s.id, s.case_id, s.text_redacted AS text
        FROM ${scriptSnippet} s LEFT JOIN ${scamCase} c ON c.id = s.case_id
        WHERE s.campaign_id IS NULL AND s.embedding IS NOT NULL
          AND (c.reported_at IS NULL OR c.reported_at > now() - make_interval(days => ${POOL_DAYS}))`);
      const byId = new Map(pool.map((r) => [Number(r.id), r]));
      const ids = [...byId.keys()];
      if (ids.length < CLUSTER_MIN_REPORTS) return { checked: ids.length, created: [] };
      const pairs = await this.db.execute<{ a: string; b: string }>(sql`
        SELECT a.id AS a, b.id AS b
        FROM ${scriptSnippet} a JOIN ${scriptSnippet} b ON a.id < b.id
        WHERE a.id IN (${sql.join(ids, sql`, `)}) AND b.id IN (${sql.join(ids, sql`, `)})
          AND 1 - (a.embedding <=> b.embedding) >= ${CLUSTER_SIMILARITY}`);
      const near = new Map<number, Set<number>>(ids.map((i) => [i, new Set()]));
      for (const { a, b } of pairs) {
        near.get(Number(a))!.add(Number(b));
        near.get(Number(b))!.add(Number(a));
      }

      const clusters: number[][] = [];
      const left = new Set(ids);
      for (;;) {
        let seed: number | undefined;
        let best = 0;
        for (const i of left) {
          const n = [...near.get(i)!].filter((j) => left.has(j)).length;
          if (n > best) [seed, best] = [i, n];
        }
        if (seed === undefined || best + 1 < CLUSTER_MIN_REPORTS) break;
        const members = [seed, ...[...near.get(seed)!].filter((j) => left.has(j))];
        // distinct cases only: one victim forwarding the same message twice is not a campaign
        const cases = new Set(members.map((m) => byId.get(m)!.case_id ?? `s${m}`));
        members.forEach((m) => left.delete(m));
        if (cases.size >= CLUSTER_MIN_REPORTS) clusters.push(members);
      }

      const created = [];
      for (const members of clusters) {
        let label: Label;
        try {
          label = await this.ml.post<Label>(
            "/v1/campaigns/label",
            { snippets: members.map((m) => byId.get(m)!.text) },
            120_000,
          );
        } catch {
          continue; // stays in the pool for the next run
        }
        const caseIds = [
          ...new Set(members.map((m) => byId.get(m)!.case_id).filter((x): x is string => !!x)),
        ];
        const id = await this.db.transaction(async (tx) => {
          const now = new Date();
          const [c] = await tx
            .insert(campaign)
            .values({
              label: label.label.slice(0, 80),
              scamType: label.scamType as never,
              firstSeen: now,
              lastSeen: now,
              status: "candidate",
              origin: "detected",
              summary: {
                summary: label.summary,
                keyPhrases: label.keyPhrases,
                warning: label.warning,
                model: label.model,
                promptVersion: label.promptVersion,
              },
            })
            .returning({ id: campaign.id });
          await tx
            .update(scriptSnippet)
            .set({ campaignId: c!.id })
            .where(inArray(scriptSnippet.id, members));
          if (caseIds.length)
            await tx
              .update(scamCase)
              .set({ campaignId: c!.id })
              .where(and(inArray(scamCase.id, caseIds), isNull(scamCase.campaignId)));
          await refreshCampaignStats(tx, now);
          return c!.id;
        });
        created.push({ id, label: label.label, reports: caseIds.length || members.length });
        await this.audit.log(p, "campaign_detected", null, { campaignId: id, n: members.length });
      }
      return { checked: ids.length, created };
    } finally {
      await this.redis.del("lock:campaign-detect").catch(() => undefined);
    }
  }

  async review(id: number, input: z.output<typeof CampaignReviewInput>, p: Principal) {
    const status = input.decision === "confirm" ? "active" : "dismissed";
    const [c] = await this.db
      .update(campaign)
      .set({ status, reviewedBy: actorId(p), reviewedAt: new Date() })
      .where(eq(campaign.id, id))
      .returning({ id: campaign.id });
    if (!c) throw new NotFoundException("Campaign not found");
    // A dismissed cluster releases its cases; its scripts stay put so they aren't re-proposed
    if (status === "dismissed")
      await this.db.update(scamCase).set({ campaignId: null }).where(eq(scamCase.campaignId, id));
    await this.audit.log(p, `campaign_${input.decision}`, null, { campaignId: id });
    const [row] = (await campaignList(this.db, 200, true)).filter((x) => x.id === id);
    return row!;
  }

  /** Embeds case narratives that have no script yet (seeded demo data); they inherit the case's campaign. */
  async backfill() {
    const rows = await this.db
      .select({
        id: scamCase.id,
        text: scamCase.narrativeRedacted,
        language: scamCase.language,
        campaignId: scamCase.campaignId,
      })
      .from(scamCase)
      .leftJoin(scriptSnippet, eq(scriptSnippet.caseId, scamCase.id))
      .where(and(isNull(scriptSnippet.id), sql`length(${scamCase.narrativeRedacted}) >= 30`));
    let embedded = 0;
    for (let i = 0; i < rows.length; i += 32) {
      const batch = rows.slice(i, i + 32);
      const { items } = await this.embed(batch.map((r) => r.text!));
      await this.db.insert(scriptSnippet).values(
        batch.map((r, j) => ({
          caseId: r.id,
          textRedacted: items[j]!.redacted,
          language: r.language,
          embedding: items[j]!.embedding,
          campaignId: r.campaignId,
        })),
      );
      embedded += batch.length;
    }
    return { embedded };
  }
}

@Controller()
export class CampaignsController {
  constructor(private readonly campaigns: CampaignService) {}

  @Route("campaignMatch")
  match(@Body() input: { text: string }) {
    return this.campaigns.match(input.text);
  }

  @Route("detectCampaigns")
  detect(@CurrentPrincipal() p: Principal) {
    return this.campaigns.detect(p);
  }

  @Route("reviewCampaign")
  review(
    @IdParam(true) id: number,
    @Body() input: z.output<typeof CampaignReviewInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.campaigns.review(id, input, p);
  }

  @Route("backfillScripts")
  backfill() {
    return this.campaigns.backfill();
  }
}
