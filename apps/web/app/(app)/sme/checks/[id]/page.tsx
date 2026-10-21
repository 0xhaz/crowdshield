import Link from "next/link";
import { CheckResult } from "@/components/CheckResult";
import { HeaderBox } from "@/components/HeaderBox";
import { api } from "@/lib/api";

export default async function CheckDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await (await api()).call("getInvoiceCheck", { params: { id } });
  return (
    <section className="page">
      <HeaderBox
        title="Invoice check"
        subtext={r.supplier ? r.supplier.name : "New supplier"}
        actions={
          <Link href="/sme/check" className="btn-secondary">
            Check another
          </Link>
        }
      />
      <CheckResult r={r} />
    </section>
  );
}
