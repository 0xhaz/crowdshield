// Read path for every check: normalise → hash → one indexed read of entity_score → verdict.
// No model calls here (techstacks §2 latency targets). Cached in Redis; cache entries are
// dropped whenever the entity is recomputed.
import type { Verdict } from "@crowdshield/contracts";
import { campaign, entity, entityScore, observation, scamCase } from "@crowdshield/db";
import type { DbOrTx, Explanation } from "@crowdshield/graph";
import {
  APPEAL_LINE,
  fill,
  GRAPH_LINE,
  SCAM_TYPE_ACTION,
  type ScamTypeKey,
  SOURCE_LINE,
  type Text,
  TIER_ACTION,
  TIER_LABEL,
  type TierKey,
} from "@crowdshield/i18n";
import { identify, type IdentifierType, type NormaliseOptions } from "@crowdshield/normalise";
import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { Config } from "../config.js";
import { type Db, InjectDb, InjectRedis } from "../infra.js";

const CACHE_TTL_S = 300;
const cacheKey = (type: string, hash: Buffer) => `verdict:v1:${type}:${hash.toString("hex")}`;

type ScoreRow = typeof entityScore.$inferSelect;

export interface IdentifierLike extends NormaliseOptions {
  type: IdentifierType;
  value: string;
}

@Injectable()
export class VerdictService {
  private readonly log = new Logger("verdicts");

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly config: Config,
  ) {}

  /** Verdict for a raw identifier. Unknown identifiers get "No reports found", never "safe". */
  async lookup(input: IdentifierLike): Promise<Verdict> {
    const id = identify(input.type, input.value, this.config.pepper, input);
    const key = cacheKey(input.type, id.lookupHash);
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as Verdict;

    const [row] = await this.db
      .select({ id: entity.id, masked: entity.displayMasked, protected: entity.protected })
      .from(entity)
      .where(and(eq(entity.type, input.type), eq(entity.lookupHash, id.lookupHash)));
    const verdict = row
      ? await this.forEntity(row.id)
      : this.build({ id: null, type: input.type, masked: id.masked, protected: false }, null, null);
    await this.redis.set(key, JSON.stringify(verdict), "EX", CACHE_TTL_S).catch(() => undefined);
    return verdict;
  }

  async forEntity(entityId: number, db: DbOrTx = this.db): Promise<Verdict> {
    const [row] = await db
      .select({
        e: {
          id: entity.id,
          type: entity.type,
          masked: entity.displayMasked,
          protected: entity.protected,
        },
        s: entityScore,
      })
      .from(entity)
      .leftJoin(entityScore, eq(entityScore.entityId, entity.id))
      .where(eq(entity.id, entityId));
    if (!row) throw new Error(`entity ${entityId} not found`);
    const camp = await this.campaignFor(entityId, db);
    return this.build({ ...row.e, type: row.e.type as IdentifierType }, row.s, camp);
  }

  async forEntities(ids: number[]): Promise<Map<number, Verdict>> {
    const out = new Map<number, Verdict>();
    for (const id of new Set(ids)) out.set(id, await this.forEntity(id));
    return out;
  }

  /** Drop cached verdicts for recomputed entities. */
  async invalidate(entityIds: number[]): Promise<void> {
    if (!entityIds.length) return;
    const rows = await this.db
      .select({ type: entity.type, hash: entity.lookupHash })
      .from(entity)
      .where(inArray(entity.id, entityIds));
    const keys = rows.map((r) => cacheKey(r.type, r.hash));
    if (keys.length)
      await this.redis
        .del(...keys)
        .catch((e: Error) => this.log.warn(`cache invalidation failed: ${e.message}`));
  }

  private async campaignFor(entityId: number, db: DbOrTx) {
    const [c] = await db
      .select({ id: campaign.id, label: campaign.label, reports24h: campaign.reports24h })
      .from(observation)
      .innerJoin(scamCase, eq(scamCase.id, observation.caseId))
      .innerJoin(campaign, eq(campaign.id, scamCase.campaignId))
      .where(eq(observation.entityId, entityId))
      .groupBy(campaign.id)
      .orderBy(desc(sql`count(*)`), desc(campaign.spikeZ))
      .limit(1);
    return c ?? null;
  }

  build(
    e: { id: number | null; type: IdentifierType; masked: string; protected: boolean },
    s: ScoreRow | null,
    camp: Verdict["campaign"],
  ): Verdict {
    const tier = (s?.tier ?? "no_known_risk") as TierKey;
    const topScamTypes = (s?.topScamTypes ?? []) as ScamTypeKey[];
    const ex = (s?.explanation ?? null) as Explanation | null;
    const explanation: Verdict["explanation"] = [];
    if (ex && tier !== "protected_official") {
      for (const src of ex.sources) {
        const tmpl = SOURCE_LINE[src.kind as keyof typeof SOURCE_LINE];
        if (tmpl)
          explanation.push({
            line: fill(tmpl, { n: src.count }),
            source: src.kind,
            count: src.count,
          });
      }
      for (const g of ex.graph.slice(0, 3)) {
        const tmpl = GRAPH_LINE[g.kind as keyof typeof GRAPH_LINE];
        if (tmpl)
          explanation.push({
            line: fill(tmpl, { masked: g.masked }),
            source: `graph:${g.kind}`,
            count: 1,
          });
      }
      if (ex.appealUpheld) explanation.push({ line: APPEAL_LINE, source: "appeal", count: 1 });
    }
    const lastReportedAt =
      ex?.sources.reduce<string | null>(
        (max, x) => (!max || x.lastSeen > max ? x.lastSeen : max),
        null,
      ) ?? null;
    return {
      entity: { id: e.id, type: e.type, masked: e.masked, protected: e.protected },
      risk: s?.risk ?? 0,
      tier,
      tierLabel: TIER_LABEL[tier],
      confidence: s && tier !== "no_known_risk" ? (s.confidence as Verdict["confidence"]) : null,
      topScamTypes,
      nCases: s?.nCases ?? 0,
      independentSources: s?.nIndependentReporters ?? 0,
      lastReportedAt,
      explanation,
      action: actionFor(tier, topScamTypes),
      campaign: tier === "protected_official" ? null : camp,
      computedAt: s?.computedAt.toISOString() ?? null,
    };
  }
}

export function actionFor(tier: TierKey, scamTypes: ScamTypeKey[]): Text {
  if (tier === "high" || tier === "confirmed") {
    const specific = scamTypes.map((t) => SCAM_TYPE_ACTION[t]).find(Boolean);
    if (specific) return specific;
  }
  return TIER_ACTION[tier];
}

/** Same cut-offs as scoring.py TIERS. */
export function tierForRisk(risk: number): Exclude<TierKey, "protected_official"> {
  return risk >= 85
    ? "confirmed"
    : risk >= 60
      ? "high"
      : risk >= 30
        ? "caution"
        : risk >= 1
          ? "reported"
          : "no_known_risk";
}
