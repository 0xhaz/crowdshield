import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BankAppDemo } from "@/components/BankAppDemo";

export const metadata: Metadata = {
  title: "Banking app demo · CrowdShield",
  description:
    "A customer's banking app asking CrowdShield about the payee before a DuitNow transfer.",
};

export default function BankAppPage() {
  return (
    <div className="min-h-screen bg-gray-25">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="flex max-w-xl flex-col gap-4">
          <Link href="/" className="flex items-center gap-1 text-14 text-brand">
            <ArrowLeft className="size-4" aria-hidden /> CrowdShield
          </Link>
          <h1 className="text-30 font-bold text-gray-900">Inside the customer’s banking app</h1>
          <p className="text-16 text-gray-700">
            Before a DuitNow transfer leaves, the bank’s backend asks CrowdShield about the payee,
            together with one signal only the phone has: is the customer on a call right now, and
            with whom.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-14 text-gray-700">
            <li>
              The bank calls <code className="text-12">POST /v1/payee-check</code> with its partner
              key. The answer comes from the scam graph in milliseconds; no AI model sits in the
              payment path.
            </li>
            <li>
              The payee’s risk and the caller’s risk combine. A mule account during a call from a
              confirmed scam number becomes “hold and call back”.
            </li>
            <li>
              The customer sees one plain warning in BM and English; the bank’s fraud team gets the
              alert in its queue.
            </li>
          </ol>
          <p className="text-12 text-gray-500">
            Nusa Digital Bank and every account here are synthetic. Try the first example, then open
            the bank portal’s alert queue to see the same transfer from the analyst’s side.
          </p>
        </div>
        <BankAppDemo configured={Boolean(process.env.BANK_PARTNER_KEY)} />
      </div>
    </div>
  );
}
