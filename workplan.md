# CrowdShield: hackathon workplan

Status: draft, 20 Oct 2026. **Submission / demo: Fri 30 Oct 2026.** Built from `architecture_11.md`, `techstacks_7.md` (supersedes v6; adds Tavily), `schema.sql`, `scoring.py` and the `banking-main` frontend reference.

**Decisions made (20 Oct)**

- Deadline 30 Oct, so we have 10 working days (21–30 Oct). Schedule in §4.
- The bot runs on **Telegram only for the demo** (changed 20 Oct). WhatsApp is deferred: the bot keeps a channel-adapter interface so WhatsApp can be added later without touching the flows.
- **All three audiences** are in scope: consumer, bank and SME.
- Worked example 2 = **47** (the doc is correct). Change the `scoring.py` example input to match (§7.1).
- Build and run locally; hosting decided later.
- **Tavily** live web intelligence (techstacks_7 §4) is in scope: MVP flows in §3 Phase 3b.

## 0. Goal and demo story

Build a working slice of the shared scam intelligence graph with all three front doors, and demo the **call-to-transfer link** (architecture §6), which is the differentiator.

**Demo script (≈5 min)**

1. **Consumer (Semak dulu bot):** forward a suspicious number or screenshot to the Telegram bot and get a verdict card in BM/EN: "HIGH RISK · Risiko tinggi, linked to 37 fake police (Macau) reports". Tap *Report* and get the pre-filled 997 call sheet.
   - Then forward something the graph has never seen: a publicly reported scam investment app or domain (public data, so it returns real web results). The bot says "No reports found" straight away, then follows up a few seconds later: "Found 2 web mentions", with cited links from a Tavily search (a forum post and a news item). This is shown as a lead, never as confirmation.
   - Forward a suspicious link. The bot inspects the page through Tavily Extract (the user never opens it) and flags "fake Maybank login page".
2. **Graph updates:** the new report raises the score of the linked mule account within a minute (one-hop recompute).
3. **Bank dashboard:** an analyst runs a payee check on that account before a DuitNow transfer, with "customer on active call" set, and sees risk, tier, evidence, sources and campaign. An alert appears in the queue. The analyst opens the case (timeline, money trail) and acts: hold, freeze or confirm mule.
4. **Feedback loop:** "confirm mule" moves the account to *confirmed*, and the bot's next verdict for linked numbers goes up.
5. **SME (Semak supplier):** forward an invoice through the bot or upload it in the SME portal. A known supplier's bank account has changed to a personal account, so the result flags "company invoice paid to personal account / new bank account for known supplier", puts the payment on hold and shows the callback checklist. The checklist shows the supplier's **official phone number, taken from its own website via Tavily**, next to the different number in the email. The fake account goes into the graph, and the bank side now sees it too.

## 1. Scope

| In (MVP) | Stretch | Out (for the hackathon) |
|---|---|---|
| Postgres graph from `schema.sql` + seed data | Campaign clustering (Qwen3-Embedding + pgvector) | Mobile app, Android/iOS caller ID |
| TypeScript port of `scoring.py` | Graph view (Cytoscape.js) of mule network | Bank mobile SDK, ATO and malware detection |
| Lookup, report, payee-check and supplier-check API (NestJS) | Admin: appeals + source weights UI | Real SSM / MyInvois / DuitNow integrations (**mocked** with realistic responses) |
| Semak dulu bot on **Telegram** (check, report, 997 sheet, supplier check) | Gmail/Outlook add-in; **WhatsApp channel** (adapter only, after the demo) | Nightly GPU (cuGraph) two-hop propagation |
| Nemotron VL screenshot/invoice extraction via Nebius | ZH/TA copy (MVP: BM + EN) | KMS/HSM, multi-account AWS, Terraform |
| **Tavily**: unknown-identifier fallback, link inspection, investment scheme check, supplier official contacts + reputation, one-off news seed run | Tavily: hourly news discovery, daily BNM/SC alert-list refresh, weekly official-numbers refresh | Tavily brand-impersonation monitor (needs certificate / new-domain feeds) |
| Bank dashboard (from banking-main layout): overview, alerts, payee check, cases, entities | Public alerts channel | Family guardian, on-device model |
| SME portal: suppliers, invoice check, bank-change holds + callback checklist | | |

**Hackathon simplifications (and the production plan they stand in for)**

- One Next.js app (`apps/web`) with route groups `(bank)`, `(sme)`, `(admin)`. Production plans three apps (`web-bank`, `web-sme`, `web-admin`). Route groups keep the split easy later.
- HMAC pepper and encryption key come from `.env`, not KMS. `value_enc` uses `pgp_sym_encrypt` as the draft schema does.
- Everything runs locally in Docker Compose. A public HTTPS tunnel (e.g. cloudflared/ngrok) serves the Telegram webhook (or use long polling locally, so no tunnel is needed). No AWS `ap-southeast-5` deployment.
- WhatsApp is deferred. When added: Cloud API test number (max 5 recipient numbers), an employee **system user** token, no BSP.
- SSM, MyInvois TIN/e-invoice and DuitNow account-name checks are **mock adapters** behind real interfaces, so swapping in the real APIs later only changes the adapter.
- Only seeded/synthetic data. No real personal data, but the redaction step is still built so the pipeline shape is right.

## 2. Repo layout (hackathon cut of techstacks §1)

```
crowdshield/                 pnpm + Turborepo
├── apps/
│   ├── api/                 NestJS: /v1 lookup, reports, cases, payee-check, supplier-check, admin
│   ├── worker/              NestJS: BullMQ consumers (extraction, score recompute, alerts)
│   ├── bot/                 NestJS: Telegram bot (channel-adapter interface, WhatsApp later), XState flows
│   ├── web/                 Next.js 15: migrated from banking-main; (bank) (sme) (admin) route groups
│   └── ml/                  FastAPI gateway: redaction → Nebius Token Factory → JSON-schema validation; Tavily web intel
├── packages/
│   ├── db/                  Drizzle schema mirroring schema.sql (+ additions in §7) + migrations + seed
│   ├── scoring/             TS port of scoring.py (shared by api + worker)
│   ├── normalise/           phone / bank account / URL / TIN / SSM no. normalisation + HMAC hashing + masking
│   ├── contracts/           Zod schemas + OpenAPI 3.1 + generated client
│   ├── i18n/                BM / EN strings, scam-type copy, tier labels
│   └── ui/                  design tokens (risk tiers) exported to Tailwind
├── docker-compose.yml       Postgres 16 + pgvector, Redis, SeaweedFS (S3)
└── banking-main/            reference only; delete once migrated
```

