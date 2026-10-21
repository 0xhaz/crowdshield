import { createClient } from "@crowdshield/contracts";
import { loadRootEnv, requireEnv } from "@crowdshield/db";
import { Redis } from "ioredis";
import { mlClient, s3Evidence } from "./services.js";
import { createTelegramBot, setCommands } from "./telegram.js";

loadRootEnv();
const api = createClient({ baseUrl: requireEnv("API_URL"), apiKey: requireEnv("BOT_API_KEY") });
const redis = new Redis(requireEnv("REDIS_URL"), { maxRetriesPerRequest: 1 });
const ml = mlClient(requireEnv("ML_GATEWAY_URL"), requireEnv("ML_API_KEY"));
const evidence = s3Evidence({
  endpoint: requireEnv("S3_ENDPOINT"),
  region: requireEnv("S3_REGION"),
  bucket: requireEnv("S3_BUCKET_EVIDENCE"),
  accessKeyId: requireEnv("S3_ACCESS_KEY"),
  secretAccessKey: requireEnv("S3_SECRET_KEY"),
});
const bot = createTelegramBot(requireEnv("TELEGRAM_BOT_TOKEN"), api, redis, { ml, evidence });

await api.call("health").then(
  (h) => console.log(`[bot] API ${h.ok ? "healthy" : "degraded"}`),
  (e: Error) =>
    console.warn(`[bot] API not reachable yet (${e.message}); checks will fail until it is up`),
);
await setCommands(bot).catch((e: Error) =>
  console.warn(`[bot] couldn't set commands: ${e.message}`),
);
await bot.api.deleteWebhook(); // long polling locally; webhooks come with hosting

let stopping = false;
const stop = async () => {
  stopping = true;
  await bot.stop();
  await redis.quit();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const me = await bot.api.getMe();
console.log(`[bot] @${me.username} polling`);
// a shutdown (Ctrl-C, or a dev-mode restart) aborts long polling: not an error
await bot
  .start({ drop_pending_updates: false, allowed_updates: ["message", "callback_query"] })
  .catch((e: unknown) => {
    if (!stopping) throw e;
  });
