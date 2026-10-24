# CrowdShield demo scripts

Every scenario the current build can demo, grouped by user, so the team can pick what goes into the final demo. Each scenario lists what to do, what you should see, how long it takes and what it proves. The suggested line-ups are at the end, followed by a checklist for the decision.

All results below were checked against a freshly reset demo database on 20 Oct 2026. Risk numbers can move by a point or two, because scores decay with time. All names, numbers and accounts are synthetic.

## Before any run

```sh
pnpm demo:start      # if not already running: API :4020, web :3020, ML gateway :8020, Telegram bot
pnpm demo:reset      # clean data: do this before every full run-through
pnpm demo:prewarm    # cache the AI and web calls (instant on stage, works if Nebius/Tavily are down)
```

| User | Where | Login (password `crowdshield-demo`) |
|---|---|---|
| Consumer | Telegram, **@CrowdShieldBot** | none: anyone can message it |
| Bank analyst | http://localhost:3020 | `analyst@nusabank.demo` (Aisyah, Nusa Digital Bank) |
| Bank supervisor | http://localhost:3020 | `supervisor@nusabank.demo` (Daniel, Nusa Digital Bank) |
| SME owner | http://localhost:3020 | `owner@majuvista.demo` (Kavitha, Majuvista Hardware Sdn Bhd) |
| Platform admin | http://localhost:3020 | `admin@crowdshield.local` |

Demo files:

- `apps/ml/tests/fixtures/scam-chat.png`: a fake "Inspektor Lim, PDRM Bukit Aman" chat. Save it to the phone.
- `apps/ml/tests/fixtures/bec-invoice.pdf`: a Keluvra Steel invoice with a "we changed bank" notice. Keep it on the laptop.

Scenarios marked **⚠ changes data** affect later scenarios; their dependencies are listed in "Order and dependencies".

---

## 1. Consumer: Semak dulu bot (Telegram)

| ID | Scenario | Time | Proves |
|---|---|---|---|
| C1 | Check a confirmed scam number | 15 s | Instant verdict card, BM + EN, scam-specific advice |
| C2 | "Why this result?" | 10 s | Explainable: evidence by source, no reporter identities |
| C3 | Unknown number | 10 s | Never says "safe"; a web search runs in the background |
| C4 | Official number that scammers spoof | 10 s | Protected numbers are never labelled scams |
| C5 | Forward a scam screenshot | 20 s | AI reads the image; every number and account in it is checked |
| C6 | Message with no number ("is this a scam?") | 15 s | AI names the scam pattern from the story alone |
| C7 | Suspicious link | 20 s | Graph verdict plus a page check, without the user opening it |
| C8 | Investment platform check | 15 s | SC / BNM alert lists and news, with sources |
| C9 | Report a scam with money lost **⚠** | 60 s | Guided report → NSRC 997 call sheet → NSRC reference |
| C10 | Report a near miss (no loss) **⚠** | 30 s | Near misses count; no call sheet, a thank-you |
| C11 | Report from a screenshot **⚠** | 60 s | Screenshot kept as evidence; account linked to the caller |
| C12 | Switch language | 5 s | BM / English (Malay phones start in BM) |
| C13 | Other seeded scams | any | Breadth: parcel, job, investment, LHDN refund, e-wallet |

**C1. Check a confirmed scam number**
1. Send `Sila hubungi 011-2345 4821 segera`.
2. Expect **🛑 CONFIRMED SCAM · Scam disahkan**, `+60 11-***-4821`, "37 report(s) from the public · 1 NSRC (997) case(s)", campaign *Fake PDRM/BNM officer calls*, "**What to do:** Hang up. Police and BNM never ask you to transfer money." Buttons: 🚩 Report this · 📞 Call 997 · ❓ Why this result?

**C2. Why this result?** On the C1 card, tap **❓ Why this result?**. Expect evidence lines: public reports, the NSRC case, and "Used in the same scam as MBB ****8812 / +60 17-***-3391", ending "Reporters are never identified."

