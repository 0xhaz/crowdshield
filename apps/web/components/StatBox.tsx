import { DoughnutChart } from "./DoughnutChart";

/** banking-main's TotalBalanceBox, generalised: a doughnut plus headline numbers. */
export function StatBox({
  chart,
  children,
}: {
  chart: { labels: string[]; values: number[]; colors: string[]; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="total-balance">
      <div className="total-balance-chart">
        <DoughnutChart {...chart} />
      </div>
      <div className="flex flex-1 flex-wrap gap-x-10 gap-y-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="total-balance-label">{label}</p>
      <div className="text-24 lg:text-30 font-semibold tabular-nums text-gray-900">{children}</div>
      {hint && <p className="text-12 text-gray-500">{hint}</p>}
    </div>
  );
}
