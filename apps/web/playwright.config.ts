import { defineConfig } from "@playwright/test";

// Smoke tests against the running local stack (pnpm demo:start). They change data, so
// `pnpm e2e` resets the demo before and after. Uses the installed Chrome, no browser download.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3020",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
});
