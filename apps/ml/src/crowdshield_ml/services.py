"""The gateway's use cases. Models read and classify; identifiers are matched elsewhere."""

import hashlib
import logging
import re
from datetime import UTC, datetime
from urllib.parse import urlparse

import pymupdf

from . import prompts
from .cache import Cache
from .config import Models
from .llm import LlmError, NebiusClient, embed, image_part
from .redact import redact
from .schemas import (
    Bilingual,
    CampaignLabel,
    CaseBrief,
    ClassifyResult,
    InvoiceReading,
    Lead,
    LeadJudgements,
    NewsItems,
    OfficialContact,
    PageCheck,
    ScreenshotReading,
    ScreenshotResult,
    SupplierWeb,
    TextClassification,
    UrlCheckResult,
    WebLeads,
)
from .tavily import TavilyClient

log = logging.getLogger("crowdshield.services")
SCAM_WORDS = "scam OR penipuan OR tipu OR fraud"

# Official domains: a page here is never "impersonation" whatever the model says. Extend with care.
OFFICIAL_DOMAINS = {
    "gov.my",
    "bnm.gov.my",
    "sc.com.my",
    "rmp.gov.my",
    "hasil.gov.my",
    "mcmc.gov.my",
    "ssm.com.my",
    "kwsp.gov.my",
    "perkeso.gov.my",
    "jpj.gov.my",
    "imi.gov.my",
    "maybank2u.com.my",
    "maybank.com",
    "cimb.com.my",
    "cimbclicks.com.my",
    "pbebank.com",
    "publicbank.com.my",
    "rhbgroup.com",
    "hlb.com.my",
    "ambank.com.my",
    "bankislam.com",
    "bsn.com.my",
    "pos.com.my",
    "touchngo.com.my",
    "grab.com",
    "shopee.com.my",
    "lazada.com.my",
}


def official_domain(host: str) -> bool:
    host = host.lower().removeprefix("www.")
    return any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS)


PAGE_CHARS = 8000

