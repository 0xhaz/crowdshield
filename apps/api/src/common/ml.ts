// Client for the internal ML gateway (apps/ml). snake_case on the wire, camelCase in contracts.
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Config } from "../config.js";

type Snake = Record<string, unknown>;

const camel = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(camel);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Snake).map(([k, x]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camel(x),
      ]),
    );
  }
  return v;
};

@Injectable()
export class MlClient {
  private readonly log = new Logger("ml");
  constructor(private readonly config: Config) {}

  post<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
    return this.request<T>(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
  }

  get<T>(path: string, timeoutMs = 20_000): Promise<T> {
    return this.request<T>(path, { method: "GET" }, timeoutMs);
  }

  /** Multipart upload (screenshots, invoices). */
  upload<T>(path: string, data: Buffer, mime: string, timeoutMs = 30_000): Promise<T> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type: mime }), "upload");
    return this.request<T>(path, { method: "POST", body: form }, timeoutMs);
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const started = Date.now();
    try {
      const res = await fetch(new URL(path, this.config.mlUrl), {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          "x-internal-key": this.config.mlKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`ML gateway ${res.status}`);
      const out = camel(await res.json()) as T;
      this.log.log(`${path} ${Date.now() - started}ms`);
      return out;
    } catch (e) {
      this.log.warn(`${path} failed after ${Date.now() - started}ms: ${(e as Error).message}`);
      throw new ServiceUnavailableException("The AI service is unavailable right now");
    }
  }
}
