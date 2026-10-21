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
export const PARTNER_KEY = "test-partner-key-0123456789abcdef";
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
  const trace = (kind = "model") => ({
    calls: [{ kind, model: "nvidia/test", ms: 5 }],
    total_ms: 5,
    cached: false,
  });
  // Bag-of-words embedding: messages sharing most words are close, different scams are far apart
  const embed = (text: string) => {
    const v = new Array<number>(1024).fill(0);
    for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let h = 0;
      for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % 1024]! += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  };
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
    "/v1/embed": (b) => ({
      items: (b.texts as string[]).map((t) => ({
        redacted: t.replace(/\d[\d -]{6,}\d/g, "[NUMBER]"),
        embedding: embed(t),
      })),
      trace: trace("embedding"),
    }),
    "/v1/classify": (b) => ({
      scam_type: /parcel|kurier/i.test(String(b.text)) ? "parcel" : "macau_impersonation",
      language: "ms",
      urgency: true,
      bank_change_language: false,
      impersonating: "PDRM",
      summary: { en: "A fake officer asks for money", ms: "Pegawai palsu minta wang" },
      roles: [],
      needs_review: false,
      prompt_version: "classify-text@test",
      trace: trace(),
    }),
    "/v1/screenshot": () => ({
      text: "Encik, akaun anda disiasat. Pindah ke Public Bank 6471 2093 5518 segera.",
      scam_type: "macau_impersonation",
      language: "ms",
      urgency: true,
      impersonating: "PDRM",
      summary: { en: "Fake police", ms: "Polis palsu" },
      needs_review: false,
      prompt_version: "read-screenshot@test",
      trace: trace(),
    }),
    "/v1/brief": (b) => {
      const c = b.case as { identifiers: { id: string }[] };
      return {
        headline: { en: "Mule account paid after a fake police call", ms: "Akaun keldai" },
        modus_operandi: [{ text: "Fake officer call", evidence: ["event:1"] }],
        money_trail: [{ text: "Paid to the mule", evidence: ["hop:1"] }],
        red_flags: [],
        recommended_actions: [{ text: "Freeze", evidence: [c.identifiers[0]?.id ?? ""] }],
        referral: { en: "To NSRC", ms: "Kepada NSRC" },
        gaps: ["No police report"],
        model: "nvidia/Nemotron-3-Ultra-550b-a55b",
        prompt_version: "case-brief@test",
        trace: { ...trace(), calls: [{ kind: "model", model: "ultra", ms: 9, reasoning: true }] },
      };
    },
    "/v1/campaigns/label": () => ({
      label: "Fake KWSP withdrawal officer, Oct 2026",
      scam_type: "macau_impersonation",
      summary: { en: "Fake EPF officers", ms: "Pegawai KWSP palsu" },
      key_phrases: ["pengeluaran KWSP", "akaun selamat"],
      warning: { en: "KWSP never calls you to move money.", ms: "KWSP tidak akan menelefon." },
      model: "ultra",
      prompt_version: "campaign-label@test",
    }),
    "/v1/news": () => ({
      items: [
        {
          headline: "Retiree loses RM120,000 to fake police",
          summary: { en: "A retiree lost savings.", ms: "Pesara rugi." },
          scam_type: "macau_impersonation",
          loss_myr: 120000,
          state: "Johor",
          url: "https://news.example.my/a",
          source: "news.example.my",
          published_at: null,
        },
      ],
      fetched_at: now(),
      cached: false,
      trace: trace("tavily"),
    }),
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const reply = replies[new URL(req.url ?? "/", "http://x").pathname];
      if (req.headers["x-internal-key"] !== ML_KEY) return void res.writeHead(401).end();
      if (!reply) return void res.writeHead(404).end();
      const json = req.headers["content-type"]?.startsWith("application/json");
      const body = (json ? JSON.parse(raw || "{}") : {}) as Record<string, unknown>;
      mlCalls.push({ path: new URL(req.url!, "http://x").pathname, body });
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
        BANK_PARTNER_KEY: PARTNER_KEY,
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
