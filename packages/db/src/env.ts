import { fileURLToPath } from "node:url";

/** Loads the repo-root .env if present; real env vars always win. */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch {
    // no .env file: rely on the process environment
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}