## 3. Work breakdown

Phases are ordered by dependency. Owners are placeholders (**BE** backend, **FE** frontend, **AI** ML/bot). BE and FE run in parallel from Phase 1, with FE using mocked API responses from `packages/contracts`. Dates are in §4.

### Phase 0: Foundations

- [x] Init pnpm + Turborepo, TS config, ESLint/Prettier, Vitest. **(BE)**
- [x] `docker-compose.yml`: `pgvector/pgvector:pg16`, Redis 7, SeaweedFS as the S3 store (MinIO no longer publishes community images). Host ports 5442 / 6389 / 9020 to avoid clashing with other local projects. **(BE)**
- [x] `.env.example` for all apps (DB, Redis, HMAC pepper, enc key, Nebius key, Telegram token, WhatsApp token / phone-number ID / verify token / app secret). **(BE)**
- [-] ~~Start the WhatsApp setup on day 1~~: deferred (Telegram-only demo, decided 20 Oct). **(AI)**
- [ ] Telegram: create the bot with BotFather and set the webhook. **(AI)**
- [x] Fix `scoring.py` example 2 to output 47 (§7.1). **(BE)**
- [x] Apply schema fixes and additions (§7) before generating Drizzle, then port `schema.sql` → `packages/db` and run migrations. **(BE)** The Drizzle schema in `packages/db` is now the source of truth; `schema.sql` is kept as the design reference.

### Phase 1: Graph core

