"use server";

// The customer banking-app demo: the bank's own backend asks CrowdShield about the payee, with the
// live call signal from the phone, using the bank's partner key (no CrowdShield user session).
import { createClient, type PayeeCheckResult } from "@crowdshield/contracts";
import { headers } from "next/headers";
import type { z } from "zod";
import { apiBase, errorMessage } from "../api";

export type AppTransferState = {
  error?: string;
  result?: z.infer<typeof PayeeCheckResult>;
  amount?: number;
};

const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 30; // per visitor per 10 minutes: this page writes alerts into the bank's queue

async function limited() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || e.reset < now) hits.set(ip, { n: 1, reset: now + 600_000 });
  else if (++e.n > LIMIT) return true;
  return false;
}

export async function appTransfer(_: AppTransferState, f: FormData): Promise<AppTransferState> {
  const key = process.env.BANK_PARTNER_KEY;
  if (!key) return { error: "The banking-app demo isn't configured (BANK_PARTNER_KEY)." };
  if (await limited()) return { error: "Too many transfers. Please try again in a few minutes." };
  const account = String(f.get("account") ?? "").trim();
  const bank = String(f.get("bank") ?? "").trim();
  const amount = Number(String(f.get("amount") ?? "").replace(/[,\s]|rm/gi, ""));
  if (!account) return { error: "Enter the account number." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
    return { error: "Enter an amount." };
  const onCall = f.get("onCall") === "on";
  try {
    const result = await createClient({ baseUrl: apiBase(), apiKey: key }).call("payeeCheck", {
      body: {
        payee: { type: "bank_account", value: `${bank} ${account}`.trim() },
        amountMyr: amount,
        rail: "duitnow",
        callSignal: onCall
          ? { active: true, caller: { type: "phone", value: String(f.get("caller") ?? "") } }
          : { active: false },
      },
    });
    return { result, amount };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
