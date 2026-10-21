# CrowdShield: tech stack and design (draft)

Status: draft, 20 Oct 2026. Companion to `architecture.md`, `schema.sql`, `scoring.py`.

Guiding choices:

- **TypeScript-first** for product services and front ends (NestJS, Next.js, React Native/Expo); **Python** only where the ML/data ecosystem requires it.
- **Personal data stays in Malaysia.** Nebius is used for model inference, training and GPU jobs on redacted or public data only.
- **Deterministic decisions, AI for understanding.** Risk scores and payment decisions come from the graph and small fast models; LLMs extract, classify, explain and draft.
- **Precompute for speed.** Lookups read precomputed scores; heavy work runs in queues and batch jobs.

---

## 1. System layout

```
crowdshield/                     pnpm + Turborepo monorepo
├── apps/
│   ├── api/                     NestJS: public + partner REST API, auth, rate limits
│   ├── worker/                  NestJS: queue consumers (extraction, scoring, alerts)
│   ├── bot/                     NestJS: WhatsApp + Telegram webhooks, conversation engine
│   ├── web-sme/                 Next.js: business owner portal (Semak supplier)
│   ├── web-bank/                Next.js: bank / e-wallet case dashboard
│   ├── web-admin/               Next.js: analysts, appeals, campaign review
│   ├── mobile/                  Expo (React Native): consumer app
│   └── ml/                      Python: FastAPI model gateway + batch/GPU jobs
├── packages/
│   ├── db/                      Drizzle schema + migrations (from schema.sql)
│   ├── scoring/                 TypeScript port of scoring.py (shared by api + worker)
│   ├── normalise/               phone, bank account, URL, TIN normalisation + HMAC hashing
│   ├── contracts/               OpenAPI spec, Zod schemas, generated clients
│   ├── i18n/                    BM / EN / ZH / TA strings and scam-type copy
│   └── ui/                      shared design tokens and components
├── native/
│   ├── android-callscreening/   Kotlin: CallScreeningService module
│   └── ios-calldirectory/       Swift: Call Directory extension
└── infra/                       Terraform, GitHub Actions
```

---

## 2. Backend

| Concern | Choice | Notes |
|---|---|---|
| API framework | **NestJS** (Node 22, TypeScript) | Modules per domain: lookup, reports, cases, supplier, bank, tracing, admin |
| API style | REST + **OpenAPI 3.1**, versioned (`/v1`) | Zod validation; generated TS clients for web/mobile; idempotency keys on writes |
| Bank partner API | REST with **mTLS + OAuth2 client credentials** | Payee check, report confirmed mule, case outcome; signed webhooks (HMAC) for alerts |
| Queues / jobs | **BullMQ on Redis** (start); move to SQS if needed | Extraction, scoring recompute, campaign detection, alert fan-out |
| Cache | Redis | Hot lookups, rate limits, bot session state |
| ORM / migrations | **Drizzle ORM** | Schema mirrors `schema.sql` |
| Search | Postgres full-text + `pg_trgm` | Look-alike domains, company names; add OpenSearch only if needed |
| Scheduling | BullMQ repeatable jobs | Nightly propagation export, feed pulls, weekly bulletin |

### Latency targets

| Path | Target | How |
|---|---|---|
| Bank payee check | p95 < 100 ms | Single indexed read of `entity_score` by `(type, lookup_hash)`; Redis cache; no LLM in path |
| Bot verdict (identifier) | < 2 s | Graph lookup + templated reply |
| Bot verdict (screenshot/message) | < 10 s | Nemotron VL extraction + lookup; "checking…" message first |
| New report → score update | < 1 min | Queue-driven incremental recompute (one hop) |
| Full two-hop propagation | Nightly | GPU job (see §4) |

---

## 3. Data layer

| Store | Choice | Holds |
|---|---|---|
| Primary database | **PostgreSQL 16** with `pgvector`, `pg_trgm` | Entities, cases, observations, edges, scores, tracing, audit (`schema.sql`) |
| Object storage | S3-compatible, Malaysian region, SSE-KMS | Screenshots, audio, evidence packs |
| Analytics | Postgres read replica → later ClickHouse or DuckDB on Parquet | Trends, hotspots, campaign stats, public bulletin |
| Graph analytics | Nightly export of `edge` to Parquet → GPU job | Two-hop propagation, mule communities |
| Graph DB (optional, later) | Neo4j | Only if interactive multi-hop investigation outgrows SQL |

