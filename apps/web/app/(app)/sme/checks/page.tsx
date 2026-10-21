import { ChecksTable } from "@/components/ChecksTable";
import { Pagination } from "@/components/Chips";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";

export default async function Checks({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await (await api()).call("listInvoiceChecks", { query: { page, pageSize: 20 } });
  return (
    <section className="page">
      <HeaderBox
        title="Check history"
        subtext="Every invoice and bank-detail check your business has run."
      />
      <div className="panel flex flex-col gap-4">
        <ChecksTable checks={data.items} />
        <Pagination
          path="/sme/checks"
          params={params}
          page={page}
          total={data.total}
          pageSize={data.pageSize}
        />
      </div>
    </section>
  );
}
