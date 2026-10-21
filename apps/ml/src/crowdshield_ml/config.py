"""Settings from the environment (the repo-root .env fills in anything not already set)."""

import os
from dataclasses import dataclass
from pathlib import Path

ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


def load_root_env(path: Path = ROOT_ENV) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())  # real env vars win


@dataclass(frozen=True)
class Settings:
    nebius_api_key: str
    nebius_base_url: str
    model_text: str
    model_vision: str
    tavily_api_key: str
    redis_url: str
    internal_key: str

    @classmethod
    def from_env(cls) -> "Settings":
        load_root_env()

        def need(name: str) -> str:
            value = os.environ.get(name, "")
            if not value:
                raise RuntimeError(f"{name} is not set (see .env.example)")
            return value

        return cls(
            nebius_api_key=need("NEBIUS_API_KEY"),
            nebius_base_url=need("NEBIUS_BASE_URL").rstrip("/"),
            model_text=os.environ.get("NEBIUS_MODEL_TEXT") or "nvidia/nemotron-3-super-120b-a12b",
            model_vision=os.environ.get("NEBIUS_MODEL_VISION") or "nvidia/Nemotron-3.5-Super-VL",
            tavily_api_key=need("TAVILY_API_KEY"),
            redis_url=need("REDIS_URL"),
            internal_key=need("ML_API_KEY"),
        )