- [x] `packages/normalise`: E.164 for MY phones (`+60…`), bank code + account, URL/domain canonicalisation, TIN and SSM no. formats, `HMAC-SHA256(pepper, value)`, masking (`+60 12-***-4567`, `MBB ****8812`). Unit tests. **(BE)**
- [x] `packages/scoring`: port `scoring.py` 1:1 (half-lives, verification multipliers, noisy-OR, one vote per reporter/sybil cluster, graph term, `BETA=0.8`, user-only cap 59, protected official, clearing 0.1, tiers, confidence). **(BE)**
- [x] Parity test: the four worked examples must output **16 / 47 / 99 / 10**, matching architecture §8 and the corrected `scoring.py`. **(BE)** Plus 500 random cases scored by both `scoring.py` and the port, which must match.
- [x] Seed script with Malaysian scenarios: Macau call ring (numbers → mule accounts → second-hop mule), parcel scam, investment scam, fake LHDN refund campaign, one protected official number (PDRM/BNM line), one cleared entity with an upheld appeal, and the source weights from architecture §7. **(BE/AI)**
- [x] SME seed data: 3–4 demo businesses with supplier histories (TIN, SSM no., usual bank account, past invoices), one fake supplier (newly registered, below-market prices), and one BEC case (known supplier, "new bank account" to a personal account that's linked to the mule ring). **(BE)**
- [x] Score recompute: `recomputeEntity(id)` reads observations + one-hop neighbours and writes `entity_score` (with `explanation` jsonb, never reporter identities). **(BE)**

Phase 1 lives in `packages/normalise`, `packages/scoring` and `packages/graph` (entities, edges, recompute, campaign stats, seed). Run `pnpm db:fresh` for a clean, seeded database. The demo identifiers are in `DEMO` in `packages/graph/src/seed/seed.ts`. Graph rules decided while building it:

- **Money flow taints downstream only.** An account inherits risk from whoever paid it, not from accounts it paid, so victims don't inherit risk from their mule.
- **Impersonated isn't guilty.** `impersonated_official` observations are not evidence against the entity.
- **Zero-risk neighbours are ignored.** They add nothing to `p_graph`, and including them would lift the user-only cap.
- **Default edge alphas:** `co_case` 0.5, `money_flow` 0.7, `same_device` 0.6, `redirects_to` 0.8, `same_campaign` 0.3 (tunable).
- **User evidence is modelled by the verification multiplier**, as in `scoring.py`'s examples: `user_report` 0.25 × 1.3 for evidence. The `user_report_verified` (0.40) source row is therefore unused for now (§7.12).

### Phase 2: API (`apps/api`)

- [x] `GET /v1/lookup?type=&value=`: normalise → hash → single indexed read of `entity_score` (+ Redis cache), masked response. Target < 100 ms locally. **(BE)**
- [x] `POST /v1/reports`: creates `scam_case` + `observation`s + `incident_event`s, de-dupes by identifier hash, enqueues recompute. Takes an idempotency key. **(BE)**
- [x] `POST /v1/payee-check` (bank): lookup plus optional `call_signal` flag (the call-to-transfer link). Returns combined risk + evidence and creates an alert if the tier is caution or above. **(BE)**
- [x] Cases: list/filter, detail (timeline, `fund_hop` money trail, evidence), actions (`confirm_mule`, `clear`, `hold`, `freeze`), each written to `audit_log`. **(BE)**
- [x] Entities: detail, neighbours (for the graph view), appeal create/decide. **(BE)**
- [x] Dashboard stats: open alerts by tier, top campaigns (reports_24h, spike_z), recent reports. **(BE)**
- [x] **Supplier check** (`POST /v1/supplier-check`): input is extracted invoice fields or a supplier record. Runs checks in parallel and returns a risk level with reasons (architecture §5). **(BE)**
  - SSM adapter (mock): exists, status, registration date, directors.
  - MyInvois adapter (mock): TIN valid, e-invoice UUID validates.
  - Account-name adapter (mock DuitNow): company vs personal holder.
  - Graph reputation: account, phone and email domain looked up in the scam graph.
  - Supplier history: same TIN and bank account as previous invoices?
  - Email/domain: domain age, look-alike, reply-to mismatch (headers, if given).
  - Official contact (Tavily): phone/email from the company's own website vs the invoice/email. Mismatch → warn.
  - Web reputation (Tavily): complaints, news, reviews, as cited signals.
- [x] Supplier CRUD + bank-detail-change **hold** (status, callback checklist, confirmed-by, timestamps). Confirmed fakes are written into the graph as observations. **(BE)**
- [x] Auth for the demo: email/password login with roles `bank_analyst` / `bank_supervisor` / `sme_owner` / `admin`, scoped by `org_id` (Auth.js on web, JWT to API). SSO comes later. **(BE/FE)**
- [x] OpenAPI generated from Zod; typed client in `packages/contracts`. **(BE)**

Phase 2 lives in `apps/api` (NestJS 12, native ESM) and `packages/contracts` (Zod schemas, route registry, OpenAPI 3.1 at `/v1/openapi.json`, typed client). Each controller method takes its method, path, auth rule and validation from the registry, and responses are validated against the contract, which strips undeclared fields. Run it with `pnpm --filter @crowdshield/api dev` on **port 4020**: ports 3000 and 4000 are taken by other local projects, so the web app will use 3020 and the ML gateway 8020. Latency on the seeded data: payee check p95 5 ms, lookup p95 10 ms uncached (target < 100 ms). There are 19 end-to-end tests covering demo steps 1–5. Decisions made while building it:

- **Combined risk (payee check):** `100 × (1 − (1 − payee) × (1 − 0.6 × callerFactor))`. `callerFactor` is the caller's risk, or 0.25 for an active call with an unknown number. A fresh mule account plus a confirmed caller on the line scores **high**, so the action is "hold and call back". "Confirm mule" then makes it **confirmed** for everyone. Recommended action by tier: proceed / warn / cooling-off / hold and call back / block and report.
- **NSRC reference brought back by the victim:** lifts the case to `reviewed` (×1.6), not to NSRC-confirmed evidence. That needs NSRC itself (partnership level 1+).
- **Duplicates:** the same reporter reporting the same identifiers within 7 days gets the earlier case back (`duplicateOf`), with no new vote. Requests also accept an `Idempotency-Key` (Redis, 24 h).
- **Consumer transfers go on the case timeline;** `fund_hop` is reserved for bank-supplied money trails.
- **Bot users** are stored only as `HMAC(channel:user id)` (`reporter.external_ref_hash`, migration 0003).
- **The 997 call sheet** contains the full receiving account and transaction reference, because NSRC needs them. It is returned only to the reporting victim and never stored unencrypted.
- **Supplier check:** SSM, MyInvois and DuitNow are mocks behind adapter interfaces (`apps/api/src/modules/sme/registries.ts`). Releasing a hold requires the callback and written-confirmation steps. Rejecting one reports the account, phone and email domain to the graph as `bec_supplier`. `official_contact` and `web_reputation` arrive with Tavily in Phase 3b.
- **Not done yet:** rate limiting, and SSO / mTLS for banks (demo uses email login and a bot API key).

### Phase 3: AI pipeline (`apps/ml`, `apps/worker`)

- [x] FastAPI gateway: `/extract/text` and `/extract/image`, regex redaction of IC numbers, phones, accounts and names (tokens re-attached after), calls Nebius Token Factory (OpenAI-compatible), validates output with Pydantic, falls back to `needs_review`. **(AI)**
- [x] Scam prompt (versioned in repo): extract identifiers, scam type (mapped to the `scam_type` enum), urgency and language. Nemotron VL for screenshots, Nemotron Super for text. **(AI)**
- [x] **Invoice prompt**: extract supplier name, SSM no., TIN, bank + account, amounts, e-invoice UUID/QR and bank-change/urgency language (Nemotron VL for PDFs and images). **(AI)**
- [-] *(Not needed for the demo)* Worker queues: `extract` → `upsert-entities` → `recompute` → `alert-fanout`. **(BE/AI)**
- [ ] Small gold set (~30 scam samples in BM/EN/Manglish + ~10 invoices) to sanity-check extraction before the demo. **(AI)**
- [ ] *(Stretch)* Qwen3-Embedding on `script_snippet`, nearest campaign centroid via pgvector HNSW, and the "known scam: reported N times this week" message. **(AI)**

### Phase 3b: Tavily web intelligence (techstacks_7 §4)

Tavily runs in the `apps/ml` gateway (`tavily-python`), next to Nebius, so every outside call has the same redaction, logging and caching. API and bot call it through `/web/*` endpoints.

- [x] **Client + guard rails:**
  - Query builder only accepts the identifier being checked or public names (company, platform, domain), never victim/reporter data or free text from a report.
  - Redis cache for 24 h, keyed by `(flow, identifier hash)`.
  - Per-flow timeouts.
  - Credit counter logged per call.

  **(AI)**
- [x] **Unknown-identifier fallback** `/web/identifier`:
  - Trigger: the graph returns no record.
  - Search for the number / account / domain / app name with "scam", "penipuan", "tipu" (country = Malaysia).
  - Nemotron Super classifies each hit as relevant or not and pulls out the scam type. Output is cited leads `[{ title, url, snippet, published_at }]`.
  - The bot replies with the graph verdict first (target < 2 s) and sends a follow-up message only if there are leads.

  **(AI)**
- [x] **Link inspection** `/web/url`:
  - Tavily Extract on the forwarded URL. The user's device never loads it.
  - Nemotron checks the page text and metadata for bank/brand impersonation, login/OTP forms and APK downloads.
  - Output becomes a `phishing_link` / `malware_apk` lead.

  **(AI)**
- [x] **Investment scheme check** `/web/investment`:
  - Search with `include_domains` sc.com.my, bnm.gov.my and major MY news sites.
  - Output: alert-list hit or news coverage, with links.

  **(AI)**
- [x] **Supplier official contacts + reputation** `/web/supplier`:
  - Search + Extract the company's official site for its phone and email.
  - Search company name + "scam" / reviews / news.
  - Feeds two new supplier checks (`official_contact`, `web_reputation`).
  - The official phone fills the callback checklist on a bank-detail change.

  **(AI/BE)**
- [ ] **Writing leads into the graph** (blocked on the §7.8 weight/cap decision; leads are shown with citations but not stored as evidence):
  - Each lead becomes a `scam_case` with source **"Tavily web lead"**: a new `source` row, `kind = news_extraction`, weight **0.25**, with web-only evidence capped at 59 (§7.8).
  - Plus a `case_evidence` row of the new kind `web_page` (URL, title, fetched-at, snippet).
  - Explanations show the source links.
  - Leads can raise a score but never confirm a scam on their own.

  **(BE)**
- [ ] **News seed run** (one-off for the demo, scheduled job is stretch):
  - Search `topic=news`, `time_range` week/month, Malaysian news domains, queries in BM / EN / ZH.
  - Nemotron extraction feeds the Phase 1 seed, so the demo graph contains real, current Malaysian scam patterns (with identifiers replaced by synthetic ones).

  **(AI)**
- [ ] *(Stretch)* Hourly news discovery, daily BNM FCA / SC Investor Alert List crawl, weekly protected official-numbers refresh, all as BullMQ repeatable jobs. **(AI/BE)**

Phase 3 lives in `apps/ml` (Python 3.12, FastAPI, uv), on **port 8020** behind `X-Internal-Key`. Run it with `pnpm --filter @crowdshield/ml dev`. Measured live:

| Call | Model | Time |
|---|---|---|
| Classify text | `nvidia/nemotron-3-super-120b-a12b` | ~1–2 s |
| Read screenshot | `nvidia/Nemotron-3.5-Super-VL` | ~3–4 s |
| Read invoice (PDF rendered with PyMuPDF) | `nvidia/Nemotron-3.5-Super-VL` | ~2 s |
| Tavily search | | ~3 s |
| Tavily extract | | ~1 s |
| Any cached call (Redis, 24 h) | | ~10 ms |

Decisions:

- **Reasoning off for extraction** (`chat_template_kwargs.enable_thinking=false`): 0.7–0.9 s per call instead of ~2.3 s. Outputs are strict JSON schema validated with Pydantic, and a failure becomes `needs_review`.
- **Redaction before Nebius** (text only): IC numbers, phones, accounts and emails become tokens and are mapped back afterwards (tested: none reach the request). Personal names aren't redacted yet; an NER model is the next step. Screenshots and invoices go to Nemotron VL as images, so they can't be redacted. This relies on Token Factory's zero data retention and belongs in the PDPA review.
- **Models read and classify only.** Identifiers are still found by the TypeScript detector and normaliser, so there is one source of truth.
- **Web-check guard rails:**
  - A web lead counts only if the result really mentions the identifier: the model judges relevance, and for numbers and accounts the digits must appear.
  - Official domains (government, regulators, major banks, couriers and e-wallets) are never flagged as impersonation, whatever the model says.
  - Tavily only ever receives the identifier being checked or a public name.
- **Bot:** screenshots are stored in S3 (hash recorded) and attached to the next report as evidence (×1.3).
  - The instant verdict comes from the graph; web checks follow as a second message only when they find something.
  - Story-only messages are classified.
  - New command: `/invest <name>`.
- **API:** new routes `/v1/web/leads`, `/v1/web/url-check` and `/v1/web/investment`. The supplier check adds `official_contact` and `web_reputation`, which degrade to "unavailable" if the gateway is down.
- **Tests:** API tests use a fake ML gateway, so they never spend Nebius or Tavily credits. `apps/ml/tests/make_fixtures.py` generates the synthetic scam screenshot and BEC invoice used in the demo.
- **Not done:**
  - the gold set (~30 samples) for extraction accuracy;
  - the news seed run (the demo seed is hand-written);
  - the BullMQ worker (recompute runs inline and meets the < 1 min target);
  - embeddings and campaign clustering (stretch);
  - invoice upload through the bot (needs SME account linking).

### Phase 4: Semak dulu bot (`apps/bot`)

- [x] **Channel adapter interface** (`receive` text/image/document/button reply, `send` text/buttons/document). The XState flows are written once and shared by both channels. **(AI)**
- [x] Telegram adapter: long polling locally (webhook when hosted), inline keyboards, Redis sessions, rate limit 30/min per user, BM/EN command menus. **(AI)**
- [-] *(Deferred, after the demo)* WhatsApp adapter: Cloud API webhook with `X-Hub-Signature-256` verification, interactive reply buttons (max 3, which fits `[Report] [Call 997] [Why?]`), media download by ID, replies inside the 24-hour session window. Template messages only for proactive alerts (stretch). **(AI)**
- [~] Flows (Check, screenshots, Tavily follow-ups and Report done; supplier check in the bot pending):
  - **Check:** identifier, link or screenshot → "checking…" → verdict card. If the graph has no record, a follow-up message with cited Tavily leads, if any. For links, the result of the page inspection.
  - **Report:** asks only for missing fields (number, account, time, state, loss) → **997 call sheet** → capture the NSRC reference afterwards.
  - **Supplier check:** forwarded invoice or email → check list + what to do.

  **(AI)**
- [x] Verdict card rendering per techstacks §11: tier label + icon (emoji in chat) + masked value + one-line reason + one action + buttons + confidence/last seen. Never say "safe". **(AI/FE)**
- [x] Language from the Telegram app language, `/lang` to switch (detection from message text comes with Phase 3); BM and EN replies from `packages/i18n` (human-written copy, not generated on the fly). **(AI)**
- [x] Media saved to the S3 store (SeaweedFS locally) first, then processed. **(AI)**
- [x] Screenshots (and image documents) → stored as evidence → Nemotron VL → same Check flow.
- [ ] Supplier check in the bot: needs the invoice extraction (Phase 3) and a way to link a Telegram user to an SME account (e.g. a one-time code from the SME portal). Until then, the SME demo runs in the portal.

Phase 4 (partial) lives in `apps/bot`: @CrowdShieldBot, run with `pnpm --filter @crowdshield/bot dev` (API must be up). It's a plain Node/grammY service rather than NestJS, with a hand-written state machine (`flow.ts`) rather than XState. The flow is small, deterministic and fully unit-tested, and `handle(event, session)` is the channel-adapter boundary for WhatsApp later. Identifier detection in free text is regex plus the shared normaliser. Reports are idempotent per draft, so double taps submit once. The Telegram user id is only sent to the API, which hashes it.

### Phase 5: Web app (`apps/web`, from banking-main)

The migration and screen mappings are in §5.

- [x] Migrate banking-main to Next.js 15 and strip Appwrite/Plaid/Dwolla (§5.1). **(FE)**
- [x] Rebrand: CrowdShield logo, Noto Sans, risk-tier tokens. The sidebar links depend on role (bank vs SME). **(FE)**
- [x] Shared `RiskBadge` + `VerdictCard` components (icon + label + colour, WCAG AA). **(FE)**
- [x] Bank screens (§5.2): overview, alerts, alert detail and actions, payee check, cases, case detail, entities, entity detail with a one-hop graph, campaigns, audit log. **(FE)**
- [x] SME screens (§5.3): overview, check invoice (upload → Nemotron VL → prefilled form → checks), result, history, payment holds with callback checklist, suppliers. **(FE)**

Phase 5 lives in `apps/web`: Next.js **15.5.28** + React 19 + Tailwind 3.4, on **port 3020**. Run `pnpm --filter @crowdshield/web build && pnpm --filter @crowdshield/web start`, or `dev`. 18 routes build cleanly. Decisions:

- **Data and auth:** server components fetch through the typed contracts client, and mutations are server actions, instead of TanStack Query / Auth.js. The API token lives in an httpOnly cookie (`cs_session`), and middleware sends signed-out users to `/sign-in`. A 401 from the API (expired token) also returns to sign-in.
- **Layout:** banking-main's layout is kept: sidebar and mobile sheet nav, 2-column home with the right sidebar (profile banner, stacked cards, progress rows), tables, filter chips (as links), split-screen auth.
  - `TotalBalanceBox` → `StatBox` (doughnut + counters).
  - `BankCard` → `EntityCard`.
  - `Category` → `CampaignRow`.
  - `PaymentTransferForm` → `PayeeCheckForm`.
- **Payee check presets** (live call + new payee, known mule, regular payment) make demo step 3 one click.
- **Invoice reading** uploads to the ML gateway server side; the browser never sees the internal key.
- **Demo data uses invented company and app names** (Keluvra Steel, Cemvora, Binqora, Glovexa, Qorvanta, Majuvista). The original names matched real Malaysian businesses on the live web check, and a public demo must not link a real company to fraud. The coined names were checked with Tavily to have no web presence.
- **Supplier contacts:** for a known supplier, the business's own records are the authority for the callback number. A different number on the company's website only adds a "confirm which is current" note.
- **Visual checks:** headless Chrome screenshots of every main screen at desktop and phone width (390 px) during the build. Turning them into Playwright smoke tests is Phase 6.
- **Not done:** dark mode (the dashboards are light-only for now), ZH/TA copy, Cytoscape (the one-hop SVG graph covers the demo). `banking-main/` can now be deleted (MIT notice kept at `apps/web/LICENSE-banking-main`).

### Phase 6: Demo hardening

- [x] One-command start (`pnpm demo:start`: infra + migrations + all four services; Telegram uses long polling, so no tunnel), reset (`pnpm demo:reset`) and pre-warm (`pnpm demo:prewarm`) scripts. **(BE)**
- [~] Rehearse the demo end-to-end on real phones (Telegram). Scripted rehearsal of steps 1–5 against the live stack passes; a rehearsal with people and real phones is still to do.
- [x] Playwright smoke tests: payee check → alert → confirm mule; invoice check → hold. **(FE)** `pnpm e2e`: 5 tests in ~6 s, using the installed Chrome; resets the demo before and after.
- [x] Pitch deck (draft, 14 slides, speaker notes): https://claude.ai/artifact/YNAc1PcjJNaoMoE1R2cnvH. Placeholders left for team name, pricing and contact.
  - The problem: APP scams, and scammers shifting to WhatsApp.
  - Three front doors on one shared graph.
  - The call-to-transfer link.
  - Semak supplier and MyInvois.
  - Live web intelligence (Tavily) for identifiers the graph hasn't seen yet. This addresses the cold-start risk.
  - Privacy: hash, mask, redact, Malaysian hosting.
  - The partnership ladder and the roadmap.

  **(All)**
- [ ] Backup demo video recorded 29 Oct. **(All)**

Phase 6 so far:

- **Runbook:** [`docs/DEMO.md`](docs/DEMO.md), the 5-step demo with exact inputs, expected results, lines to say, fallbacks, and facts worth having ready.
- **Resilience:**
  - Screenshot and invoice readings are cached by file hash for 24 h. This is architecture §10's "exact duplicate → no model call"; it also means pre-warmed demo artefacts answer in ~20 ms and still work if Nebius is down.
  - Web checks are cached for 24 h.
  - Role guards stop the bank and SME portals crossing over.
  - Friendly error and not-found pages; malformed IDs return 404.
- **Bugs found by the new tests and the rehearsal, all fixed:**
  - Multi-button forms lost the clicked button's value in server actions, so "Confirm mule" and hold decisions failed. Hidden inputs now carry the choice.
  - A too-broad "not found" rule hid action errors.
  - "Report this" in the bot reported only one identifier from a forwarded scam message, so the account never linked to the caller. It now reports all identifiers from the same message.
  - The supplier web lookup trusted the model's "official site" judgment and attached two *other* real companies' contacts to the invented demo suppliers. The page must now name the company itself.
  - grammY logged a spurious error on dev-mode restarts.
- **Still to do:** a rehearsal with people and real phones, and the backup video (29 Oct).

### Phase 7: Judging-criteria improvements (decided 22 Oct)

Judged on four equal criteria (tie-break in this order): **Technological Implementation** (how well built, how well it uses Nebius Token Factory and NVIDIA Nemotron), **Design** (complete, coherent product, a quick "aha"), **Potential Impact** (credible, specific, real audience), **Quality of the Idea** (non-obvious use of the platform, real understanding of trade-offs including model choices). Stage One is pass/fail: theme fit plus using the required APIs.

- [ ] **Public demo on AWS (us-east-1)**, single VM with HTTPS, plus a "Try it now" check on the landing page (number, link or screenshot; no Telegram needed; rate-limited). *(Design, Impact)*
- [ ] **Nemotron 3 Ultra case brief:** "Generate case brief" on bank cases drafts the NSRC/PDRM referral pack in BM/EN, with reasoning on, citing the case's evidence. *(Tech, Idea)*
- [ ] **Model evaluation and trade-off table:** gold set of ~40 BM/EN/Manglish scam texts + invoices. Accuracy, latency and cost for Lightning / Nano / Super / Ultra, reasoning on vs off. Results drive model routing and go in the README and deck. *(Tech, Idea)*
- [ ] **AI trace visible** in the web app and bot: model, time, prompt version, redaction. *(Tech, Design)*
- [ ] **Submission hygiene:** git history, private GitHub repo `0xhaz/crowdshield`, CI running all tests, README with an architecture diagram, Devpost write-up, video. *(Tech)*
- [ ] **Campaign detection:** Qwen3-Embedding → pgvector; new-script clusters labelled by Nemotron; shown on the Campaigns page. *(Idea, Impact)*
- [ ] **Customer banking-app screen:** what the victim sees during the call-to-transfer warning. *(Design, Impact)*
- [ ] **Real-world grounding:** Tavily news run ("scams in the news this week", with citations); deck figures replaced with sourced ones. *(Impact)*
- [ ] **Bot quick start:** example buttons on `/start`. *(Design)*
- [ ] **Model routing:** Nemotron 3.5 Lightning (~0.5 s) for fast classification where the evaluation shows it holds up. *(Tech)*
- [ ] *(Needs the user's Meta setup)* WhatsApp adapter. *(Not possible: voice-note checks; no speech model is listed on Token Factory.)*

## 4. Schedule (21–30 Oct)

| Date | Backend (BE) | AI / bot (AI) | Frontend (FE) | Exit check |
|---|---|---|---|---|
| **Tue 20** (today) | Decisions done; repo init | Telegram bot via BotFather | Read banking-main | Workplan agreed |
| **Wed 21** | ~~Phase 0~~ (done 20 Oct). Start Phase 1: `normalise` + `scoring` port | Telegram bot echoes locally (long polling) | Next 15 / React 19 upgrade, strip Appwrite/Plaid/Dwolla/Sentry, app builds | Bot echoes; web builds on Next 15 |
| **Thu 22** | Parity test (16/47/99/10), seed scaffolding | Model gateway: redaction + Nebius call + Pydantic validation; Tavily client + cache + query guard | Rebrand, tokens, `RiskBadge`, `VerdictCard`, layout shell for bank and SME | Parity test green |
| **Fri 23** | Seed data (scam + SME, using the news seed run), recompute, `lookup` + `reports` | Scam + invoice extraction prompts; gold set; Tavily news seed run | Overview + alerts list on mock data | `lookup` returns seeded verdicts |
| **Sat 24** | `payee-check`, alerts, cases + actions, audit log; `web_page` evidence + Tavily lead write-back | Shared XState flows: Check + Report + 997 sheet on Telegram; unknown-identifier fallback + link inspection | Payee check + case detail | Payee check → alert works |
| **Sun 25** | Worker queues; one-minute recompute after report | Telegram polish: inline buttons, photo/document handling, BM/EN | Entities + entity detail; wire to the real API | **Steps 1–4 of the demo work end-to-end** |
| **Mon 26** | Supplier check + mock SSM/MyInvois/DuitNow adapters + Tavily official-contact/reputation checks | Supplier-check flow in both bots; `/web/supplier`; investment scheme check | SME: supplier list + invoice upload/check | Invoice check returns reasons |
| **Tue 27** | Supplier holds + graph write-back; auth + roles | Language detection, BM/EN copy, verdict polish | SME: bank-change hold + callback checklist; auth pages | **Step 5 of the demo works** |
| **Wed 28** | Bug fixes; stretch: embeddings/campaigns | Stretch: campaign "known scam" message | Stretch: graph view; responsive + a11y pass | **Feature freeze 23:59** |
| **Thu 29** | Reset-and-seed, perf check on `lookup` | Cached fallbacks; rehearsal on real phones | Playwright smoke tests; visual polish | Full rehearsal ×2; backup video |
| **Fri 30** | Final rehearsal, submission | | | **Demo** |

If anything slips, cut in this order: stretch items → investment scheme check → SME email/domain checks → SME portal pages (keep the SME check in the bot only).

## 5. Frontend: banking-main → CrowdShield web

banking-main is the JS Mastery "Horizon" banking app (MIT licence, so keep the LICENSE notice for copied code). **Keep its layout and component structure as the default.** Change the versions, data layer and branding.

### 5.1 Version and dependency changes

| Item | banking-main | Target | Notes |
|---|---|---|---|
| `next` | 14.2.3 | **15.x** (techstacks §7) | `searchParams`/`params` become Promises: `await` them in `app/(root)/page.tsx` and the other pages |
| `react`, `react-dom` | ^18 | **19.x** (required by Next 15) | Check `react-countup` and `react-chartjs-2` under React 19 |
| `@types/react`, `@types/react-dom` | ^18 | ^19 | |
| `eslint-config-next` | 14.2.3 | match `next` | ESLint 8 → 9 flat config, optional |
| `tailwindcss` | ^3.4.1 | **keep 3.4** | `globals.css` relies heavily on `@layer utilities` + `@apply`. Moving to v4 costs time and adds no value to the demo |
| `@sentry/nextjs` | ^7 | **remove** for now | v7 doesn't support Next 15. Remove `sentry.*.config.ts`, `global-error.jsx` and `api/sentry-example-api`; re-add v8+ later |
| `lucide-react` | ^0.374 | latest | Risk-tier icons (ShieldX, TriangleAlert, CircleAlert, Info, Search, PhoneCall) |
| `node-appwrite`, `plaid`, `react-plaid-link`, `dwolla-v2` | present | **remove** | Replace `lib/actions/*` with API client calls |
| `next.config.mjs` | `ignoreBuildErrors: true` | remove | Keep the build honest |
| add | | `@tanstack/react-query`, `@tanstack/react-table`, `next-auth` (Auth.js v5), `react-dropzone` (invoice upload), `cytoscape` (stretch) | |
| fonts | Inter + IBM Plex Serif | **Noto Sans** (+ Noto Sans SC / Tamil later) | `fontFamily` in `tailwind.config.ts` and `app/layout.tsx` |

Also delete: `constants/index.ts` test tokens (`TEST_ACCESS_TOKEN`, `ITEMS`), `PlaidLink.tsx`, `BankDropdown.tsx`, unused card/brand icons (visa, mastercard, spotify, stripe…), and Horizon metadata.

### 5.2 Bank dashboard: `(bank)` route group

| banking-main | Keep | CrowdShield screen | Changes |
|---|---|---|---|
| `app/(root)/layout.tsx` + `Sidebar` + `MobileNav` + `Footer` | Layout, sheet nav, active-link styling | Shared shell for bank and SME | Links depend on role. Bank: Overview, Alerts, Payee check, Cases, Entities, Campaigns, Audit log. Footer shows the user and their org/role |
| `app/(root)/page.tsx` Home | 2-column home + right sidebar | **Overview** | `HeaderBox` greeting; `TotalBalanceBox` → **Alert summary** (open alerts by tier in `DoughnutChart`, `AnimatedCounter` for open alerts); `RecentTransactions` tabs → **recent alerts**, tabbed by tier |
| `RightSidebar` (profile, bank cards, top categories) | Structure | Profile + **Live campaigns** | `BankCard` stack → top 2 **VerdictCards** for hot entities; `Category` progress bars → campaigns by `reports_24h` / spike |
| `transaction-history` + `TransactionsTable` + `Pagination` | Table + pagination | **Alerts / Cases list** | Columns: entity (masked), type, risk + `RiskBadge`, scam type, source, amount, time, status. Filters by tier/status |
| `payment-transfer` + `PaymentTransferForm` | Form layout (react-hook-form + zod) | **Payee check** | Inputs: bank, account no., amount, "customer on active call" toggle (call signal) → VerdictCard + evidence |
| `my-banks` + `BankCard` | Card grid | **Entities / watchlist** | Card per entity: masked value, tier, n_cases, last seen; links to entity detail |
| *(new)* | Reuse `header-box`, tables, tabs | **Case detail** | Timeline (`incident_event`), money trail (`fund_hop`), evidence, explanation, actions (hold / freeze / confirm mule / clear), audit entries |
| *(new)* | | **Entity detail** | Score breakdown (p_direct, p_graph, sources), observations, neighbours (graph view, stretch), appeal status |
| `(auth)` layout + `AuthForm` + `CustomInput` | Split layout with right-side image | Sign-in | Replace `auth-image.svg` with CrowdShield art. Bank users are invited (no sign-up); SMEs can sign up |
| `components/ui/*` (shadcn) | All | Same | Add `badge`, `dialog`, `dropdown-menu`, `toast`, `checkbox` as needed |

### 5.3 SME portal: `(sme)` route group, "Semak supplier"

| banking-main | Reused as | CrowdShield screen | Content |
|---|---|---|---|
| Home layout (`HeaderBox`, `TotalBalanceBox`, `RightSidebar`) | Same 2-column layout | **SME overview** | Summary: suppliers by status, open holds, checks this month; right sidebar: recent flagged checks, scam alerts relevant to SMEs |
| `my-banks` + `BankCard` | Card grid | **Suppliers** | Card per supplier: name, SSM no., TIN status, usual bank (masked), last invoice, status badge |
| `PaymentTransferForm` | Form layout | **Check invoice** | Drop an invoice PDF/image or paste email text → extracted fields (editable) → check list with ✓/✗ per check + risk level + what to do |
| `TransactionsTable` | Table | **Check history** | Past checks with result, supplier, amount, date |
| *(new)* | Dialog / sheet | **Bank-detail change hold** | Callback checklist: call the supplier on the number from records (shown, never the one in the email), confirm in writing, mark verified/rejected; rejection reports the account to the graph |
| *(new)* | Simple table | **Team** (stretch) | Members and roles |

### 5.4 Design tokens

Add to `tailwind.config.ts` (from techstacks §11), used everywhere with a label and an icon, never colour alone:

`risk-critical` (red, 85+) · `risk-high` (orange, 60–84) · `risk-caution` (amber, 30–59) · `risk-low` (yellow-grey, 1–29) · `risk-none` (grey, 0) · `risk-info` (blue, protected official).

Replace `bankGradient` / `bg-bank-gradient` (active nav, buttons) with a CrowdShield brand gradient. Keep the gray scale, shadows and text-size utilities.

## 6. Data contracts (first draft)

```ts
// GET /v1/lookup  and the core of POST /v1/payee-check
type Verdict = {
  entity: { type: EntityType; masked: string; protected: boolean };
  risk: number;                     // 0..100
  tier: 'no_known_risk' | 'reported' | 'caution' | 'high' | 'confirmed' | 'protected_official';
  confidence: 'low' | 'medium' | 'high';
  topScamTypes: ScamType[];
  nCases: number;
  independentSources: number;
  lastReportedAt: string | null;
  explanation: { line: string; source: SourceKind; count: number; links?: string[] }[];   // no reporter identities
  action: { en: string; ms: string };                                 // one concrete action
  campaign?: { id: number; label: string; reports24h: number };
};

// Tavily leads (gateway /web/identifier, /web/url, /web/investment); sent as a follow-up when the graph has nothing
type WebLeads = {
  query: string;                     // the identifier or public name only, never personal data
  leads: { title: string; url: string; snippet: string; publishedAt?: string; scamType?: ScamType; relevant: boolean }[];
  pageCheck?: { impersonates?: string; hasLoginForm: boolean; hasApkDownload: boolean; summary: { en: string; ms: string } };
  cached: boolean;
  fetchedAt: string;
};

// POST /v1/supplier-check
type SupplierCheckResult = {
  risk: 'low' | 'caution' | 'high';
  checks: {
    key: 'ssm' | 'tin' | 'einvoice' | 'account_name' | 'graph' | 'history' | 'email_domain'
       | 'official_contact' | 'web_reputation';
    status: 'pass' | 'fail' | 'warn' | 'unavailable';
    reason: { en: string; ms: string };
    source: string;                  // 'SSM (mock)', 'MyInvois (mock)', 'CrowdShield graph', 'Tavily'…
    links?: string[];                // citations for web-sourced checks
  }[];
  officialContact?: { phone?: string; email?: string; sourceUrl: string };   // for the callback checklist
  bankDetailChanged: boolean;        // → create hold + callback checklist
  actions: { en: string; ms: string }[];
};
```

## 7. Schema and doc fixes (Phase 0)

1. **Worked example 2 → 47 (decided).** Architecture §8 says 47, but `scoring.py` currently outputs 46. The fix: in the `__main__` example, change the linked mule's risk from `linked = [(0.5, 0.90)]` to `linked = [(0.5, 0.92)]`. Tested: this outputs 16 / 47 / 99 / 10 and the other three examples don't change. (A bank-confirmed mule's own direct score would be about 0.99 under the model, so 0.90 was understated anyway.)
2. **Add the `pg_trgm` extension.** Techstacks needs it for look-alike domains and company names.
3. **Encryption:** keep `pgp_sym_encrypt` for the hackathon. KMS envelope encryption (techstacks §3) comes later.
4. **Add foreign keys for `campaign_id`** on `scam_case` and `script_snippet` (`ALTER TABLE … ADD FOREIGN KEY` after `campaign`).
5. **New tables:**
   - `org` (kind: bank / ewallet / sme / agency), which `reporter.org_id` points to.
   - `app_user` (org_id, role).
   - `alert` (payee-check results: org_id, entity_id, risk, tier, call_signal, status).
   - `intervention` (alert/case action, actor, at).
   - `supplier` (org_id, name, ssm_no, tin, usual bank account hash/masked, callback phone).
   - `invoice_check` (org_id, supplier_id, extracted jsonb, result jsonb).
   - `payment_hold` (invoice_check_id, status, checklist jsonb, verified_by, at).
   - Bot session state stays in Redis.
6. **Tenant isolation** (per-bank schema + RLS) is out of scope for the demo. Every bank/SME table carries `org_id`, and the API scopes by it, so RLS can be added later.
7. **User-only cap edge case:** `scoring.py` applies the 59 cap only when `user_only and not neighbours`, so user reports plus any weak neighbour can go above 59. Keep that behaviour in the port and confirm the intent later.
8. **Weight and cap for Tavily leads (proposed: 0.25 + cap at 59).** techstacks_7 says Tavily results enter "at news weight (0.5) or lower". Run through `scoring.py`, leads with no other evidence score:

   | Weight | 1 lead | 2 leads | 3 leads |
   |---|---|---|---|
   | 0.50 (news) | 50 caution | 75 high | **88 confirmed** |
   | 0.30 | 30 caution | 51 caution | 66 high |
   | **0.25** | **25 reported** | **44 caution** | **58 caution** |

   The user-only cap (59) doesn't apply because these aren't user reports. So at news weight, three forum posts would mark a number "Confirmed scam".

   Proposal:
   - Add a separate `source` row, "Tavily web lead" (`kind = news_extraction`), with weight **0.25**.
   - Extend the 59 cap to cover entities whose evidence is only user reports and/or web leads.
   - Count all leads from one Tavily query as one vote (same sybil key), so copies of the same thread don't add up.

   No enum change is needed. Confirm the value and the cap. The cap is a small change to the scoring port and to `scoring.py`.
9. **New evidence kind `web_page`** on `case_evidence` (URL, title, fetched-at, snippet) for Tavily citations. Small migration in Phase 3b.
10. **Doc fix in techstacks_7 §4:** the new Tavily section replaced the `### On-device (later)` heading, so the on-device bullets (MLX / llama.cpp distillation) now sit under the Tavily "Rules" list. Restore the heading.
11. **techstacks_7 §4 models table** lists Tavily news discovery under "Where it runs: Nebius". Tavily is an external API (it runs from our gateway, not on Nebius). Minor doc fix.
12. **"User report with evidence" counted twice?** Architecture §7 gives "user report with evidence" its own source weight (0.40), while `scoring.py` models evidence as a multiplier (×1.3) on `user_report` (0.25). Using both would double-count evidence (0.40 × 1.3). The seed follows the worked examples (multiplier only). Decide whether `user_report_verified` should mean something else, such as a phone-verified reporter, or be dropped.

## 8. Risks for the hackathon

| Risk | Mitigation |
|---|---|
| Judges ask "why not WhatsApp?" (most Malaysian scam traffic is there) | Show the channel-adapter interface; WhatsApp is a drop-in adapter (Cloud API, system-user token) planned after the demo; the flows and API are channel-agnostic |
| Nebius latency or outage during the demo | Cached extraction results for the demo screenshots and invoice; "checking…" message first; identifier-only fallback |
| Next 15 / React 19 upgrade breaks a banking-main dependency | Upgrade on 21 Oct before any feature work; drop Sentry; swap any incompatible lib |
| Three audiences in 10 days | Shared engine first (by 25 Oct). SME reuses the graph, bot flows and layout. Cut order in §4 |
| Seed data looks fake | Build scenarios from the real Malaysian scam types and campaign shapes in the docs (Macau, parcel, LHDN refund, BEC supplier), with realistic counts and times |
| Defamation optics in a public demo | Synthetic identifiers only; masked everywhere; show the appeal/clearing path |
| Tavily latency (seconds) breaks the < 2 s bot verdict | Graph verdict first, Tavily leads as an async follow-up; 24 h cache; per-flow timeouts |
| Tavily credits run out during testing or the demo | Cache everything; log credits per call; use `basic` search depth by default; pre-warm the demo queries; cached fallback responses |
| Web results for synthetic demo numbers return nothing | Demo the unknown-identifier fallback with a real, publicly reported scam domain or app name (public data, not a person's number), and keep a cached response |
| PDPA: phone/account numbers sent to a non-Malaysian service | Fine for the hackathon (synthetic/public data only). For production, needs the same legal review as Nebius (techstacks §13). Consider restricting Tavily to domains, URLs, app and company names, and sending phone numbers only with consent |

## 9. Still open

- Team members and who owns BE / AI / FE.
- Demo hosting: **build and run locally for now** (Docker Compose + tunnel for the bot webhooks); choose a host later. Keep everything config-driven (`.env`, no hard-coded localhost URLs) so moving is a deploy step, not a rewrite.
- Judging criteria and demo length (adjust §0 to fit).
- Tavily: API key and plan/credit limit; confirm the 0.25 lead weight and the 59 cap for web-only evidence (§7.8).
