"use server";

import { ApiError, createClient } from "@crowdshield/contracts";
import { redirect } from "next/navigation";
import { apiBase, homeFor } from "../api";
import { clearToken, setToken } from "../session";

export type LoginState = { error?: string; email?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  let target: string;
  try {
    const res = await createClient({ baseUrl: apiBase() }).call("login", {
      body: { email, password },
    });
    await setToken(res.token, res.expiresAt);
    target = homeFor(res.user);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 400))
      return { error: "Wrong email or password.", email };
    return { error: "Can't reach the CrowdShield API. Is it running?", email };
  }
  redirect(target);
}

export async function logout() {
  await clearToken();
  redirect("/sign-in");
}
