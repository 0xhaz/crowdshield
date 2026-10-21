# CrowdShield demo runbook

About 5 minutes. Two screens: the **web dashboard** (laptop, projected) and **Telegram** on a phone (mirrored, or held up to the camera).

All data is synthetic. Company, app and people names are invented and were checked to have no web presence. Never demo with real numbers or accounts.

## Before you start (T-60 min)

```sh
pnpm demo:start          # infra + migrations + API (4020), web (3020), ML gateway (8020), Telegram bot
pnpm demo:reset          # clean seeded data; clears verdict caches, bot sessions, idempotency keys
pnpm demo:prewarm        # caches every Nebius/Tavily call the demo makes (valid 24 h)
pnpm demo:wave           # optional: a new scam wave for the Campaigns beat
pnpm e2e                 # optional: 5 browser smoke tests, then resets the data again
```

Check:

- `pnpm demo:prewarm` prints all ✓. A ✗ means the Nebius/Tavily keys or the ML gateway are down; see "If something breaks".
- `http://localhost:3020` loads. Logins use password `crowdshield-demo`:
  - Bank analyst: `analyst@nusabank.demo`
  - Bank supervisor: `supervisor@nusabank.demo`
  - SME owner: `owner@majuvista.demo`
- Telegram: send `/start` to **@CrowdShieldBot**. If the phone's language is Malay, the bot replies in BM; `/lang` switches.
- On the phone, save `apps/ml/tests/fixtures/scam-chat.png` (the screenshot). On the laptop, have `apps/ml/tests/fixtures/bec-invoice.pdf` (the invoice) ready.

## The story in one line

> The telco sees the call. The bank sees the transfer. Nobody sees both, except a shared graph that the crowd, banks and businesses all feed.

## Step 1: a consumer checks a scam (Telegram, ~60 s)

1. Send the screenshot `scam-chat.png`, the fake "Inspektor Lim" chat.
   - Expect about 3 s, ~20 ms if pre-warmed: **"📷 What I see"**, *fake police / BNM officer (Macau scam)*, "Hang up. Police and BNM never ask you to transfer money."
   - Then two verdict cards:
     - `PBB ****5518`: **No reports found**, never "safe".
     - `+60 11-***-4821`: **🛑 CONFIRMED SCAM · Scam disahkan**, "37 report(s) from the public · 1 NSRC (997) case(s)", campaign *Fake PDRM/BNM officer calls*.
2. Tap **❓ Why this result?** on the caller: the evidence lines, with no reporter identities.
3. Optional:
   - Paste `check this https://lhdn-refund-my.com/claim` → instant **High risk** from the graph, then a link check as a second message.
   - `/invest MBI International` → BNM alert list and news coverage.

**Say:** "Most people don't install apps. They forward things to WhatsApp or Telegram. Semak dulu answers in seconds, in BM or English, and never calls anything safe."

## Step 2: the report feeds the graph (Telegram, ~45 s)

1. On the account card (`PBB ****5518`), tap **🚩 Report this**.
2. Answer:
   - type **👮 Fake police / BNM / bank**, then **✅ Done**;
   - lost money **Yes**, amount `25000`;
   - when **Within the last hour**, reference `DN2026102000012345`;
   - state **Selangor**, consent **Yes, share**.
3. Expect:
   - "Report received. This is not your fault…";
   - the account now shows **Be careful**: it inherited risk from the confirmed caller;
   - the **📋 Call NSRC 997 now** sheet, with the full account and transaction reference to read out on the call.
4. Send `NSRC-2026-10-200111` → "✅ Saved".

**Say:** "Every report makes the graph smarter. This account was unknown a minute ago; now every bank on the network sees it, linked to a confirmed scam caller."

## Step 3: the bank sees the call and the transfer (web, ~60 s)

1. Sign in as the **bank analyst**. The overview shows the alert queue, the doughnut of open alerts by tier, live campaigns (*Fake LHDN tax refund* is **spiking**) and the highest-risk entities.
2. **Payee check** → preset **"Live call + new payee (demo step 3)"** → **Check payee**.
   - Expect combined risk **≥ 60, High risk**: "**Hold the transfer and call the customer back**".
   - The customer warning: "You are on a call with a number reported for scams… Hang up before you pay."
   - The payee and caller verdicts side by side, and **Alert raised**.

**Say:** "The customer is on a call with a number the crowd has confirmed as a scammer, while paying an account that number just used. Neither the telco nor the bank can see that alone."

## Step 4: confirm the mule, and everyone is protected (web + Telegram, ~30 s)

