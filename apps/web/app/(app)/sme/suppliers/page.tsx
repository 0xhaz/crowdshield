import { Building2 } from "lucide-react";
import { HeaderBox } from "@/components/HeaderBox";
import { StatusChip } from "@/components/StatusChip";
import { SupplierForm } from "@/components/SupplierForm";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default async function Suppliers() {
  const suppliers = await (await api()).call("listSuppliers");
  return (
    <section className="page">
      <HeaderBox
        title="Suppliers"
        subtext="Your known suppliers and the bank accounts you usually pay."
      />
      <div className="flex flex-wrap gap-6">
        {suppliers.map((s) => (
          <article
            key={s.id}
            className="flex w-full max-w-[340px] flex-col gap-3 rounded-[20px] border border-gray-200 bg-white p-5 shadow-creditCard"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex-center size-10 rounded-full bg-brand-light">
                <Building2 className="size-5 text-brand" aria-hidden />
              </span>
              <StatusChip status={s.status} />
            </div>
            <h2 className="text-16 font-semibold text-gray-900">{s.name}</h2>
            <dl className="kv text-14">
              <dt>SSM</dt>
              <dd className="font-mono">{s.ssmNo ?? "—"}</dd>
              <dt>TIN</dt>
              <dd className="font-mono">{s.tin ?? "—"}</dd>
              <dt>Pays to</dt>
              <dd className="font-mono">{s.accountMasked ?? "—"}</dd>
              <dt>Callback</dt>
              <dd className="font-mono">{s.callbackPhone ?? "—"}</dd>
              <dt>Last check</dt>
              <dd>{formatDate(s.lastCheckAt)}</dd>
            </dl>
          </article>
        ))}
      </div>
      <SupplierForm />
    </section>
  );
}