**C3. Unknown number**
1. Send `013-888 2741`.
2. Expect **🔍 NO REPORTS FOUND · Tiada laporan**, "No reports found, but that doesn't mean it is safe. Police and BNM never ask you to transfer money."
3. A web search runs in the background. For this synthetic number it finds nothing, so no second message arrives.

**C4. Official number that scammers spoof**
1. Send `1-300-88-5465` (BNMTELELINK).
2. Expect **📞🛡️ OFFICIAL NUMBER, MAY BE SPOOFED**, "Hang up and call back on the official number."
3. Check this number against bnm.gov.my before the demo.

**C5. Forward a scam screenshot**
1. Send the image `scam-chat.png`.
2. Expect "📷 **What I see**": a summary, "Looks like: fake police / BNM officer (Macau scam)", "What to do: Hang up…".
3. Then two cards in message order:
   - `PBB ****5518`: No reports found.
   - `+60 11-***-4821`: Confirmed scam.
4. About 3 s the first time, ~20 ms if pre-warmed. The screenshot is stored as evidence for the next report.

**C6. Message with no number**
1. Send `Got an SMS: your parcel is held at our warehouse, pay RM1.50 redelivery fee within 24 hours or it will be returned`.
2. Expect a one-line summary, "Looks like: **fake parcel / courier**", "What to do: Don't click the link. Couriers don't ask for payment through SMS links." and a **🚩 Report a scam** button.
3. A normal message (`Are we still meeting for lunch tomorrow at 1pm?`) gets "This doesn't look like a known scam pattern…".

**C7. Suspicious link**
1. Send `check this https://lhdn-refund-my.com/claim`.
2. Expect an instant **⚠️ HIGH RISK** (14 public reports, campaign *Fake LHDN tax refund*), then a second message: "🔗 **Link check** (we opened it safely…)".
3. The demo domain doesn't exist, so the check says "The page couldn't be opened… Don't enter passwords or OTPs from links." A real live phishing page would show "Looks like a fake LHDN page. It asks for a login, OTP or card details."

**C8. Investment platform check**
1. Send `/invest MBI International`, a real, publicly reported Malaysian scheme.
2. Expect "📈 **Investment check**: found on regulator lists or in the news…", with links to the BNM Financial Consumer Alert List and news coverage.
3. For a name with no results, the bot says "That isn't approval: check that the company is licensed on sc.com.my."

**C9. Report a scam with money lost ⚠**
1. After C1, tap **🚩 Report this**.
2. Answer:
   - **👮 Fake police / BNM / bank** → send `Public Bank 6471 2093 5518` → **✅ Done**;
   - lost money **Yes** → `25000`;
   - **Within the last hour**;
   - reference `DN2026102000012345`;
   - **Selangor** → **Yes, share**.
3. Expect:
   - "✅ **Report received.** This is not your fault…";
   - a list: `PBB ****5518: Be careful`, `+60 11-***-4821: Confirmed scam`;
   - **📋 Call NSRC 997 now** with scam type, times, "RM 25,000.00 · to PBB:647120935518 · ref DN2026…", scammer numbers and state.
4. Send `NSRC-2026-10-200111`. Expect "✅ Saved."

**C10. Report a near miss ⚠**
1. `/report` → **📦 Parcel / courier** → send `016-773 1290 pos-redelivery-my.top/pay` → **✅ Done** → lost money **No** → **Skip** the state → **No** to sharing.
2. Expect "✅ **Thank you.** Your report helps warn the next person…". No call sheet.

**C11. Report from a screenshot ⚠** (the version in `DEMO.md`)
1. After C5, tap **🚩 Report this** on the `PBB ****5518` card. It pre-fills both the account and the caller from the screenshot.
2. Then as C9 from **Done**.
3. Expect the account to become **Be careful** (inherited from the confirmed caller). The screenshot is attached as evidence.

