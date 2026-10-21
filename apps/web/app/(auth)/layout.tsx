import { ShieldAlert } from "lucide-react";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen w-full justify-between">
      {children}
      <div className="auth-asset">
        <div className="mr-10 flex max-w-[460px] flex-col gap-6 xl:mr-24">
          <p className="text-14 font-semibold uppercase tracking-wide text-brand">
            One shared scam intelligence graph
          </p>
          <h2 className="text-30 font-bold text-gray-900">
            The bank sees the transfer. The crowd saw the call.
          </h2>
          <div
            className="rounded-2xl border border-risk-critical-border bg-white p-5 shadow-profile"
            aria-hidden
          >
            <div className="flex items-center gap-2 text-risk-critical">
              <ShieldAlert className="size-5" />
              <span className="text-14 font-bold">CONFIRMED SCAM · Scam disahkan</span>
            </div>
            <p className="mt-2 font-mono text-18 text-gray-900">+60 11-***-4821</p>
            <p className="mt-1 text-14 text-gray-600">
              37 reports from the public · 1 NSRC (997) case
            </p>
            <p className="mt-3 text-14 text-gray-900">
              <b>What to do:</b> Hang up. Police and BNM never ask you to transfer money.
            </p>
          </div>
          <p className="text-14 text-gray-600">
            Payee checks, alerts and cases for banks and e-wallets. Supplier checks for businesses.
          </p>
        </div>
      </div>
    </main>
  );
}
