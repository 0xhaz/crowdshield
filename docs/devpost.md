# CrowdShield: Devpost submission

**Tagline:** The bank sees the transfer. The crowd saw the call. CrowdShield stops the scam payment before the money moves.

**Try it:** https://crowdshield.184-197-8-50.sslip.io · Telegram [@CrowdShieldBot](https://t.me/CrowdShieldBot) · banking-app demo at `/demo/bank-app` · portal logins `analyst@nusabank.demo` / `owner@majuvista.demo`, password `crowdshield-demo` (synthetic data only)

---

## Inspiration

From January to November 2025, Malaysian police recorded 67,735 online crime cases with losses over RM2.7 billion. Scam calls were the biggest category. The national scam hotline, NSRC 997, saved about RM34.5 million in 2025. Most money is never recovered once it has left the victim's account.

Every scam has a moment when it could be stopped, but the signal is split. The victim knows a "police officer" is on the phone. The bank knows a large DuitNow transfer is going to an account opened nine days ago. The business knows its supplier never changed banks. Nobody sees all of it. We built the shared picture.

## What it does

CrowdShield is one scam graph with five front doors:

1. **"Semak dulu" Telegram bot (the public).** Forward a number, account, link, message or screenshot. You get a verdict (confirmed scam, high risk, reported, no reports found) with its reasons and one plain action, in BM or English. Nemotron reads screenshots and names the scam pattern; known scam waves are flagged. If you lost money, the bot walks you through a report and hands you a pre-filled sheet to read from while calling NSRC 997.
2. **Bank portal (fraud analysts and supervisors).** Payee checks that combine the payee's risk with the customer's **live call signal**, an alert queue with graded interventions, cases with timelines and money trails, an **AI case brief** with a referral note for NSRC/PDRM, and **AI-detected scam campaigns** for a person to confirm.
3. **The customer's banking app.** Before a DuitNow transfer, the bank's backend calls CrowdShield with its partner key. A transfer to a mule account during a call from a confirmed scam number is paused, and the customer sees one clear warning.
4. **CrowdShield Guard, a Chrome extension.** Most victims only realise after the fact, and saving a screenshot and sending it somewhere is friction. With the extension you press Alt+Shift+S and drag over any message, email or chat; Nemotron reads it and the graph checks every number in it. On WhatsApp Web, Telegram Web and Gmail (each turned on by the user), scam-linked numbers and accounts are highlighted as they appear, and "it's me, new number, please transfer" impersonation messages are flagged before anyone pays. Detection runs on the device; only the identifiers are looked up.
5. **"Semak supplier" (small businesses).** Upload an invoice. Nemotron reads it; a changed bank account is caught and the payment held; the supplier's official phone number is found on the web for a call-back. Rejecting a fake invoice reports the account, protecting the next business.

Every report, bank confirmation and rejected invoice strengthens the graph for everyone.

## How we built it

- **NVIDIA Nemotron on Nebius Token Factory** for every model task:
  - **Nemotron 3 Ultra** classifies forwarded messages in BM, English, Manglish and Chinese, judges web search results and link pages, and, with **reasoning on**, writes case briefs and labels new scam campaigns.
  - **Nemotron 3.5 Super VL** reads scam screenshots and invoice PDFs verbatim (digits and account numbers exact).
  - **Nemotron 3 Super** sorts this week's scam news.
  - **Qwen3-Embedding-8B** embeds scam scripts into pgvector for campaign matching and detection.
- **Model choices are measured, not guessed.** We built a 41-message gold set (four languages, 12 scam types plus normal messages) and evaluated Lightning, Nano, Super and Ultra, with reasoning on and off. Defining every scam type in the prompt took accuracy from 68% to 100%; strict JSON-schema decoding stayed on (relaxing it broke 40 of 41 outputs); reasoning didn't help classification, so it is only on where the task needs it. Ultra was the most accurate and the fastest, so it handles interactive text.
- **Tavily** for live web intelligence (scam reports about an unknown number, link pages, regulator lists, suppliers' official contacts) and for the news feed. Results are shown as cited leads, never as evidence.
- **Deterministic core.** Scores come from the graph: noisy-OR over independent sources, half-lives, Sybil-resistant reporter weighting, one-hop propagation along co-case and money-flow edges. It is a TypeScript port of our Python reference, checked by a 500-case parity test. No model sits in the payment path; a payee check takes about 5 ms.
- **Every AI result shows its trace:** model, reasoning on or off, prompt version, time and tokens.
- **Stack:** NestJS API with one typed contract (Zod) shared by the API, web app and bot; Next.js 15; grammY; FastAPI gateway; Postgres + pgvector; Redis; S3; Docker on AWS with Caddy HTTPS. 140 TypeScript and 12 Python tests run in CI on every push; 11 browser tests (including the extension in a real Chromium) run against the live stack.

## Privacy and fairness

Identifiers are looked up by keyed hash and stored encrypted; everything on screen is masked (`+60 11-***-4821`). IC, phone and account numbers are redacted before any text model sees them. Reporters are never named. An unknown number gets "no reports found", never a green tick. Listed owners can appeal; a supervisor decides; an upheld appeal clears the score. Official numbers (PDRM, BNM, banks) are protected and shown as "may be spoofed". Every lookup and decision is audited.

## Challenges

- **Wrong labels came from the prompt, not the model.** Every model made the same mistakes until we found that the prompt defined only 5 of the 12 scam types.
- **Cross-language campaign matching.** BM and English reports of the same scam score around 0.72 similarity; we calibrated thresholds on real embeddings (same scam 0.65–0.80, different scams 0.26–0.66) and require 3+ distinct reports before proposing a campaign.
- **Web search false positives.** Names in our demo data first matched real businesses, so every name is coined and checked. A lead counts only if the page actually mentions the identifier, and official domains are never flagged.
- **Reasoning budgets.** Reasoning tokens count against the output limit; long case briefs were cut off until we raised the budget and asked for concise points.

## Accomplishments

- A transfer to a mule account during a live scam call is paused in about 5 ms, with no model in the path.
- A new scam wave (fake "KWSP Account 3 agents") is detected from three reports in two languages and labelled by Nemotron Ultra with a summary, repeated phrases and a draft warning; the bot warns the public once an analyst confirms it.
- An Ultra case brief turns a timeline and money trail into a cited brief and a bilingual referral note in about 12 seconds.

## What we learned

Measure before choosing a model; the cheapest fix is often the prompt. Keep models where they are strong (reading, classifying, drafting) and keep decisions in code that can be explained and audited.

## What's next

the Chrome Web Store listing, an Android companion that reads incoming SMS and WhatsApp notifications on the device (the same on-device detection as the extension), WhatsApp (the bot's conversation is already channel-agnostic), a pilot with one bank's fraud team using real call-signal consent, NSRC case intake via API, and voice-note transcription when a speech model is available on Token Factory.

## Built with

nvidia-nemotron · nebius-token-factory · tavily · qwen3-embedding · typescript · nestjs · next.js · react · tailwind · python · fastapi · postgresql · pgvector · redis · telegram · grammy · docker · caddy · aws
