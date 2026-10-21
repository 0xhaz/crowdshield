import type { SupplierCheckResult } from "@crowdshield/contracts";
import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { z } from "zod";
import { cn } from "@/lib/utils";

const CHECK_TITLE: Record<string, string> = {
  ssm: "Company registration (SSM)",
  tin: "Tax ID (LHDN TIN)",
  einvoice: "e-Invoice (LHDN MyInvois)",
  account_name: "Account holder name",
  graph: "Scam reports (CrowdShield)",
  history: "Your payment history",
  email_domain: "Email domain",
  official_contact: "Official contact",
  web_reputation: "Web reputation",
};
const STATUS = {
  pass: { icon: CircleCheck, cls: "text-success-700", label: "Pass" },
  warn: { icon: TriangleAlert, cls: "text-risk-caution", label: "Warning" },
  fail: { icon: CircleX, cls: "text-risk-critical", label: "Problem" },
  unavailable: { icon: CircleHelp, cls: "text-gray-400", label: "Not available" },
} as const;
const RISK = {
  high: {
    cls: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
    title: "Do not pay yet",
    icon: CircleX,
  },
  caution: {
    cls: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
    title: "Check before paying",
    icon: TriangleAlert,
  },
  low: {
    cls: "border-success-100 bg-success-25 text-success-700",
    title: "No problems found",
    icon: CircleCheck,
  },
} as const;

export function CheckResult({ r }: { r: z.infer<typeof SupplierCheckResult> }) {
  const risk = RISK[r.risk];
  const order = { fail: 0, warn: 1, pass: 2, unavailable: 3 } as const;
  return (
    <div className="flex flex-col gap-6">
      <div className={cn("flex items-start gap-4 rounded-2xl border p-6", risk.cls)}>
        <risk.icon className="size-8 shrink-0" aria-hidden />
        <div className="flex flex-col gap-2">
          <h2 className="text-24 font-bold">{risk.title}</h2>
          <ul className="flex flex-col gap-1 text-16 text-gray-900">
            {r.actions.map((a) => (
              <li key={a.en}>• {a.en}</li>
            ))}
          </ul>
          {r.holdId && (
            <Link href="/sme/holds" className="btn-primary mt-2 self-start">
              Payment is on hold: open the callback checklist
            </Link>
          )}
        </div>
      </div>
      <section className="panel flex flex-col">
        <h2 className="panel-title mb-2">
          Checks{r.supplier ? ` · ${r.supplier.name}` : " · new supplier"}
        </h2>
        <ul className="divide-y divide-gray-200">
          {[...r.checks]
            .sort((a, b) => order[a.status] - order[b.status])
            .map((c) => {
              const s = STATUS[c.status];
              return (
                <li key={c.key} className="flex gap-3 py-3">
                  <s.icon className={cn("mt-0.5 size-5 shrink-0", s.cls)} aria-label={s.label} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-14 font-semibold text-gray-900">
                      {CHECK_TITLE[c.key] ?? c.key}
                    </p>
                    <p className="text-14 text-gray-700">{c.reason.en}</p>
                    <p className="text-12 text-gray-500">
                      {c.source}
                      {c.links?.map((l) => (
                        <a
                          key={l}
                          href={l}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ml-2 text-brand underline"
                        >
                          source
                        </a>
                      ))}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
