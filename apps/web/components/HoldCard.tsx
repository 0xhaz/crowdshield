"use client";

import type { Hold } from "@crowdshield/contracts";
import { CheckSquare, Loader2, Square } from "lucide-react";
import { useActionState, useRef } from "react";
import type { z } from "zod";
import { decideHold, type SimpleState, toggleHoldStep } from "@/lib/actions/sme";
import { formatDateTime, formatMyr } from "@/lib/utils";
import { StatusChip } from "./StatusChip";

export function HoldCard({ h }: { h: z.infer<typeof Hold> }) {
  const [toggleState, toggle, toggling] = useActionState<SimpleState, FormData>(toggleHoldStep, {});
  const [decided, decide, deciding] = useActionState<SimpleState, FormData>(decideHold, {});
  const decision = useRef<HTMLInputElement>(null); // see ActionForm: don't rely on the submitter
  const choose = (v: string) => () => {
    if (decision.current) decision.current.value = v;
  };
  const open = h.status === "on_hold";
  return (
    <article className="panel flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-18 font-semibold text-gray-900">
            {h.supplier?.name ?? "Unknown supplier"}
          </h2>
          <p className="muted">
            {formatMyr(h.amountMyr)} to{" "}
            <span className="font-mono font-semibold text-risk-critical">
              {h.newAccountMasked ?? "a new account"}
            </span>{" "}
            · held {formatDateTime(h.createdAt)}
          </p>
        </div>
        <StatusChip status={h.status} />
      </header>
      {h.supplier?.callbackPhone && open && (
        <p className="rounded-lg bg-brand-light p-3 text-14 text-gray-900">
          Call <b>{h.supplier.name}</b> on{" "}
          <a
            className="font-mono font-semibold text-brand"
            href={`tel:${h.supplier.callbackPhone}`}
          >
            {h.supplier.callbackPhone}
          </a>{" "}
          (from your records), never a number in the email.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {h.checklist.map((c) => (
          <li key={c.step}>
            <form action={toggle}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="step" value={c.step} />
              <input type="hidden" name="done" value={String(!c.done)} />
              <button
                type="submit"
                disabled={!open || toggling}
                className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-gray-50 disabled:hover:bg-transparent"
              >
                {c.done ? (
                  <CheckSquare
                    className="mt-0.5 size-5 shrink-0 text-success-700"
                    aria-label="Done"
                  />
                ) : (
                  <Square className="mt-0.5 size-5 shrink-0 text-gray-400" aria-label="Not done" />
                )}
                <span
                  className={`text-14 ${c.done ? "text-gray-500 line-through" : "text-gray-900"}`}
                >
                  {c.label.en}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {toggleState.error && (
        <p role="alert" className="text-14 text-risk-critical">
          {toggleState.error}
        </p>
      )}
      {open && (
        <form action={decide} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
          <input type="hidden" name="id" value={h.id} />
          <input ref={decision} type="hidden" name="decision" defaultValue="" />
          <textarea
            name="note"
            rows={2}
            placeholder="What the supplier said on the call (optional)"
            className="input-class rounded-lg p-2.5 text-14"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              onClick={choose("rejected")}
              disabled={deciding}
              className="btn-danger"
            >
              {deciding && <Loader2 className="size-4 animate-spin" />}It&apos;s fake: reject and
              report
            </button>
            <button
              type="submit"
              onClick={choose("verified")}
              disabled={deciding}
              className="btn-secondary"
            >
              Supplier confirmed: release payment
            </button>
          </div>
        </form>
      )}
      {decided.error && (
        <p role="alert" className="text-14 text-risk-critical">
          {decided.error}
        </p>
      )}
      {decided.ok && (
        <p role="status" className="text-14 text-success-700">
          ✓ {decided.ok}
        </p>
      )}
    </article>
  );
}
