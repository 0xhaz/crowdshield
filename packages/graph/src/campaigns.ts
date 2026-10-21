import { campaign } from "@crowdshield/db";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "./types.js";

/**
 * Campaign stats from its cases: reports in the last 24 h vs the daily baseline over the 14 days
 * before that; spike_z is a Poisson z-score, (observed - expected) / sqrt(expected).
 */
export async function refreshCampaignStats(db: DbOrTx, now = new Date()): Promise<void> {
  const at = now.toISOString(); // raw sql params don't serialise Date
  await db.execute(sql`
    WITH stats AS (
      SELECT c.campaign_id AS id,
             min(coalesce(c.occurred_at, c.reported_at)) AS first_seen,
             max(c.reported_at) AS last_seen,
             count(*) FILTER (WHERE c.reported_at > ${at}::timestamptz - interval '24 hours') AS r24,
             count(*) FILTER (WHERE c.reported_at <= ${at}::timestamptz - interval '24 hours'
                                AND c.reported_at > ${at}::timestamptz - interval '15 days') / 14.0 AS baseline
      FROM scam_case c WHERE c.campaign_id IS NOT NULL GROUP BY c.campaign_id
    )
    UPDATE ${campaign} SET
      first_seen = stats.first_seen,
      last_seen = stats.last_seen,
      reports_24h = stats.r24,
      baseline_daily = stats.baseline,
      spike_z = (stats.r24 - stats.baseline) / sqrt(greatest(stats.baseline, 1))
    FROM stats WHERE ${campaign}.id = stats.id`);
}