NEEDS_REVIEW = Bilingual(
    en="We couldn't read this automatically; a person will review it.",
    ms="Kami tidak dapat membacanya secara automatik; seorang petugas akan menyemaknya.",
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def search_terms(kind: str, value: str) -> list[str]:
    """How an identifier is written on the web: '+60112345482' also as '0112345482' and '011-2345482'."""
    if kind in ("phone", "whatsapp") and value.startswith("+60"):
        local = "0" + value[3:]
        return [local, f"{local[:3]}-{local[3:]}"]
    if kind in ("bank_account", "ewallet"):
        return [value.split(":", 1)[1].lstrip("+")]
    if kind == "app":
        return [value.split(":", 1)[1]]
    if kind == "url":
        return [value.split("/", 1)[0]]
    return [value.lstrip("@")]


LEGAL_SUFFIX = re.compile(r"\b(sdn\.?\s*bhd|bhd|berhad|plt|llp)\.?$", re.I)


def names_company(text: str, company: str) -> bool:
    """The page must name the company itself (legal suffix aside) before we trust its contacts.
    Guards against the model accepting a similar-sounding company's site as official."""
    core = re.sub(r"\s+", " ", LEGAL_SUFFIX.sub("", company.strip())).strip().lower()
    return bool(core) and core in re.sub(r"\s+", " ", text.lower())


def mentions(text: str, terms: list[str]) -> bool:
    digits = re.sub(r"\D", "", text)
    for t in terms:
        if t.lower() in text.lower():
            return True
        d = re.sub(r"\D", "", t)
        if len(d) >= 8 and d in digits:
            return True
    return False


class Gateway:
    def __init__(self, llm: NebiusClient, tavily: TavilyClient, cache: Cache, models: Models):
        self.llm, self.tavily, self.cache, self.models = llm, tavily, cache, models

    def model(self, task: str) -> str:
        return self.models.for_task(task)

    # ---------- reading ----------
    async def classify(self, text: str) -> ClassifyResult:
        red = redact(text)
        try:
            out = await self.llm.json(
                self.model("classify"),
                prompts.CLASSIFY,
                red.text,
                TextClassification,
                prompt_version=prompts.CLASSIFY_V,
            )
        except LlmError:
            return ClassifyResult(
                scam_type="other",
                language="mixed",
                urgency=False,
                bank_change_language=False,
                impersonating=None,
                summary=NEEDS_REVIEW,
                roles=[],
                needs_review=True,
                prompt_version=prompts.CLASSIFY_V,
            )
        roles = [{"value": red.restore(r.token), "role": r.role} for r in out.roles if r.role != "unknown"]
        summary = Bilingual(en=red.restore(out.summary.en), ms=red.restore(out.summary.ms))
        return ClassifyResult(
            scam_type=out.scam_type,
            language=out.language,
            urgency=out.urgency,
            bank_change_language=out.bank_change_language,
            impersonating=out.impersonating,
            summary=summary,
            roles=roles,
            prompt_version=prompts.CLASSIFY_V,
        )

    async def read_screenshot(self, data: bytes, mime: str) -> ScreenshotResult:
        # Exact duplicates (the same scam image forwarded by many people) skip the model (architecture §10)
        key = self.cache.key("screenshot", prompts.SCREENSHOT_V, hashlib.sha256(data).hexdigest())
        if hit := await self.cache.get(key):
            return ScreenshotResult(**hit)
        content = [{"type": "text", "text": "Read this screenshot."}, image_part(data, mime)]
        try:
            out = await self.llm.json(
                self.model("screenshot"),
                prompts.SCREENSHOT,
                content,
                ScreenshotReading,
                prompt_version=prompts.SCREENSHOT_V,
                max_tokens=2000,
            )
        except LlmError:
            return ScreenshotResult(
                text="",
                scam_type="other",
                language="mixed",
                urgency=False,
                impersonating=None,
                summary=NEEDS_REVIEW,
                needs_review=True,
                prompt_version=prompts.SCREENSHOT_V,
            )
        result = ScreenshotResult(
            text=out.transcript,
            scam_type=out.scam_type,
            language=out.language,
            urgency=out.urgency,
            impersonating=out.impersonating,
            summary=out.summary,
            prompt_version=prompts.SCREENSHOT_V,
        )
        await self.cache.set(key, result.model_dump())  # successful readings only, 24 h
        return result

    async def read_invoice(self, data: bytes, mime: str) -> dict:
        key = self.cache.key("invoice", prompts.INVOICE_V, hashlib.sha256(data).hexdigest())
        if hit := await self.cache.get(key):
            return hit
        images: list[tuple[bytes, str]]
        if mime == "application/pdf":
            doc = pymupdf.open(stream=data, filetype="pdf")
            images = [(page.get_pixmap(dpi=144).tobytes("png"), "image/png") for page in list(doc)[:2]]
        else:
            images = [(data, mime)]
        content: list[dict] = [{"type": "text", "text": "Read this invoice."}]
        content += [image_part(b, m) for b, m in images]
        try:
            out = await self.llm.json(
                self.model("invoice"),
                prompts.INVOICE,
                content,
                InvoiceReading,
                prompt_version=prompts.INVOICE_V,
                max_tokens=1500,
            )
        except LlmError:
            return {"needs_review": True, "prompt_version": prompts.INVOICE_V}
        result = {**out.model_dump(), "needs_review": False, "prompt_version": prompts.INVOICE_V}
        await self.cache.set(key, result)
        return result

    # ---------- Tavily ----------
    async def _judge(
        self, subject: str, results: list[dict], terms: list[str], *, require_mention: bool
    ) -> list[Lead]:
        if not results:
            return []

        def entry(i: int, r: dict) -> str:
            head = f"[{i}] {r.get('title', '')}\nURL: {r.get('url', '')}\nDate: {r.get('published_date', '')}"
            return f"{head}\n{(r.get('content') or '')[:500]}"

        listing = "\n\n".join(entry(i, r) for i, r in enumerate(results[:20]))
        try:
            judged = await self.llm.json(
                self.model("leads"),
                prompts.LEADS,
                f"Identifier: {subject}\n\nResults:\n{listing}",
                LeadJudgements,
                prompt_version=prompts.LEADS_V,
            )
            by_index = {j.index: j for j in judged.results}
        except LlmError:
            by_index = {}
        leads = []
        for i, r in enumerate(results):
            j = by_index.get(i)
            text = f"{r.get('title', '')} {r.get('content', '')}"
            relevant = bool(j and j.relevant) and (not require_mention or mentions(text, terms))
            leads.append(
                Lead(
                    title=r.get("title", "")[:200],
                    url=r.get("url", ""),
                    snippet=(r.get("content") or "")[:300],
                    published_at=r.get("published_date"),
                    scam_type=j.scam_type if j else None,
                    relevant=relevant,
                )
            )
        return leads

    async def identifier_leads(self, kind: str, value: str) -> WebLeads:
        key = self.cache.key("identifier", kind, value)
        if hit := await self.cache.get(key):
            return WebLeads(**{**hit, "cached": True})
        terms = search_terms(kind, value)
        query = " OR ".join(f'"{t}"' for t in terms) + f" {SCAM_WORDS}"
        results = await self.tavily.search(query, max_results=5)
        leads = await self._judge(
            terms[0], results, terms, require_mention=kind not in ("url", "domain", "app")
        )
        out = WebLeads(query=query, leads=leads, cached=False, fetched_at=now_iso())
        await self.cache.set(key, out.model_dump())
        return out

    async def investment_check(self, name: str) -> WebLeads:
        key = self.cache.key("investment", name.lower())
        if hit := await self.cache.get(key):
            return WebLeads(**{**hit, "cached": True})
        query = f'"{name}"'
        official = await self.tavily.search(query, max_results=5, include_domains=["sc.com.my", "bnm.gov.my"])
        news = await self.tavily.search(f'"{name}" {SCAM_WORDS}', max_results=5, topic="news")
        leads = await self._judge(name, official + news, [name], require_mention=True)
        out = WebLeads(query=query, leads=leads, cached=False, fetched_at=now_iso())
        await self.cache.set(key, out.model_dump())
        return out

    async def check_url(self, url: str) -> UrlCheckResult:
        key = self.cache.key("url", url)
        if hit := await self.cache.get(key):
            return UrlCheckResult(**{**hit, "cached": True})
        target = url if re.match(r"^https?://", url) else f"http://{url}"
        try:
            page = await self.tavily.extract(target)  # Tavily fetches it; the user's device never does
        except Exception as e:
            log.warning("extract failed for %s: %s", urlparse(target).netloc, e)
            page = None
        if not page or not page.get("raw_content"):
            out = UrlCheckResult(
                url=url, fetched=False, title=None, page_check=None, cached=False, fetched_at=now_iso()
            )
        else:
            text = page["raw_content"][:PAGE_CHARS]
            host = urlparse(target).hostname or ""
            try:
                check = await self.llm.json(
                    self.model("page"),
                    prompts.PAGE,
                    f"URL: {target}\nDomain: {host}\n\nPage text:\n{text}",
                    PageCheck,
                    prompt_version=prompts.PAGE_V,
                )
            except LlmError:
                check = None
            if check and official_domain(host):
                check = check.model_copy(update={"impersonates": None, "suspicious": False})
            title = next((ln.lstrip("#").strip() for ln in text.splitlines() if ln.startswith("# ")), None)
            out = UrlCheckResult(
                url=url,
                fetched=True,
                title=title[:200] if title else None,
                page_check=check,
                cached=False,
                fetched_at=now_iso(),
            )
        await self.cache.set(key, out.model_dump())
        return out

    async def supplier_web(self, company: str, domain: str | None) -> SupplierWeb:
        key = self.cache.key("supplier", company.lower(), domain or "")
        if hit := await self.cache.get(key):
            return SupplierWeb(**{**hit, "cached": True})
        official = None
        results = await self.tavily.search(f'"{company}" Malaysia contact', max_results=5)
        # prefer the company's own domain if we know it, else the first non-directory result
        directories = (
            "facebook.",
            "linkedin.",
            "ctoscredit",
            "businesslist",
            "yellowpages",
            "marketplace",
            "shopee",
            "lazada",
        )
        candidates = [r for r in results if domain and domain in r.get("url", "")] or [
            r for r in results if not any(d in r.get("url", "") for d in directories)
        ]
        for r in candidates[:2]:
            page = await self.tavily.extract(r["url"])
            if not page or not page.get("raw_content") or not names_company(page["raw_content"], company):
                continue
            try:
                c = await self.llm.json(
                    self.model("contact"),
                    prompts.CONTACT,
                    f"Company: {company}\nURL: {r['url']}\n\n{page['raw_content'][:PAGE_CHARS]}",
                    OfficialContact,
                    prompt_version=prompts.CONTACT_V,
                )
            except LlmError:
                continue
            if c.is_official_site and (c.phone or c.email):
                official = {"phone": c.phone, "email": c.email, "source_url": r["url"]}
                break
        rep_results = await self.tavily.search(
            f'"{company}" {SCAM_WORDS} OR complaint OR aduan', max_results=5
        )
        reputation = await self._judge(company, rep_results, [company], require_mention=True)
        out = SupplierWeb(
            official_contact=official, reputation=reputation, cached=False, fetched_at=now_iso()
        )
        await self.cache.set(key, out.model_dump())
        return out

    # ---------- embeddings (campaign matching and detection) ----------
    async def redact_and_embed(self, texts: list[str]) -> list[dict]:
        """Redacts each text, then embeds the redacted text. Only redacted text ever leaves this service."""
        out: list[dict | None] = [None] * len(texts)
        todo: list[tuple[int, str, str]] = []
        for i, t in enumerate(texts):
            red = redact(t).text
            key = self.cache.key("embed", self.model("embed"), red)
            if hit := await self.cache.get(key):
                out[i] = hit
            else:
                todo.append((i, red, key))
        if todo:
            vectors = await embed(self.llm, self.model("embed"), [r for _, r, _ in todo])
            for (i, red, key), vec in zip(todo, vectors, strict=True):
                out[i] = {"redacted": red, "embedding": vec}
                await self.cache.set(key, out[i], ttl=7 * 24 * 3600)
        return [o for o in out if o is not None]

    # ---------- Ultra: case brief for the fraud team and the NSRC/PDRM referral ----------
    async def case_brief(self, case: dict) -> dict:
        import json as _json

        # Identifiers arrive masked; only free text (narrative, event details) can carry personal data.
        # Redacting the whole JSON would turn dates and masked numbers into tokens.
        case = dict(case)
        if isinstance(case.get("narrative"), str):
            case["narrative"] = redact(case["narrative"]).text
        if isinstance(case.get("timeline"), list):
            case["timeline"] = [
                {**t, "detail": redact(t["detail"]).text} if isinstance(t.get("detail"), str) else t
                for t in case["timeline"]
            ]
        payload = _json.dumps(case, ensure_ascii=False)
        key = self.cache.key("brief", prompts.BRIEF_V, self.model("brief"), payload)
        if hit := await self.cache.get(key):
            return hit
        out = await self.llm.json(
            self.model("brief"),
            prompts.BRIEF,
            payload,
            CaseBrief,
            prompt_version=prompts.BRIEF_V,
            max_tokens=12000,  # reasoning tokens count too; 6000 truncated long cases
            thinking=True,
            temperature=0.3,  # long free text: temperature 0 tends to run away under strict decoding
        )
        result = {**out.model_dump(), "model": self.model("brief"), "prompt_version": prompts.BRIEF_V}
        await self.cache.set(key, result)
        return result

    # ---------- campaign labelling (new clusters from the novelty pool) ----------
    async def label_campaign(self, snippets: list[str]) -> dict:
        texts = [redact(t).text for t in snippets[:12]]
        listing = "\n\n".join(f"[{i + 1}] {t[:700]}" for i, t in enumerate(texts))
        out = await self.llm.json(
            self.model("label"),
            prompts.LABEL,
            f"Reports in this cluster:\n\n{listing}",
            CampaignLabel,
            prompt_version=prompts.LABEL_V,
            max_tokens=3000,
            thinking=True,
            temperature=0.3,  # long free text: temperature 0 tends to run away under strict decoding
        )
        result = out.model_dump()
        result["key_phrases"] = result["key_phrases"][:6]
        return {**result, "model": self.model("label"), "prompt_version": prompts.LABEL_V}

    # ---------- news: what's happening this week (Tavily + Nemotron) ----------
    NEWS_QUERIES = (
        "scam Malaysia police losses this week",
        "penipuan Malaysia polis kerugian",
        "Macau scam Malaysia victim",
        "investment scam Malaysia arrested",
        "NSRC 997 scam warning Malaysia",
    )

    async def news(self, days: int = 7) -> dict:
        key = self.cache.key("news", prompts.NEWS_V, str(days))
        if hit := await self.cache.get(key):
            return {**hit, "cached": True}
        time_range = "week" if days <= 7 else "month"
        seen: set[str] = set()
        results: list[dict] = []
        for q in self.NEWS_QUERIES:
            for r in await self.tavily.search(q, max_results=5, topic="news", time_range=time_range):
                if r.get("url") and r["url"] not in seen:
                    seen.add(r["url"])
                    results.append(r)

        def entry(i: int, r: dict) -> str:
            head = f"[{i}] {r.get('title', '')}\nURL: {r.get('url', '')}\nDate: {r.get('published_date', '')}"
            return f"{head}\n{(r.get('content') or '')[:500]}"

        listing = "\n\n".join(entry(i, r) for i, r in enumerate(results[:20]))
        try:
            judged = await self.llm.json(
                self.model("news"),
                prompts.NEWS,
                listing,
                NewsItems,
                prompt_version=prompts.NEWS_V,
                max_tokens=4000,
            )
        except LlmError:
            judged = NewsItems(items=[])
        items = []
        seen_incidents: set[tuple] = set()
        for j in judged.items:
            if j.relevant and 0 <= j.index < len(results):
                # one story, several outlets: the same loss in the same state is one incident
                incident = (int(j.loss_myr // 1000), j.state) if j.loss_myr else None
                if incident in seen_incidents:
                    continue
                if incident:
                    seen_incidents.add(incident)
                r = results[j.index]
                items.append(
                    {
                        "headline": j.headline,
                        "summary": j.summary.model_dump(),
                        "scam_type": j.scam_type,
                        "loss_myr": j.loss_myr,
                        "state": j.state,
                        "url": r["url"],
                        "source": urlparse(r["url"]).netloc,
                        "published_at": r.get("published_date"),
                    }
                )
        out = {"items": items[:10], "fetched_at": now_iso(), "cached": False}
        await self.cache.set(key, out, ttl=6 * 3600)
        return out
