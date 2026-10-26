# CrowdShield: Devpost submission

**Elevator pitch (173/200):** The bank sees the transfer. The crowd saw the call. CrowdShield joins them in one scam graph, with NVIDIA Nemotron, to stop scam payments in Malaysia before the money moves.

**Thumbnail:** [`docs/assets/devpost-thumbnail.png`](assets/devpost-thumbnail.png) (1500 × 1000, 3:2)

**Try it:** https://crowdshield.184-197-8-50.sslip.io · Telegram [@CrowdShieldBot](https://t.me/CrowdShieldBot) · banking-app demo at `/demo/bank-app` · portal logins `analyst@nusabank.demo` / `owner@majuvista.demo`, password `crowdshield-demo` (synthetic data only)

## Inspiration

From January to November 2025, Malaysian police recorded 67,735 online crime cases with losses over RM2.7 billion. Scam calls were the biggest category. The national scam hotline, NSRC 997, saved about RM34.5 million in 2025. Once money leaves the victim's account, most of it is never recovered.

Every scam has a moment when it could be stopped, but the signals are split between people who never talk to each other. The victim knows a "police officer" is on the phone. The bank knows a large DuitNow transfer is going to an account opened nine days ago. The business knows its supplier never changed banks. We built one place where those signals meet.

## What it does

CrowdShield is one scam graph with five ways in. Each report, bank confirmation and rejected invoice goes back into the graph, so the next check anywhere benefits from it.

1. Telegram bot, for the public. Forward a number, account, link, message or screenshot and you get a verdict (confirmed scam, high risk, reported, or no reports found) with its reasons and one plain action, in Malay or English. Nemotron reads screenshots and names the scam pattern, and the bot says when a message belongs to a known scam wave. If you lost money, the bot walks you through a report and gives you a pre-filled sheet to read from while you call NSRC 997.
2. Bank portal, for fraud analysts and supervisors. Payee checks combine the payee's risk with the customer's live call signal. Analysts work an alert queue with graded interventions, read cases with timelines and money trails, generate an AI case brief with a referral note for NSRC and PDRM, and confirm scam campaigns the AI has detected. They can also record transfers their bank traced through NSRC, and every account the money reached is then flagged across the network.
3. The customer's banking app. Before a DuitNow transfer, the bank's backend calls CrowdShield with its partner key. A transfer to a mule account during a call from a confirmed scam number is paused, and the customer sees one clear warning. After a scam, the bank uses the same key to send the hops, freezes and cash-outs it traced.
4. CrowdShield Guard, a Chrome extension. Most victims only realise after the fact, and saving a screenshot to send somewhere is one more step they rarely take. With the extension you press Alt+Shift+S and drag over any message, email or chat; Nemotron reads it and the graph checks every number in it. On WhatsApp Web, Telegram Web and Gmail, each turned on by the user, scam-linked numbers and accounts are highlighted as they appear, and "it's me, new number, please transfer" messages are flagged before anyone pays. Detection runs on the device, and only the identifiers are looked up.
5. Supplier check, for small businesses. Upload an invoice and Nemotron reads it. A changed bank account is caught, the payment is held, and the supplier's official phone number is found on the web so the owner can call back. Rejecting a fake invoice reports the account to the graph.

## How we built it

Every model task runs on NVIDIA Nemotron through Nebius Token Factory:

- Nemotron 3 Ultra classifies forwarded messages in Malay, English, mixed Malay-English and Chinese, judges web search results and link pages, and, with reasoning on, writes case briefs and labels new scam campaigns.
- Nemotron 3.5 Super VL reads scam screenshots and invoice PDFs verbatim, with digits and account numbers exact.
- Nemotron 3 Super sorts this week's scam news.
- Qwen3-Embedding-8B embeds scam scripts into pgvector for campaign matching and detection.

We picked models by testing them. Our gold set has 41 messages in four languages, covering 12 scam types plus normal messages, and we ran Lightning, Nano, Super and Ultra on it with reasoning on and off. Defining every scam type in the prompt took accuracy from 68% to 100%. We kept strict JSON-schema decoding on, because relaxing it broke 40 of 41 outputs. Reasoning didn't improve classification, so we only turn it on where a task needs it. Ultra was both the most accurate and the fastest, so it handles interactive text.

Tavily provides live web intelligence for anything the graph hasn't seen yet (see "How we use Tavily" below).

Scores come from the graph, not from a model: noisy-OR over independent sources, half-lives, Sybil-resistant reporter weighting, and one-hop propagation along co-case and money-flow edges. The scoring code is a TypeScript port of our Python reference, checked by a 500-case parity test. No model sits in the payment path, and a payee check takes about 5 ms.

Every AI result shows its trace: model, reasoning on or off, prompt version, time and tokens.

The stack is a NestJS API with one typed contract (Zod) shared by the API, web app and bot; Next.js 15; grammY; a FastAPI gateway; Postgres with pgvector; Redis; S3; and Docker on AWS behind Caddy HTTPS. CI runs 145 TypeScript and 14 Python tests on every push, and 13 browser tests, including the extension in a real Chromium, run against the live stack.

## How we use Tavily

A brand-new scam number, link or company has no reports in our graph yet. Tavily lets CrowdShield still say something useful about it on day one. Tavily searches and fetches pages, Nemotron judges what comes back, and the graph keeps making the risk decisions.

