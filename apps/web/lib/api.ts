import "server-only";
import {
  ApiError,
  type CallArgs,
  createClient,
  type Me,
  type ResponseOf,
  type RouteId,
  routes,
} from "@crowdshield/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getToken } from "./session";

export const apiBase = () => process.env.API_URL ?? "http://localhost:4020";

/** Typed API client authenticated as the signed-in user. Expired sessions go back to sign-in. */
export async function api() {
  const token = await getToken();
  if (!token) redirect("/sign-in");
  const client = createClient({ baseUrl: apiBase(), token });
  return {
    async call<K extends RouteId>(id: K, args?: CallArgs<K>): Promise<ResponseOf<K>> {
      try {
        return await client.call(id, args);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) redirect("/sign-in?expired=1");
        // pages only: a missing record shows the not-found page; actions handle 404 themselves
        if (e instanceof ApiError && e.status === 404 && routes[id].method === "get") notFound();
        throw e;
      }
    },
  };
}

/** The signed-in user, once per request. */
export const getMe = cache(async (): Promise<Me> => (await api()).call("me"));

export const isBank = (me: Me) => ["bank_analyst", "bank_supervisor", "admin"].includes(me.role);
export const isSme = (me: Me) => ["sme_owner", "sme_member"].includes(me.role);
export const homeFor = (me: Me) => (isSme(me) ? "/sme" : "/bank");

/** Returns an error message instead of throwing, for server actions that render it. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const issues = e.body.issues as { message?: string; path?: unknown[] }[] | undefined;
    if (issues?.length)
      return issues.map((i) => `${(i.path ?? []).join(".")}: ${i.message}`).join("; ");
    return e.body.message ?? e.message;
  }
  return "Something went wrong. Please try again.";
}
