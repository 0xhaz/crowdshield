// Starts the built API (dist/main.js) against the seeded test database and a separate Redis DB.
import { createClient } from "@crowdshield/contracts";
import { createDb, loadRootEnv, requireEnv, runMigrations } from "@crowdshield/db";
import { seed } from "@crowdshield/graph";
import { type ChildProcess, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

loadRootEnv();
export const PORT = 4120;
export const BASE = `http://localhost:${PORT}`;
export const BOT_KEY = "test-bot-key-0123456789abcdef0123456789";
export const PASSWORD = "crowdshield-demo";
const ML_PORT = 4121;
const ML_KEY = "test-ml-key";
export const mlCalls: { path: string; body: Record<string, unknown> }[] = [];

/** Canned ML gateway (snake_case, like apps/ml) so API tests never call Nebius or Tavily. */
function fakeMl(): Promise<Server> {
  const lead = (relevant: boolean) => ({
    title: "Forum thread",
    url: "https://forum.my/t/9",
    snippet: "…",
    published_at: null,
    scam_type: relevant ? "investment" : null,
    relevant,
  });
  const now = () => new Date().toISOString();
  const replies: Record<string, (b: Record<string, unknown>) => unknown> = {
    "/v1/web/identifier": (b) => ({
      query: `"${String(b.value)}" scam`,
      leads: [lead(true), lead(false)],
      cached: false,
      fetched_at: now(),
    }),
    "/v1/web/investment": () => ({
      query: "q",
      leads: [lead(true)],
      cached: false,
      fetched_at: now(),
    }),
    "/v1/web/url": (b) => ({
      url: b.url,
      fetched: true,
      title: "LHDN Refund",
      cached: false,
      fetched_at: now(),
      page_check: {
        impersonates: "LHDN",
        has_login_form: true,
        asks_for_otp_or_card: true,
        has_apk_download: false,
        suspicious: true,
        summary: { en: "Fake", ms: "Palsu" },
      },
    }),
    "/v1/web/supplier": (b) => ({
      official_contact: String(b.company).startsWith("Keluvra")
        ? { phone: "03-5121 8800", email: null, source_url: "https://keluvra-steel.com.my/contact" }
        : String(b.company).startsWith("Cemvora")
          ? { phone: "03-7956 1144", email: null, source_url: "https://cemvora.my" }
          : null,
      reputation: [],
      cached: false,
      fetched_at: now(),
    }),
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const reply = replies[req.url ?? ""];
      if (req.headers["x-internal-key"] !== ML_KEY) return void res.writeHead(401).end();
      if (!reply) return void res.writeHead(404).end();
      const body = JSON.parse(raw || "{}") as Record<string, unknown>;
      mlCalls.push({ path: req.url!, body });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply(body)));
    });
  });
  return new Promise((r) => server.listen(ML_PORT, () => r(server)));
}
const secrets = { pepper: "p".repeat(64), encKey: "k".repeat(64) };

export async function startApi(): Promise<{ stop: () => Promise<void> }> {
  const url = requireEnv("DATABASE_URL_TEST");
  const { db, client } = createDb(url, { max: 1 });
  await client.unsafe(
    "SET client_min_messages = warning; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  await runMigrations(url);
  await db.transaction((tx) => seed(tx, secrets, { demoPassword: PASSWORD }));
  await client.end();

  const redisUrl = `${requireEnv("REDIS_URL").replace(/\/\d+$/, "")}/15`;
  const { Redis } = await import("ioredis");
  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();

  const ml = await fakeMl();
  const proc: ChildProcess = spawn(
    process.execPath,
    [fileURLToPath(new URL("../dist/main.js", import.meta.url))],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: url,
        REDIS_URL: redisUrl,
        API_PORT: String(PORT),
        IDENTIFIER_HMAC_PEPPER: secrets.pepper,
        IDENTIFIER_ENC_KEY: secrets.encKey,
        JWT_SECRET: "j".repeat(64),
        BOT_API_KEY: BOT_KEY,
        ML_GATEWAY_URL: `http://localhost:${ML_PORT}`,
        ML_API_KEY: ML_KEY,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(`${BASE}/v1/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) break;
    if (proc.exitCode !== null) throw new Error(`API exited with ${proc.exitCode}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    stop: async () => {
      proc.kill("SIGTERM");
      await new Promise((r) => proc.once("exit", r));
      await new Promise((r) => ml.close(r));
    },
  };
}

export const bot = () => createClient({ baseUrl: BASE, apiKey: BOT_KEY });
export async function as(email: string) {
  const res = await createClient({ baseUrl: BASE }).call("login", {
    body: { email, password: PASSWORD },
  });
  return createClient({ baseUrl: BASE, token: res.token });
}
