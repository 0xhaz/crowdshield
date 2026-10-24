# CrowdShield

**Scam intelligence for Malaysia.** One shared scam graph that the public, banks, e-wallets and small businesses all feed and all use. The bank sees the transfer; the crowd saw the call. CrowdShield puts the two together before the money moves.

Built for the Nebius × NVIDIA Global AI Hackathon on **NVIDIA Nemotron** models served by **Nebius Token Factory**.

- **Live demo:** https://crowdshield.184-197-8-50.sslip.io (try a check on the landing page, no sign-in)
- **Telegram bot:** [@CrowdShieldBot](https://t.me/CrowdShieldBot): send `/start` and tap an example
- **Chrome extension (CrowdShield Guard):** https://crowdshield.184-197-8-50.sslip.io/extension
- **Customer banking-app demo:** https://crowdshield.184-197-8-50.sslip.io/demo/bank-app
- **Bank and business portals:** sign in with `analyst@nusabank.demo`, `supervisor@nusabank.demo` or `owner@majuvista.demo`, password `crowdshield-demo`

All data is synthetic: people, companies, apps, numbers and accounts are invented.

## Why

From January to November 2025, Malaysian police logged **67,735 online crime cases with losses over RM2.7 billion**; scam calls were the largest category (28,698 cases). NSRC 997 saved about **RM34.5 million** in 2025. Once money has moved, little comes back. ([sources](docs/sources.md))

The signals that would stop a transfer are split across parties: the victim knows who is calling, the bank knows where the money is going, the business knows its supplier's real account. CrowdShield joins them in one graph, with privacy built in.

## What it does

| Who | Where | What they get |
|---|---|---|
| The public | Telegram bot, landing page | Forward a number, account, link, message or screenshot: a verdict with its reasons and one action. Lost money? A guided report and a pre-filled sheet for the NSRC 997 call. |
| Anyone on a laptop | Chrome extension "CrowdShield Guard" | Snip any area of the screen (Alt+Shift+S) to check it, nothing to save or paste. On WhatsApp Web, Telegram Web and Gmail (each opt-in), scam-linked numbers are highlighted and "new number, send money" impersonation messages are flagged before anyone pays. |
| Bank fraud analyst | Web portal | Payee checks with the customer's live call signal, an alert queue, cases with timelines and money trails, an **AI case brief**, **AI-detected scam campaigns** to confirm. |
| Bank's app backend | `POST /v1/payee-check` and `POST /v1/cases/:id/money-trail` with a partner key | Before a DuitNow transfer: hold, warn or proceed, with a plain warning for the customer in Malay and English. After a scam: the hops, freezes and cash-outs the bank traced (through NSRC / the National Fraud Portal), so every receiving account is flagged across the network. |
| Business owner | Web portal (supplier check) | Upload an invoice: changed bank details are caught and the payment held; the supplier's official contact is found on the web for a call-back. |

## How it works

### The big picture

Everyone who checks also feeds the graph, so every report, bank confirmation and rejected invoice protects the next person.

```mermaid
flowchart LR
  subgraph feed["Who feeds the graph"]
    P1["Public reports<br/>bot · landing page"]
    B1["Banks<br/>confirmed mules · money trails"]
    S1["Businesses<br/>rejected fake invoices"]
    O1["Official sources<br/>NSRC · regulator alert lists"]
  end
  G[("Shared scam graph<br/>numbers · accounts · links · apps<br/>linked by scam and money flow")]
  subgraph use["Who is protected"]
    P2["Public<br/>verdict before replying or paying"]
    B2["Banks<br/>payee check before a transfer leaves"]
    S2["Businesses<br/>supplier check before paying an invoice"]
  end
  P1 & B1 & S1 & O1 --> G
  G --> P2 & B2 & S2
```

### One scam, end to end

The demo story: a report about one call protects a second victim minutes later, and then everyone.

```mermaid
sequenceDiagram
  autonumber
  actor V1 as Victim 1
  participant Bot as Telegram bot
  participant CS as CrowdShield
  actor V2 as Victim 2
  participant App as Victim 2's bank app
  actor A as Bank analyst
  V1->>Bot: Forwards the "police officer" number
  Bot->>CS: Look up
  CS-->>Bot: Confirmed scam, with reasons
  V1->>Bot: Report: I paid MBB ****8812
  Bot->>CS: Report links the account to the caller
  Note over CS: The account inherits risk from the caller, "Be careful" 47
  V2->>App: Transfers RM 25,000 to MBB ****8812, on a call with the same number
  App->>CS: Payee check plus call signal
  CS-->>App: High risk 79, hold and call back
  App-->>V2: "We've paused this transfer"
  CS->>A: Alert in the fraud queue
  A->>CS: Confirms the mule
  Note over CS: Every bank, business and bot user is warned on their next check
```

### Architecture

```mermaid
flowchart LR
  subgraph doors["Front doors"]
    TG["Telegram bot<br/>check a number, link or screenshot"]
    LP["Landing page<br/>Try it now"]
    EXT["Chrome extension<br/>snip · chat warnings"]
    BANK["Bank portal<br/>alerts · cases · campaigns"]
    SME["SME portal<br/>supplier check"]
    APP["Bank backend<br/>partner key"]
  end
  API["CrowdShield API<br/>NestJS · typed contracts"]
  PG[("Postgres + pgvector<br/>scam graph · scores · scripts")]
  RD[("Redis<br/>verdict cache")]
  S3[("S3<br/>evidence")]
  ML["ML gateway (FastAPI)<br/>redaction · routing · AI trace · cache"]
  subgraph nebius["Nebius Token Factory"]
    ULTRA["Nemotron 3 Ultra"]
    VL["Nemotron 3.5 Super VL"]
    SUPER["Nemotron 3 Super"]
    EMB["Qwen3-Embedding-8B"]
  end
  TAV["Tavily<br/>web + news search"]
  TG & LP & EXT & BANK & SME & APP --> API
  TG -- screenshots --> ML
  TG -- evidence --> S3
  API --> PG & RD
  API --> ML
  ML --> ULTRA & VL & SUPER & EMB
  ML --> TAV
```

### The payee check: no AI in the payment path

```mermaid
sequenceDiagram
  participant App as Bank app backend
  participant API as CrowdShield API
  participant Cache as Redis
  participant DB as Scam graph
  App->>API: POST /v1/payee-check<br/>payee account, amount, call signal
  API->>Cache: Verdicts for payee and caller
  alt cache miss
    API->>DB: Precomputed scores
  end
  Note over API: combined = 1 - (1 - payee) x (1 - 0.6 x caller)<br/>a confirmed scam caller on the line lifts the payee's risk
  API-->>App: Score, tier, recommended action, customer warning
  Note over App: The bank decides: proceed, warn, cooling-off or hold
  opt High or confirmed
    API->>DB: Alert in the bank's fraud queue
  end
```

About 5 ms at p95. The bank's fraud engine stays in charge; CrowdShield advises.

### How a risk score is computed

Deterministic and explainable; the TypeScript code is parity-tested against the Python reference (`scoring.py`) on 500 random cases.

```mermaid
flowchart TD
  O["Each piece of evidence<br/>report · NSRC case · bank confirmation · bank trace"] --> W["Weight = source x reporter trust x verification x recency"]
  W --> D["Direct probability: noisy-OR<br/>one vote per reporter and per shared device"]
  N["Linked identifiers<br/>same scam 0.5 · money flow 0.7, downstream only"] --> GR["Graph probability"]
  D --> R["Risk = 100 x (1 - (1 - direct) x (1 - 0.8 x graph))"]
  GR --> R
  R --> CAP{"Public reports only,<br/>nothing linked?"}
  CAP -- yes --> C59["Capped at 59: never above 'be careful'<br/>on public reports alone"]
  CAP -- no --> T
  C59 --> T["Tier: confirmed 85+ · high 60+ · be careful 30+ · reported 1+ · no reports"]
  APL["Upheld appeal"] -. "x 0.1" .-> R
  OFF["Official number<br/>PDRM, BNM, banks"] -. "never scored, 'may be spoofed'" .-> T
```

### New scam campaigns

```mermaid
flowchart LR
  R["New report"] --> RED["Redact IC, phone,<br/>account numbers"]
  RED --> E["Embed the script<br/>Qwen3-Embedding"]
  E --> M{"Close to a known<br/>campaign? cosine >= 0.72"}
  M -- yes --> J["Join it<br/>the bot names the wave"]
  M -- no --> POOL["Novelty pool"]
  POOL --> CL{"3+ distinct reports<br/>within cosine 0.68?"}
  CL -- yes --> L["Nemotron 3 Ultra labels it<br/>summary · phrases · draft warning"]
  L --> H["Analyst reviews"]
  H -- confirm --> W["Bot warns the public"]
  H -- dismiss --> X["Cases released"]
```

### Every AI request: privacy first, always traced

```mermaid
flowchart LR
  IN["Message, screenshot<br/>or case"] --> RED["Redact before any text model"]
  RED --> CACHE{"Seen before?<br/>same text or file hash"}
  CACHE -- yes --> OUT
  CACHE -- no --> ROUTE["Route by task<br/>chosen by our evaluation"]
  ROUTE --> NEM["Nemotron on Nebius Token Factory<br/>strict JSON schema"]
  NEM --> VAL{"Valid?"}
  VAL -- no --> RETRY["Retry once, sampling more"] --> VAL
  VAL -- yes --> OUT["Result + AI trace<br/>model · prompt version · time · tokens"]
```

Models never decide risk: a model's guess has weight 0 in the score, and web results from Tavily are shown as cited leads, not evidence.

### Money trail from banks

Banks trace and freeze money among themselves through NSRC and PayNet's National Fraud Portal. CrowdShield takes the outcome and warns everyone else.

```mermaid
sequenceDiagram
  actor V as Victim
  participant N as NSRC 997 / National Fraud Portal
  participant B as Banks
  participant CS as CrowdShield
  participant O as Other banks, businesses, bot users
  V->>N: Reports the scam
  N->>B: Trace and freeze across banks
  B->>CS: POST /v1/cases/:id/money-trail<br/>hops, frozen amounts, cash-outs
  Note over CS: Same DuitNow reference = one hop, even if both banks report it
  Note over CS: Each receiving account is flagged, "Be careful"
  CS->>O: Alerts and warnings on their next check
```

### Data model (core tables)

```mermaid
erDiagram
  ENTITY ||--o{ OBSERVATION : "reported in"
  SCAM_CASE ||--o{ OBSERVATION : contains
  ENTITY ||--|| ENTITY_SCORE : "scored as"
  ENTITY ||--o{ EDGE : links
  CAMPAIGN ||--o{ SCAM_CASE : groups
  CAMPAIGN ||--o{ SCRIPT_SNIPPET : "matched by"
  SCAM_CASE ||--o{ FUND_HOP : "money trail"
  SCAM_CASE ||--o{ CASHOUT_EVENT : "cashed out"
  ENTITY ||--o{ ALERT : "flagged in"
  ENTITY {
    bigint id PK
    text type "phone, bank_account, url ..."
    bytea lookup_hash "keyed HMAC"
    bytea value_enc "encrypted"
    text display_masked
  }
  OBSERVATION {
    uuid case_id FK
    bigint entity_id FK
    text role "caller, payee_account ..."
    smallint source_id FK
  }
  SCAM_CASE {
    uuid id PK
    text scam_type
    text verification
    numeric loss_myr
  }
  ENTITY_SCORE {
    real p_direct
    real p_graph
    smallint risk
    text tier
  }
  EDGE {
    bigint src_id FK
    bigint dst_id FK
    text kind "co_case, money_flow ..."
    real alpha
  }
  SCRIPT_SNIPPET {
    text text_redacted
    vector embedding "1024 dims"
  }
  FUND_HOP {
    bigint from_entity FK
    bigint to_entity FK
    numeric amount_myr
    numeric frozen_myr
    text txn_ref "unique per case"
  }
```

### Privacy

- Identifiers are looked up by keyed hash and stored encrypted; everything is masked on screen (`+60 11-***-4821`).
- IC, phone and account numbers are redacted before any text model sees them.
- Reporters are never named; verdicts show evidence counts and sources.
- An unknown number gets "No reports found", never a "safe" tick.
- Wrongly listed owners can appeal; an upheld appeal clears the score.
- The extension finds numbers on the device and only looks those up; message text leaves the browser only on a snip or "Check with AI".
- Every lookup and decision is in the audit log.

### Deployment

```mermaid
flowchart LR
  U["Browsers, Telegram,<br/>bank backends"] -->|HTTPS| C["Caddy<br/>Let's Encrypt"]
  subgraph vm["One AWS VM (t4g.large), Docker Compose"]
    C -->|/v1| API["API"]
    C --> WEB["Web"]
    BOT["Bot<br/>long polling"] --> API
    API --> PG[("Postgres + pgvector")] & RD[("Redis")] & ML["ML gateway"]
    BOT --> S3[("SeaweedFS S3")]
  end
  ML --> NEB["Nebius Token Factory"] & TAV["Tavily"]
  BOT <--> TGM["Telegram"]
```

Details: [docs/DEPLOY.md](docs/DEPLOY.md).

## How AI is used

Models read, classify, search and draft. **Decisions stay deterministic:** risk scores come from the evidence graph (noisy-OR with one-hop propagation, parity-tested against `scoring.py`), and **no model sits in the payment path** (payee check p95 ≈ 5 ms).

| Task | Model (Nebius Token Factory) |
|---|---|
| Name the scam in a forwarded message (Malay, English, mixed Malay-English, Chinese) | NVIDIA Nemotron 3 Ultra 550B |
| Read scam screenshots and invoices (PDF/image) | NVIDIA Nemotron 3.5 Super VL |
| **Case brief** for the fraud team + NSRC/PDRM referral note, citing evidence | Nemotron 3 Ultra, **reasoning on** |
| **Label new scam campaigns** and draft the public warning | Nemotron 3 Ultra, reasoning on |
| Judge web search results and link pages; find a supplier's official contact | Nemotron 3 Ultra + Tavily |
| This week's scam news | Nemotron 3 Super + Tavily |
| Script similarity for campaign matching and detection | Qwen3-Embedding-8B → pgvector |

The routing comes from an evaluation on 41 hand-labelled messages ([docs/model-eval.md](docs/model-eval.md)): defining all 12 scam types took Super from 68% to 100%; Ultra was both the most accurate and the fastest; reasoning didn't help classification, so it is on only for the brief and campaign labels. Details: [docs/model-choices.md](docs/model-choices.md).

Every AI-made result shows an **AI trace** (model, reasoning, prompt version, time, tokens) in the web app and the bot.

## Run it locally

Requires Node 22+, pnpm 9, Docker and [uv](https://docs.astral.sh/uv/).

```sh
pnpm install
cp .env.example .env        # fill the secrets (openssl rand -hex 32) and your Nebius, Tavily, Telegram keys
pnpm demo:start             # Postgres+pgvector, Redis, S3, migrations, API :4020, web :3020, ML :8020, bot
pnpm demo:reset             # synthetic demo data, caches cleared, scripts embedded
pnpm demo:wave              # a new scam wave → AI-detected campaign to review at /bank/campaigns
pnpm test                   # 145 TypeScript tests (incl. scoring parity and API end-to-end)
cd apps/ml && uv run pytest # ML gateway tests
pnpm e2e                    # browser tests against the running stack
```

Demo runbook: [docs/DEMO.md](docs/DEMO.md). Every scenario per user: [docs/demo-scripts.md](docs/demo-scripts.md). Deployment (AWS, one VM, Docker, Caddy HTTPS): [docs/DEPLOY.md](docs/DEPLOY.md).

## Layout

```
apps/api            NestJS API (/v1), OpenAPI at /v1/openapi.json
apps/bot            Telegram bot (grammY), channel-agnostic conversation flow
apps/ml             ML gateway: redaction, Nebius Token Factory, Tavily, evaluation (eval/)
apps/web            Next.js 15: landing, bank portal, SME portal, banking-app demo
apps/extension      Chrome extension (MV3): snip-and-check, chat/email watcher; on-device detection
packages/contracts  API schemas (Zod), route registry, typed client
packages/db         Drizzle schema and migrations
packages/graph      entities, edges, score recompute, campaigns, demo seed
packages/scoring    TypeScript port of scoring.py (parity-tested)
packages/normalise  identifier detection, normalisation, hashing, masking
packages/i18n       Malay / English copy
infra/              Docker images, production compose, AWS provisioning
```
