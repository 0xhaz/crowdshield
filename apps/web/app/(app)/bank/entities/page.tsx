import { Chips, Pagination } from "@/components/Chips";
import { EntityCard } from "@/components/EntityCard";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";
import { tierLabel } from "@/lib/risk";

type P = { tier?: string; type?: string; page?: string };

export default async function Entities({ searchParams }: { searchParams: Promise<P> }) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await (
    await api()
  ).call("listEntities", {
    query: { tier: params.tier as never, type: params.type as never, page, pageSize: 24 },
  });
  return (
    <section className="page">
      <HeaderBox
        title="Entities"
        subtext="Phone numbers, accounts, links and apps in the graph, by risk. Values are always masked."
      />
      <div className="flex flex-col gap-3">
        <Chips
          path="/bank/entities"
          params={params}
          name="tier"
          options={[
            { label: "All" },
            ...(["confirmed", "high", "caution", "reported", "protected_official"] as const).map(
              (t) => ({ value: t, label: tierLabel(t).en }),
            ),
          ]}
        />
        <Chips
          path="/bank/entities"
          params={params}
          name="type"
          options={[
            { label: "Any type" },
            { value: "bank_account", label: "Bank accounts" },
            { value: "ewallet", label: "E-wallets" },
            { value: "phone", label: "Phones" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "telegram", label: "Telegram" },
            { value: "url", label: "Links" },
            { value: "domain", label: "Domains" },
            { value: "app", label: "Apps" },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-6">
        {data.items.map((e) => (
          <EntityCard key={e.id} e={e} />
        ))}
      </div>
      <Pagination
        path="/bank/entities"
        params={params}
        page={page}
        total={data.total}
        pageSize={data.pageSize}
      />
    </section>
  );
}
