"use client";

import { Loader2, ScanSearch } from "lucide-react";
import { useActionState } from "react";
import { type DetectState, detectCampaigns } from "@/lib/actions/bank";

/** Runs campaign detection now (it also runs after every unmatched report). */
export function DetectButton() {
  const [state, action, pending] = useActionState<DetectState>(detectCampaigns, {});
  const n = state.result?.created.length ?? 0;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
        Look for new campaigns
      </button>
      {state.result && (
        <span role="status" className="text-14 text-gray-600">
          {n
            ? `Found ${n} new campaign${n > 1 ? "s" : ""} in ${state.result.checked} unmatched reports`
            : `No new campaign in ${state.result.checked} unmatched reports`}
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-14 text-risk-critical">
          {state.error}
        </span>
      )}
    </form>
  );
}
