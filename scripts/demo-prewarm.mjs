#!/usr/bin/env node
// Pre-warms the ML gateway cache (Nebius + Tavily) for everything the demo shows, so the live demo
// is instant and still works if Nebius or Tavily is slow or down (cached for 24 h). Run ~1 h before.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.loadEnvFile(`${root}.env`);
const ml = process.env.ML_GATEWAY_URL ?? "http://localhost:8020";
const H = { "x-internal-key": process.env.ML_API_KEY ?? "" };

async function time(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`✓ ${label.padEnd(46)} ${String(Date.now() - t).padStart(6)} ms ${r ?? ""}`);
  } catch (e) {
    console.log(`✗ ${label.padEnd(46)} ${e.message}`);
    process.exitCode = 1;
  }
}
const json = (path, body) =>
  fetch(`${ml}${path}`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  });
const file = (path, name, mime) => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync(`${root}apps/ml/tests/fixtures/${name}`)], { type: mime }),
    name,
  );
  return fetch(`${ml}${path}`, { method: "POST", headers: H, body: form }).then(async (r) => {
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  });
};

await time("ML gateway health", async () => {
  const r = await fetch(`${ml}/health`);
  return (await r.json()).ok ? "ok" : "degraded";
});
await time(
  "screenshot: scam-chat.png",
  async () => (await file("/v1/screenshot", "scam-chat.png", "image/png")).scam_type,
);
await time(
  "invoice: bec-invoice.pdf",
  async () => (await file("/v1/invoice", "bec-invoice.pdf", "application/pdf")).account,
);
await time(
  "story: parcel fee SMS",
  async () =>
    (
      await json("/v1/classify", {
        text: "Got an SMS: your parcel is held at our warehouse, pay RM1.50 redelivery fee within 24 hours or it will be returned",
      })
    ).scam_type,
);
await time("link check: lhdn-refund-my.com/claim", async () =>
  (await json("/v1/web/url", { url: "lhdn-refund-my.com/claim" })).fetched
    ? "fetched"
    : "unreachable (expected)",
);
await time(
  "web leads: unknown number 013-888 2741",
  async () =>
    `${(await json("/v1/web/identifier", { type: "phone", value: "+60138882741" })).leads.filter((l) => l.relevant).length} relevant`,
);
await time(
  "web leads: new mule account PBB 6471…",
  async () =>
    `${(await json("/v1/web/identifier", { type: "bank_account", value: "PBB:647120935518" })).leads.filter((l) => l.relevant).length} relevant`,
);
await time(
  "investment: MBI International",
  async () =>
    `${(await json("/v1/web/investment", { name: "MBI International" })).leads.filter((l) => l.relevant).length} relevant`,
);
for (const [company, domain] of [
  ["Keluvra Steel Supplies Sdn Bhd", "keluvra-steel.com.my"],
  ["Cemvora Trading Sdn Bhd", "cemvora.my"],
  ["Glovexa Supply Sdn Bhd", null],
]) {
  await time(`supplier web: ${company}`, async () =>
    (await json("/v1/web/supplier", { company, domain })).official_contact
      ? "official contact found"
      : "no website (expected)",
  );
}
console.log(
  process.exitCode
    ? "\nSome calls failed: check the ML gateway and keys."
    : "\nDemo cache warm ✓ (valid 24 h)",
);