1. **Alert raised: open it →**. Note the red "The customer was on a call…" banner.
2. Optionally add a note, then **Confirm mule**. The status becomes **Confirmed Mule**; the verdict becomes **Confirmed scam**, "Confirmed by a member bank".
3. On Telegram, paste `Public Bank 6471 2093 5518` → now **🛑 CONFIRMED SCAM**.

**Say:** "One bank's decision protects every other bank and every consumer, instantly."

## Step 5: a business is about to pay a fake invoice (web, ~60 s)

1. Sign out, then sign in as the **SME owner**.
2. **Check invoice** → upload `bec-invoice.pdf` → **Read invoice** (about 2–6 s, ~20 ms if pre-warmed). The form fills: Keluvra Steel, SSM, TIN, **Hong Leong Bank 2290 1847 3365**, RM 86,500, the "finance" phone `016-221 0934`, the email `accounts@keluvra-steel-my.com`, and "Says the bank account has changed" ticked.
3. **Run checks** → **Do not pay yet**:
   - **Account holder**: an individual, not the company.
   - **Scam reports**: linked to the mule ring (money from `MBB ****8812`).
   - **Payment history**: the account changed from `PBB ****4457`.
   - **Email**: look-alike domain.
   - **Contact**: the invoice phone isn't the number in your records.
   - SSM and TIN still pass, because the real company is fine and it's being impersonated.
4. **Payment is on hold: open the callback checklist**.
   - Try **Supplier confirmed: release payment** → refused until the callback is done.
   - Tick the callback step, then **It's fake: reject and report** → "reported to CrowdShield to protect other businesses and banks."

**Say:** "Malaysia's mandatory e-invoicing gives us TIN and invoice checks that foreign fraud tools don't have. And the fake account goes straight into the same graph the banks use."

## Extra beats for judging (pick what fits the time)

- **No-install check (landing, ~20 s):** open the public URL, "Try it now" → **A ‘police’ call**. Nemotron 3 Ultra names the pattern, the Macau wave is flagged, and the AI trace chip shows the model and time. **A scam chat screenshot** shows the vision model.
- **The victim's banking app (~30 s):** `/demo/bank-app` → **Mule account, on a scam call** → Transfer. "We've paused this transfer", with the BM/EN warning. Then the same alert is in the analyst's queue (Step 3 from the other side).
- **AI case brief (~30 s):** any case with a money trail → **Write the brief**. Nemotron 3 Ultra with reasoning (~12 s fresh, instant once cached); click an evidence chip to jump to the timeline item; copy the BM referral note.
- **A new scam wave (~30 s):** before the demo run `pnpm demo:wave` (on the VM: `dc exec -T api node scripts/demo-campaign-wave.mjs`). On **Campaigns**, the KWSP "Account 3 agent" candidate shows Ultra's label, repeated phrases and draft warning; **Confirm campaign**, then forward a similar message to the bot to see "Known scam wave".
- **Bot first contact:** `/start` shows four example buttons; each runs a real check.

## Close (~20 s)

One shared graph, three front doors: consumers (Telegram now, WhatsApp next), banks and e-wallets, businesses.

- Personal data stays in Malaysia: identifiers are hashed, values masked, text redacted before any AI call.
- Scores are explainable, and owners can appeal.
- Next: NSRC referral partnership, one digital-bank pilot, WhatsApp channel.

## If something breaks

| Problem | Do this |
|---|---|
| Nebius or Tavily slow or down | Anything pre-warmed still answers from cache (24 h). Otherwise the bot says it couldn't read the screenshot: type `011-2345 4821` instead. For the invoice, type the fields (the e2e test uses the same values). |
| Telegram not responding | Check the bot log in the `pnpm demo:start` output for `@CrowdShieldBot polling`. Fall back to the web steps; the API is the same. |
| Web shows "This page couldn't load" | The API is restarting (dev mode recompiles on save). Wait 5 s, then **Try again**. |
| Data looks wrong after a rehearsal | `pnpm demo:reset`, then `pnpm demo:prewarm`. |
| Need a full-screen-safe build (no dev badge) | `pnpm --filter @crowdshield/web build && pnpm --filter @crowdshield/web start` instead of the dev web server. |

## Facts worth having ready

- **Scoring:** noisy-OR over independent evidence (one vote per reporter or same-device cluster), plus one-hop graph risk at 0.8 weight. User reports alone are capped at "caution" (59). An upheld appeal multiplies risk by 0.1.
- **Latency on this laptop:** payee check p95 ~5 ms; lookup p95 ~10 ms; screenshot reading ~3 s; invoice reading ~2–6 s.
- **Tests:** 124 unit and integration tests (TypeScript + Python) and 5 browser end-to-end tests.
- **Mocked for the demo:** SSM, LHDN MyInvois and the DuitNow name check (behind real adapter interfaces); the bank app SDK's call signal (a checkbox in the payee check).