### Hosting (personal data)

- **AWS Asia Pacific (Malaysia) region `ap-southeast-5`** as default: RDS Postgres, ElastiCache Redis, S3, KMS, ECS Fargate. Alternatives to evaluate: Azure and Google Cloud Malaysian regions, or local providers if a bank requires it.
- Separate AWS accounts for prod / staging / dev; private subnets; no public database endpoints.

### Data protection

- **Identifiers:** normalised then hashed with **HMAC-SHA256**, key in **AWS KMS** (or CloudHSM for bank tier). Lookups use the hash only.
- **Raw values:** application-level **envelope encryption** with KMS data keys (replaces `pgp_sym_encrypt` in the draft schema). Decryption only through an audited service.
- **Masking** in every API response by default.
- **Redaction before AI:** a redaction step (regex + small NER model) strips names, IC numbers, full account and phone numbers from text before any call to Nebius; identifiers are replaced with tokens and re-attached after.
- **Tenant isolation for banks:** each bank's private data in its own schema or database with row-level security; shared graph receives only hashed identifiers and confirmed outcomes.
- **Retention:** raw evidence deleted or archived on a schedule (to be set with legal advice); hashes and scores kept for as long as evidence is valid.

---

## 4. AI and ML (Nebius)

### Model gateway

- `apps/ml` runs a **FastAPI model gateway** in Malaysia. It redacts input, calls **Nebius Token Factory** (OpenAI-compatible API, zero data retention on), validates structured output against JSON schemas, and logs prompt/model versions.
- All prompts versioned in the repo; outputs validated with Pydantic; failures fall back to "needs human review".

### Models and jobs

| Task | Model / tool | Where it runs | Mode |
|---|---|---|---|
| Extract entities and scam type from text | **Nemotron 3 Super** | Token Factory | Real time (bot) and batch (news) |
| Read screenshots, receipts, invoices, fake IDs | **Nemotron VL** | Token Factory | Real time |
| Hard reasoning: campaign summaries, evidence packs, bank case notes | **Nemotron 3 Ultra** | Token Factory | Async |
| Fast classification (scam type, urgency, bank-change language) | **Nemotron Nano** + LoRA fine-tune | Token Factory dedicated endpoint | Real time |
| Script similarity, campaign clustering | **Qwen3-Embedding** → pgvector | Token Factory | Batch + on insert |
| Speech to text (BM / EN / ZH) | Whisper large-v3 or NVIDIA Parakeet | Nebius GPU (Serverless Jobs / endpoint) | Async |
| Campaign detection (novelty clustering) | HDBSCAN on **RAPIDS cuML** | Nebius Serverless Jobs | Nightly + rolling 6 h |
| Two-hop risk propagation, mule communities | **RAPIDS cuGraph** (PageRank-style propagation, Louvain) | Nebius Serverless Jobs | Nightly |
| Mule detection model (later) | Graph neural network (PyTorch Geometric / DGL) | Nebius GPU | Train weekly |
| Phishing page comparison | Nemotron VL + perceptual hash vs bank's real pages | Token Factory + worker | On new candidate domain |
| News discovery | **Tavily** search API | Nebius | Scheduled |
| Synthetic test data (transactions, scam dialogues) | Nemotron Super | Token Factory batch | Internal only |

### Tavily (live web intelligence)

Runtime calls inside product flows, not only batch jobs. Endpoints: Search (topic, time range, include/exclude domains, country), Extract (page content from URLs), Crawl/Map (site traversal). Check current parameters in Tavily docs.

