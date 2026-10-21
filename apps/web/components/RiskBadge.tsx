import { CircleAlert, Info, PhoneCall, Search, ShieldX, TriangleAlert } from "lucide-react";
import { TIER_STYLE, type Tier, type TierIcon, tierLabel } from "@/lib/risk";
import { cn } from "@/lib/utils";

const ICONS: Record<TierIcon, typeof ShieldX> = {
  "shield-x": ShieldX,
  triangle: TriangleAlert,
  "circle-alert": CircleAlert,
  info: Info,
  search: Search,
  "phone-shield": PhoneCall,
};

export function TierIconFor({ tier, className }: { tier: string; className?: string }) {
  const Icon = ICONS[(TIER_STYLE[tier as Tier] ?? TIER_STYLE.no_known_risk).icon];
  return <Icon className={className} aria-hidden />;
}

export function RiskBadge({
  tier,
  risk,
  size = "sm",
}: {
  tier: string;
  risk?: number | null;
  size?: "sm" | "md";
}) {
  const s = TIER_STYLE[tier as Tier] ?? TIER_STYLE.no_known_risk;
  return (
    <span
      className={cn(
        "chip whitespace-nowrap",
        s.bg,
        s.border,
        s.text,
        size === "md" && "text-14 px-3 py-1.5",
      )}
    >
      <TierIconFor tier={tier} className={size === "md" ? "size-4" : "size-3.5"} />
      {tierLabel(tier).en}
      {risk !== undefined && risk !== null && tier !== "protected_official" && (
        <span className="font-semibold tabular-nums">· {risk}</span>
      )}
    </span>
  );
}
