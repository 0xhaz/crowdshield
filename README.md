# CrowdShield

Scam and fraud intelligence platform for Malaysia: one shared scam graph, three front doors (consumer bot, bank dashboard, SME supplier check). See `workplan.md` for the hackathon plan, and `architecture_11.md` / `techstacks_7.md` for the design.

## Demo

```sh
pnpm demo:start     # Docker infra, migrations, API :4020, web :3020, ML gateway :8020, Telegram bot
pnpm demo:reset     # clean seeded data and caches
pnpm demo:prewarm   # cache every Nebius/Tavily call the demo makes (24 h)
pnpm e2e            # browser smoke tests against the running stack (resets data before/after)
```

The demo script is in [docs/DEMO.md](docs/DEMO.md).

## Local setup

Requires Node 22+, pnpm 9 and Docker.

```sh
pnpm install
cp .env.example .env        # then fill the secrets: openssl rand -hex 32
pnpm infra:up               # Postgres + pgvector, Redis, SeaweedFS (S3) + buckets
pnpm db:migrate             # apply migrations
pnpm db:seed                # synthetic demo data (or `pnpm db:fresh` = reset + migrate + seed)
pnpm test                   # includes DB integration tests (uses crowdshield_test)
```

| Service | Host port | Notes |
|---|---|---|
| Postgres 16 + pgvector | 5442 | `crowdshield` / `crowdshield`, databases `crowdshield` and `crowdshield_test` |
| Redis 7 | 6389 | |
| SeaweedFS S3 | 9020 | path-style S3; buckets `evidence`, `invoices`; keys in `infra/seaweedfs/s3.json` |
| CrowdShield API | 4020 | `pnpm --filter @crowdshield/api dev`; OpenAPI at `/v1/openapi.json` |
| Web app | 3020 | `pnpm --filter @crowdshield/web dev` (or `build` + `start`); bank and SME portals |
| ML gateway | 8020 | `pnpm --filter @crowdshield/ml dev` (Python 3.12 via uv; Nebius + Tavily) |
| Telegram bot | — | `pnpm --filter @crowdshield/bot dev` (long polling, needs API + ML gateway) |

Demo logins (password `crowdshield-demo`, or `SEED_DEMO_PASSWORD`): `analyst@nusabank.demo`, `supervisor@nusabank.demo`, `owner@majuvista.demo`, `admin@crowdshield.local`.

Other commands: `pnpm db:reset` (drop and re-migrate the local DB), `pnpm db:generate` (new migration after editing `packages/db/src/schema`), `pnpm infra:down`.

## Layout

```
apps/api            NestJS API (/v1)
apps/bot            Telegram bot @CrowdShieldBot (grammY)
apps/ml             ML gateway: redaction, Nebius (Nemotron), Tavily (FastAPI)
apps/web            Next.js 15 dashboards: bank (alerts, payee check, cases, entities) and SME (Semak supplier)
packages/db         Drizzle schema (source of truth) + migrations in packages/db/drizzle
packages/normalise  identifier normalisation, HMAC hashing, masking
packages/scoring    TypeScript port of scoring.py (parity-tested against it)
packages/graph      entities, edges, score recompute, campaign stats, demo seed
packages/contracts  API schemas (Zod), route registry, OpenAPI, typed client
packages/i18n       BM / EN copy: tier labels, actions, explanation lines
infra/              local container config
banking-main/       frontend reference (MIT, JS Mastery); removed once migrated to apps/web
schema.sql, scoring.py  original design references
```