**C12. Switch language.** Send `/lang`. Expect "Bahasa: Bahasa Melayu"; replies are now in BM. Send `/lang` again to switch back.

**C13. Other seeded scams** (send any; results are from the seed):

| Send | Result | Story |
|---|---|---|
| `017-208 3391` (WhatsApp) | Confirmed scam | The "BNM officer" on WhatsApp in the Macau case |
| `016-773 1290` | Be careful (56) | Fake courier redelivery-fee caller |
| `014-962 0417` | High risk (60) | Fake LHDN refund caller (spiking campaign) |
| `@Qorvanta_Admin` | High risk | Fake trading-app "mentor" on Telegram |
| `https://play.google.com/store/apps/details?id=com.qorvanta.trade` | Confirmed scam | On the SC Investor Alert List |
| `TNG 018-355 7024` | Be careful | Part-time "like and review" job scam e-wallet |
| `012-660 4415` | Some reports (2) | Reports cleared after the owner's appeal was upheld (recycled number) |
| `019-427 8836` | Some reports (16) | Two public reports only: user reports alone stay low |
| `Maybank 5123 4567 8812` | Confirmed scam | Bank-confirmed mule in the Macau ring |
| `HLB 2290 1847 3365` | Be careful (56) | Received money from the mule: risk via the money trail only |

---

## 2. Bank analyst (web)

| ID | Scenario | Time | Proves |
|---|---|---|---|
| B1 | Overview tour | 30 s | Alert queue, live-call alerts, frozen funds, spiking campaigns |
| B2 | Payee check: live call + new payee **⚠** | 45 s | **The call-to-transfer link** (the differentiator) |
| B3 | Payee check: known mule **⚠** | 20 s | Block and report a confirmed mule account |
| B4 | Payee check: regular supplier | 15 s | No false alarm; proceed |
| B5 | Work an alert: confirm mule **⚠** | 30 s | One bank's decision protects everyone (bot + other banks) |
| B6 | Other alert actions **⚠** | 20 s | Graded response: hold, callback, release, freeze, clear, log NSRC/NFP |
| B7 | Investigate a case | 45 s | Timeline, money trail, frozen funds, cash-out, police hand-off |
| B8 | Investigate an entity | 30 s | Score breakdown and the money-flow graph |
| B9 | Campaigns | 20 s | Early warning: the LHDN refund wave spiking |
| B10 | Entities watchlist | 15 s | Filter by tier and type; values always masked |

**B1. Overview tour.** Sign in as the analyst; you land on **Overview**.
- Left: "Welcome, Aisyah"; a doughnut of open alerts by tier; **Open alerts**, **Live-call alerts (24 h)**, **Frozen in money trails** (RM 12,000).
- Alert queue with tier chips: `MBB ****8812` Confirmed scam with a 📞 icon (customer was on a call), `HLB ****3365` Be careful, `RHB ****7301` High risk.
- Right: "Highest-risk entities" (stacked cards); "Live campaigns", with *Fake LHDN tax refund* highlighted orange as **spiking (z 11.9)**.

**B2. Payee check: live call + new payee ⚠**
1. **Payee check** → preset **Live call + new payee (demo step 3)** → **Check payee**.
2. The result depends on whether C9 or C11 ran first:
   - *Fresh data:* payee unknown (0), confirmed caller → combined **60 · High risk**, "**Hold the transfer and call the customer back**".
   - *After C9 / C11:* payee 47 (Be careful) + confirmed caller → **79 · High risk**, same action.
3. Also shown:
   - the customer warning: "You are on a call with a number reported for scams… Hang up before you pay.", plus the BM line;
   - the payee and caller verdict cards;
   - **Alert raised: open it →**.

**B3. Payee check: known mule ⚠** Preset **Known mule account** → **Check payee**. Expect **100 · Confirmed scam**, "**Block, report to NSRC, flag the receiving account**"; alert raised.

