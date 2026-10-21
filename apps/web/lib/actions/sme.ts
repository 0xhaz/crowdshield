"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, errorMessage } from "../api";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export type InvoiceFields = Partial<
  Record<
    | "supplierName"
    | "ssmNo"
    | "tin"
    | "bank"
    | "account"
    | "accountHolderName"
    | "amountMyr"
    | "invoiceNo"
    | "einvoiceUuid"
    | "phone"
    | "emailFrom"
    | "replyTo"
    | "bankChangeLanguage"
    | "urgencyLanguage",
    string
  >
>;
export type ReadState = { fields?: InvoiceFields; error?: string; fileName?: string; ms?: number };

/** Reads an uploaded invoice with Nemotron VL through the internal ML gateway (server side only). */
export async function readInvoice(_: ReadState, f: FormData): Promise<ReadState> {
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a PDF or image of the invoice." };
  if (file.size > 8 * 1024 * 1024) return { error: "The file is larger than 8 MB." };
  const form = new FormData();
  form.append("file", file, file.name);
  const started = Date.now();
  try {
    const res = await fetch(
      new URL("/v1/invoice", process.env.ML_GATEWAY_URL ?? "http://localhost:8020"),
      {
        method: "POST",
        headers: { "x-internal-key": process.env.ML_API_KEY ?? "" },
        body: form,
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!res.ok)
      return {
        error:
          res.status === 415
            ? "Upload a PDF, JPG, PNG or WebP file."
            : "Couldn't read the invoice right now. You can type the details instead.",
      };
    const r = (await res.json()) as Record<string, string | number | boolean | null>;
    if (r.needs_review)
      return { error: "We couldn't read this invoice automatically. Please type the details." };
    const s = (k: string) => (r[k] === null || r[k] === undefined ? undefined : String(r[k]));
    return {
      fileName: file.name,
      ms: Date.now() - started,
      fields: {
        supplierName: s("supplier_name"),
        ssmNo: s("ssm_no"),
        tin: s("tin"),
        bank: s("bank"),
        account: s("account"),
        accountHolderName: s("account_holder_name"),
        amountMyr: s("amount_myr"),
        invoiceNo: s("invoice_no"),
        einvoiceUuid: s("einvoice_uuid"),
        phone: s("phone"),
        emailFrom: s("email_from"),
        replyTo: s("reply_to"),
        bankChangeLanguage: r.bank_change_language ? "on" : undefined,
        urgencyLanguage: r.urgency_language ? "on" : undefined,
      },
    };
  } catch {
    return { error: "Couldn't reach the document reader. You can type the details instead." };
  }
}

export type CheckState = { error?: string };

export async function runSupplierCheck(_: CheckState, f: FormData): Promise<CheckState> {
  const amount = str(f, "amountMyr")
    ? Number(str(f, "amountMyr")!.replace(/[,\s]|rm/gi, ""))
    : undefined;
  let checkId: string;
  try {
    const r = await (
      await api()
    ).call("supplierCheck", {
      body: {
        supplierId: str(f, "supplierId"),
        channel: "web",
        invoice: {
          supplierName: str(f, "supplierName"),
          ssmNo: str(f, "ssmNo"),
          tin: str(f, "tin"),
          bank: str(f, "bank"),
          account: str(f, "account"),
          accountHolderName: str(f, "accountHolderName"),
          amountMyr: Number.isFinite(amount) ? amount : undefined,
          invoiceNo: str(f, "invoiceNo"),
          einvoiceUuid: str(f, "einvoiceUuid"),
          phone: str(f, "phone"),
          emailFrom: str(f, "emailFrom"),
          replyTo: str(f, "replyTo"),
          bankChangeLanguage: f.get("bankChangeLanguage") === "on",
          urgencyLanguage: f.get("urgencyLanguage") === "on",
        },
      },
    });
    checkId = r.checkId;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/sme");
  redirect(`/sme/checks/${checkId}`);
}

export type SimpleState = { error?: string; ok?: string };

export async function toggleHoldStep(_: SimpleState, f: FormData): Promise<SimpleState> {
  try {
    await (
      await api()
    ).call("updateHoldChecklist", {
      params: { id: str(f, "id")! },
      body: { step: str(f, "step")!, done: f.get("done") === "true" },
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/sme/holds");
  return {};
}

export async function decideHold(_: SimpleState, f: FormData): Promise<SimpleState> {
  const decision = str(f, "decision") as "verified" | "rejected";
  try {
    await (
      await api()
    ).call("decideHold", {
      params: { id: str(f, "id")! },
      body: { decision, note: str(f, "note") },
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/sme/holds");
  revalidatePath("/sme");
  return {
    ok:
      decision === "verified"
        ? "Payment released; the new account is now the supplier's usual account."
        : "Rejected. The fake account was reported to CrowdShield to protect other businesses and banks.",
  };
}

export async function createSupplier(_: SimpleState, f: FormData): Promise<SimpleState> {
  const name = str(f, "name");
  if (!name) return { error: "Enter the supplier's name." };
  try {
    await (
      await api()
    ).call("createSupplier", {
      body: {
        name,
        ssmNo: str(f, "ssmNo"),
        tin: str(f, "tin"),
        bank: str(f, "bank"),
        account: str(f, "account"),
        accountHolderName: str(f, "accountHolderName"),
        callbackPhone: str(f, "callbackPhone"),
        emailDomain: str(f, "emailDomain"),
      },
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/sme/suppliers");
  return { ok: `${name} added.` };
}
