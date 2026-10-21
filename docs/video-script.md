# Demo video script (about 3 minutes)

For the Devpost submission video. Screen recording with voice-over; the phone is mirrored (QuickTime or scrcpy) next to the browser. Run `infra/deploy/demo-reset.sh` on the server (or `pnpm demo:reset` locally) right before recording, then `pnpm demo:prewarm` so every model call is instant.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Landing hero | "Malaysians lost over 2.7 billion ringgit to online crime in eleven months of 2025. Scam calls were the biggest category. The bank sees the transfer. The crowd saw the call. Nobody sees both. CrowdShield does." |
| 0:15–0:40 | Telegram: `/start`, tap **A suspicious call** | "Anyone can forward a message to our bot, Semak dulu. Nemotron 3 Ultra names the scam in BM or English in about a second, and our embeddings recognise a known scam wave. The trace shows which model answered." |
| 0:40–1:00 | Telegram: send the scam screenshot | "Screenshots too: Nemotron 3.5 Super VL reads the chat, and every number in it is checked against the scam graph. This caller is a confirmed scam number." |
| 1:00–1:20 | Telegram: **Report this** → lost money → consent → call sheet | "Lost money? The bot takes the report in a few taps and hands the victim a sheet to read from while calling NSRC 997, because minutes matter." |
| 1:20–1:50 | `/demo/bank-app`: example **Mule account, on a scam call** → Transfer | "Now the victim's banking app. Before the transfer leaves, the bank asks CrowdShield about the payee, with one signal only the phone has: the customer is on a call with a confirmed scam number. The transfer is paused in milliseconds. No AI model sits in the payment path; the score comes from the graph." |
| 1:50–2:15 | Bank portal: Alerts → the alert → Confirm mule; then the case → **Write the brief** | "The analyst sees the same transfer in the queue, confirms the mule, and every bank and every bot user is protected. For the referral, Nemotron 3 Ultra reasons over the timeline and money trail and writes a brief where every point links to its evidence, plus a referral note in English and BM." |
| 2:15–2:35 | Campaigns page: the KWSP candidate → **Confirm campaign** | "New scams appear every week. Three reports of a fake KWSP agent, in two languages, matched no known campaign. CrowdShield grouped them by meaning, and Ultra named the campaign and drafted a warning. Once the analyst confirms it, the bot warns the public." |
| 2:35–2:50 | SME portal: upload `bec-invoice.pdf` | "Businesses get the same protection: the vision model reads the invoice, the changed bank account is caught, and the supplier's real phone number is found on the web for a call-back." |
| 2:50–3:00 | README model table / eval table | "Every model choice was measured on our own Malaysian test set. Nemotron does the reading; the graph makes the decisions. Semak dulu: check first." |

## Before recording

- On the server: `./demo-reset.sh`, then `dc exec -T api node scripts/demo-campaign-wave.mjs` (locally: `pnpm demo:reset && pnpm demo:wave`) so the KWSP candidate exists.
- Telegram language: English for the video (send `/lang` if needed); show one BM reply to make the bilingual point.
- Close other tabs, hide bookmarks, zoom the browser to 110%.
- Keep it under 3 minutes; judges watch many videos.
