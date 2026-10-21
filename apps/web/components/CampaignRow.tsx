import type { z } from "zod";
import type { Campaign } from "@crowdshield/contracts";
import { Radar, TrendingUp } from "lucide-react";
import { scamLabel } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { Progress } from "./ui/progress";

type C = z.infer<typeof Campaign>;

/** banking-main's Category row, for scam campaigns: reports in 24 h vs the busiest campaign. */
export function CampaignRow({ c, max }: { c: C; max: number }) {
  const spiking = c.spikeZ >= 3;
  return (
    <div
      className={cn("flex gap-[18px] rounded-xl p-4", spiking ? "bg-risk-high-bg" : "bg-blue-25")}
    >
      <figure
        className={cn(
          "flex-center size-10 shrink-0 rounded-full",
          spiking ? "bg-risk-high-border" : "bg-blue-100",
        )}
      >
        {spiking ? (
          <TrendingUp className="size-5 text-risk-high" aria-hidden />
        ) : (
          <Radar className="size-5 text-blue-700" aria-hidden />
        )}
      </figure>
      <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
        <div className="text-14 flex justify-between gap-2">
          <h2
            className={cn("truncate font-medium", spiking ? "text-risk-high" : "text-blue-900")}
            title={c.label}
          >
            {c.label}
          </h2>
          <span
            className={cn(
              "shrink-0 font-normal tabular-nums",
              spiking ? "text-risk-high" : "text-blue-700",
            )}
          >
            {c.reports24h}/24h
          </span>
        </div>
        <Progress
          value={max ? (c.reports24h / max) * 100 : 0}
          aria-label={`${c.reports24h} reports in 24 hours`}
          className={cn("h-2 w-full", spiking ? "bg-risk-high-border" : "bg-blue-100")}
          indicatorClassName={cn("h-2 w-full", spiking ? "bg-risk-high-solid" : "bg-blue-700")}
        />
        <p className="text-12 text-gray-600">
          {scamLabel(c.scamType)} · {c.totalCases} cases
          {spiking && <b className="text-risk-high"> · spiking (z {c.spikeZ.toFixed(1)})</b>}
        </p>
      </div>
    </div>
  );
}
