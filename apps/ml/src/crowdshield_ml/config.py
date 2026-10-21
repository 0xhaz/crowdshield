"""Settings from the environment (the repo-root .env fills in anything not already set)."""

import os
from dataclasses import dataclass
from pathlib import Path

_HERE = Path(__file__).resolve()
# repo-root .env in development; in the container there is none (env comes from compose)
ROOT_ENV = _HERE.parents[4] / ".env" if len(_HERE.parents) > 4 else Path("/nonexistent/.env")


def load_root_env(path: Path = ROOT_ENV) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())  # real env vars win


# Model tiers on Nebius Token Factory. Which task uses which tier is decided by the evaluation
# (docs/model-eval.md) and can be overridden per task with ROUTE_<TASK>=<tier or model id>.
TIERS = {
    "lightning": ("NEBIUS_MODEL_LIGHTNING", "nvidia/Nemotron-3_5-Lightning"),
    "nano": ("NEBIUS_MODEL_NANO", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"),
    "super": ("NEBIUS_MODEL_TEXT", "nvidia/nemotron-3-super-120b-a12b"),
    "ultra": ("NEBIUS_MODEL_REASONING", "nvidia/Nemotron-3-Ultra-550b-a55b"),
    "vision": ("NEBIUS_MODEL_VISION", "nvidia/Nemotron-3.5-Super-VL"),
    "embed": ("NEBIUS_MODEL_EMBEDDING", "Qwen/Qwen3-Embedding-8B"),
}
# From docs/model-eval.md (22 Oct): Ultra without reasoning was the most accurate (41/41) and the
# fastest (p50 1.1 s) on interactive classification, so interactive text tasks route to it with
# reasoning off; reasoning stays on only for the case brief and campaign labelling. Batch news
# extraction uses Super. Vision has one candidate (Nemotron 3.5 Super VL).
DEFAULT_ROUTES = {
    "classify": "ultra",
    "screenshot": "vision",
    "invoice": "vision",
    "leads": "ultra",
    "page": "ultra",
    "contact": "ultra",
    "brief": "ultra",
    "label": "ultra",
    "news": "super",
    "embed": "embed",
}


@dataclass(frozen=True)
class Models:
    tiers: dict[str, str]
    routes: dict[str, str]

    @classmethod
    def from_env(cls) -> "Models":
        tiers = {t: os.environ.get(env) or default for t, (env, default) in TIERS.items()}
        routes = {
            task: os.environ.get(f"ROUTE_{task.upper()}") or tier for task, tier in DEFAULT_ROUTES.items()
        }
        return cls(tiers, routes)

    def for_task(self, task: str) -> str:
        r = self.routes[task]
        return self.tiers.get(r, r)  # a tier name, or a full model id


@dataclass(frozen=True)
class Settings:
    nebius_api_key: str
    nebius_base_url: str
    models: "Models"
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
            models=Models.from_env(),
            tavily_api_key=need("TAVILY_API_KEY"),
            redis_url=need("REDIS_URL"),
            internal_key=need("ML_API_KEY"),
        )
