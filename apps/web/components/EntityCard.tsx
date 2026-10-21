import type { EntitySummary } from "@crowdshield/contracts";
import Link from "next/link";
import type { z } from "zod";
import { scamLabel, TIER_STYLE, type Tier, tierLabel } from "@/lib/risk";
import { cn, timeAgo, titleCase } from "@/lib/utils";
import { TierIconFor } from "./RiskBadge";

/** banking-main's BankCard, for a scored entity: masked identifier, tier, evidence count. */
export function EntityCard({ e, ghost }: { e: z.infer<typeof EntitySummary>; ghost?: boolean }) {
  const s = TIER_STYLE[e.tier as Tier];
  const dark = e.tier === "confirmed" || e.tier === "high";
  if (ghost) {
    // the card peeking out behind the first one in a stack (banking-main's right sidebar)
    return (
      <div
        aria-hidden
        className={cn(
          "h-[170px] w-full max-w-[320px] rounded-[20px] border shadow-creditCard",
          dark ? "border-white bg-brand-dark-gradient opacity-60" : cn("bg-white", s.border),
        )}
      />
    );
  }
  return (
    <Link
      href={`/bank/entities/${e.id}`}
      className={cn(
        "relative flex h-[170px] w-full max-w-[320px] flex-col justify-between overflow-hidden rounded-[20px] border p-5 shadow-creditCard transition hover:-translate-y-0.5",
        dark ? "border-white bg-brand-dark-gradient text-white" : cn("bg-white", s.border),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-12 font-semibold uppercase tracking-wide",
              dark ? "text-white/80" : "text-gray-500",
            )}
          >
            {titleCase(e.type)}
          </p>
          <p className="mt-1 truncate font-mono text-18 font-semibold">{e.masked}</p>
        </div>
        <span
          className={cn(
            "chip shrink-0",
            dark ? "border-white/30 bg-white/15 text-white" : cn(s.bg, s.border, s.text),
          )}
        >
          <TierIconFor tier={e.tier} className="size-3.5" />
          {tierLabel(e.tier).en}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate text-14", dark ? "text-white/90" : "text-gray-700")}>
            {e.topScamTypes.length ? scamLabel(e.topScamTypes[0]) : "No scam type yet"}
          </p>
          <p className={cn("text-12", dark ? "text-white/70" : "text-gray-500")}>
            {e.nCases} case(s) · seen {timeAgo(e.lastSeen)}
          </p>
        </div>
        {e.tier !== "protected_official" && (
          <p className="text-30 font-bold tabular-nums">{e.risk}</p>
        )}
      </div>
      {dark && (
        <div
          className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10"
          aria-hidden
        />
      )}
    </Link>
  );
}
