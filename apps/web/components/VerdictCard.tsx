import type { Verdict } from "@crowdshield/contracts";
import { TIER_STYLE, type Tier, scamLabel } from "@/lib/risk";
import { cn, timeAgo } from "@/lib/utils";
import { TierIconFor } from "./RiskBadge";

/** The verdict card from techstacks §11, as used in the bot, app and portals. */
export function VerdictCard({
  v,
  compact,
  className,
}: {
  v: Verdict;
  compact?: boolean;
  className?: string;
}) {
  const s = TIER_STYLE[v.tier as Tier];
  return (
    <article
      className={cn("rounded-xl border bg-white p-5 shadow-chart", s.border, className)}
      aria-label={`Verdict: ${v.tierLabel.en}`}
    >
      <div className={cn("flex items-center gap-2", s.text)}>
        <span className={cn("flex-center size-8 rounded-full", s.bg)}>
          <TierIconFor tier={v.tier} className="size-4" />
        </span>
        <span className="text-14 font-bold uppercase tracking-wide">
          {v.tierLabel.en} · <span className="normal-case">{v.tierLabel.ms}</span>
        </span>
        {v.tier !== "protected_official" && v.tier !== "no_known_risk" && (
          <span className="ml-auto text-24 font-bold tabular-nums">{v.risk}</span>
        )}
      </div>
      <p className="mt-3 font-mono text-18 text-gray-900">{v.entity.masked}</p>
      {v.topScamTypes.length > 0 && (
        <p className="mt-1 text-14 text-gray-600">{v.topScamTypes.map(scamLabel).join(", ")}</p>
      )}
      {!compact && v.explanation.length > 0 && (
        <ul className="mt-3 space-y-1 text-14 text-gray-700">
          {v.explanation.slice(0, 5).map((e) => (
            <li key={`${e.source}-${e.line.en}`} className="flex gap-2">
              <span aria-hidden>•</span>
              {e.line.en}
            </li>
          ))}
        </ul>
      )}
      {v.campaign && !compact && (
        <p className="mt-2 text-14 text-gray-600">
          Campaign: <span className="font-medium text-gray-900">{v.campaign.label}</span>
        </p>
      )}
      <p className="mt-3 text-14 text-gray-900">
        <b>What to do:</b> {v.action.en}
      </p>
      {!compact && (
        <p className="mt-2 text-12 text-gray-500">
          {v.confidence ? `Confidence: ${v.confidence}` : "No evidence yet"}
          {v.lastReportedAt ? ` · last reported ${timeAgo(v.lastReportedAt)}` : ""}
          {` · ${v.independentSources} independent source(s) · ${v.nCases} case(s)`}
        </p>
      )}
    </article>
  );
}
