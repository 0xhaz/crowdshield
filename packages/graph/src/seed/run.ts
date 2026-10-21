// pnpm db:seed → reset-free seed of the local database (run `pnpm db:reset` first for a clean slate).
import { createDb, loadRootEnv, requireEnv } from "@crowdshield/db";
import { seed } from "./seed.js";

loadRootEnv();
const url = requireEnv("DATABASE_URL");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("refusing to seed a non-local database");
}
const { db, client } = createDb(url, { max: 1 });
try {
  const summary = await db.transaction((tx) =>
    seed(
      tx,
      { pepper: requireEnv("IDENTIFIER_HMAC_PEPPER"), encKey: requireEnv("IDENTIFIER_ENC_KEY") },
      {
        demoPassword: process.env.SEED_DEMO_PASSWORD,
      },
    ),
  );
  console.log(
    `seeded: ${summary.orgs} orgs, ${summary.users} users, ${summary.entities} entities, ${summary.cases} cases`,
  );
  console.log(`demo logins use password: ${summary.demoPassword}`);
} finally {
  await client.end();
}
