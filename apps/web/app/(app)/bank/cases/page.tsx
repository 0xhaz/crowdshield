import { CasesTable } from "@/components/CasesTable";
import { Chips, Pagination } from "@/components/Chips";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";
import { scamLabel } from "@/lib/risk";

type P = { scamType?: string; campaignId?: string; withLoss?: string; page?: string };
const TYPES = [
  "macau_impersonation",
  "investment",
  "parcel",
  "phishing_link",
  "job_task",
  "bec_supplier",
  "ecommerce",
];

export default async function Cases({ searchParams }: { searchParams: Promise<P> }) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await (
    await api()
  ).call("listCases", {
    query: {
      scamType: params.scamType as never,
      campaignId: params.campaignId ? Number(params.campaignId) : undefined,
      withLoss: params.withLoss === "1" ? true : undefined,
      page,
      pageSize: 15,
    },
  });
  return (
    <section className="page">
      <HeaderBox
        title="Cases"
        subtext="Every report and confirmation in the shared graph: consumer reports, NSRC references, bank confirmations, regulator alerts."
      />
      <div className="panel flex flex-col gap-4">
        <Chips
          path="/bank/cases"
          params={params}
          name="scamType"
          options={[
            { label: "All types" },
            ...TYPES.map((t) => ({ value: t, label: scamLabel(t) })),
          ]}
        />
        <Chips
          path="/bank/cases"
          params={params}
          name="withLoss"
          options={[{ label: "All" }, { value: "1", label: "With money lost" }]}
        />
        <CasesTable cases={data.items} />
        <Pagination
          path="/bank/cases"
          params={params}
          page={page}
          total={data.total}
          pageSize={data.pageSize}
        />
      </div>
    </section>
  );
}