| When | Tavily | Nemotron | What the user gets |
|---|---|---|---|
| A number, account or link has no reports in the graph | Searches for it in its local formats (`"011-23454821" OR "01123454821"` + scam words) | Keeps only results that really mention it as a scam | A follow-up with cited links, marked "leads, not confirmation" |
| Someone forwards a link | Extract: Tavily opens the page, so the user's phone never does | Checks whether it impersonates a brand, asks for a login, OTP or card, or offers an APK | "Looks like a fake LHDN page. Don't open it." |
| `/invest <platform>` | Searches the regulators' sites (`sc.com.my`, `bnm.gov.my`) plus a news search | Keeps results about that platform | Regulator alert-list and news hits; an unknown platform is never called safe |
| A business checks a supplier | Searches for and extracts the company's contact page | Takes the phone number only if the page names the company | "Call the supplier back on 03-…, from their own website" |
| The landing page's scam news | News search over the last 7 days, in Malay and English | Keeps real Malaysian cases, removes duplicates, extracts loss and state | "Scams in the Malaysian news", each item linked to its source |

Guard rails:

- Web results are shown as cited leads and don't change a risk score.
- A lead counts only if the page actually mentions the identifier.
- Official bank and government domains are never flagged as impersonations.
- Only the identifier or a public company name is sent to Tavily, never the user's message.
- Results are cached for 24 hours (news for 6).
- If Tavily is slow or down, the graph's answer still arrives instantly and only the follow-up is missing.

### Example in Telegram

The bot answers from the graph in under a second, then sends what the web says a few seconds later. The identifiers are synthetic and the web results are illustrative.

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

## Privacy and fairness

Identifiers are looked up by keyed hash and stored encrypted, and everything on screen is masked (`+60 11-***-4821`). IC, phone and account numbers are redacted before any text model sees them. Reporters are never named. An unknown number gets "no reports found", never a green tick. Listed owners can appeal to a supervisor, and an upheld appeal clears the score. Official numbers (PDRM, BNM, banks) are protected and shown as "may be spoofed". Every lookup and decision goes into the audit log.

## Challenges

- Every model made the same classification mistakes. The cause turned out to be our prompt, which defined only 5 of the 12 scam types.
- Matching campaigns across languages was hard: Malay and English reports of the same scam score around 0.72 similarity. We calibrated thresholds on real embeddings (same scam 0.65 to 0.80, different scams 0.26 to 0.66) and require 3 or more distinct reports before proposing a campaign.
- Web search produced false positives. Names in our first demo data matched real businesses, so we replaced every name with a coined one and checked it. A lead now counts only if the page mentions the identifier, and official domains are never flagged.
- Reasoning tokens count against the output limit, so long case briefs were cut off until we raised the budget. Then, under strict JSON decoding at temperature 0, Ultra sometimes wrote blank lines until it ran out of tokens, and a retry at temperature 0 did the same. Starting long outputs at temperature 0.3 fixed it: 4 of 4 fresh briefs came back first time.
- Early case briefs said the impersonated BNM number was "not used by scammers", invented what a screenshot showed, and asked the wrong agency to trace crypto. We fixed the input (explicit notes on what each item means), the rules (unknowns go to "gaps", and which agency does what) and the output (internal ids stripped), then checked every line against the case data.
- The sending and receiving banks can both report the same transfer. The shared DuitNow reference makes it one hop, the database enforces this even when both reports arrive at the same moment, and a later report can only raise the frozen amount.

## Accomplishments

- A transfer to a mule account during a live scam call is paused in about 5 ms, with no model in the path.
- A new scam wave (fake "KWSP Account 3 agents") is detected from three reports in two languages and labelled by Nemotron Ultra with a summary, repeated phrases and a draft warning. The bot warns the public once an analyst confirms it.
- An Ultra case brief turns a timeline and money trail into a cited brief and a bilingual referral note in about 12 seconds.

## What we learned

Test models before choosing one, because the cheapest fix is often in the prompt. Use models for reading, classifying and drafting, and keep decisions in code that can be explained and audited.

## What's next

In production, CrowdShield would advise and the bank would decide. It returns a score, reasons and a recommended action, and the bank's own fraud engine makes the call, as banks already do with other third-party risk signals. We see three ways to connect, from most to least trust required:

1. A live API, as in the demo: the bank's backend calls the payee check before releasing a transfer.
2. Through PayNet's National Fraud Portal, so CrowdShield's signals reach banks through infrastructure they already trust. This is the most realistic path in Malaysia.
3. A data feed: the bank downloads risky identifiers and scores them inside its own systems, so no customer data leaves the bank.

A pilot would need:

- hosting in Malaysia (the demo runs in AWS us-east-1);
- per-bank credentials with mutual TLS;
- ISO 27001 or SOC 2 and independent penetration tests;
- a strict timeout, so a slow check never blocks a payment;
- each bank reporting only its own side of a money trail, with alerts going straight to the bank holding a traced account;
- a legal review of banking secrecy and outsourcing rules with the bank and Bank Negara Malaysia.

On iPhones, a banking app can tell that a call is active but not who is calling, so the caller's identity would have to come from victims' reports or a telco partnership.

For the public, we want to add:

- a Chrome Web Store listing for the extension;
- WhatsApp (the bot's conversation logic is already channel-agnostic);
- an Android companion that checks incoming SMS and WhatsApp notifications on the device, using the same on-device detection as the extension;
- voice-note transcription once a speech model is available on Token Factory.

We'd also like to run a pilot with one bank's fraud team using real call-signal consent, and take case intake from NSRC via API.

## Built with

nvidia-nemotron · nebius-token-factory · tavily · qwen3-embedding · typescript · nestjs · next.js · react · tailwind · python · fastapi · postgresql · pgvector · redis · telegram · grammy · docker · caddy · aws
