import { HeaderBox } from "@/components/HeaderBox";
import { InvoiceCheckForm } from "@/components/InvoiceCheckForm";
import { api } from "@/lib/api";

export default async function CheckInvoice() {
  const suppliers = await (await api()).call("listSuppliers");
  return (
    <section className="page">
      <HeaderBox
        title="Check an invoice"
        subtext="Semak supplier: verify a supplier, invoice or bank-detail change before you pay."
      />
      <InvoiceCheckForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
    </section>
  );
}
