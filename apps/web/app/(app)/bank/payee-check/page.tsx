import { BANKS, EWALLETS } from "@crowdshield/normalise";
import Link from "next/link";
import { HeaderBox } from "@/components/HeaderBox";
import { PayeeCheckForm } from "@/components/PayeeCheckForm";

const PRESETS = {
  live: {
    label: "Live call + new payee (demo step 3)",
    bank: "PBB",
    account: "6471 2093 5518",
    amount: "25000",
    callActive: "on",
    caller: "011-2345 4821",
  },
  mule: { label: "Known mule account", bank: "MBB", account: "5123 4567 8812", amount: "9500" },
  clean: {
    label: "Regular supplier payment",
    bank: "MBB",
    account: "5144 0912 7730",
    amount: "800",
  },
} as const;

export default async function PayeeCheck({
  searchParams,
}: {
  searchParams: Promise<{ preset?: keyof typeof PRESETS }>;
}) {
  const { preset } = await searchParams;
  const banks = [
    ...Object.entries(BANKS).map(([code, b]) => ({
      code,
      name: b.name,
      type: "bank_account" as const,
    })),
    ...Object.entries(EWALLETS).map(([code, b]) => ({
      code,
      name: b.name,
      type: "ewallet" as const,
    })),
  ];
  return (
    <section className="payment-transfer">
      <HeaderBox
        title="Payee check"
        subtext="Check a payee before a DuitNow / IBG / e-wallet transfer. If the customer is on a call right now, include it: that's the signal no single party has."
      />
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Demo presets">
        {Object.entries(PRESETS).map(([k, p]) => (
          <Link
            key={k}
            href={`/bank/payee-check?preset=${k}`}
            className={`chip-link ${preset === k ? "chip-link-active" : ""}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <section className="size-full pt-5">
        <PayeeCheckForm
          key={preset ?? "none"}
          banks={banks}
          defaults={preset ? PRESETS[preset] : undefined}
        />
      </section>
    </section>
  );
}
