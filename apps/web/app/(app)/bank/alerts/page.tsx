import { AlertsTable } from "@/components/AlertsTable";
import { Chips, Pagination } from "@/components/Chips";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";
import { tierLabel } from "@/lib/risk";

type P = { status?: string; tier?: string; page?: string };

export default async function Alerts({ searchParams }: { searchParams: Promise<P> }) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await (
    await api()
  ).call("listAlerts", {
    query: { status: params.status as never, tier: params.tier as never, page, pageSize: 15 },
  });
  return (
    <section className="page">
      <HeaderBox
        title="Alerts"
        subtext="Payee checks that crossed the alert threshold. Open alerts first, highest risk first."
      />
      <div className="panel flex flex-col gap-4">
        <Chips
          path="/bank/alerts"
          params={params}
          name="status"
          options={[
            { label: "All" },
            { value: "open", label: "Open" },
            { value: "in_review", label: "In review" },
            { value: "held", label: "Held" },
            { value: "frozen", label: "Frozen" },
            { value: "confirmed_mule", label: "Confirmed mule" },
            { value: "released", label: "Released" },
            { value: "cleared", label: "Cleared" },
          ]}
        />
        <Chips
          path="/bank/alerts"
          params={params}
          name="tier"
          options={[
            { label: "Any risk" },
            ...(["confirmed", "high", "caution"] as const).map((t) => ({
              value: t,
              label: tierLabel(t).en,
            })),
          ]}
        />
        <AlertsTable alerts={data.items} />
        <Pagination
          path="/bank/alerts"
          params={params}
          page={page}
          total={data.total}
          pageSize={data.pageSize}
        />
      </div>
    </section>
  );
}
