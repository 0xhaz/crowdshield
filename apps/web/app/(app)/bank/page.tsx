import Link from "next/link";
import { AlertsTable } from "@/components/AlertsTable";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { CampaignRow } from "@/components/CampaignRow";
import { Chips } from "@/components/Chips";
import { EntityCard } from "@/components/EntityCard";
import { HeaderBox } from "@/components/HeaderBox";
import { RightSidebar } from "@/components/RightSidebar";
import { Stat, StatBox } from "@/components/StatBox";
import { api, getMe } from "@/lib/api";
import { TIER_ORDER, TIER_STYLE, tierLabel } from "@/lib/risk";

export default async function BankOverview({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const params = await searchParams;
  const client = await api();
  const [me, d, recent] = await Promise.all([
    getMe(),
    client.call("bankDashboard"),
    client.call("listAlerts", { query: { tier: params.tier as never, pageSize: 8 } }),
  ]);
  const tiers = TIER_ORDER.filter((t) => d.alertsByTier[t]);
  const maxReports = Math.max(0, ...d.campaigns.map((c) => c.reports24h));

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            title="Welcome,"
            user={me.name.split(" ")[0]}
            subtext={`Fraud operations · ${me.org.name}`}
          />
          <StatBox
            chart={{
              label: "Open alerts by risk tier",
              labels: tiers.map((t) => tierLabel(t).en),
              values: tiers.map((t) => d.alertsByTier[t]!),
              colors: tiers.map((t) => TIER_STYLE[t].hex),
            }}
          >
            <Stat label="Open alerts">
              <AnimatedCounter value={d.openAlerts} />
            </Stat>
            <Stat label="Live-call alerts (24 h)" hint="Customer was on a call while paying">
              <AnimatedCounter value={d.callSignalAlerts24h} />
            </Stat>
            <Stat label="Frozen in money trails">
              <AnimatedCounter value={d.frozenMyr} prefix="RM " />
            </Stat>
          </StatBox>
        </header>

        <section className="recent-transactions">
          <header className="flex items-center justify-between">
            <h2 className="recent-transactions-label">Alert queue</h2>
            <Link href="/bank/alerts" className="view-all-btn">
              View all
            </Link>
          </header>
          <Chips
            path="/bank"
            params={params}
            name="tier"
            options={[
              { label: "All" },
              ...(["confirmed", "high", "caution"] as const).map((t) => ({
                value: t,
                label: tierLabel(t).en,
              })),
            ]}
          />
          <AlertsTable alerts={recent.items} />
        </section>
      </div>

      <RightSidebar me={me}>
        <div className="flex w-full justify-between">
          <h2 className="header-2">Highest-risk entities</h2>
          <Link
            href="/bank/entities"
            className="text-14 font-semibold text-gray-600 hover:text-brand"
          >
            View all
          </Link>
        </div>
        {d.hotEntities[0] && (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-5">
            <div className="relative z-10 w-full">
              <EntityCard e={d.hotEntities[0]} />
            </div>
            {d.hotEntities[1] && (
              <div className="absolute right-0 top-8 z-0 w-[90%]">
                <EntityCard e={d.hotEntities[1]} ghost />
              </div>
            )}
          </div>
        )}
        <div className="mt-10 flex flex-1 flex-col gap-6">
          <div className="flex w-full justify-between">
            <h2 className="header-2">Live campaigns</h2>
            <Link
              href="/bank/campaigns"
              className="text-14 font-semibold text-gray-600 hover:text-brand"
            >
              All
            </Link>
          </div>
          <div className="space-y-5">
            {d.campaigns.map((c) => (
              <CampaignRow key={c.id} c={c} max={maxReports} />
            ))}
          </div>
        </div>
      </RightSidebar>
    </section>
  );
}
