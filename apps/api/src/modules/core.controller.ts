import { buildOpenApi, type IdentifierInput, type LoginInput } from "@crowdshield/contracts";
import { appUser, org } from "@crowdshield/db";
import { verifyPassword } from "@crowdshield/graph";
import { Controller, UnauthorizedException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, type Principal, requireUser, TokenService } from "../common/auth.js";
import { Body, Query, Route } from "../common/route.js";
import { VerdictService } from "../common/verdicts.js";
import { Config } from "../config.js";
import { type Db, InjectDb, InjectRedis } from "../infra.js";

@Controller()
export class CoreController {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly tokens: TokenService,
    private readonly verdicts: VerdictService,
    private readonly audit: AuditService,
    private readonly config: Config,
  ) {}

  @Route("health")
  async health() {
    const [db, redis] = await Promise.all([
      this.db.execute(sql`SELECT 1`).then(
        () => true,
        () => false,
      ),
      this.redis.ping().then(
        () => true,
        () => false,
      ),
    ]);
    return { ok: db && redis, db, redis };
  }

  @Route("openapi")
  openapi() {
    return buildOpenApi(`http://localhost:${this.config.port}`);
  }

  @Route("login")
  async login(@Body() input: z.output<typeof LoginInput>) {
    const [u] = await this.db
      .select({ user: appUser, org })
      .from(appUser)
      .innerJoin(org, eq(org.id, appUser.orgId))
      .where(eq(appUser.email, input.email.toLowerCase()));
    // same error and similar timing whether or not the email exists
    const ok = verifyPassword(
      input.password,
      u?.user.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA",
    );
    if (!u || !ok) throw new UnauthorizedException("Wrong email or password");
    await this.db.update(appUser).set({ lastLoginAt: new Date() }).where(eq(appUser.id, u.user.id));
    const { token, expiresAt } = await this.tokens.sign({
      kind: "user",
      userId: u.user.id,
      orgId: u.org.id,
      orgKind: u.org.kind,
      role: u.user.role,
    });
    return { token, expiresAt: expiresAt.toISOString(), user: this.toMe(u.user, u.org) };
  }

  @Route("me")
  async me(@CurrentPrincipal() p: Principal) {
    const user = requireUser(p);
    const [u] = await this.db
      .select({ user: appUser, org })
      .from(appUser)
      .innerJoin(org, eq(org.id, appUser.orgId))
      .where(eq(appUser.id, user.userId));
    return this.toMe(u!.user, u!.org);
  }

  @Route("lookup")
  async lookup(@Query() input: z.output<typeof IdentifierInput>, @CurrentPrincipal() p: Principal) {
    const verdict = await this.verdicts.lookup(input);
    await this.audit.log(p, "lookup", verdict.entity.id, {
      type: input.type,
      tier: verdict.tier,
      found: verdict.entity.id !== null,
    });
    return verdict;
  }

  private toMe(u: typeof appUser.$inferSelect, o: typeof org.$inferSelect) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      org: { id: o.id, name: o.name, kind: o.kind },
    };
  }
}
