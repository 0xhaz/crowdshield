import { Sparkles } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { CampaignRow } from "@/components/CampaignRow";
import { DetectButton } from "@/components/DetectButton";
import { HeaderBox } from "@/components/HeaderBox";
import { reviewCampaign } from "@/lib/actions/bank";
import { api } from "@/lib/api";
import { scamLabel } from "@/lib/risk";
import { formatDate } from "@/lib/utils";

export default async function Campaigns() {
  const all = await (await api()).call("listCampaigns");
  const candidates = all.filter((c) => c.status === "candidate");
  const campaigns = all.filter((c) => c.status !== "candidate");
  const max = Math.max(0, ...campaigns.map((c) => c.reports24h));
  return (
    <section className="page">
      <HeaderBox
        title="Campaigns"
        subtext="Scams grouped by script and shared identifiers. A spike means many more reports in the last 24 h than usual."
      />

      <section className="panel flex flex-col gap-4" aria-labelledby="new-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-2xl flex-col gap-1">
            <h2 id="new-title" className="panel-title flex items-center gap-2">
              <Sparkles className="size-5 text-indigo-700" aria-hidden /> New campaigns to review
            </h2>
            <p className="text-12 text-gray-600">
              Reports whose scripts match no known campaign are grouped by meaning (Qwen3
              embeddings, in any language). When 3 or more reports say the same thing, Nemotron 3
              Ultra names the campaign and drafts a warning. The bot only warns the public after you
              confirm it.
            </p>
          </div>
          <DetectButton />
        </div>
        {candidates.length === 0 ? (
          <p className="muted">Nothing new right now.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {candidates.map((c) => (
              <article
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-indigo-500/30 bg-blue-25 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip border-indigo-500/30 bg-white text-indigo-700">
                    <Sparkles className="size-3.5" aria-hidden /> Detected by AI
                  </span>
                  <span className="text-12 text-gray-600">
                    {scamLabel(c.scamType)} · {c.totalCases} reports · first{" "}
                    {formatDate(c.firstSeen)}
                  </span>
                </div>
                <h3 className="text-16 font-semibold text-gray-900">{c.label}</h3>
                {c.summary && <p className="text-14 text-gray-700">{c.summary.en}</p>}
                {c.keyPhrases.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Phrases the scammers repeat">
                    {c.keyPhrases.map((k) => (
                      <span key={k} className="chip border-gray-200 bg-white text-gray-700">
                        “{k}”
                      </span>
                    ))}
                  </div>
                )}
                {c.warning && (
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-14">
                    <p className="label mb-1">Draft public warning</p>
                    <p className="text-gray-800">{c.warning.en}</p>
                    <p className="mt-1 text-gray-600">{c.warning.ms}</p>
                  </div>
                )}
                <Link href={`/bank/cases?campaignId=${c.id}`} className="text-14 text-brand">
                  Read the {c.totalCases} reports
                </Link>
                <ActionForm
                  act={reviewCampaign}
                  hidden={{ id: c.id }}
                  note={false}
                  buttons={[
                    {
                      value: "confirm",
                      label: "Confirm campaign",
                      tone: "primary",
                      name: "decision",
                    },
                    { value: "dismiss", label: "Dismiss", name: "decision" },
                  ]}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((c) => (
          <div key={c.id} className="panel flex flex-col gap-3">
            <CampaignRow c={c} max={max} />
            {c.origin === "detected" && c.summary && (
              <p className="text-14 text-gray-700">
                <Sparkles
                  className="mr-1 inline size-3.5 text-indigo-700"
                  aria-label="Detected by AI"
                />
                {c.summary.en}
              </p>
            )}
            <dl className="kv">
              <dt>First seen</dt>
              <dd>{formatDate(c.firstSeen)}</dd>
              <dt>Last report</dt>
              <dd>{formatDate(c.lastSeen)}</dd>
              <dt>Daily baseline</dt>
              <dd className="tabular-nums">{c.baselineDaily.toFixed(2)} reports/day</dd>
            </dl>
            <Link href={`/bank/cases?campaignId=${c.id}`} className="btn-secondary self-start">
              View {c.totalCases} cases
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