| Flow | Tavily call | Trigger | Output |
|---|---|---|---|
| **Unknown identifier fallback** | Search: number / account / domain / app name + "scam", "penipuan", "tipu" | Bot or app check returns no graph record | Forum posts, news, alert-list hits → cited lead; written to graph as `news_extraction` / weak evidence |
| **Investment scheme check** | Search with `include_domains` = sc.com.my, bnm.gov.my, major MY news | User asks about a platform, app or "fund manager" | Alert-list match or news coverage, with links |
| **Suspicious link inspection** | Extract on the URL (user never opens it) | User forwards a link | Page text and metadata → Nemotron checks for bank/brand impersonation, login forms, APK downloads |
| **Supplier official contacts** | Search + Extract on the company's official site | Semak supplier, especially on bank-detail change | Official phone/email for callback; compare with invoice/email details |
| **Supplier reputation** | Search: company name + "scam" / reviews / news | New supplier check | Complaints, news, reviews as cited signals |
| **Brand impersonation monitor** | Extract on look-alike domains from certificate/new-domain feeds | New candidate domain | Content for screenshot/text comparison with the real bank page |
| **Protected official numbers** | Search + Extract restricted to official bank / agency domains | Weekly | Verified hotlines for the `protected` list |
| **News and campaign discovery** | Search `topic=news`, `time_range=day`, Malaysian news domains, BM + EN + ZH queries | Hourly | New cases → Nemotron extraction → graph seed and campaign detection |
| **Alert-list refresh** | Crawl / Extract BNM Financial Consumer Alert List, SC Investor Alert List | Daily | Unlicensed entities and websites |

Rules:

- Never put victim or reporter personal data in a query. Only the identifier being checked, or public names (companies, platforms, domains).
- Tavily results are leads with citations, not confirmation; they enter scoring at news weight (0.5) or lower and are shown with their source links.
- Cache results per identifier (e.g. 24 h) to control credits and latency; respect site terms.

- Distil the scam-type classifier to a small model (1–3B or smaller) for **on-device** use:
  - iOS: **MLX** / Core ML
  - Android: **llama.cpp** or ExecuTorch
- Message and transcript content then stays on the phone; only hashed identifiers are looked up.

### Evaluation

- Gold sets per task (extraction, scam type, campaign assignment) in BM, EN, ZH and code-switched Manglish.
- Track precision/recall per model version in **MLflow** (Nebius Managed MLflow or self-hosted).
- Scoring calibration reviewed monthly against outcomes (upheld reports, confirmed mules, appeals won).

---

## 5. Messaging (bot)

| Channel | Integration | Notes |
|---|---|---|
| WhatsApp | **WhatsApp Business Platform (Cloud API)** via Meta, or a BSP | Verified business number; template messages for alerts need Meta approval; 24-hour session window rules |
| Telegram | Telegram Bot API (webhooks) | No template restrictions; good for power users and alerts channel |
| Public alerts | WhatsApp Channel + Telegram channel | Weekly bulletin, campaign warnings |

- Conversation engine: deterministic state machine (XState) for flows (check, report, 997 call sheet, supplier check); LLM only for understanding free text and images.
- Media (screenshots, voice notes) downloaded to Malaysian object storage immediately, then processed.
- Language detection per message; reply in the user's language.

---

## 6. Mobile app (consumer)

| Concern | Choice |
|---|---|
| Framework | **Expo (React Native)**, TypeScript, Expo Router |
| Native modules | Android **CallScreeningService** (Kotlin) for pre-ring identification/blocking; iOS **Call Directory extension** (Swift) for local label/block list |
| Number list sync | Signed delta lists of high-risk hashed numbers pushed to device; iOS extension needs plain numbers locally, so limit to confirmed tier |
| Push | Expo Notifications (FCM / APNs) |
| Family guardian | Linked accounts with explicit consent from the protected person |
| Auth | Phone number + OTP (WhatsApp OTP or SMS), device binding |
| Local storage | Expo SecureStore for keys; SQLite for cached lists |
| Analytics | PostHog (self-hosted in MY) or privacy-preserving equivalent |

Platform limits: no call audio on iOS; Android call screening needs the user to set the app as the call-screening app.

---

## 7. Web apps

| App | Users | Stack |
|---|---|---|
| `web-sme` | Business owners | **Next.js 15** (App Router), Tailwind, shadcn/ui, TanStack Query |
| `web-bank` | Bank fraud analysts | Same stack; data-dense tables (TanStack Table), graph view (Cytoscape.js), timelines |
| `web-admin` | CrowdShield analysts | Same stack; campaign review, appeals, source management |

- Auth: **Auth.js** or Keycloak with SSO (SAML/OIDC) for bank users; RBAC with roles for analyst, supervisor, auditor.
- All sensitive views (decrypted values, cash-out data) behind step-up auth and logged in `audit_log`.

