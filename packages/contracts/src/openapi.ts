import { z } from "zod";
import { type RouteDef, routes } from "./routes.js";
import { ErrorBody } from "./schemas.js";

const jsonSchema = (schema: z.ZodType, io: "input" | "output") =>
  z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any" });

function parameters(r: RouteDef) {
  const params = [...r.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (r.query) {
    const q = jsonSchema(r.query, "input") as {
      properties?: Record<string, object>;
      required?: string[];
    };
    for (const [name, schema] of Object.entries(q.properties ?? {})) {
      params.push({
        name,
        in: "query",
        required: q.required?.includes(name) ?? false,
        schema: schema as { type: string },
      });
    }
  }
  if (r.idempotent)
    params.push({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      schema: { type: "string" },
    });
  return params;
}

/** OpenAPI 3.1 document for /v1, generated from the route registry. */
export function buildOpenApi(serverUrl = "http://localhost:4000") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [id, r] of Object.entries(routes) as [string, RouteDef][]) {
    const path = r.path.replace(/:(\w+)/g, "{$1}");
    paths[path] ??= {};
    paths[path][r.method] = {
      operationId: id,
      summary: r.summary,
      security:
        r.auth === "public" ? [] : r.auth === "service" ? [{ apiKey: [] }] : [{ bearer: [] }],
      "x-roles": Array.isArray(r.auth) ? r.auth : undefined,
      parameters: parameters(r),
      requestBody: r.body
        ? {
            required: true,
            content: { "application/json": { schema: jsonSchema(r.body, "input") } },
          }
        : undefined,
      responses: {
        200: {
          description: "OK",
          content: { "application/json": { schema: jsonSchema(r.response, "output") } },
        },
        default: {
          description: "Error",
          content: { "application/json": { schema: jsonSchema(ErrorBody, "output") } },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "CrowdShield API",
      version: "1.0.0",
      description: "Scam intelligence graph: lookup, reports, payee check, cases, Semak supplier.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description: "Service key (bot); also accepted wherever a bearer token is",
        },
      },
    },
    paths,
  };
}
