"use client";

import {
  ArrowLeft,
  CircleCheck,
  Loader2,
  OctagonX,
  PauseCircle,
  PhoneCall,
  TriangleAlert,
} from "lucide-react";
import { useActionState, useState } from "react";
import { type AppTransferState, appTransfer } from "@/lib/actions/bankapp";
import { cn, formatMyr } from "@/lib/utils";

const BANKS = [
  "Maybank",
  "CIMB",
  "Public Bank",
  "RHB",
  "Hong Leong",
  "AmBank",
  "BSN",
  "Bank Islam",
];
const PRESETS = [
  {
    label: "Mule account, on a scam call",
    bank: "Public Bank",
    account: "6471 2093 5518",
    call: true,
  },
  { label: "Reported account", bank: "Maybank", account: "5123 4567 8812", call: false },
  { label: "Unknown account", bank: "Maybank", account: "5144 0912 7730", call: false },
];

type Screen = {
  tone: string;
  icon: typeof CircleCheck;
  title: string;
  primary: string;
  secondary?: string;
};

/** What the customer sees for each recommended action (graded interventions, architecture §6). */
const SCREENS: Record<string, Screen> = {
  proceed: { tone: "success", icon: CircleCheck, title: "Transfer sent", primary: "Done" },
  warn: {
    tone: "caution",
    icon: TriangleAlert,
    title: "Check before you pay",
    primary: "Cancel transfer",
    secondary: "I know this person, continue",
  },
  cooling_off: {
    tone: "caution",
    icon: PauseCircle,
    title: "Let’s pause for 30 minutes",
    primary: "Cancel transfer",
    secondary: "Remind me in 30 minutes",
  },
  hold_and_callback: {
    tone: "high",
    icon: PauseCircle,
    title: "We’ve paused this transfer",
    primary: "Cancel transfer",
    secondary: "Wait for the bank’s call",
  },
  block_and_report: {
    tone: "critical",
    icon: OctagonX,
    title: "Transfer stopped",
    primary: "Call NSRC 997",
    secondary: "Back to home",
  },
};
const TONE: Record<string, string> = {
  success: "border-success-600/30 bg-success-25 text-success-700",
  caution: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
  high: "border-risk-high-border bg-risk-high-bg text-risk-high",
  critical: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
};

/** A customer's banking app (Nusa Digital Bank, synthetic) asking CrowdShield before a DuitNow transfer. */
export function BankAppDemo({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<AppTransferState, FormData>(appTransfer, {});
  const [form, setForm] = useState({ bank: "Public Bank", account: "", amount: "", onCall: false });
  const [dismissed, setDismissed] = useState<AppTransferState | null>(null);
  const r = state.result && state !== dismissed ? state.result : null;
  const screen = r ? (SCREENS[r.recommendedAction] ?? SCREENS.warn!) : null;

  return (
    <div className="mx-auto flex w-full max-w-[380px] flex-col overflow-hidden rounded-[2.5rem] border-[10px] border-gray-900 bg-white shadow-profile">
      <div className="bg-brand-dark-gradient px-5 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between text-12 text-white/80">
          <span>9:41</span>
          {form.onCall && (
            <span className="flex items-center gap-1 rounded-full bg-success-600 px-2 py-0.5 text-white">
              <PhoneCall className="size-3" aria-hidden /> On a call 04:12
            </span>
          )}
        </div>
        <p className="mt-3 text-12 uppercase tracking-wider text-white/70">Nusa Digital Bank</p>
        <h1 className="text-20 font-semibold">DuitNow transfer</h1>
      </div>

      {screen && r ? (
        <div className="flex flex-col gap-4 p-5" role="alertdialog" aria-labelledby="app-result">
          <div
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-5 text-center",
              TONE[screen.tone],
            )}
          >
            <screen.icon className="size-10" aria-hidden />
            <h2 id="app-result" className="text-18 font-bold">
              {screen.title}
            </h2>
            <p className="text-14 text-gray-800">
              {formatMyr(state.amount ?? 0)} to{" "}
              <span className="font-mono">{r.payee.entity.masked}</span>
            </p>
          </div>
          {r.recommendedAction !== "proceed" && (
            <>
              <p className="text-14 text-gray-900">{r.customerWarning.en}</p>
              <p className="text-14 text-gray-600">{r.customerWarning.ms}</p>
              {r.recommendedAction === "hold_and_callback" && (
                <p className="rounded-lg bg-gray-25 p-3 text-12 text-gray-700">
                  Our fraud team will call you on your registered number. Don’t trust anyone who
                  calls you first and says they’re from the bank.
                </p>
              )}
            </>
          )}
          <button
            type="button"
            className="btn-primary w-full justify-center"
            onClick={() => setDismissed(state)}
          >
            {screen.primary}
          </button>
          {screen.secondary && (
            <button
              type="button"
              className="btn-secondary w-full justify-center"
              onClick={() => setDismissed(state)}
            >
              {screen.secondary}
            </button>
          )}
          <p className="text-center text-[11px] text-gray-500">
            Risk {r.combinedRisk}/100 from CrowdShield · checked before the money moved
            {r.alertId ? " · sent to the bank’s fraud queue" : ""}
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="label">Bank</span>
            <select
              name="bank"
              value={form.bank}
              onChange={(e) => setForm({ ...form, bank: e.target.value })}
              className="input-class h-11 rounded-lg px-3 text-14"
            >
              {BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Account number</span>
            <input
              name="account"
              inputMode="numeric"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
              className="input-class h-11 rounded-lg px-3 font-mono text-14"
              placeholder="e.g. 5123 4567 8812"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Amount (RM)</span>
            <input
              name="amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input-class h-11 rounded-lg px-3 text-14"
              placeholder="0.00"
            />
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-dashed border-gray-300 p-3 text-12 text-gray-700">
            <input
              type="checkbox"
              name="onCall"
              checked={form.onCall}
              onChange={(e) => setForm({ ...form, onCall: e.target.checked })}
              className="mt-0.5 size-4"
            />
            <span>
              <b>Demo:</b> the customer is on a phone call with{" "}
              <span className="font-mono">011-2345 4821</span> (the app sees the call state, with
              consent)
            </span>
          </label>
          <input type="hidden" name="caller" value="011-2345 4821" />
          <button
            type="submit"
            className="btn-primary h-11 w-full justify-center"
            disabled={pending || !configured}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Transfer
          </button>
          {state.error && (
            <p role="alert" className="text-14 text-risk-critical">
              {state.error}
            </p>
          )}
          <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Fill in an example (synthetic)
            </p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="flex items-center gap-2 text-left text-12 text-brand"
                onClick={() =>
                  setForm({ bank: p.bank, account: p.account, amount: "25000", onCall: p.call })
                }
              >
                <ArrowLeft className="size-3 rotate-180" aria-hidden />
                {p.label}
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
