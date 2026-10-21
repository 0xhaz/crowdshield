import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { Config } from "./config.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: process.env.NODE_ENV === "test" ? ["error"] : ["log", "warn", "error"],
});
const config = app.get(Config);
app.disable("x-powered-by");
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
