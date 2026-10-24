# CrowdShield: Devpost submission

**Tagline:** The bank sees the transfer. The crowd saw the call. CrowdShield stops the scam payment before the money moves.

**Try it:** https://crowdshield.184-197-8-50.sslip.io · Telegram [@CrowdShieldBot](https://t.me/CrowdShieldBot) · banking-app demo at `/demo/bank-app` · portal logins `analyst@nusabank.demo` / `owner@majuvista.demo`, password `crowdshield-demo` (synthetic data only)

---

## Inspiration

From January to November 2025, Malaysian police recorded 67,735 online crime cases with losses over RM2.7 billion. Scam calls were the biggest category. The national scam hotline, NSRC 997, saved about RM34.5 million in 2025. Most money is never recovered once it has left the victim's account.

Every scam has a moment when it could be stopped, but the signal is split. The victim knows a "police officer" is on the phone. The bank knows a large DuitNow transfer is going to an account opened nine days ago. The business knows its supplier never changed banks. Nobody sees all of it. We built the shared picture.

## What it does

CrowdShield is one scam graph with five front doors:

1. **Telegram bot (the public).** Forward a number, account, link, message or screenshot. You get a verdict (confirmed scam, high risk, reported, no reports found) with its reasons and one plain action, in Malay or English. Nemotron reads screenshots and names the scam pattern; known scam waves are flagged. If you lost money, the bot walks you through a report and hands you a pre-filled sheet to read from while calling NSRC 997.
2. **Bank portal (fraud analysts and supervisors).** Payee checks that combine the payee's risk with the customer's **live call signal**, an alert queue with graded interventions, cases with timelines and money trails, an **AI case brief** with a referral note for NSRC/PDRM, and **AI-detected scam campaigns** for a person to confirm.
3. **The customer's banking app.** Before a DuitNow transfer, the bank's backend calls CrowdShield with its partner key. A transfer to a mule account during a call from a confirmed scam number is paused, and the customer sees one clear warning.
4. **CrowdShield Guard, a Chrome extension.** Most victims only realise after the fact, and saving a screenshot and sending it somewhere is friction. With the extension you press Alt+Shift+S and drag over any message, email or chat; Nemotron reads it and the graph checks every number in it. On WhatsApp Web, Telegram Web and Gmail (each turned on by the user), scam-linked numbers and accounts are highlighted as they appear, and "it's me, new number, please transfer" impersonation messages are flagged before anyone pays. Detection runs on the device; only the identifiers are looked up.
5. **Supplier check (small businesses).** Upload an invoice. Nemotron reads it; a changed bank account is caught and the payment held; the supplier's official phone number is found on the web for a call-back. Rejecting a fake invoice reports the account, protecting the next business.

Every report, bank confirmation and rejected invoice strengthens the graph for everyone.

## How we built it

- **NVIDIA Nemotron on Nebius Token Factory** for every model task:
  - **Nemotron 3 Ultra** classifies forwarded messages in Malay, English, mixed Malay-English and Chinese, judges web search results and link pages, and, with **reasoning on**, writes case briefs and labels new scam campaigns.
  - **Nemotron 3.5 Super VL** reads scam screenshots and invoice PDFs verbatim (digits and account numbers exact).
  - **Nemotron 3 Super** sorts this week's scam news.
  - **Qwen3-Embedding-8B** embeds scam scripts into pgvector for campaign matching and detection.
- **Model choices are measured, not guessed.** We built a 41-message gold set (four languages, 12 scam types plus normal messages) and evaluated Lightning, Nano, Super and Ultra, with reasoning on and off. Defining every scam type in the prompt took accuracy from 68% to 100%; strict JSON-schema decoding stayed on (relaxing it broke 40 of 41 outputs); reasoning didn't help classification, so it is only on where the task needs it. Ultra was the most accurate and the fastest, so it handles interactive text.
- **Tavily** for live web intelligence: what the scam graph hasn't seen yet (see "How we use Tavily" below).
- **Deterministic core.** Scores come from the graph: noisy-OR over independent sources, half-lives, Sybil-resistant reporter weighting, one-hop propagation along co-case and money-flow edges. It is a TypeScript port of our Python reference, checked by a 500-case parity test. No model sits in the payment path; a payee check takes about 5 ms.
- **Every AI result shows its trace:** model, reasoning on or off, prompt version, time and tokens.
- **Stack:** NestJS API with one typed contract (Zod) shared by the API, web app and bot; Next.js 15; grammY; FastAPI gateway; Postgres + pgvector; Redis; S3; Docker on AWS with Caddy HTTPS. 140 TypeScript and 12 Python tests run in CI on every push; 11 browser tests (including the extension in a real Chromium) run against the live stack.

## How we use Tavily

A brand-new scam number, link or company has no reports in our graph yet. Tavily is how CrowdShield still says something useful on day one. Tavily finds and fetches; Nemotron reads and judges; the graph decides.

