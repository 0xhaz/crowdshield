import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeaderBox } from "@/components/HeaderBox";
import { RiskBadge } from "@/components/RiskBadge";
import { api } from "@/lib/api";
import { scamLabel, sourceLabel } from "@/lib/risk";
import { formatDateTime, formatMyr, titleCase } from "@/lib/utils";

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await (await api()).call("getCase", { params: { id } });
  return (
    <section className="page">
      <HeaderBox
        title={scamLabel(c.scamType).replace(/^\w/, (x) => x.toUpperCase())}
        subtext={`${sourceLabel(c.source)} · reported ${formatDateTime(c.reportedAt)}${c.campaign ? ` · ${c.campaign.label}` : ""}`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          {c.narrative && (
            <blockquote className="panel border-l-4 border-l-brand text-16 text-gray-800">
              {c.narrative}
            </blockquote>
          )}

          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Timeline</h2>
            {c.timeline.length === 0 ? (
              <p className="muted">No timeline recorded.</p>
            ) : (
              <ol className="relative ml-2 border-l border-gray-200">
                {c.timeline.map((t, i) => (
                  <li key={i} className="mb-5 ml-4">
                    <span
                      className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-brand"
                      aria-hidden
                    />
                    <p className="text-12 text-gray-500">
                      {formatDateTime(t.at)} · {titleCase(t.channel)}
                      {t.durationSec ? ` · ${Math.round(t.durationSec / 60)} min` : ""}
                    </p>
                    <p className="text-14 font-semibold text-gray-900">
                      {titleCase(t.kind)}
                      {t.entity && (
                        <Link
                          href={`/bank/entities/${t.entity.id}`}
                          className="ml-2 font-mono font-normal text-brand"
                        >
                          {t.entity.masked}
                        </Link>
                      )}
                    </p>
                    {t.detail && <p className="text-14 text-gray-700">{t.detail}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Money trail</h2>
            {c.moneyTrail.length === 0 ? (
              <p className="muted">No bank-supplied transfers on this case.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {c.moneyTrail.map((h, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <span className="chip border-gray-200 bg-gray-50 text-gray-700">
                      Hop {h.hopNo}
                    </span>
                    <Link href={`/bank/entities/${h.from.id}`} className="font-mono text-14">
                      {h.from.masked}
                    </Link>
                    <ArrowRight className="size-4 text-gray-400" aria-label="to" />
                    {h.to ? (
                      <Link
                        href={`/bank/entities/${h.to.id}`}
                        className="font-mono text-14 font-semibold"
                      >
                        {h.to.masked}
                      </Link>
                    ) : (
                      <span className="muted">unknown</span>
                    )}
                    <span className="ml-auto text-right">
                      <span className="block font-semibold tabular-nums">
                        {formatMyr(h.amountMyr)}
                      </span>
                      <span className="block text-12 text-gray-500">
                        {h.rail?.toUpperCase()} · {formatDateTime(h.at)}
                        {h.txnRef ? ` · ${h.txnRef}` : ""}
                      </span>
                      {h.frozenMyr > 0 && (
                        <span className="block text-12 font-semibold text-risk-info">
                          Frozen {formatMyr(h.frozenMyr)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {c.cashouts.length > 0 && (
              <div className="rounded-lg bg-risk-critical-bg p-3 text-14 text-risk-critical">
                <p className="font-semibold">
                  Cash-out (restricted: your bank and law enforcement)
                </p>
                {c.cashouts.map((x, i) => (
                  <p key={i}>
                    {titleCase(x.method)} · {x.locationRef} · {x.state} · {formatMyr(x.amountMyr)} ·{" "}
                    {formatDateTime(x.at)}
                  </p>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="panel">
            <h2 className="panel-title mb-3">Case</h2>
            <dl className="kv">
              <dt>Loss</dt>
              <dd>{c.nearMiss ? "Near miss (no money lost)" : formatMyr(c.lossMyr)}</dd>
              <dt>Verification</dt>
              <dd>{titleCase(c.verification)}</dd>
              <dt>NSRC ref</dt>
              <dd>{c.nsrcRef ?? "—"}</dd>
              <dt>Police report</dt>
              <dd>{c.policeReportNo ?? "—"}</dd>
              <dt>Victim</dt>
              <dd>
                {[c.victimState, c.victimAgeBand && `age ${c.victimAgeBand}`]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
              <dt>Language</dt>
              <dd>{c.language?.toUpperCase() ?? "—"}</dd>
            </dl>
          </section>
          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Identifiers</h2>
            {c.entities.map((e) => (
              <Link
                key={`${e.id}-${e.role}`}
                href={`/bank/entities/${e.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50"
              >
                <span>
                  <span className="block whitespace-nowrap font-mono text-14">{e.masked}</span>
                  <span className="text-12 text-gray-500">{titleCase(e.role)}</span>
                </span>
                {e.tier && <RiskBadge tier={e.tier} risk={e.risk} />}
              </Link>
            ))}
          </section>
          {(c.referrals.length > 0 || c.evidence.length > 0) && (
            <section className="panel flex flex-col gap-2 text-14">
              <h2 className="panel-title">Hand-off and evidence</h2>
              {c.referrals.map((r, i) => (
                <p key={i}>
                  <b>{r.agency}</b> · {r.externalRef} · {titleCase(r.status)}
                </p>
              ))}
              {c.evidence.map((e) => (
                <p key={e.id} className="truncate text-gray-600">
                  {titleCase(e.kind)}: <code>{e.storageUri}</code>
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
