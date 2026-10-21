"""Model output schemas (strict JSON) and API responses."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ScamType = Literal[
    "macau_impersonation",
    "investment",
    "parcel",
    "job_task",
    "love_romance",
    "ecommerce",
    "loan",
    "phishing_link",
    "malware_apk",
    "account_takeover",
    "bec_supplier",
    "other",
    "not_a_scam",
]
Role = Literal[
    "caller",
    "messenger",
    "payee_account",
    "link_sent",
    "app_installed",
    "profile_used",
    "wallet_used",
    "impersonated_official",
    "unknown",
]
Language = Literal["ms", "en", "zh", "ta", "mixed"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Bilingual(Strict):
    en: str
    ms: str


# ---------- model outputs ----------
class RoleAssignment(Strict):
    token: str = Field(description="A redaction token from the text, e.g. [PHONE_1], or a link")
    role: Role


class TextClassification(Strict):
    scam_type: ScamType
    language: Language
    urgency: bool = Field(description="Pressure to act fast, threats, secrecy")
    bank_change_language: bool = Field(description="Says a bank account changed / pay a new account")
    impersonating: str | None = Field(
        description="Organisation the sender claims to be, e.g. PDRM, LHDN, Pos Laju"
    )
    summary: Bilingual = Field(description="One sentence, plain language, no personal data")
    roles: list[RoleAssignment]


class ScreenshotReading(Strict):
    transcript: str = Field(description="All visible text, verbatim, numbers/accounts/links exactly as shown")
    scam_type: ScamType
    language: Language
    urgency: bool
    impersonating: str | None
    summary: Bilingual


class InvoiceReading(Strict):
    supplier_name: str | None
    ssm_no: str | None
    tin: str | None
    bank: str | None
    account: str | None
    account_holder_name: str | None
    amount_myr: float | None
    invoice_no: str | None
    einvoice_uuid: str | None
    phone: str | None
    email_from: str | None
    reply_to: str | None
    bank_change_language: bool
    urgency_language: bool


class LeadJudgement(Strict):
    index: int
    relevant: bool = Field(
        description="True only if the result really talks about this identifier in a scam context"
    )
    scam_type: ScamType | None


class LeadJudgements(Strict):
    results: list[LeadJudgement]


class PageCheck(Strict):
    impersonates: str | None = Field(description="Brand or agency the page pretends to be, if any")
    has_login_form: bool
    asks_for_otp_or_card: bool
    has_apk_download: bool
    suspicious: bool
    summary: Bilingual


class OfficialContact(Strict):
    phone: str | None
    email: str | None
    is_official_site: bool = Field(description="The page is the company's own website")


# ---------- API responses ----------
class ClassifyResult(BaseModel):
    scam_type: ScamType
    language: Language
    urgency: bool
    bank_change_language: bool
    impersonating: str | None
    summary: Bilingual
    roles: list[dict]
    needs_review: bool = False
    prompt_version: str


class ScreenshotResult(BaseModel):
    text: str
    scam_type: ScamType
    language: Language
    urgency: bool
    impersonating: str | None
    summary: Bilingual
    needs_review: bool = False
    prompt_version: str


class Lead(BaseModel):
    title: str
    url: str
    snippet: str
    published_at: str | None = None
    scam_type: ScamType | None = None
    relevant: bool


class WebLeads(BaseModel):
    query: str
    leads: list[Lead]
    cached: bool
    fetched_at: str


class UrlCheckResult(BaseModel):
    url: str
    fetched: bool
    title: str | None
    page_check: PageCheck | None
    cached: bool
    fetched_at: str


class SupplierWeb(BaseModel):
    official_contact: dict | None
    reputation: list[Lead]
    cached: bool
    fetched_at: str


# ---------- Phase 7: case brief (Ultra), campaign labels, news ----------
class BriefPoint(Strict):
    text: str
    evidence: list[str] = Field(
        description="Ids from the case data that support this point, e.g. ['event:3', 'hop:1']"
    )


class CaseBrief(Strict):
    headline: Bilingual = Field(description="One sentence: what happened, to whom (no names), how much")
    modus_operandi: list[BriefPoint] = Field(description="How the scam worked, step by step")
    money_trail: list[BriefPoint] = Field(description="Where the money went and what was frozen")
    red_flags: list[BriefPoint]
    recommended_actions: list[BriefPoint] = Field(description="Concrete next steps for the bank's fraud team")
    referral: Bilingual = Field(
        description="A short referral note to NSRC / PDRM CCID, factual, from the case data only"
    )
    gaps: list[str] = Field(description="Information missing from the case that investigators will need")


class CampaignLabel(Strict):
    label: str = Field(
        description="Short campaign name, max 60 characters, e.g. 'Fake EPF withdrawal call, Oct 2026'"
    )
    scam_type: ScamType
    summary: Bilingual
    key_phrases: list[str] = Field(description="3-6 phrases the scammers repeat, in the original language")
    warning: Bilingual = Field(
        description="A draft public warning, one or two plain sentences, for human review"
    )


class NewsItem(Strict):
    index: int
    relevant: bool = Field(description="A real scam or fraud case or warning in Malaysia")
    scam_type: ScamType | None
    headline: str = Field(description="Short neutral headline in English")
    summary: Bilingual
    loss_myr: float | None = Field(description="Total loss in RM if the article states it")
    state: str | None = Field(description="Malaysian state if stated")


class NewsItems(Strict):
    items: list[NewsItem]