**B4. Payee check: regular supplier** Preset **Regular supplier payment** → **Check payee**. Expect **0 · No reports found**, "**Proceed: no known risk**", no alert.

**B5. Work an alert: confirm mule ⚠**
1. From B2 click **Alert raised: open it →** (or **Alerts** → the top open alert).
2. You see a red banner, "The customer was on a call while making this transfer…", the payee's current verdict, history, and the **Decide** panel.
3. Optionally add a note, then **Confirm mule**.
4. Expect the status chip **Confirmed Mule**, the verdict **Confirmed scam · 99** with "Confirmed by a member bank", and "This alert is closed".
5. Then on Telegram send `Public Bank 6471 2093 5518` → **🛑 CONFIRMED SCAM**.

**B6. Other alert actions ⚠** On any open alert (**Alerts** → filter *Open*):
- **Hold payment** → Held.
- **Customer callback** → In review.
- **Release** → Released.
- **Freeze receiving account** → Frozen.
- **Clear (false alarm)** → Cleared.
- **Log NSRC report** / **Log NFP report** record a hand-off without closing the alert.

Each action appears under **History** and in the audit log.

**B7. Investigate a case**
1. **Cases** → tap **Fake police / BNM officer** in the first chip row, then **With money lost** in the second row. One case is left: an NSRC case, RM 48,000, with the blue `NSRC-2026-10-118274` chip in the Source column. Open it (click the date). Under **All** it sits lower down, below the recent public reports.
2. Expect:
   - the victim's narrative;
   - a **Timeline** of 5 steps: first contact call 14 min → transfer to "BNM officer" on WhatsApp video → pressure → DuitNow RM 48,000 → son calls 997;
   - a **Money trail**: hop 1 `BSN ****0076 → MBB ****8812` RM 48,000; hop 2 `→ CIMB ****6677` RM 30,000 (frozen RM 12,000) and `→ HLB ****3365` RM 15,000;
   - a red **Cash-out** box (restricted to the reporting bank): crypto exchange, RM 18,000;
   - the case panel (NSRC ref, police report no., victim Selangor, age 60+);
   - identifiers with tiers, including the BNM hotline as "Official number, may be spoofed".

**B8. Investigate an entity**
1. **Entities** → **Confirmed scam** → **Bank accounts** → `MBB ****8812`, or click any masked identifier anywhere.
2. Expect:
   - the verdict card;
   - the **Graph (one hop)**: red money-flow arrows from the victim's BSN account in, out to CIMB and HLB, dashed same-case links to the two scam numbers;
   - the **Score breakdown**: direct evidence 1.000, from linked entities ~0.75, and the formula;
   - the case list;
   - **Act** buttons (confirm mule, freeze, mark cleared).

**B9. Campaigns.** **Campaigns** shows 5 campaigns, biggest spike first: *Fake LHDN tax refund* (12 reports in 24 h vs a baseline of 0.14/day, spiking), Macau officer calls, the Qorvanta trading app, parcel fee, part-time job. **View N cases** filters the case list.

**B10. Entities watchlist.** **Entities** shows cards by risk. Filter by tier (Confirmed / High / Be careful / Some reports / Official) and type (bank accounts, e-wallets, phones, WhatsApp, Telegram, links, domains, apps). Victims' own accounts never appear.

---

