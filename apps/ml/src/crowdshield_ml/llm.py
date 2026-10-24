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

from .trace import record

log = logging.getLogger("crowdshield.llm")
T = TypeVar("T", bound=BaseModel)


class LlmError(Exception):
    pass


def relax_enums(schema: dict) -> dict:
    """Replaces every `enum` with a plain string whose description lists the allowed values."""
    if isinstance(schema, dict):
        out = {k: relax_enums(v) for k, v in schema.items()}
        if "enum" in out:
            allowed = ", ".join(str(v) for v in out.pop("enum") if v is not None)
            desc = out.get("description", "")
            out["description"] = (desc + " " if desc else "") + f"One of: {allowed}."
            out["type"] = "string"
        return out
    if isinstance(schema, list):
        return [relax_enums(v) for v in schema]
    return schema


def _norm(v):
    if isinstance(v, str):
        n = v.strip().lower().replace("-", "_").replace(" ", "_")
        return n
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_norm(x) for x in v]
    return v


def validate_normalised[M: BaseModel](schema_model: type[M], data: dict) -> M:
    """Validates; if an enum-like string is off by case or spacing, retries on normalised enum fields."""
    try:
        return schema_model.model_validate(data)
    except ValidationError as e:
        fixed = dict(data)
        for err in e.errors():
            if (
                err.get("type") == "literal_error"
                and len(err["loc"]) == 1
                and isinstance(fixed.get(err["loc"][0]), str)
            ):
                fixed[err["loc"][0]] = _norm(fixed[err["loc"][0]])
        return schema_model.model_validate(fixed)


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
        strict_enums: bool = True,
    ) -> T:
        schema = schema_model.model_json_schema()
        if not strict_enums:
            # Optional: enums as described strings, validated afterwards. Measured worse
            # (docs/model-eval.md): models invent values for nested enums. Strict is the default.
            schema = relax_enums(schema)
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
            # A retry at temperature 0 repeats the same output. Strict decoding occasionally runs away
            # (blank lines until max_tokens, seen on long case briefs), so the retry samples a little.
            body["temperature"] = 0 if attempt == 0 else 0.4
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
                result = validate_normalised(schema_model, json.loads(content))
                ms = round((time.perf_counter() - started) * 1000)
                usage = data.get("usage") or {}
                record(
                    {
                        "kind": "model",
                        "model": model,
                        "prompt": prompt_version,
                        "ms": ms,
                        "tokens": usage.get("total_tokens"),
                        "reasoning": thinking,
                        "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get(
                            "reasoning_tokens"
                        ),
                    }
                )
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


async def embed(
    client: "NebiusClient", model: str, texts: list[str], dimensions: int = 1024
) -> list[list[float]]:
    """Embeddings for redacted texts (pgvector column is vector(1024))."""
    started = time.perf_counter()
    r = await client.client.post(
        f"{client.base_url}/embeddings",
        json={"model": model, "input": texts, "dimensions": dimensions},
        headers=client.headers,
    )
    if r.status_code >= 400:
        raise LlmError(f"embeddings {r.status_code}")
    data = r.json()
    record(
        {
            "kind": "embedding",
            "model": model,
            "ms": round((time.perf_counter() - started) * 1000),
            "inputs": len(texts),
        }
    )
    return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]
