"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

const DEMO = [
  ["Bank analyst", "analyst@nusabank.demo"],
  ["Bank supervisor", "supervisor@nusabank.demo"],
  ["SME owner", "owner@majuvista.demo"],
] as const;

export function AuthForm({ expired }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <section className="auth-form">
      <header className="flex flex-col gap-5 md:gap-8">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" width={34} height={34} alt="" />
          <h1 className="text-26 font-bold text-black-1">CrowdShield</h1>
        </div>
        <div className="flex flex-col gap-1 md:gap-3">
          <h1 className="text-24 lg:text-36 font-semibold text-gray-900">Sign in</h1>
          <p className="text-16 font-normal text-gray-600">
            For bank, e-wallet and business accounts. Accounts are created by invitation.
          </p>
        </div>
      </header>

      {expired && (
        <p className="rounded-lg bg-risk-caution-bg p-3 text-14 text-risk-caution">
          Your session expired. Please sign in again.
        </p>
      )}

      <form action={action} className="space-y-6">
        <div className="form-item">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={state.email}
            placeholder="you@company.my"
            className="input-class h-11 w-full px-3.5"
          />
        </div>
        <div className="form-item">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            className="input-class h-11 w-full px-3.5"
          />
        </div>
        {state.error && (
          <p role="alert" className="form-message text-14">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="form-btn flex h-11 w-full items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <Loader2 size={20} className="animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <details className="rounded-lg border border-gray-200 p-4 text-14 text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700">Demo accounts</summary>
        <ul className="mt-2 space-y-1">
          {DEMO.map(([role, email]) => (
            <li key={email}>
              {role}: <code>{email}</code>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Password: the seed password (<code>crowdshield-demo</code> by default).
        </p>
      </details>
    </section>
  );
}
