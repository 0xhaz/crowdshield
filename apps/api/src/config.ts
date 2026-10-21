import { loadRootEnv, requireEnv } from "@crowdshield/db";

export class Config {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly pepper: string;
  readonly encKey: string;
  readonly jwtSecret: Uint8Array;
  readonly botApiKey: string;
  readonly port: number;
  readonly corsOrigins: string[];
  readonly mlUrl: string;
  readonly mlKey: string;
  readonly tokenTtlHours = 12;

  constructor() {
    loadRootEnv();
    this.databaseUrl = requireEnv("DATABASE_URL");
    this.redisUrl = requireEnv("REDIS_URL");
    this.pepper = requireEnv("IDENTIFIER_HMAC_PEPPER");
    this.encKey = requireEnv("IDENTIFIER_ENC_KEY");
    const jwt = requireEnv("JWT_SECRET");
    if (jwt.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
    this.jwtSecret = new TextEncoder().encode(jwt);
    this.botApiKey = requireEnv("BOT_API_KEY");
    this.port = Number(
      process.env.API_PORT ?? new URL(process.env.API_URL ?? "http://localhost:4000").port ?? 4000,
    );
    this.corsOrigins = (process.env.WEB_URL ?? "http://localhost:3020").split(",");
    this.mlUrl = process.env.ML_GATEWAY_URL ?? "http://localhost:8020";
    this.mlKey = process.env.ML_API_KEY ?? "";
  }

  get secrets() {
    return { pepper: this.pepper, encKey: this.encKey };
  }
}
