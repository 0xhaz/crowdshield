"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState } from "react";
import { addTracedHop, type TrailState } from "@/lib/actions/bank";

const BANKS = [
  "Maybank",
  "CIMB",
  "Public Bank",
  "RHB",
  "Hong Leong",
  "AmBank",
  "BSN",
  "Bank Islam",
  "Bank Rakyat",
];
const RAILS = [
  ["duitnow", "DuitNow"],
  ["ibg", "IBG"],
  ["instant_transfer", "Instant transfer"],
  ["ewallet", "E-wallet"],
] as const;

/**
 * Records a transfer the analyst's bank traced through NSRC or the National Fraud Portal. The account
 * that received it is flagged across the network at once (it received money from a scam account).
 */
export function TraceHopForm({
  caseId,
  accounts,
  nextHop,
}: {
  caseId: string;
  accounts: { id: number; masked: string }[];
  nextHop: number;
}) {
  const [state, action, pending] = useActionState<TrailState, FormData>(addTracedHop, {});
  // Malaysia time, as datetime-local wants it
  const now = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 16);
  const v = state.result?.traced[0];
  return (
    <details className="group rounded-lg border border-dashed border-gray-300 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-14 font-semibold text-brand">
        <Plus className="size-4" aria-hidden /> Add a transfer your bank traced
      </summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="hopNo" value={nextHop} />
        <label className="flex flex-col gap-1.5">
          <span className="label">From account</span>
          <select
            name="from"
            className="input-class h-10 px-3 font-mono text-14"
            defaultValue={accounts.at(-1)?.id}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.masked}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label">To bank</span>
            <select name="bank" className="input-class h-10 px-3 text-14" defaultValue="Bank Islam">
              {BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-[1.4] flex-col gap-1.5">
            <span className="label">Account number</span>
            <input
              name="account"
              inputMode="numeric"
              className="input-class h-10 px-3 font-mono text-14"
              placeholder="1201 7788 4410"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label">Amount (RM)</span>
            <input
              name="amount"
              inputMode="decimal"
              className="input-class h-10 px-3 text-14"
              placeholder="9000"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label">Frozen (RM)</span>
            <input
              name="frozen"
              inputMode="decimal"
              className="input-class h-10 px-3 text-14"
              placeholder="0"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label">When (MYT)</span>
            <input
              name="at"
              type="datetime-local"
              defaultValue={now}
              className="input-class h-10 px-2 text-14"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label">Rail</span>
            <select name="rail" className="input-class h-10 px-3 text-14">
              {RAILS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="label">
            Transaction reference (DuitNow / IBG; the other bank sees the same one)
          </span>
          <input
            name="txnRef"
            required
            className="input-class h-10 px-3 font-mono text-14"
            placeholder="DN2026102500099001"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add to the money trail
          </button>
          {state.error && (
            <p role="alert" className="text-14 text-risk-critical">
              {state.error}
            </p>
          )}
          {state.result && (
            <p role="status" className="text-14 text-success-700">
              {state.result.hopsAdded
                ? `Added. ${v ? `${v.entity.masked} is now “${v.tierLabel.en}”${v.risk ? ` · ${v.risk}` : ""}` : ""}${
                    state.result.alertsRaised
                      ? `; alert sent to ${state.result.alertsRaised} other bank${state.result.alertsRaised > 1 ? "s" : ""} and e-wallet${state.result.alertsRaised > 1 ? "s" : ""}`
                      : ""
                  }.`
                : state.result.hopsUpdated
                  ? "Already in the trail (the other bank reported it too): frozen amount updated."
                  : "Already in the trail: nothing new to add."}
            </p>
          )}
        </div>
        <p className="text-12 text-gray-500 sm:col-span-2">
          Banks trace and freeze through NSRC and the National Fraud Portal; this records the
          outcome so every bank, e-wallet, business and bot user is warned about the receiving
          account.
        </p>
      </form>
    </details>
  );
}