---

## 8. External integrations

| Integration | Purpose | Access |
|---|---|---|
| LHDN **MyInvois API** | TIN validation, e-invoice details, supplier history | Intermediary registration with each business's permission |
| SSM (MyData-SSM / SSM Search) or a **KYB aggregator** | Company registration, directors, status | Paid; aggregator first |
| CTOS / Experian Malaysia / RAM Credit Info | Company credit and litigation (optional) | Commercial |
| Bank partners / PayNet | DuitNow account-name check, payee check, outcomes | Partnership |
| PDRM Semak Mule, NSRC | Confirmed identifiers, case references | Partnership (see architecture §9) |
| BNM Financial Consumer Alert List, SC Investor Alert List | Unlicensed entities | Public pages, scheduled scrape (check terms) |
| Phishing / malware feeds (OpenPhish, PhishTank, URLhaus) | URLs, domains, APK hashes | Public feeds, respect licences |
| Certificate Transparency logs, new-domain feeds | Look-alike bank domains | certstream or commercial feed |
| Accounting software (SQL Account, AutoCount, Bukku, Xero) | Supplier master data, payment runs | Per-vendor APIs or file import |
| Gmail / Outlook add-ins | Bank-change and invoice email checks | Google Workspace / Microsoft 365 add-in frameworks |
| Email authentication checks | SPF / DKIM / DMARC parsing | Header analysis in worker |

---

## 9. Infrastructure and operations

| Concern | Choice |
|---|---|
| Containers | Docker; **ECS Fargate** in `ap-southeast-5` (move to EKS only if needed) |
| Infrastructure as code | **Terraform** |
| CI/CD | **GitHub Actions**: lint, type-check, tests, migrations, image build, deploy to staging, manual promote to prod |
| Secrets | AWS Secrets Manager; KMS for keys |
| Observability | **OpenTelemetry** → Grafana (Tempo, Loki, Prometheus) or Grafana Cloud with data-residency check; Sentry for front ends |
| Edge / security | CloudFront + **AWS WAF**; bot protection on public endpoints; per-key rate limits |
| Backups | RDS automated backups + cross-AZ; point-in-time recovery; quarterly restore test |
| Availability target | 99.9% for lookup APIs; multi-AZ |
| Security testing | SAST (Semgrep), dependency scanning (Dependabot), annual external pentest before bank go-live |
| Compliance evidence | Map controls to BNM RMiT and PDPA; prepare for SOC 2 / ISO 27001 when banks require |

---

## 10. Testing

- **Unit:** scoring, normalisation, parsers (Vitest; pytest for `ml`).
- **Contract:** OpenAPI contract tests for bank API.
- **Integration:** Postgres + Redis in Testcontainers.
- **End-to-end:** Playwright for web apps; Maestro for mobile.
- **Data:** synthetic Malaysian scenarios (normal activity, Macau, investment, parcel, mule chains, fake supplier) generated with Nemotron and versioned as fixtures.
- **Model evals:** gold sets per task, run on every prompt/model change.
- **Load:** k6 against payee check (target p95 < 100 ms at expected partner volume).

---

## 11. Design

### Principles

1. **Clear verdict first, evidence second.** Every check answers "what should I do now?" in one line, then shows why.
2. **Never say "safe".** Absence of evidence is shown as "no reports found", with a reminder of the universal rules (hang up and call back; police/BNM never ask for transfers).
3. **Calm, not alarming.** Firm language for high risk, without panic or blame. Victims are never blamed.
4. **Built for older and less technical users.** Large text, plain language, one action per screen, works in WhatsApp without installing anything.
5. **Multilingual by default.** BM first for consumers, with EN, ZH, TA; Manglish-tolerant input.
6. **Trustworthy for professionals.** Bank and SME views show sources, confidence, timestamps and audit trails.

### Brand

- Name: **CrowdShield**; consumer feature: **Semak dulu**; SME feature: **Semak supplier**.
- Personality: protective, plain-spoken, local.
- Logo direction: a shield built from many small marks (the crowd), simple enough to read at WhatsApp avatar size.

### Risk tiers (shared across all surfaces)

