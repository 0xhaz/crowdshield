"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useRef } from "react";
import type { ActionState } from "@/lib/actions/bank";
import { cn } from "@/lib/utils";

/** One form, several submit buttons (each sets `action`), optional note, inline result. */
export function ActionForm({
  act,
  hidden,
  buttons,
  note = true,
}: {
  act: (s: ActionState, f: FormData) => Promise<ActionState>;
  hidden: Record<string, string | number>;
  buttons: {
    value: string;
    label: string;
    tone?: "primary" | "secondary" | "danger";
    name?: string;
  }[];
  note?: boolean;
}) {
  const [state, action, pending] = useActionState(act, {});
  // The clicked button's value goes through a hidden input rather than the submitter,
  // which isn't reliably included in a server action's FormData.
  const choice = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input ref={choice} type="hidden" name={buttons[0]?.name ?? "action"} defaultValue="" />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {note && (
        <label className="flex flex-col gap-1.5">
          <span className="label">Note (optional, goes in the audit log)</span>
          <textarea
            name="note"
            rows={2}
            maxLength={1000}
            className="input-class rounded-lg p-2.5 text-14"
            placeholder="e.g. Customer confirmed by callback"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.value}
            type="submit"
            onClick={() => {
              if (choice.current) choice.current.value = b.value;
            }}
            disabled={pending}
            className={cn(
              b.tone === "danger"
                ? "btn-danger"
                : b.tone === "primary"
                  ? "btn-primary"
                  : "btn-secondary",
            )}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {b.label}
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-14 text-risk-critical">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-14 text-success-700">
          ✓ {state.ok}
        </p>
      )}
    </form>
  );
}
