// Drops everything in the local (or demo VM) database and re-applies migrations. Never production data.
import postgres from "postgres";
import { loadRootEnv, requireEnv } from "./env.js";
import { runMigrations } from "./migrate.js";

loadRootEnv();
const url = requireEnv("DATABASE_URL");
const host = new URL(url).hostname;
// Only local databases, or the public demo VM's own database (DEMO_DATABASE=yes, set by make-env.sh)
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.DEMO_DATABASE !== "yes") {
  throw new Error(`refusing to reset non-local database at ${host}`);
}

const sql = postgres(url, { max: 1 });
await sql.unsafe(
  "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
);
await sql.end();
await runMigrations(url);
console.log("database reset and migrated");
