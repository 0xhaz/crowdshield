import Link from "next/link";
import { CampaignRow } from "@/components/CampaignRow";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default async function Campaigns() {
  const campaigns = await (await api()).call("listCampaigns");
  const max = Math.max(0, ...campaigns.map((c) => c.reports24h));
  return (
    <section className="page">
      <HeaderBox
        title="Campaigns"
        subtext="Scams grouped by script and shared identifiers. A spike means many more reports in the last 24 h than usual."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((c) => (
          <div key={c.id} className="panel flex flex-col gap-3">
            <CampaignRow c={c} max={max} />
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