3. *(Money trail from the bank's own trace)* Under **Money trail**, open **Add a transfer your bank traced**: from `HLB ****3365`, to **Bank Islam** `1201 7788 4410`, RM 9,000, frozen RM 4,000 → **Add to the money trail**. Expect: "BIMB ****4410 is now “Be careful” · 50", the new hop with **Frozen RM 4,000.00**, and an alert sent to the other bank/e-wallet in the network. Look the account up in the bot: "Received money a member bank traced from 1 scam case(s)". *Say:* banks trace and freeze among themselves through NSRC and the National Fraud Portal; CrowdShield takes the outcome and warns everyone else who might pay that account.

## 3. Bank supervisor (web)

Everything the analyst can do, plus:

| ID | Scenario | Time | Proves |
|---|---|---|---|
| S1 | Audit log | 20 s | Every lookup, payee check and decision logged with the policy version |
| S2 | Decide an appeal **⚠** | 45 s | Fair to the listed: an upheld appeal clears a recycled number |

**S1. Audit log.** Sign in as the supervisor → **Audit log** (only supervisors and admins see it). Expect rows for `Payee Check`, `Lookup`, `Alert Confirm Mule`, `Entity View`… with entity links, details (no raw identifiers) and `policy-2026-10-demo`. Run B2/B5 first for fresh rows.

**S2. Decide an appeal ⚠** The web app has no "file an appeal" form yet; owners appeal through the API. Create one first, from the repo folder:

```sh
BOT=$(grep ^BOT_API_KEY .env | cut -d= -f2)
curl -s -X POST localhost:4020/v1/entities/22/appeals -H "x-api-key: $BOT" -H 'content-type: application/json' \
  -d '{"reason":"This has been my number since September; the reports are about the previous owner.","claimantVerified":true}'
```

Entity 22 is `+60 19-***-8836` after a reset. Then:

1. **Entities** → **Some reports** → `+60 19-***-8836`. Under **Appeals** you see the open appeal with **Uphold** / **Reject**.
2. **Uphold**. Expect status **Cleared**, the score breakdown showing "× 0.1 (appeal upheld)", and risk dropping from 16 to about 2.
3. Analysts see the appeal but not the buttons.

---

## 4. SME owner: Semak supplier (web)

| ID | Scenario | Time | Proves |
|---|---|---|---|
| M1 | Overview tour | 20 s | Holds, checks, "before you pay" rules, scams going around |
| M2 | Fake bank-detail change (BEC), from the PDF **⚠** | 60 s | AI reads the invoice; 4 red flags; payment held |
| M3 | Callback checklist → reject and report **⚠** | 30 s | Release blocked until the callback; the fake account joins the graph |
| M3b | Callback checklist → verify and release **⚠** | 30 s | The other branch: the new account becomes the supplier's usual one |
| M4 | Clean invoice from a known supplier | 30 s | No false alarm; every check passes |
| M5 | Brand-new supplier selling gloves | 30 s | New company + personal account → high; advice to pay in stages |
| M6 | Dissolved company | 20 s | SSM status catches a company that no longer exists |
| M7 | Cancelled e-invoice | 20 s | The LHDN MyInvois check catches an invoice that was cancelled |
| M8 | Suppliers and check history | 20 s | Supplier master data; every past check |
| M9 | Add a supplier | 30 s | How the "usual account" baseline is set |

**M1. Overview tour.** Sign in as the SME owner → "Welcome, Kavitha"; a doughnut of suppliers by status; **Payments on hold**, **Checks this month**, **Known suppliers** (3). Right: **Before you pay** (4 rules) and **Scams going around**.

**M2. Fake bank-detail change (BEC) ⚠**
1. **Check invoice** → choose `bec-invoice.pdf` → **Read invoice**. Expect "✓ Read bec-invoice.pdf in N s" (about 2–6 s, ~0 if pre-warmed).
2. The form fills with: Keluvra Steel Supplies Sdn Bhd, SSM 201901023456, TIN C2584563200, invoice SS-2026-1187, RM 86,500, **Hong Leong Bank 2290 1847 3365**, account name "Keluvra Steel Supplies", phone `016-221 0934`, email `accounts@keluvra-steel-my.com`, ☑ "Says the bank account has changed", ☑ "Pressure to pay urgently".
3. **Run checks** → **Do not pay yet**:
   - ✗ **Account holder name**: "The account belongs to an individual, not a company."
   - ✗ **Scam reports**: "Linked to scam reports: HLB ****3365 (be careful, risk 56). Received money from an account used by scammers (MBB ****8812)."
   - ✗ **Your payment history**: "Bank account changed: usually PBB ****4457, this invoice says HLB ****3365."
   - ✗ **Email domain**: "Look-alike email domain: keluvra-steel-my.com imitates keluvra-steel.com.my."
   - ⚠ **Official contact**: "The phone on the invoice (016-221 0934) isn't the number in your records (+60351218800)."
   - ✓ SSM, TIN, web reputation: the real company is fine; it's being impersonated.
4. Button: **Payment is on hold: open the callback checklist**.

**M3. Reject and report ⚠** (after M2)
1. **Payment holds** → the Keluvra card ("RM 86,500.00 to HLB ****3365"): "Call Keluvra Steel Supplies Sdn Bhd on +60351218800 (from your records)", then 4 checklist steps.
2. Click **Supplier confirmed: release payment** first. It's refused: "Call back on the number from your records and get written confirmation before releasing the payment".
3. Tick the first step (the callback), optionally note "Keluvra confirmed they never changed banks", then **It's fake: reject and report**.
4. Expect "✓ Rejected. The fake account was reported to CrowdShield to protect other businesses and banks."
5. On Telegram, `HLB 2290 1847 3365` jumps from **Be careful (56)** to **⚠️ HIGH RISK (71)**. It's now also linked to the scammer's phone `+60 16-***-0934` and the look-alike domain, with "What to do: Hold the payment. Call the supplier on a number from your own records…".

**M3b. Verify and release ⚠** (after M2, instead of M3) Tick the **callback** and **written confirmation** steps → **Supplier confirmed: release payment**. Expect "Payment released; the new account is now the supplier's usual account." **Suppliers** now shows Keluvra paying to `HLB ****3365`. Use this only to show the other branch: it trains the system to trust the fake account.

**M4. Clean invoice.** **Check invoice** → type: supplier `Cemvora Trading Sdn Bhd`, SSM `201501007731`, TIN `C2391175508`, e-invoice UUID `F9D425P6DS7D8IU`, amount `18400`, bank `Maybank`, account `5144 0912 7730`, sent from `billing@cemvora.my` → **Run checks**. Expect **No problems found**: all 9 checks ✓, "Keep to your usual approval steps; this is not a guarantee."

**M5. Brand-new supplier.** Type: `Glovexa Supply Sdn Bhd`, SSM `202608047712`, TIN `C60011234500`, amount `42000`, bank `Maybank`, account `5621 0098 4410` → **Run checks**. Expect **Do not pay yet**:
- ⚠ SSM: "GLOVEXA SUPPLY SDN BHD was registered only 2 month(s) ago (2026-08-14)."
- ✗ the account belongs to an individual.
- ⚠ new supplier with no payment history.
- Actions: "Pay only to an account in the company's name." and "New supplier: pay in stages, use escrow, or pay on delivery."

**M6. Dissolved company.** Type: `Palmquira Products Sdn Bhd`, SSM `201107004421`, TIN `C1955420010`, amount `9000` → **Run checks**. Expect **Do not pay yet**, ✗ "PALMQUIRA PRODUCTS SDN BHD is dissolved at SSM.", "Do not pay until the supplier resolves the problems below."

**M7. Cancelled e-invoice.** Same as M4 but e-invoice UUID `9KQ2ZR7M1WX3B5T` → ✗ "This e-invoice was cancelled at LHDN." → **Do not pay yet**.

**M8. Suppliers and history.** **Suppliers**: 3 cards (Binqora Bekalan, Cemvora Trading, Keluvra Steel) with SSM, TIN, usual account (masked), callback number. **Check history**: every check, with result, amount and hold status.

**M9. Add a supplier.** **Suppliers** → the **Add a supplier** form: name, SSM, TIN, bank, account, account name, phone from your records, email domain → "✓ … added." Later invoices are compared with these details.

---

## 5. Platform admin (web)

`admin@crowdshield.local` signs in to the bank portal (all bank screens plus the audit log for every organisation) and can decide appeals like a supervisor. There is no separate admin UI yet. Use it only if a judge asks "who runs the platform?"

---

## 6. Cross-user stories (the strongest moments)

| ID | Story | Uses | Time | Proves |
|---|---|---|---|---|
| X1 | **Call-to-transfer**: the crowd → the bank → everyone | C5 → C11 → B2 → B5 → Telegram re-check | ~3 min | The differentiator, end to end |
| X2 | **Business protects banks**: SME → graph → bank/bot | M2 → M3 → Telegram `HLB 2290 1847 3365` | ~2 min | One graph across audiences |
| X3 | **From report to police hand-off** | C9 (with NSRC ref) → B7 | ~2 min | Faster, better reports for NSRC/PDRM |
| X4 | **Fairness**: wrong listing corrected | C13 `019-427 8836` → S2 uphold → Telegram re-check | ~1.5 min | Appeals; never a public blacklist |

---

## 7. Suggested line-ups

**A. Five minutes (current `DEMO.md`): X1 + X2**
C5 → C11 → B1 (10 s) → B2 → B5 → Telegram re-check → M2 → M3.
All three audiences, the differentiator, both AI moments (screenshot, invoice). Highest impact; the most moving parts.

**B. Three minutes: X1 only**
C5 → C11 → B2 → B5 → Telegram re-check. Mention Semak supplier on a slide.
Tight, and still lands the differentiator.

**C. Bank-focused jury (fintech / bank judges): X1 + investigation**
C1 → C11 (typed, no screenshot) → B2 → B5 → B7 → B8 → B9.
Depth on payee check, cases, money trail and the graph.

**D. SME / e-invoicing angle: X2 + checks**
M1 → M2 → M3 → M5 → M4 (contrast).
Malaysia's e-invoicing edge; the AI invoice reader; no false alarms.

**E. AI / sponsor showcase (Nebius, Tavily judges)**
C5 (Nemotron VL screenshot) → C6 (story classification) → C7 (Tavily page check) → C8 (Tavily investment check) → M2 (Nemotron VL invoice).
Every AI call, all real and cached. Note that decisions stay in the graph.

**F. Ten minutes / Q&A deep dive: A + extras**
Line-up A, then any of C2, C4, C8, B7, B8, B9, M5, S2 (X4).

---

## 8. Order and dependencies

- **Reset before every full run** (`pnpm demo:reset`): reports, confirmations, holds and appeals all change the data.
- **C11 / C9 before B2** makes the payee check show **47 + 99 → 79** (the deck uses these numbers). Without them, B2 shows **0 + 99 → 60** with the same action.
- **B5 confirms the mule.** After it, B2 gives **Confirmed / block** instead of "hold and call back". Run B2 before B5.
- **M3 or M3b, not both:** the hold is decided once. Reset to repeat.
- **S2 needs the curl step** to create an open appeal.
- **C5, C6, C7, C8 and M2 call Nebius/Tavily.** Run `pnpm demo:prewarm` within 24 h of the demo, so they answer from cache even if the network is slow.
- **The bot's language** follows the phone's language (Malay → BM); `/lang` switches.

## 9. Decide together

- [ ] Which line-up (A–F), and the time limit?
- [ ] Who drives the laptop, who holds the phone?
- [ ] Mirror the phone, or show Telegram Desktop / Web on the laptop?
- [ ] Screenshot (C5) or typed number (C1) to start? (The screenshot is more impressive; typed is safer.)
- [ ] Show the M3 refusal ("callback first") or skip straight to reject?
- [ ] Include fairness (X4), or keep it for Q&A?
- [ ] Backup: a recorded video of the chosen line-up by 29 Oct.
