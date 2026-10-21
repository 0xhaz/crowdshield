import { cn, titleCase } from "@/lib/utils";

const STYLE: Record<string, string> = {
  open: "border-risk-high-border bg-risk-high-bg text-risk-high",
  in_review: "border-risk-info-border bg-risk-info-bg text-risk-info",
  held: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
  on_hold: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
  frozen: "border-risk-info-border bg-risk-info-bg text-risk-info",
  confirmed_mule: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
  confirmed: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
  rejected: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
  released: "border-success-100 bg-success-25 text-success-700",
  verified: "border-success-100 bg-success-25 text-success-700",
  cleared: "border-success-100 bg-success-25 text-success-700",
  upheld: "border-success-100 bg-success-25 text-success-700",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "chip whitespace-nowrap",
        STYLE[status] ?? "border-gray-200 bg-gray-50 text-gray-700",
      )}
    >
      {titleCase(status)}
    </span>
  );
}
