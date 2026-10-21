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
for (const pattern of ["verdict:*", "bot:sess:*", "bot:rl:*", "idem:*"]) {
  deleted +=
    Number(
      redis(
        `EVAL "local n=0 for _,k in ipairs(redis.call('KEYS',ARGV[1])) do redis.call('DEL',k) n=n+1 end return n" 0 "${pattern}"`,
      ),
    ) || 0;
}
console.log(`redis: cleared ${deleted} cached verdicts / sessions / keys (ml:* cache kept)`);
console.log("demo reset ✓  (restart the API if it was running with an old build)");
