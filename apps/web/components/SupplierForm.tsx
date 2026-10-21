"use client";

import { useActionState } from "react";
import { createSupplier, type SimpleState } from "@/lib/actions/sme";

const F = [
  ["name", "Company name"],
  ["ssmNo", "SSM no."],
  ["tin", "TIN"],
  ["bank", "Bank"],
  ["account", "Account number"],
  ["accountHolderName", "Account name"],
  ["callbackPhone", "Phone (from your records)"],
  ["emailDomain", "Email domain"],
] as const;

export function SupplierForm() {
  const [state, action, pending] = useActionState<SimpleState, FormData>(createSupplier, {});
  return (
    <form action={action} className="panel flex flex-col gap-4">
      <h2 className="panel-title">Add a supplier</h2>
      <p className="muted">
        The account and phone you save here are what later invoices are compared with.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {F.map(([name, label]) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="label">{label}</span>
            <input name={name} required={name === "name"} className="input-class h-10 px-3" />
          </label>
        ))}
      </div>
      <button type="submit" disabled={pending} className="btn-primary self-start">
        Add supplier
      </button>
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
