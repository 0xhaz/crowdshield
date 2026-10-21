"""Redis JSON cache (24 h for web lookups: controls Tavily credits and latency)."""

import hashlib
import json
import logging

import redis.asyncio as redis

log = logging.getLogger("crowdshield.cache")
DAY = 24 * 3600


class Cache:
    def __init__(self, url: str):
        self.r = redis.from_url(url)

    @staticmethod
    def key(kind: str, *parts: str) -> str:
        return f"ml:{kind}:" + hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]

    async def get(self, key: str) -> dict | None:
        try:
            raw = await self.r.get(key)
            return json.loads(raw) if raw else None
        except Exception as e:  # cache is best-effort
            log.warning("cache get failed: %s", e)
            return None

    async def set(self, key: str, value: dict, ttl: int = DAY) -> None:
        try:
            await self.r.set(key, json.dumps(value), ex=ttl)
        except Exception as e:
            log.warning("cache set failed: %s", e)

    async def ping(self) -> bool:
        try:
            return bool(await self.r.ping())
        except Exception:
            return False
