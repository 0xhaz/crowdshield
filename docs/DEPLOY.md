# Deploying the public demo (AWS)

One VM runs everything in Docker: Postgres + pgvector, Redis, SeaweedFS (S3), the ML gateway, the API, the web app, the Telegram bot, and Caddy in front with automatic HTTPS (Let's Encrypt on an `sslip.io` hostname, so no DNS setup is needed).

| Item | Value |
|---|---|
| Region | us-east-1 |
| Instance | t4g.large (2 vCPU, 8 GB, arm64), Ubuntu 24.04, 30 GB encrypted gp3, 4 GB swap |
| Open ports | 80, 443 to everyone; 22 from the admin's IP only |
| Cost | about US$55 a month (instance, Elastic IP, disk) |

## First deploy

```sh
infra/deploy/aws-provision.sh                       # prints the IP and domain, creates ~/.ssh/crowdshield-demo.pem
infra/deploy/make-env.sh crowdshield.<ip-dashed>.sslip.io
rsync -az --delete --exclude .env --exclude node_modules --exclude .git --exclude banking-main \
  --exclude '**/dist' --exclude '**/.next' --exclude '**/.venv' -e "ssh -i ~/.ssh/crowdshield-demo.pem" \
  ./ ubuntu@<ip>:/opt/crowdshield/
ssh -i ~/.ssh/crowdshield-demo.pem ubuntu@<ip>
cd /opt/crowdshield/infra/deploy
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
./demo-reset.sh                                      # synthetic demo data + script embeddings
```

`make-env.sh` generates fresh secrets for everything internal (database, S3, identifier pepper and encryption key, JWT, bot, ML gateway and partner keys) and copies only the external keys (Nebius, Tavily, Telegram) from the local `.env`. `.env.prod` and `seaweedfs-s3.json` are git-ignored and mode 600 on the server.

## Telegram: one bot, one poller

The bot uses long polling, and Telegram allows one poller per token. When the server's bot runs, stop the local one (run local dev with `turbo run dev --filter='!@crowdshield/bot'`), or use a second bot token for local development.

## Updating

Re-run the `rsync` above, then on the server: `docker compose --env-file .env.prod -f compose.prod.yml up -d --build`. Migrations run automatically (the `migrate` service) before the API starts.

## Day-to-day

```sh
dc() { docker compose --env-file .env.prod -f compose.prod.yml "$@"; }
dc ps                      # health
dc logs -f api ml bot      # logs (rotated, 3 × 10 MB per service)
./demo-reset.sh            # fresh demo data before judging or a recording
```

## Tearing down

Terminate the instance, release the Elastic IP, delete the security group and key pair named `crowdshield-demo` (all tagged `Project=crowdshield`).

## Security notes

- The demo database holds synthetic data only; `DEMO_DATABASE=yes` is what allows seeding and reset off localhost.
- Demo logins are published for judges. Nothing real should ever be entered.
- The public check and screenshot endpoints are rate-limited per IP (30 checks and 6 screenshots per 10 minutes) with a daily ceiling on screenshots; the banking-app demo is rate-limited per visitor.
- Use an IAM user or role with EC2 permissions for provisioning, not the AWS root account's access keys.
