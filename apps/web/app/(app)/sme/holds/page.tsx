import { HeaderBox } from "@/components/HeaderBox";
import { HoldCard } from "@/components/HoldCard";
import { api } from "@/lib/api";

export default async function Holds() {
  const holds = await (await api()).call("listHolds");
  return (
    <section className="page">
      <HeaderBox
        title="Payment holds"
        subtext="Payments stopped because the supplier's bank details changed. Release only after the callback and written confirmation."
      />
      {holds.length === 0 ? (
        <p className="muted">No holds. Bank-detail changes found by a check appear here.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {holds.map((h) => (
            <HoldCard key={h.id} h={h} />
          ))}
        </div>
      )}
    </section>
  );
}
