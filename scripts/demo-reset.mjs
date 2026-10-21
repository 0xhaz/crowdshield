#!/usr/bin/env node
// Resets the local demo to a clean state: fresh seeded database, and Redis cleared of verdict
// caches, bot sessions, idempotency keys and rate-limit counters. Keeps the ML gateway's web/document
// cache (ml:*) so pre-warmed demo results stay instant. Local only.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // works from any package directory

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });
const redis = (args) =>
  execSync(`docker compose exec -T redis redis-cli ${args}`, {
    encoding: "utf8",
    cwd: root,
  }).trim();

run("pnpm db:fresh");
let deleted = 0;
for (const pattern of ["verdict:*", "bot:sess:*", "bot:rl:*", "idem:*", "rl:*", "lock:*"]) {
  deleted +=
    Number(
      redis(
        `EVAL "local n=0 for _,k in ipairs(redis.call('KEYS',ARGV[1])) do redis.call('DEL',k) n=n+1 end return n" 0 "${pattern}"`,
      ),
    ) || 0;
}
console.log(`redis: cleared ${deleted} cached verdicts / sessions / keys (ml:* cache kept)`);
// Seeded cases get their scripts embedded (campaign matching); needs the API and ML gateway running
process.loadEnvFile(`${root}.env`);
const api = process.env.API_URL ?? "http://localhost:4020";
try {
  const r = await fetch(`${api}/v1/campaigns/backfill`, {
    method: "POST",
    headers: { "x-api-key": process.env.BOT_API_KEY ?? "" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  console.log(`scripts: embedded ${(await r.json()).embedded} seeded case narratives`);
} catch (e) {
  console.log(
    `scripts: not embedded (${e.message}); run \`pnpm demo:reset\` again with the stack up`,
  );
}
console.log("demo reset ✓  (restart the API if it was running with an old build)");
