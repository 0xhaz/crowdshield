"use client";

import { FileUp, Loader2, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import {
  type CheckState,
  type InvoiceFields,
  type ReadState,
  readInvoice,
  runSupplierCheck,
} from "@/lib/actions/sme";

type Supplier = { id: string; name: string };

const FIELDS: { name: keyof InvoiceFields; label: string; placeholder?: string; mono?: boolean }[] =
  [
    { name: "supplierName", label: "Supplier name", placeholder: "As printed on the invoice" },
    { name: "ssmNo", label: "SSM registration no.", placeholder: "e.g. 201901023456", mono: true },
    { name: "tin", label: "Tax ID (TIN)", placeholder: "e.g. C2584563200", mono: true },
    { name: "invoiceNo", label: "Invoice no." },
    {
      name: "einvoiceUuid",
      label: "e-Invoice UUID",
      placeholder: "From the LHDN QR code, if any",
      mono: true,
    },
    { name: "amountMyr", label: "Amount (RM)", placeholder: "e.g. 86500" },
    { name: "bank", label: "Bank", placeholder: "e.g. Hong Leong Bank" },
    {
      name: "account",
      label: "Account number",
      placeholder: "Pay-to account on the invoice",
      mono: true,
    },
    { name: "accountHolderName", label: "Account name on the invoice" },
    { name: "phone", label: "Contact phone on the invoice / email", mono: true },
    { name: "emailFrom", label: "Sent from (email)", mono: true },
    { name: "replyTo", label: "Reply-to (if different)", mono: true },
  ];

export function InvoiceCheckForm({ suppliers }: { suppliers: Supplier[] }) {
  const [read, readAction, reading] = useActionState<ReadState, FormData>(readInvoice, {});
  const [check, checkAction, checking] = useActionState<CheckState, FormData>(runSupplierCheck, {});
  const [fileName, setFileName] = useState<string>();
  const v = read.fields ?? {};

  return (
    <div className="flex flex-col gap-8">
      <form action={readAction} className="panel flex flex-col gap-4">
        <div>
          <h2 className="panel-title">1. Upload the invoice or payment email (optional)</h2>
          <p className="muted">
            We read it with AI and fill in the form below. You can also type the details.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-brand hover:bg-brand-light/40">
          <FileUp className="size-7 text-brand" aria-hidden />
          <span className="text-14 font-semibold text-gray-900">
            {fileName ?? "Choose a PDF or image"}
          </span>
          <span className="text-12 text-gray-500">PDF, JPG, PNG or WebP · up to 8 MB</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name)}
          />
        </label>
        <button type="submit" disabled={reading || !fileName} className="btn-secondary self-start">
          {reading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Reading…
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Read invoice
            </>
          )}
        </button>
        {read.error && (
          <p role="alert" className="text-14 text-risk-critical">
            {read.error}
          </p>
        )}
        {read.fields && (
          <p role="status" className="text-14 text-success-700">
            ✓ Read {read.fileName} in {((read.ms ?? 0) / 1000).toFixed(1)} s. Check the fields
            below.
          </p>
        )}
      </form>

      <form key={JSON.stringify(v)} action={checkAction} className="panel flex flex-col gap-5">
        <div>
          <h2 className="panel-title">2. Check before you pay</h2>
          <p className="muted">
            SSM, LHDN TIN and e-invoice, account name, scam reports, your payment history and email
            domain are checked together.
          </p>
        </div>
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="label">Known supplier (optional)</span>
          <select name="supplierId" defaultValue="" className="input-class h-11 px-3">
            <option value="">Match automatically from SSM / TIN / name</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.name} className="flex flex-col gap-1.5">
              <span className="label">{f.label}</span>
              <input
                name={f.name}
                defaultValue={v[f.name]}
                placeholder={f.placeholder}
                className={`input-class h-11 px-3 ${f.mono ? "font-mono" : ""}`}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-14 text-gray-700">
            <input
              type="checkbox"
              name="bankChangeLanguage"
              defaultChecked={v.bankChangeLanguage === "on"}
              className="size-4 accent-brand"
            />
            Says the bank account has changed
          </label>
          <label className="flex items-center gap-2 text-14 text-gray-700">
            <input
              type="checkbox"
              name="urgencyLanguage"
              defaultChecked={v.urgencyLanguage === "on"}
              className="size-4 accent-brand"
            />
            Pressure to pay urgently
          </label>
        </div>
        <button type="submit" disabled={checking} className="btn-primary h-11 self-start px-8">
          {checking ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Checking…
            </>
          ) : (
            "Run checks"
          )}
        </button>
        {check.error && (
          <p role="alert" className="text-14 text-risk-critical">
            {check.error}
          </p>
        )}
      </form>
    </div>
  );
}
