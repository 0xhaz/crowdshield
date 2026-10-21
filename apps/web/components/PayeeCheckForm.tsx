"use client";

import { Loader2, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { payeeCheck, type PayeeState } from "@/lib/actions/bank";
import { TIER_STYLE, type Tier } from "@/lib/risk";
import { cn, titleCase } from "@/lib/utils";
import { RiskBadge } from "./RiskBadge";
import { VerdictCard } from "./VerdictCard";

type Bank = { code: string; name: string; type: "bank_account" | "ewallet" };

const ACTION_TEXT: Record<string, string> = {
  proceed: "Proceed: no known risk",
  warn: "Show the scam warning, then proceed",
  cooling_off: "Warn and apply a cooling-off hold",
  hold_and_callback: "Hold the transfer and call the customer back",
  block_and_report: "Block, report to NSRC, flag the receiving account",
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="payment-transfer_form-item">
      <div className="payment-transfer_form-content">
        <span className="text-14 font-medium text-gray-700">{label}</span>
        {hint && <span className="text-12 font-normal text-gray-600">{hint}</span>}
      </div>
      <div className="flex w-full flex-col">{children}</div>
    </div>
  );
}

export function PayeeCheckForm({
  banks,
  defaults,
}: {
  banks: Bank[];
  defaults?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<PayeeState, FormData>(payeeCheck, {});
  const v = { ...defaults, ...state.input };
  const r = state.result;

  return (
    <div className="flex flex-col gap-10">
      <form action={action} className="flex flex-col">
        <div className="payment-transfer_form-details">
          <h2 className="text-18 font-semibold text-gray-900">Transfer</h2>
          <p className="text-16 font-normal text-gray-600">The payee as the customer entered it</p>
        </div>
        <div className="flex flex-col gap-6 border-t border-gray-200 py-5">
          <Row label="Bank / e-wallet">
            <select
              name="bank"
              defaultValue={v.bank ?? "MBB"}
              className="input-class h-11 max-w-md px-3"
              onChange={(e) => {
                const t = banks.find((b) => b.code === e.target.value)?.type ?? "bank_account";
                (e.target.form!.elements.namedItem("type") as HTMLInputElement).value = t;
              }}
            >
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              name="type"
              defaultValue={banks.find((b) => b.code === (v.bank ?? "MBB"))?.type ?? "bank_account"}
            />
          </Row>
          <Row label="Account number" hint="Or the phone number for an e-wallet">
            <input
              name="account"
              required
              defaultValue={v.account}
              placeholder="e.g. 5123 4567 8812"
              className="input-class h-11 max-w-md px-3 font-mono"
            />
          </Row>
          <Row label="Amount (RM)">
            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={v.amount}
              placeholder="e.g. 25000"
              className="input-class h-11 max-w-[200px] px-3"
            />
          </Row>
          <Row label="Rail">
            <select
              name="rail"
              defaultValue={v.rail ?? "duitnow"}
              className="input-class h-11 max-w-[200px] px-3"
            >
              {["duitnow", "ibg", "instant_transfer", "ewallet", "fpx"].map((x) => (
                <option key={x} value={x}>
                  {x.toUpperCase()}
                </option>
              ))}
            </select>
          </Row>
        </div>
        <div className="payment-transfer_form-details">
          <h2 className="text-18 font-semibold text-gray-900">Live call signal</h2>
          <p className="text-16 font-normal text-gray-600">
            From the bank app SDK, with the customer&apos;s consent
          </p>
        </div>
        <div className="flex flex-col gap-6 border-t border-gray-200 py-5">
          <Row label="Customer is on a call now">
            <label className="flex items-center gap-2 text-14 text-gray-700">
              <input
                type="checkbox"
                name="callActive"
                defaultChecked={v.callActive === "on"}
                className="size-4 accent-brand"
              />{" "}
              Active call during this transfer
            </label>
          </Row>
          <Row label="Number on the call" hint="If the SDK can see it">
            <input
              name="caller"
              defaultValue={v.caller}
              placeholder="e.g. 011-2345 4821"
              className="input-class h-11 max-w-md px-3 font-mono"
            />
          </Row>
        </div>
        <div className="payment-transfer_btn-box">
          <button
            type="submit"
            disabled={pending}
            className="payment-transfer_btn btn-primary h-11 max-w-[280px]"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Checking…
              </>
            ) : (
              "Check payee"
            )}
          </button>
        </div>
        {state.error && (
          <p role="alert" className="text-14 text-risk-critical">
            {state.error}
          </p>
        )}
      </form>

      {r && (
        <section aria-live="polite" className="flex max-w-[1000px] flex-col gap-6">
          <div
            className={cn(
              "flex flex-wrap items-center gap-6 rounded-2xl border p-6",
              TIER_STYLE[r.combinedTier as Tier].bg,
              TIER_STYLE[r.combinedTier as Tier].border,
            )}
          >
            <div>
              <p className="text-14 font-medium text-gray-700">Combined risk</p>
              <p
                className={cn(
                  "text-36 font-bold tabular-nums",
                  TIER_STYLE[r.combinedTier as Tier].text,
                )}
              >
                {r.combinedRisk}
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <span className="self-start">
                <RiskBadge tier={r.combinedTier} size="md" />
              </span>
              <p className="text-18 font-semibold text-gray-900">
                {ACTION_TEXT[r.recommendedAction] ?? titleCase(r.recommendedAction)}
              </p>
              {r.alertId && (
                <Link
                  href={`/bank/alerts/${r.alertId}`}
                  className="text-14 font-semibold text-brand"
                >
                  Alert raised: open it →
                </Link>
              )}
            </div>
          </div>
          <div className="panel">
            <h3 className="panel-title mb-2">Warning shown to the customer</h3>
            <p className="text-16 text-gray-900">{r.customerWarning.en}</p>
            <p className="mt-1 text-14 italic text-gray-600" lang="ms">
              {r.customerWarning.ms}
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="header-2">Payee</h3>
              <VerdictCard v={r.payee} />
            </div>
            {r.caller ? (
              <div className="flex flex-col gap-2">
                <h3 className="header-2 flex items-center gap-2">
                  <PhoneCall className="size-5" aria-hidden />
                  Caller on the line
                </h3>
                <VerdictCard v={r.caller} />
              </div>
            ) : null}
          </div>
          <p className="text-12 text-gray-500">
            Policy {r.policyVersion}. Combined risk = 100 × (1 − (1 − payee) × (1 − 0.6 × caller));
            an active call with an unknown number counts as 0.25.
          </p>
        </section>
      )}
    </div>
  );
}
