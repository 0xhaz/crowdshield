import json

import httpx
import pytest
import respx

from crowdshield_ml.config import DEFAULT_ROUTES, Models
from crowdshield_ml.llm import NebiusClient
from crowdshield_ml.redact import redact
from crowdshield_ml.services import Gateway, mentions, names_company, official_domain, search_terms
from crowdshield_ml.tavily import TavilyClient

NEBIUS = "https://nebius.test/v1"


class MemoryCache:
    def __init__(self):
        self.d = {}

    @staticmethod
    def key(kind, *parts):
        return f"{kind}:{'|'.join(parts)}"

    async def get(self, key):
        return self.d.get(key)

    async def set(self, key, value, ttl=0):
        self.d[key] = value


def gateway():
    models = Models(
        {
            "lightning": "lightning-model",
            "nano": "nano-model",
            "super": "super-model",
            "ultra": "ultra-model",
            "vision": "vision-model",
            "embed": "embed-model",
        },
        dict(DEFAULT_ROUTES),
    )
    return Gateway(NebiusClient(NEBIUS, "k"), TavilyClient("t"), MemoryCache(), models)


def llm_reply(payload: dict) -> httpx.Response:
    return httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps(payload)}}], "usage": {"total_tokens": 1}}
    )


# ---------- redaction ----------
def test_redacts_ic_phone_account_email_and_restores():
    text = "IC 680312-10-5524, call 011-2345 4821 or +60 11-2345 4821, pay Maybank 5123 4567 8812, email lim@pdrm-my.com"
    r = redact(text)
    for secret in ["680312-10-5524", "011-2345 4821", "5123 4567 8812", "lim@pdrm-my.com"]:
        assert secret not in r.text
    assert "[IC_1]" in r.text and "[EMAIL_1]" in r.text and "[ACCOUNT_1]" in r.text
    assert r.restore("[PHONE_1] / [ACCOUNT_1]") == "011-2345 4821 / 5123 4567 8812"


def test_keeps_links_amounts_and_short_numbers():
    r = redact("Claim RM 1,280 at https://lhdn-refund-my.com/claim before 5pm, kod 1234")
    assert "https://lhdn-refund-my.com/claim" in r.text and "1,280" in r.text and "1234" in r.text
    assert r.tokens == {}


def test_same_value_same_token():
    r = redact("011-2345 4821 ... call 011-2345 4821 again")
    assert r.text.count("[PHONE_1]") == 2 and len(r.tokens) == 1


# ---------- helpers ----------
def test_search_terms_use_local_formats():
    assert search_terms("phone", "+601123454821") == ["01123454821", "011-23454821"]
    assert search_terms("bank_account", "MBB:512345678812") == ["512345678812"]
    assert search_terms("app", "pkg:com.qorvanta.trade") == ["com.qorvanta.trade"]
    assert search_terms("url", "lhdn-refund-my.com/claim") == ["lhdn-refund-my.com"]


def test_mentions_matches_digits_across_formatting():
    assert mentions("Scam alert: 011-2345 4821 called my mother", ["01123454821"])
    assert not mentions("Call 011-2345 9999 for help", ["01123454821"])


def test_official_domains():
    assert official_domain("www.maybank2u.com.my") and official_domain("secure.hasil.gov.my")
    assert not official_domain("maybank2u-login.com.my") and not official_domain(
        "hasil.gov.my.verify-now.top"
    )


# ---------- flows (Nebius / Tavily mocked) ----------
@pytest.mark.asyncio
@respx.mock
async def test_classify_reattaches_tokens_and_never_sends_raw_pii():
    route = respx.post(f"{NEBIUS}/chat/completions").mock(
        return_value=llm_reply(
            {
                "scam_type": "macau_impersonation",
                "language": "ms",
                "urgency": True,
                "bank_change_language": False,
                "impersonating": "PDRM",
                "summary": {"en": "Fake police call.", "ms": "Panggilan polis palsu."},
                "roles": [
                    {"token": "[PHONE_1]", "role": "caller"},
                    {"token": "[ACCOUNT_1]", "role": "payee_account"},
                    {"token": "[IC_1]", "role": "unknown"},
                ],
            }
        )
    )
    out = await gateway().classify(
        "IC 680312-10-5524. Hubungi 011-2345 4821, pindah ke Maybank 5123 4567 8812"
    )
    sent = route.calls[0].request.content.decode()
    assert "680312" not in sent and "2345 4821" not in sent and "5123 4567" not in sent
    assert json.loads(sent)["chat_template_kwargs"] == {"enable_thinking": False}
    assert out.roles == [
        {"value": "011-2345 4821", "role": "caller"},
        {"value": "5123 4567 8812", "role": "payee_account"},
    ]
    assert out.needs_review is False


@pytest.mark.asyncio
@respx.mock
async def test_model_failure_falls_back_to_needs_review():
    respx.post(f"{NEBIUS}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})
    )
    out = await gateway().classify("hello 011-2345 4821")
    assert out.needs_review is True and out.scam_type == "other"


