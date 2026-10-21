// Ties controllers to the route registry in @crowdshield/contracts: HTTP method, path, auth rule,
// and Zod validation of params/query/body and of the response all come from one definition.
import { type RouteDef, type RouteId, routes } from "@crowdshield/contracts";
import {
  applyDecorators,
  BadRequestException,
  type CallHandler,
  createParamDecorator,
  Delete,
  type ExecutionContext,
  Get,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  type NestInterceptor,
  Patch,
  Post,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { map, type Observable } from "rxjs";
import { z } from "zod";

export const ROUTE_ID = "crowdshield:route";
const METHODS = { get: Get, post: Post, patch: Patch, delete: Delete } as const;

export function Route(id: RouteId) {
  const r = routes[id] as RouteDef;
  return applyDecorators(METHODS[r.method](r.path), SetMetadata(ROUTE_ID, id));
}

export function routeOf(ctx: ExecutionContext): RouteDef | undefined {
  const id = Reflect.getMetadata(ROUTE_ID, ctx.getHandler()) as RouteId | undefined;
  return id ? (routes[id] as RouteDef) : undefined;
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ message: "Invalid request", issues: result.error.issues });
  }
  return result.data;
}

/** Validated body, using the route's body schema. */
export const Body = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const r = routeOf(ctx);
  if (!r?.body) throw new Error("route has no body schema");
  return parse(r.body, ctx.switchToHttp().getRequest<Request>().body);
});

/** Validated query, using the route's query schema. */
export const Query = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const r = routeOf(ctx);
  if (!r?.query) throw new Error("route has no query schema");
  return parse(r.query, ctx.switchToHttp().getRequest<Request>().query);
});

/** Path param; `int: true` parses a positive integer id. A malformed id can't exist, so it's a 404. */
export const Param = createParamDecorator(
  (opts: { name: string; int?: boolean }, ctx: ExecutionContext) => {
    const raw = ctx.switchToHttp().getRequest<Request>().params[opts.name];
    const schema = opts.int ? z.coerce.number().int().positive() : z.string().min(1).max(100);
    const r = schema.safeParse(raw);
    if (!r.success) throw new NotFoundException("Not found");
    return r.data;
  },
);
export const IdParam = (int = false) => Param({ name: "id", int });
export const UuidParam = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const r = z.uuid().safeParse(ctx.switchToHttp().getRequest<Request>().params.id);
  if (!r.success) throw new NotFoundException("Not found");
  return r.data;
});

export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const key = ctx.switchToHttp().getRequest<Request>().header("idempotency-key");
  return key ? parse(z.string().min(8).max(200), key) : undefined;
});

/**
 * Validates every response against the route's schema. Unknown fields are stripped, so nothing
 * outside the contract (raw values, internal columns) can leak out of a handler by accident.
 */
@Injectable()
export class ResponseContractInterceptor implements NestInterceptor {
  private readonly log = new Logger("contract");
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const r = routeOf(ctx);
    return next.handle().pipe(
      map((data) => {
        if (!r) return data;
        const result = r.response.safeParse(data);
        if (result.success) return result.data;
        this.log.error(
          `${r.method.toUpperCase()} ${r.path} response violates contract: ${JSON.stringify(result.error.issues).slice(0, 2000)}`,
        );
        throw new InternalServerErrorException("Response did not match the API contract");
      }),
    );
  }
}
