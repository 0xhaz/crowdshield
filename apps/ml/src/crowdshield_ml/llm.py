"""Nebius Token Factory client (OpenAI-compatible) with JSON-schema output and validation.

Extraction runs with reasoning off (chat_template_kwargs.enable_thinking = false): measured
~0.7-0.9 s per call vs ~2.3 s with reasoning, and the outputs are schema-constrained anyway.
"""

import base64
import json
import logging
import time
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

log = logging.getLogger("crowdshield.llm")
T = TypeVar("T", bound=BaseModel)


class LlmError(Exception):
    pass


class NebiusClient:
    def __init__(self, base_url: str, api_key: str, client: httpx.AsyncClient | None = None):
        self.base_url = base_url
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=5.0))
        self.headers = {"Authorization": f"Bearer {api_key}"}

    async def json(
        self,
        model: str,
        system: str,
        user: str | list[dict],
        schema_model: type[T],
        *,
        prompt_version: str,
        max_tokens: int = 1200,
        thinking: bool = False,
    ) -> T:
        schema = schema_model.model_json_schema()
        body = {
            "model": model,
            "temperature": 0,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_model.__name__, "schema": schema, "strict": True},
            },
            "chat_template_kwargs": {"enable_thinking": thinking},
        }
        last: Exception | None = None
        for attempt in range(2):
            started = time.perf_counter()
            try:
                r = await self.client.post(
                    f"{self.base_url}/chat/completions", json=body, headers=self.headers
                )
                if r.status_code >= 500 or r.status_code == 429:
                    raise LlmError(f"Nebius {r.status_code}")
                r.raise_for_status()
                data = r.json()
                content = data["choices"][0]["message"]["content"]
                result = schema_model.model_validate(json.loads(content))
                log.info(
                    "llm model=%s prompt=%s ms=%d tokens=%s",
                    model,
                    prompt_version,
                    (time.perf_counter() - started) * 1000,
                    data.get("usage", {}).get("total_tokens"),
                )
                return result
            except (httpx.HTTPError, LlmError, KeyError, json.JSONDecodeError, ValidationError) as e:
                last = e
                log.warning("llm attempt %d failed (%s): %s", attempt + 1, prompt_version, e)
        raise LlmError(f"{prompt_version} failed: {last}")


def image_part(data: bytes, mime: str) -> dict:
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"},
    }