@pytest.mark.asyncio
@respx.mock
async def test_identifier_leads_require_a_real_mention_and_are_cached():
    tavily = respx.post("https://api.tavily.com/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Beware 011-2345 4821",
                        "url": "https://forum.my/a",
                        "content": "This number 011-2345 4821 called pretending to be PDRM",
                    },
                    {"title": "Scam tips", "url": "https://news.my/b", "content": "General advice on scams"},
                ]
            },
        )
    )
    respx.post(f"{NEBIUS}/chat/completions").mock(
        return_value=llm_reply(
            {
                "results": [
                    {"index": 0, "relevant": True, "scam_type": "macau_impersonation"},
                    {
                        "index": 1,
                        "relevant": True,
                        "scam_type": None,
                    },  # model too generous: no mention, so dropped
                ]
            }
        )
    )
    g = gateway()
    first = await g.identifier_leads("phone", "+601123454821")
    assert [lead.relevant for lead in first.leads] == [True, False]
    assert '"01123454821"' in json.loads(tavily.calls[0].request.content)["query"]
    second = await g.identifier_leads("phone", "+601123454821")
    assert second.cached is True and tavily.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_identical_screenshots_are_read_once_and_failures_are_not_cached():
    route = respx.post(f"{NEBIUS}/chat/completions").mock(
        side_effect=[
            httpx.Response(500),
            httpx.Response(500),
            llm_reply(
                {
                    "transcript": "Hubungi 011-2345 4821",
                    "scam_type": "macau_impersonation",
                    "language": "ms",
                    "urgency": True,
                    "impersonating": "PDRM",
                    "summary": {"en": "Fake police.", "ms": "Polis palsu."},
                }
            ),
        ]
    )
    g = gateway()
    first = await g.read_screenshot(b"same-image", "image/png")
    assert first.needs_review is True  # model down: nothing cached
    second = await g.read_screenshot(b"same-image", "image/png")
    third = await g.read_screenshot(b"same-image", "image/png")
    assert second.text == third.text == "Hubungi 011-2345 4821"
    assert route.call_count == 3  # 2 failed attempts + 1 success; the third read came from cache


def test_official_contact_requires_the_page_to_name_the_company():
    assert names_company("Contact Cemvora Trading Sdn. Bhd. at +603...", "Cemvora Trading Sdn Bhd")
    assert names_company("CEMVORA   TRADING, Klang", "Cemvora Trading Sdn Bhd")
    assert not names_company(
        "Cenviro Sdn Bhd, waste management. Call +603-27276100", "Cemvora Trading Sdn Bhd"
    )
    assert not names_company("Southern Latex Sdn Bhd gloves", "Glovexa Supply Sdn Bhd")


# ---------- case brief ----------
BRIEF = {
    "headline": {"en": "Mule paid", "ms": "Akaun keldai"},
    "modus_operandi": [],
    "money_trail": [],
    "red_flags": [],
    "recommended_actions": [],
    "referral": {"en": "To NSRC", "ms": "Kepada NSRC"},
    "gaps": [],
}


@respx.mock
async def test_case_brief_redacts_free_text_but_keeps_dates_and_masked_ids():
    route = respx.post(f"{NEBIUS}/chat/completions").mock(return_value=llm_reply(BRIEF))
    case = {
        "narrative": "He called from 011-2345 4821 and said pay Maybank 5123 4567 8812",
        "identifiers": [{"id": "entity:1", "masked": "+60 11-***-4821"}],
        "timeline": [
            {"id": "event:1", "at": "2026-10-18T06:48:18.764Z", "detail": "IC 680312-10-5524 shown"}
        ],
        "moneyTrail": [{"id": "hop:1", "at": "2026-10-18T06:48:18.764Z", "amountMyr": 48000}],
    }
    out = await gateway().case_brief(case)
    sent = json.loads(route.calls[0].request.content)["messages"][-1]["content"]
    for secret in ["011-2345 4821", "5123 4567 8812", "680312-10-5524"]:
        assert secret not in sent
    assert "2026-10-18T06:48:18.764Z" in sent and "+60 11-***-4821" in sent
    assert out["model"] == "ultra-model" and out["headline"]["en"] == "Mule paid"
    assert json.loads(route.calls[0].request.content)["chat_template_kwargs"] == {"enable_thinking": True}


@respx.mock
async def test_retry_after_runaway_json_samples_differently():
    runaway = httpx.Response(
        200,
        json={"choices": [{"message": {"content": '{"headline": {"en": "x"' + "\n" * 500}}], "usage": {}},
    )
    route = respx.post(f"{NEBIUS}/chat/completions").mock(side_effect=[runaway, llm_reply(BRIEF)])
    out = await gateway().case_brief({"narrative": "A short story", "timeline": []})
    assert out["headline"]["en"] == "Mule paid"
    temps = [json.loads(c.request.content)["temperature"] for c in route.calls]
    assert temps[0] == 0.3 and temps[1] > temps[0]  # briefs start warm; the retry samples more


def test_strip_ids_keeps_evidence_lists_and_line_breaks():
    from crowdshield_ml.services import strip_ids

    b = strip_ids(
        {
            "gaps": ["Victim's BSN account (entity:7) not in the case data."],
            "money_trail": [{"text": "RM 48,000 to MBB ****8812 (entity:3, hop:1).", "evidence": ["hop:1"]}],
            "referral": {
                "en": "1. Call from +60 11-***-4821 (entity:1).\n2. Paid hop:1 at 16:00.",
                "ms": "x",
            },
        }
    )
    assert b["gaps"] == ["Victim's BSN account not in the case data."]
    assert b["money_trail"][0] == {"text": "RM 48,000 to MBB ****8812.", "evidence": ["hop:1"]}
    assert b["referral"]["en"] == "1. Call from +60 11-***-4821.\n2. Paid at 16:00."