| Tier | Label (EN / BM) | Colour token | Icon | Primary action |
|---|---|---|---|---|
| Confirmed (85+) | Confirmed scam / Scam disahkan | `risk-critical` (red) | Shield with cross | Do not pay or reply; report |
| High (60–84) | High risk / Risiko tinggi | `risk-high` (orange) | Warning triangle | Stop and verify through official channels |
| Caution (30–59) | Be careful / Berhati-hati | `risk-caution` (amber) | Alert circle | Verify before acting |
| Reported (1–29) | Some reports / Ada laporan | `risk-low` (yellow-grey) | Info | Proceed carefully |
| No known risk (0) | No reports found / Tiada laporan | `risk-none` (neutral grey) | Search | General safety tips |
| Protected official | Official number, may be spoofed / Nombor rasmi, mungkin dipalsukan | `risk-info` (blue) | Phone with shield | Hang up and call back on the official number |

Colour is never the only cue: every tier has a text label and an icon. Contrast meets WCAG 2.2 AA in light and dark themes.

### Verdict card (used in bot replies, app, SME portal)

```
[icon]  HIGH RISK · Risiko tinggi
+60 11-***-4821
Linked to 37 reports of fake police (Macau) calls in the last 14 days.
What to do: Hang up. Police and BNM never ask you to transfer money.
[Report this]  [Call 997]  [Why this result?]
Confidence: high · Last reported 2 hours ago
```

### Typography and tokens

- Font: **Noto Sans** family (Latin, **Noto Sans SC** for Chinese, **Noto Sans Tamil**) for consistent multilingual rendering; system fonts as fallback.
- Minimum body text 16 px on mobile; consumer app supports system font scaling up to 200%.
- Design tokens (colour, spacing, radius, type scale) defined once in `packages/ui` and exported to Tailwind (web) and NativeWind (mobile).

### Surfaces

| Surface | Key screens / flows |
|---|---|
| WhatsApp / Telegram bot | Check (forward anything) → verdict card; Report (guided, only missing fields) → 997 call sheet; Supplier check (forward invoice/email) → check list; Alerts subscription |
| Consumer app | Home (check box + recent alerts); incoming-call label; family guardian; my reports and their status; settings and language |
| SME portal | Supplier list with status; invoice/email check; bank-detail change holds and callback checklist; team members |
| Bank dashboard | Alert queue; case detail (timeline, evidence, agents' reasoning, actions); entity view with graph; mule network explorer; campaign feed; analytics; audit log |
| Admin | Campaign review and labelling; appeals; source weights; reporter trust; content for bulletins |

### Content and tone

- Scam-type warnings written once per language by people, reviewed with partners (not generated on the fly for critical warnings); LLMs draft, humans approve.
- Reading level: simple sentences, no jargon (say "account used by scammers to receive money", not "mule account", in consumer copy).
- Every warning ends with one concrete action.

### Accessibility

- WCAG 2.2 AA across web and mobile; screen-reader labels on all icons; no information by colour alone; large tap targets (min 44×44 pt); support for reduced motion.

---

## 12. Environments and cost notes

| Environment | Purpose |
|---|---|
| dev | Local Docker Compose (Postgres + pgvector, Redis, MinIO), Nebius sandbox keys |
| staging | Full stack in `ap-southeast-5`, synthetic data only, MyInvois sandbox |
| prod | Multi-AZ, real data, partner integrations |

- Nebius batch extraction: roughly US$3 per 10,000 news articles on Nemotron Super batch pricing (from earlier estimate; confirm current prices).
- GPU jobs: nightly cuGraph/cuML runs on a single H100-class GPU should take minutes at early scale; use Serverless Jobs to pay per second.
- Largest early costs are likely WhatsApp conversation fees, SSM/KYB lookups and Malaysian cloud hosting, not AI.

---

## 13. Open technical questions

- Malaysian hosting provider and region final choice (AWS `ap-southeast-5` default).
- Exact data boundary for Nebius (redaction coverage, PDPA cross-border review).
- WhatsApp: direct Cloud API vs a Business Solution Provider.
- Postgres-only graph vs adding Neo4j.
- Build vs partner for the bank mobile SDK (device and malware risk).
- On-device model size and accuracy targets.
- Whether bank tier requires CloudHSM and dedicated infrastructure per bank.
