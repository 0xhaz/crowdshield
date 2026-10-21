#!/usr/bin/env bash
# On the demo VM: fresh synthetic demo data, caches cleared (the ML gateway's ml:* cache is kept so
# pre-warmed results stay instant), and seeded case scripts embedded for campaign matching.
set -euo pipefail
cd "$(dirname "$0")"
dc() { docker compose --env-file .env.prod -f compose.prod.yml "$@"; }

dc run --rm --no-deps migrate pnpm db:fresh
for pattern in 'verdict:*' 'bot:sess:*' 'bot:rl:*' 'idem:*' 'rl:*' 'lock:*'; do
  dc exec -T redis redis-cli EVAL "local n=0 for _,k in ipairs(redis.call('KEYS',ARGV[1])) do redis.call('DEL',k) n=n+1 end return n" 0 "$pattern" >/dev/null
done
dc exec -T api node -e "fetch('http://localhost:4020/v1/campaigns/backfill',{method:'POST',headers:{'x-api-key':process.env.BOT_API_KEY}}).then(r=>r.text()).then(t=>console.log('scripts:',t))"
echo "demo reset ✓"
