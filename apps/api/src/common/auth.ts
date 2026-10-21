import { type RouteDef } from "@crowdshield/contracts";
import { appUser, org } from "@crowdshield/db";
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import { timingSafeEqual } from "node:crypto";
import { Config } from "../config.js";
import { type Db, InjectDb } from "../infra.js";
import { routeOf } from "./route.js";

export type UserPrincipal = {
  kind: "user";
  userId: string;
  orgId: string;
  orgKind: string;
  role: string;
};
export type ServicePrincipal = { kind: "service"; name: string };
export type Principal = UserPrincipal | ServicePrincipal;

declare module "express" {
  interface Request {
    principal?: Principal;
  }
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class TokenService {
  constructor(private readonly config: Config) {}

  async sign(p: UserPrincipal): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.config.tokenTtlHours * 3_600_000);
    const token = await new SignJWT({ org: p.orgId, ok: p.orgKind, role: p.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(p.userId)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .setIssuer("crowdshield-api")
      .sign(this.config.jwtSecret);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<UserPrincipal> {
    const { payload } = await jwtVerify(token, this.config.jwtSecret, {
      issuer: "crowdshield-api",
      algorithms: ["HS256"],
    });
    return {
      kind: "user",
      userId: payload.sub!,
      orgId: String(payload.org),
      orgKind: String(payload.ok),
      role: String(payload.role),
    };
  }
}

/** Global guard: every route declares its auth rule in the contracts registry. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly config: Config,
    @InjectDb() private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const route: RouteDef | undefined = routeOf(ctx);
    if (!route) return true; // non-API routes (none today)
    const req = ctx.switchToHttp().getRequest<Request>();
    req.principal = await this.authenticate(req);
    const auth = route.auth;
    if (auth === "public") return true;
    const p = req.principal;
    if (!p) throw new UnauthorizedException("Sign in or provide an API key");
    if (auth === "any") return true;
    if (auth === "service") {
      if (p.kind === "service" || (p.kind === "user" && p.role === "admin")) return true;
      throw new ForbiddenException("Service key required");
    }
    if (p.kind === "user" && auth.includes(p.role as never)) return true;
    throw new ForbiddenException("Your role can't use this endpoint");
  }

  private async authenticate(req: Request): Promise<Principal | undefined> {
    const key = req.header("x-api-key");
    if (key) {
      if (safeEqual(key, this.config.botApiKey)) return { kind: "service", name: "bot" };
      throw new UnauthorizedException("Invalid API key");
    }
    const header = req.header("authorization");
    if (!header) return undefined;
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token)
      throw new UnauthorizedException("Use a Bearer token");
    let p: UserPrincipal;
    try {
      p = await this.tokens.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    // Revocation check: the user must still exist in the same org with the same role
    const [u] = await this.db
      .select({ role: appUser.role, orgId: appUser.orgId, orgKind: org.kind })
      .from(appUser)
      .innerJoin(org, eq(org.id, appUser.orgId))
      .where(eq(appUser.id, p.userId));
    if (!u || u.role !== p.role || u.orgId !== p.orgId)
      throw new UnauthorizedException("Session no longer valid");
    return p;
  }
}

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().principal,
);

export function requireUser(p: Principal | undefined): UserPrincipal {
  if (p?.kind !== "user") throw new ForbiddenException("A signed-in user is required");
  return p;
}

export const actorId = (p: Principal | undefined) => (p?.kind === "user" ? p.userId : null);
export const isAdmin = (p: Principal | undefined) => p?.kind === "user" && p.role === "admin";
