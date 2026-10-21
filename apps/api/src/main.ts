import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "./app.module.js";
import { Config } from "./config.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: process.env.NODE_ENV === "test" ? ["error"] : ["log", "warn", "error"],
});
const config = app.get(Config);
app.disable("x-powered-by");
// Behind Caddy on the same host: req.ip is the client's address (public check rate limits)
app.set("trust proxy", "loopback");
// Screenshots on the public check arrive as base64; everything else stays at 1 MB
app.use("/v1/public/screenshot", express.json({ limit: "8mb" }));
app.useBodyParser("json", { limit: "1mb" });
app.enableCors({
  origin: config.corsOrigins,
  credentials: false,
  allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-api-key"],
});
app.enableShutdownHooks();
await app.listen(config.port);
new Logger("api").log(
  `CrowdShield API on http://localhost:${config.port}/v1 (OpenAPI: /v1/openapi.json)`,
);
