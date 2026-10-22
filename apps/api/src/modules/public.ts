// "Try it now" on the landing page: anyone can paste a message or drop a screenshot without signing
// in. Same deterministic lookups as the bot; Nemotron reads screenshots and names the scam pattern;
// the script is matched to known campaigns. Nothing is stored, and each IP is rate-limited.
import type {
  AiTrace,
  PublicCheckInput,
  PublicLookupInput,
  PublicScreenshotInput,
} from "@crowdshield/contracts";
import { SCAM_TYPE_ACTION, type ScamTypeKey } from "@crowdshield/i18n";
import { detectIdentifiers } from "@crowdshield/normalise";
import {
  BadRequestException,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { MlClient } from "../common/ml.js";
import { Body, Route } from "../common/route.js";
import { VerdictService } from "../common/verdicts.js";
import { InjectRedis } from "../infra.js";
import { CampaignService } from "./campaigns.js";

type Trace = z.output<typeof AiTrace>;
type Classified = {
  scamType: string;
  summary: { en: string; ms: string };
  needsReview?: boolean;
  trace: Trace;
};
type Screenshot = Classified & { text: string };

/** Per IP, per 10 minutes; plus a daily ceiling on screenshots across everyone (model cost). */
const LIMITS = { check: 30, screenshot: 6, lookup: 120 } as const;
const SCREENSHOTS_PER_DAY = 500;
const MIN_PATTERN_CHARS = 30;
const MAX_IMAGE_BYTES = 5_500_000;

const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().ip ?? "unknown",
);

const tooMany = () =>
  new HttpException(
    "Too many checks, please try again in a few minutes",
    HttpStatus.TOO_MANY_REQUESTS,
  );

/** One trace for the whole check: calls from each step, wall-clock time. */
function mergeTraces(traces: (Trace | null | undefined)[], ms: number): Trace | null {
  const t = traces.filter((x): x is Trace => !!x);
  if (!t.length) return null;
  return {
    calls: t.flatMap((x) => x.calls),
    totalMs: Math.round(ms),
    cached: t.every((x) => x.cached),
  };
}

@Injectable()
export class PublicCheckService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly ml: MlClient,
    private readonly verdicts: VerdictService,
    private readonly campaigns: CampaignService,
    private readonly audit: AuditService,
  ) {}

  async limit(kind: keyof typeof LIMITS, ip: string) {
    try {
      const k = `rl:${kind}:${ip}`;
      const n = await this.redis.incr(k);
      if (n === 1) await this.redis.expire(k, 600);
      if (n > LIMITS[kind]) throw tooMany();
      if (kind === "screenshot") {
        const day = `rl:screenshot-day:${new Date().toISOString().slice(0, 10)}`;
        const total = await this.redis.incr(day);
        if (total === 1) await this.redis.expire(day, 86_400);
        if (total > SCREENSHOTS_PER_DAY) throw tooMany();
      }
    } catch (e) {
      if (e instanceof HttpException) throw e; // Redis down: fail open, the gateway has its own limits
    }
  }

  async check(text: string) {
    const started = performance.now();
    const long = text.trim().length >= MIN_PATTERN_CHARS;
    const [verdicts, classified, campaign] = await Promise.all([
      this.lookups(text),
      long ? this.ml.post<Classified>("/v1/classify", { text }).catch(() => null) : null,
      long ? this.campaigns.match(text).catch(() => null) : null,
    ]);
    return this.result(verdicts, classified, null, campaign, performance.now() - started);
  }

  async screenshot(input: z.output<typeof PublicScreenshotInput>) {
    const started = performance.now();
    const data = Buffer.from(input.imageBase64, "base64");
    if (data.length < 100 || data.length > MAX_IMAGE_BYTES)
      throw new BadRequestException("The image must be under 5.5 MB");
    const read = await this.ml.upload<Screenshot>("/v1/screenshot", data, input.mime);
    const text = read.text ?? "";
    const [verdicts, campaign] = await Promise.all([
      this.lookups(text),
      text.trim().length >= MIN_PATTERN_CHARS ? this.campaigns.match(text).catch(() => null) : null,
    ]);
    return this.result(verdicts, read, text || null, campaign, performance.now() - started);
  }

  async lookupMany(ids: z.output<typeof PublicLookupInput>["identifiers"]) {
    // invalid values (a stray digit run that isn't a real number) are skipped, not an error
    const out = await Promise.all(ids.map((i) => this.verdicts.lookup(i).catch(() => null)));
    const verdicts = out.filter((v): v is NonNullable<typeof v> => v !== null);
    await this.audit.log(undefined, "public_lookup", null, { identifiers: ids.length });
    return { verdicts };
  }

  async news() {
    return this.ml.get<Record<string, unknown>>("/v1/news?days=7", 90_000);
  }

  private async lookups(text: string) {
    const found = detectIdentifiers(text);
    return Promise.all(found.map((f) => this.verdicts.lookup({ type: f.type, value: f.value })));
  }

  private async result(
    verdicts: Awaited<ReturnType<VerdictService["lookup"]>>[],
    classified: Classified | null,
    transcript: string | null,
    campaign: Awaited<ReturnType<CampaignService["match"]>> | null,
    ms: number,
  ) {
    const pattern =
      classified && !classified.needsReview
        ? {
            scamType: classified.scamType,
            summary: classified.summary,
            action: SCAM_TYPE_ACTION[classified.scamType as ScamTypeKey] ?? null,
          }
        : null;
    await this.audit.log(undefined, "public_check", null, {
      identifiers: verdicts.length,
      screenshot: transcript !== null,
      scamType: pattern?.scamType ?? null,
      campaign: campaign?.campaign?.id ?? null,
    });
    return {
      verdicts,
      pattern,
      transcript,
      campaign: campaign?.campaign ?? null,
      trace: mergeTraces([classified?.trace, campaign?.trace], ms),
    };
  }
}

@Controller()
export class PublicController {
  constructor(private readonly svc: PublicCheckService) {}

  @Route("publicCheck")
  async check(@Body() input: z.output<typeof PublicCheckInput>, @ClientIp() ip: string) {
    await this.svc.limit("check", ip);
    return this.svc.check(input.text);
  }

  @Route("publicLookup")
  async lookup(@Body() input: z.output<typeof PublicLookupInput>, @ClientIp() ip: string) {
    await this.svc.limit("lookup", ip);
    return this.svc.lookupMany(input.identifiers);
  }

  @Route("publicScreenshot")
  async screenshot(@Body() input: z.output<typeof PublicScreenshotInput>, @ClientIp() ip: string) {
    await this.svc.limit("screenshot", ip);
    return this.svc.screenshot(input);
  }

  @Route("news")
  news() {
    return this.svc.news();
  }
}
