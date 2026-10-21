"""Tavily client (techstacks_7 §4). Queries only ever contain the identifier being checked or
public names (companies, platforms, domains) - never victim or reporter data."""

import logging
import time

import httpx

from .trace import record

log = logging.getLogger("crowdshield.tavily")


class TavilyClient:
    def __init__(self, api_key: str, client: httpx.AsyncClient | None = None):
        self.client = client or httpx.AsyncClient(
            base_url="https://api.tavily.com", timeout=httpx.Timeout(20.0, connect=5.0)
        )
        self.headers = {"Authorization": f"Bearer {api_key}"}

    async def _post(self, path: str, body: dict) -> dict:
        started = time.perf_counter()
        r = await self.client.post(path, json=body, headers=self.headers)
        r.raise_for_status()
        data = r.json()
        record({"kind": "tavily", "op": path.strip("/"), "ms": round((time.perf_counter() - started) * 1000)})
        log.info(
            "tavily %s ms=%d credits=%s",
            path,
            (time.perf_counter() - started) * 1000,
            (data.get("usage") or {}).get("credits"),
        )
        return data

    async def search(
        self,
        query: str,
        *,
        max_results: int = 5,
        include_domains: list[str] | None = None,
        topic: str = "general",
        time_range: str | None = None,
    ) -> list[dict]:
        body: dict = {
            "query": query,
            "max_results": max_results,
            "search_depth": "basic",
            "topic": topic,
            "country": "malaysia",
        }
        if include_domains:
            body["include_domains"] = include_domains
            body.pop("country")  # country boosting doesn't combine with a domain allow-list
        if time_range:
            body["time_range"] = time_range
        return (await self._post("/search", body)).get("results", [])

    async def extract(self, url: str) -> dict | None:
        data = await self._post("/extract", {"urls": [url], "extract_depth": "basic"})
        results = data.get("results") or []
        return results[0] if results else None
