import Link from "next/link";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { CampaignRow } from "@/components/CampaignRow";
import { ChecksTable } from "@/components/ChecksTable";
import { HeaderBox } from "@/components/HeaderBox";
import { RightSidebar } from "@/components/RightSidebar";
import { Stat, StatBox } from "@/components/StatBox";
import { api, getMe } from "@/lib/api";

const RULES = [
  "A new bank account for a known supplier is the #1 sign of invoice fraud.",
  "Call back on a number from your own records, never one in the email.",
  "A company invoice should be paid to a company account, not a person's.",
  "New supplier and a big order? Pay in stages or on delivery.",
];

export default async function SmeOverview() {
  const client = await api();
  const [me, d] = await Promise.all([getMe(), client.call("smeDashboard")]);
  const statuses = Object.entries(d.suppliersByStatus);
  const total = statuses.reduce((n, [, v]) => n + v, 0);
  const max = Math.max(0, ...d.campaigns.map((c) => c.reports24h));
  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            title="Welcome,"
            user={me.name.split(" ")[0]}
            subtext={`Semak supplier · ${me.org.name}`}
            actions={
              <Link href="/sme/check" className="btn-primary">
                Check an invoice
              </Link>
            }
          />
          <StatBox
            chart={{
              label: "Suppliers by status",
              labels: statuses.map(([k]) => k),
              values: statuses.map(([, v]) => v),
              colors: statuses.map(([k]) =>
                k === "verified"
                  ? "#039855"
                  : k === "flagged" || k === "blocked"
                    ? "#D92D20"
                    : "#98A2B3",
              ),
            }}
          >
            <Stat label="Payments on hold" hint="Waiting for a callback">
              <AnimatedCounter value={d.openHolds} />
            </Stat>
            <Stat label="Checks this month">
              <AnimatedCounter value={d.checksThisMonth} />
            </Stat>
            <Stat label="Known suppliers">
              <AnimatedCounter value={total} />
            </Stat>
          </StatBox>
        </header>
        <section className="recent-transactions">
          <header className="flex items-center justify-between">
            <h2 className="recent-transactions-label">Needs attention</h2>
            <Link href="/sme/checks" className="view-all-btn">
              View all
            </Link>
          </header>
          <ChecksTable checks={d.flaggedChecks} />
        </section>
      </div>
      <RightSidebar me={me}>
        <div className="flex flex-col gap-4">
          <h2 className="header-2">Before you pay</h2>
          <ul className="flex flex-col gap-3">
            {RULES.map((r) => (
              <li key={r} className="rounded-xl bg-blue-25 p-4 text-14 text-blue-900">
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <h2 className="header-2">Scams going around</h2>
          {d.campaigns.slice(0, 3).map((c) => (
            <CampaignRow key={c.id} c={c} max={max} />
          ))}
        </div>
      </RightSidebar>
    </section>
  );
}