| When | Tavily | Nemotron | What the user gets |
|---|---|---|---|
| A number, account or link has **no reports** in the graph | **Search** for it in its local formats (`"011-23454821" OR "01123454821"` + scam words) | Keeps only results that really mention it as a scam | A follow-up with cited links, marked "leads, not confirmation" |
| Someone forwards a **link** | **Extract**: Tavily opens the page, so the user's phone never does | Does it impersonate a brand? Ask for a login, OTP or card? Offer an APK? | "Looks like a fake LHDN page. Don't open it." |
| **`/invest <platform>`** | **Search** restricted to the regulators' sites (`sc.com.my`, `bnm.gov.my`) plus a **news** search | Keeps results about that platform | Regulator alert-list and news hits, never "this is safe" |
| A business checks a **supplier** | **Search** and **extract** the company's contact page | Takes the phone number only if the page names the company | "Call the supplier back on 03-…, from their own website" |
| The landing page's **scam news** | **News search**, last 7 days, in Malay and English | Keeps real Malaysian cases, removes duplicates, extracts loss and state | "Scams in the Malaysian news", every item linked to its source |

Guard rails:

- Web results are **leads with citations, never evidence**: they don't change a risk score.
- A lead counts only if the page actually mentions the identifier.
- Official bank and government domains are never flagged as impersonations.
- Only the identifier or a public company name is sent to Tavily, never the user's message.
- Results are cached (24 h, news 6 h).
- If Tavily is slow or down, the graph's answer still arrives instantly; only the follow-up is missing.

### Example in Telegram

The bot answers from the graph in under a second, then sends what the web says a few seconds later. Synthetic identifiers; the web results here are illustrative.

```
You:   Someone WhatsApped me from 013-888 2741 offering a part-time job.
       They sent this link: lhdn-refund-my.com/claim

Bot:   🔍 NO REPORTS FOUND
       +60 13-***-2741
       What to do: No reports found, but that doesn't mean it is safe.
       Police and BNM never ask you to transfer money.
       [🚩 Report this] [📞 Call 997] [❓ Why this result?]

Bot:   ⚠️ HIGH RISK
       lhdn-refund-my.com/…
       14 report(s) from the public
       Campaign: Fake LHDN tax refund call + link, Oct 2026
       What to do: Don't open the link or enter your banking login or OTP.

       … a few seconds later (Tavily + Nemotron) …

Bot:   🌐 Web check +60 13-***-2741: found 2 mention(s) online.
       These are leads, not confirmation:
       • "Beware 013-888 2741, part-time job, asked for a deposit" (forum)
       • "List of part-time job scam numbers" (community list)

Bot:   🔗 Link check (we opened it safely, so you don't have to)
       lhdn-refund-my.com/…
       ⚠️ Looks like a fake LHDN page.
       It asks for a login, OTP or card details.
       Don't open it.

You:   /invest Zentrova Capital

Bot:   📈 Investment check: Zentrova Capital
       nothing found on the SC / BNM alert lists or in the news. That isn't
       approval: check that the company is licensed on sc.com.my before investing.
```

The number nobody had reported now comes with two cited warnings from the web, the link is checked without the user opening it, and an unknown investment platform is never called safe.

## Privacy and fairness

Identifiers are looked up by keyed hash and stored encrypted; everything on screen is masked (`+60 11-***-4821`). IC, phone and account numbers are redacted before any text model sees them. Reporters are never named. An unknown number gets "no reports found", never a green tick. Listed owners can appeal; a supervisor decides; an upheld appeal clears the score. Official numbers (PDRM, BNM, banks) are protected and shown as "may be spoofed". Every lookup and decision is audited.

## Challenges

- **Wrong labels came from the prompt, not the model.** Every model made the same mistakes until we found that the prompt defined only 5 of the 12 scam types.
- **Cross-language campaign matching.** Malay and English reports of the same scam score around 0.72 similarity; we calibrated thresholds on real embeddings (same scam 0.65–0.80, different scams 0.26–0.66) and require 3+ distinct reports before proposing a campaign.
- **Web search false positives.** Names in our demo data first matched real businesses, so every name is coined and checked. A lead counts only if the page actually mentions the identifier, and official domains are never flagged.
- **Reasoning budgets.** Reasoning tokens count against the output limit; long case briefs were cut off until we raised the budget and asked for concise points.

## Accomplishments

- A transfer to a mule account during a live scam call is paused in about 5 ms, with no model in the path.
- A new scam wave (fake "KWSP Account 3 agents") is detected from three reports in two languages and labelled by Nemotron Ultra with a summary, repeated phrases and a draft warning; the bot warns the public once an analyst confirms it.
- An Ultra case brief turns a timeline and money trail into a cited brief and a bilingual referral note in about 12 seconds.

## What we learned

Measure before choosing a model; the cheapest fix is often the prompt. Keep models where they are strong (reading, classifying, drafting) and keep decisions in code that can be explained and audited.

## What's next

the Chrome Web Store listing, bank codes per member bank (each bank reports only its own side of a money trail, and alerts go straight to the bank holding a traced account), an Android companion that reads incoming SMS and WhatsApp notifications on the device (the same on-device detection as the extension), WhatsApp (the bot's conversation is already channel-agnostic), a pilot with one bank's fraud team using real call-signal consent, NSRC case intake via API, and voice-note transcription when a speech model is available on Token Factory.

## Built with

nvidia-nemotron · nebius-token-factory · tavily · qwen3-embedding · typescript · nestjs · next.js · react · tailwind · python · fastapi · postgresql · pgvector · redis · telegram · grammy · docker · caddy · aws
