import { PhoneCall } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { HeaderBox } from "@/components/HeaderBox";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusChip } from "@/components/StatusChip";
import { VerdictCard } from "@/components/VerdictCard";
import { alertAction } from "@/lib/actions/bank";
import { api } from "@/lib/api";
import { formatDateTime, formatMyr, titleCase } from "@/lib/utils";

const OPEN = new Set(["open", "in_review", "held"]);

export default async function AlertDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await (await api()).call("getAlert", { params: { id } });
  return (
    <section className="page">
      <HeaderBox
        title={`Alert · ${a.entity.masked}`}
        subtext={
          a.kind === "mule_pattern"
            ? `Money trail ${formatDateTime(a.createdAt)} · received ${formatMyr(a.amountMyr)} from a scam case, traced by another bank`
            : `Payee check ${formatDateTime(a.createdAt)} · ${formatMyr(a.amountMyr)} via ${a.rail?.toUpperCase() ?? "transfer"}`
        }
        actions={
          <div className="flex items-center gap-2">
            <RiskBadge tier={a.tier} risk={a.risk} size="md" />
            <StatusChip status={a.status} />
          </div>
        }
      />
      {a.callSignal && (
        <p className="flex items-center gap-2 rounded-xl border border-risk-critical-border bg-risk-critical-bg p-4 text-14 text-risk-critical">
          <PhoneCall className="size-5 shrink-0" aria-hidden />
          The customer was on a call while making this transfer. That's the coaching pattern of
          Macau and impersonation scams: call them back on their registered number before releasing
          anything.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="header-2">Payee, as of now</h2>
            <VerdictCard v={a.verdict} />
            {a.verdict.entity.id && (
              <Link
                href={`/bank/entities/${a.verdict.entity.id}`}
                className="text-14 font-semibold text-brand"
              >
                Open entity, graph and cases →
              </Link>
            )}
          </section>
          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">History</h2>
            {a.interventions.length === 0 ? (
              <p className="muted">No action taken yet.</p>
            ) : (
              <ol className="relative ml-2 border-l border-gray-200">
                {a.interventions.map((i) => (
                  <li key={i.id} className="mb-4 ml-4">
                    <span
                      className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-brand"
                      aria-hidden
                    />
                    <p className="text-14 font-semibold text-gray-900">{titleCase(i.action)}</p>
                    <p className="text-12 text-gray-500">{formatDateTime(i.at)}</p>
                    {i.note && <p className="mt-1 text-14 text-gray-700">{i.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className="panel flex h-fit flex-col gap-4">
          <h2 className="panel-title">Decide</h2>
          {OPEN.has(a.status) ? (
            <ActionForm
              act={alertAction}
              hidden={{ id: a.id }}
              buttons={[
                { value: "hold", label: "Hold payment" },
                { value: "callback", label: "Customer callback" },
                { value: "release", label: "Release" },
                { value: "freeze", label: "Freeze receiving account" },
                { value: "confirm_mule", label: "Confirm mule", tone: "danger" },
                { value: "clear", label: "Clear (false alarm)" },
              ]}
            />
          ) : (
            <p className="muted">
              This alert is closed ({titleCase(a.status)}). Reports to NSRC / the National Fraud
              Portal can still be logged.
            </p>
          )}
          <div className="border-t border-gray-200 pt-4">
            <ActionForm
              act={alertAction}
              hidden={{ id: a.id }}
              note={false}
              buttons={[
                { value: "report_nsrc", label: "Log NSRC report" },
                { value: "report_nfp", label: "Log NFP report" },
              ]}
            />
          </div>
          <p className="text-12 text-gray-500">
            &ldquo;Confirm mule&rdquo; adds bank-confirmed evidence to the shared graph: every bank
            and the Semak dulu bot will see this account as a confirmed scam.
          </p>
        </aside>
      </div>
    </section>
  );
}
