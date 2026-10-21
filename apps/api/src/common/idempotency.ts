import { Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { InjectRedis } from "../infra.js";

/** Replays the first response for a repeated Idempotency-Key (24 h), per caller and operation. */
@Injectable()
export class IdempotencyService {
  private readonly log = new Logger("idempotency");
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async run<T>(scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();
    const k = `idem:${scope}:${key}`;
    try {
      const hit = await this.redis.get(k);
      if (hit) return JSON.parse(hit) as T;
    } catch (e) {
      this.log.warn(`redis unavailable, not deduplicating: ${(e as Error).message}`);
    }
    const result = await fn();
    await this.redis.set(k, JSON.stringify(result), "EX", 86_400).catch(() => undefined);
    return result;
  }
}
