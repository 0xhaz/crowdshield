import type { z } from "zod";
import type { RouteDef, RouteId, Routes } from "./routes.js";
import { routes } from "./routes.js";

type PathParams<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in Name | keyof PathParams<`/${Rest}`>]: string | number }
  : P extends `${string}:${infer Name}`
    ? { [K in Name]: string | number }
    : Record<never, never>;

type Args<R extends RouteDef> = (keyof PathParams<R["path"]> extends never
  ? { params?: undefined }
  : { params: PathParams<R["path"]> }) &
  (R["query"] extends z.ZodType ? { query?: z.input<R["query"]> } : { query?: undefined }) &
  (R["body"] extends z.ZodType ? { body: z.input<R["body"]> } : { body?: undefined }) & {
    idempotencyKey?: string;
  };

export type ResponseOf<K extends RouteId> = z.output<Routes[K]["response"]>;
export type CallArgs<K extends RouteId> = Args<Routes[K]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error?: string; message?: string; issues?: unknown[] },
  ) {
    super(body.message ?? `HTTP ${status}`);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  token?: string | (() => string | undefined);
  apiKey?: string;
  fetch?: typeof fetch;
}

/** Typed client over the route registry: `api.call("lookup", { query: { type: "phone", value } })`. */
export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? fetch;
  return {
    async call<K extends RouteId>(
      id: K,
      args: Args<Routes[K]> = {} as Args<Routes[K]>,
    ): Promise<ResponseOf<K>> {
      const r: RouteDef = routes[id];
      const a = args as {
        params?: Record<string, string | number>;
        query?: Record<string, unknown>;
        body?: unknown;
        idempotencyKey?: string;
      };
      let path = r.path.replace(/:(\w+)/g, (_, k: string) =>
        encodeURIComponent(String(a.params?.[k])),
      );
      if (a.query) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(a.query))
          if (v !== undefined && v !== null) qs.set(k, String(v));
        if ([...qs].length) path += `?${qs}`;
      }
      const token = typeof options.token === "function" ? options.token() : options.token;
      const headers: Record<string, string> = { accept: "application/json" };
      if (a.body !== undefined) headers["content-type"] = "application/json";
      if (token) headers.authorization = `Bearer ${token}`;
      if (options.apiKey) headers["x-api-key"] = options.apiKey;
      if (a.idempotencyKey) headers["idempotency-key"] = a.idempotencyKey;
      const res = await doFetch(new URL(path, options.baseUrl), {
        method: r.method.toUpperCase(),
        headers,
        body: a.body === undefined ? undefined : JSON.stringify(a.body),
      });
      const body = res.status === 204 ? undefined : await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body ?? {});
      return body as ResponseOf<K>;
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
