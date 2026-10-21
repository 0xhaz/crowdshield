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

  async post<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
    const started = Date.now();
    try {
      const res = await fetch(new URL(path, this.config.mlUrl), {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-key": this.config.mlKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`ML gateway ${res.status}`);
      const out = camel(await res.json()) as T;
      this.log.log(`${path} ${Date.now() - started}ms`);
      return out;
    } catch (e) {
      this.log.warn(`${path} failed after ${Date.now() - started}ms: ${(e as Error).message}`);
      throw new ServiceUnavailableException("Web check is unavailable right now");
    }
  }
}
