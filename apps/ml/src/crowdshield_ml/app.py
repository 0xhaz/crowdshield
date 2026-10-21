"""FastAPI app: internal-only (X-Internal-Key), runs next to the API in Malaysia (techstacks §4)."""

import hmac
import logging

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .cache import Cache
from .config import Settings
from .llm import NebiusClient
from .services import Gateway
from .tavily import TavilyClient
from .trace import collect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings = Settings.from_env()
gateway = Gateway(
    NebiusClient(settings.nebius_base_url, settings.nebius_api_key),
    TavilyClient(settings.tavily_api_key),
    Cache(settings.redis_url),
    settings.models,
)
app = FastAPI(title="CrowdShield ML gateway", version="0.1.0")

MAX_UPLOAD = 8 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def internal(x_internal_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_internal_key, settings.internal_key):
        raise HTTPException(401, "internal key required")


async def read_upload(file: UploadFile, allowed: set[str]) -> tuple[bytes, str]:
    mime = (file.content_type or "").split(";")[0]
    if mime not in allowed:
        raise HTTPException(415, f"unsupported type {mime}")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file too large")
    return data, mime


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class IdentifierIn(BaseModel):
    type: str = Field(
        pattern="^(phone|whatsapp|telegram|bank_account|ewallet|url|domain|app|social_profile|crypto_wallet)$"
    )
    value: str = Field(
        min_length=3, max_length=500, description="Normalised value from @crowdshield/normalise"
    )


class UrlIn(BaseModel):
    url: str = Field(min_length=4, max_length=2000)


class NameIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)


class SupplierIn(BaseModel):
    company: str = Field(min_length=2, max_length=200)
    domain: str | None = Field(default=None, max_length=200)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "redis": await gateway.cache.ping(),
        "models": settings.models.tiers,
        "routes": settings.models.routes,
    }


async def traced(work) -> dict:
    """Runs one gateway call and attaches its AI trace (models, Tavily calls, timings)."""
    with collect() as trace:
        result = await work
    body = result.model_dump() if isinstance(result, BaseModel) else dict(result)
    body["trace"] = {"calls": trace["calls"], "total_ms": trace["total_ms"], "cached": not trace["calls"]}
    return body


class TextsIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class CaseIn(BaseModel):
    case: dict


class SnippetsIn(BaseModel):
    snippets: list[str] = Field(min_length=2, max_length=50)


@app.post("/v1/classify", dependencies=[Depends(internal)])
async def classify(body: TextIn):
    return await traced(gateway.classify(body.text))


@app.post("/v1/screenshot", dependencies=[Depends(internal)])
async def screenshot(file: UploadFile = File(...)):
    data, mime = await read_upload(file, IMAGE_TYPES)
    return await traced(gateway.read_screenshot(data, mime))


@app.post("/v1/invoice", dependencies=[Depends(internal)])
async def invoice(file: UploadFile = File(...)):
    data, mime = await read_upload(file, IMAGE_TYPES | {"application/pdf"})
    return await traced(gateway.read_invoice(data, mime))


@app.post("/v1/web/identifier", dependencies=[Depends(internal)])
async def web_identifier(body: IdentifierIn):
    return await traced(gateway.identifier_leads(body.type, body.value))


@app.post("/v1/web/url", dependencies=[Depends(internal)])
async def web_url(body: UrlIn):
    return await traced(gateway.check_url(body.url))


@app.post("/v1/web/investment", dependencies=[Depends(internal)])
async def web_investment(body: NameIn):
    return await traced(gateway.investment_check(body.name))


@app.post("/v1/web/supplier", dependencies=[Depends(internal)])
async def web_supplier(body: SupplierIn):
    return await traced(gateway.supplier_web(body.company, body.domain))


@app.post("/v1/embed", dependencies=[Depends(internal)])
async def embed_texts(body: TextsIn):
    """Redact, then embed (Qwen3-Embedding, 1024 dims) for campaign matching."""

    async def work():
        return {"items": await gateway.redact_and_embed(body.texts)}

    return await traced(work())


@app.post("/v1/brief", dependencies=[Depends(internal)])
async def brief(body: CaseIn):
    """Nemotron Ultra with reasoning: case brief for the fraud team + NSRC/PDRM referral note."""
    return await traced(gateway.case_brief(body.case))


@app.post("/v1/campaigns/label", dependencies=[Depends(internal)])
async def label(body: SnippetsIn):
    return await traced(gateway.label_campaign(body.snippets))


@app.get("/v1/news", dependencies=[Depends(internal)])
async def news(days: int = 7):
    return await traced(gateway.news(days))
