"use server";

import type { PayeeCheckResult } from "@crowdshield/contracts";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { api, errorMessage } from "../api";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export type ActionState = { error?: string; ok?: string };

export async function alertAction(_: ActionState, f: FormData): Promise<ActionState> {
  const id = str(f, "id")!;
  const action = str(f, "action") as "hold";
  try {
    await (
      await api()
    ).call("alertAction", { params: { id }, body: { action, note: str(f, "note") } });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/bank/alerts/${id}`);
  revalidatePath("/bank");
  return { ok: `Done: ${action.replace(/_/g, " ")}` };
}

export async function entityAction(_: ActionState, f: FormData): Promise<ActionState> {
  const id = Number(str(f, "id"));
  const action = str(f, "action") as "confirm_mule";
  try {
    await (
      await api()
    ).call("entityAction", { params: { id }, body: { action, note: str(f, "note") } });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/bank/entities/${id}`);
  return { ok: `Done: ${action.replace(/_/g, " ")}` };
}

export async function decideAppeal(_: ActionState, f: FormData): Promise<ActionState> {
  const id = str(f, "appealId")!;
  try {
    await (
      await api()
    ).call("decideAppeal", { params: { id }, body: { decision: str(f, "decision") as "upheld" } });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/bank/entities/${str(f, "entityId")}`);
  return { ok: "Appeal decided" };
}

export type PayeeState = {
  error?: string;
  result?: z.infer<typeof PayeeCheckResult>;
  input?: Record<string, string>;
};

export async function payeeCheck(_: PayeeState, f: FormData): Promise<PayeeState> {
  const input = Object.fromEntries(
    [...f.entries()].filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  const amount = Number(str(f, "amount")?.replace(/[,\s]|rm/gi, ""));
  if (!str(f, "account")) return { error: "Enter the payee's account number.", input };
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Enter the transfer amount.", input };
  const callActive = f.get("callActive") === "on";
  try {
    const result = await (
      await api()
    ).call("payeeCheck", {
      body: {
        payee: {
          type: str(f, "type") === "ewallet" ? "ewallet" : "bank_account",
          value: str(f, "account")!,
          bank: str(f, "bank"),
          provider: str(f, "bank"),
        },
        amountMyr: amount,
        rail: (str(f, "rail") ?? "duitnow") as "duitnow",
        callSignal: callActive
          ? {
              active: true,
              caller: str(f, "caller") ? { type: "phone", value: str(f, "caller")! } : undefined,
            }
          : undefined,
      },
    });
    revalidatePath("/bank");
    return { result, input };
  } catch (e) {
    return { error: errorMessage(e), input };
  }
}
