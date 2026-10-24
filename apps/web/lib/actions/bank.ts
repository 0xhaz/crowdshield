"use server";

import type {
  CaseBrief,
  DetectResult,
  MoneyTrailResult,
  PayeeCheckResult,
} from "@crowdshield/contracts";
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

export type BriefState = { error?: string; brief?: z.infer<typeof CaseBrief> };

/** Nemotron Ultra with reasoning: takes 10–30 s on a fresh case, instant when cached. */
export async function caseBrief(_: BriefState, f: FormData): Promise<BriefState> {
  try {
    return { brief: await (await api()).call("caseBrief", { params: { id: str(f, "id")! } }) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function reviewCampaign(_: ActionState, f: FormData): Promise<ActionState> {
  const decision = str(f, "decision") as "confirm" | "dismiss";
  try {
    await (
      await api()
    ).call("reviewCampaign", { params: { id: Number(str(f, "id")) }, body: { decision } });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/bank/campaigns");
  revalidatePath("/bank");
  return { ok: decision === "confirm" ? "Confirmed: the bot now warns about it" : "Dismissed" };
}

export type DetectState = { error?: string; result?: z.infer<typeof DetectResult> };

export async function detectCampaigns(): Promise<DetectState> {
  try {
    const result = await (await api()).call("detectCampaigns");
    revalidatePath("/bank/campaigns");
    return { result };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export type TrailState = { error?: string; result?: z.infer<typeof MoneyTrailResult> };

/** A transfer the analyst's bank traced (via NSRC / the National Fraud Portal) from an account in the case. */
export async function addTracedHop(_: TrailState, f: FormData): Promise<TrailState> {
  const caseId = str(f, "caseId")!;
  const amount = Number(str(f, "amount")?.replace(/[,\s]|rm/gi, ""));
  const frozen = Number(str(f, "frozen")?.replace(/[,\s]|rm/gi, "") || 0);
  const account = str(f, "account");
  if (!str(f, "from")) return { error: "Choose the account the money left." };
  if (!account)
    return {
      error: "Enter the account that received it, in full (your bank sees it in the trace).",
    };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount." };
  if (!str(f, "txnRef"))
    return {
      error:
        "Enter the transaction reference: it's how a transfer reported by both banks is counted once.",
    };
  if (!Number.isFinite(frozen) || frozen < 0 || frozen > amount)
    return { error: "The frozen amount can't be more than the amount." };
  const at = str(f, "at");
  try {
    const result = await (
      await api()
    ).call("addMoneyTrail", {
      params: { id: caseId },
      body: {
        hops: [
          {
            hopNo: Number(str(f, "hopNo") ?? 2),
            from: { entityId: Number(str(f, "from")) },
            to: { type: "bank_account", value: `${str(f, "bank") ?? ""} ${account}`.trim() },
            amountMyr: amount,
            at: at ? new Date(`${at}:00+08:00`).toISOString() : new Date().toISOString(),
            rail: (str(f, "rail") ?? "duitnow") as "duitnow",
            txnRef: str(f, "txnRef"),
            frozenMyr: frozen,
          },
        ],
      },
    });
    revalidatePath(`/bank/cases/${caseId}`);
    return { result };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
