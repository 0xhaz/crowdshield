#!/usr/bin/env node
// Demo: a new scam wave nobody has labelled yet. Sends three reports of a fake "KWSP Account 3 early
// withdrawal agent" advance-fee script (worded differently, BM and English, different numbers and
// victims) through the bot's API path. Their scripts don't
// match any known campaign, so detection clusters them and Nemotron Ultra labels the candidate for
// the fraud team to confirm on /bank/campaigns. Usage: pnpm demo:wave
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.loadEnvFile(`${root}.env`);
const api = process.env.API_URL ?? "http://localhost:4020";
const H = { "x-api-key": process.env.BOT_API_KEY ?? "", "content-type": "application/json" };

const WAVE = [
  {
    phone: "011-6120 4471",
    text: "Salam, saya ejen berdaftar KWSP. Saya boleh bantu keluarkan simpanan Akaun 3 anda lebih awal tanpa tunggu kelulusan, hanya bayar yuran pemprosesan RM350 dahulu. Isi borang di pautan ini dan hantar salinan IC.",
  },
  {
    phone: "017-889 2306",
    text: "Nak keluarkan duit KWSP Akaun 3 cepat? Ejen kami uruskan dalam 24 jam, dijamin lulus. Caj pentadbiran RM280 sahaja, bayar ke akaun syarikat kami dan whatsapp resit untuk mula proses.",
  },
  {
    phone: "016-301 7754",
    text: "EPF Account 3 fast withdrawal service: our licensed agent can release your savings within 1 day, guaranteed approval. Pay the RM300 processing fee first and send your IC copy via WhatsApp.",
  },
];

for (const [i, w] of WAVE.entries()) {
  const r = await fetch(`${api}/v1/reports`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      reporter: { channel: "telegram", externalId: `demo-wave-${Date.now()}-${i}` },
      scamType: "other",
      scriptText: w.text,
      narrative: "Agent offering early KWSP Account 3 withdrawal asked for a processing fee.",
      language: i === 2 ? "en" : "ms",
      identifiers: [{ type: "phone", value: w.phone, role: "caller" }],
      shareConsent: true,
    }),
  });
  if (!r.ok) throw new Error(`report ${i + 1}: HTTP ${r.status} ${await r.text()}`);
  const out = await r.json();
  console.log(
    `report ${i + 1}: case ${out.caseId.slice(0, 8)} · campaign ${out.campaign?.label ?? "none (novel)"}`,
  );
}

// Detection also runs in the background after each unmatched report; ask once more and show the result
const login = await fetch(`${api}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "analyst@nusabank.demo",
    password: process.env.DEMO_PASSWORD ?? "crowdshield-demo",
  }),
}).then((r) => r.json());
const auth = { authorization: `Bearer ${login.token}` };
for (let i = 0; i < 60; i++) {
  await fetch(`${api}/v1/campaigns/detect`, { method: "POST", headers: auth });
  const list = await fetch(`${api}/v1/campaigns`, { headers: auth }).then((r) => r.json());
  const c = list.find(
    (x) => x.status === "candidate" && /kwsp|epf/i.test(`${x.label} ${x.summary?.en}`),
  );
  if (c) {
    console.log(`\ncandidate campaign #${c.id}: ${c.label} (${c.totalCases} reports)`);
    console.log(
      `  ${c.summary?.en}\n  phrases: ${c.keyPhrases.join(" · ")}\n  draft warning: ${c.warning?.en}`,
    );
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("no candidate yet: check the API log (detection needs the ML gateway)");
process.exitCode = 1;
