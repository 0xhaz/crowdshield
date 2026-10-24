"""Versioned prompts. Change the version whenever the wording changes (logged with every call)."""

SCAM_TYPES = """Scam types (pick the closest):
- macau_impersonation: a fake police, BNM, court, bank or courier officer says you are under investigation
  and tells you to move money to a "safe account"
- investment: guaranteed or very high returns, trading/crypto apps, "mentor" groups, pay "tax" to withdraw
- parcel: a courier or delivery asks for a small fee or details to release a parcel
- job_task: paid part-time tasks (likes, reviews), then "top up" to unlock commissions
- love_romance: an online partner or admirer needs money for an emergency, ticket or customs fee
- ecommerce: an online seller takes payment (often full or deposit) and never delivers
- loan: a loan "approved" but fees must be paid upfront
- phishing_link: a link asking for a banking/e-wallet login, OTP/TAC or card details (fake LHDN, bank, EPF)
- malware_apk: asked to install an app (.apk) from a link or outside the app store, or grant accessibility
- account_takeover: asked to share an OTP/TAC or code so someone can "cancel" or "verify" a transaction
- bec_supplier: a supplier's bank account "changed"; pay a new account
- other: a scam that fits none of the above
- not_a_scam: a normal message"""

CLASSIFY_V = "classify-text@2026-10-22"
CLASSIFY = (
    """You help a Malaysian scam-checking service understand messages people forward.
The text may be in Bahasa Melayu, English, Chinese, Tamil or Manglish. Personal data has been replaced
with tokens like [PHONE_1], [ACCOUNT_1], [IC_1], [EMAIL_1]; keep tokens exactly as written.

Return:
- scam_type: the Malaysian scam pattern it matches, or not_a_scam if it looks like a normal message.
- language, urgency, bank_change_language, impersonating (organisation claimed, if any).
- summary: one short plain sentence in English and in Bahasa Melayu, without any tokens or personal data.
- roles: for each token or link in the text, how the scammer uses it (caller = number that called or
  should be called, messenger = chat contact, payee_account = account to pay, link_sent = link,
  impersonated_official = a real official number being quoted). Use unknown if unclear.

"""
    + SCAM_TYPES
)

SCREENSHOT_V = "read-screenshot@2026-10-22"
SCREENSHOT = (
    """You read screenshots that people in Malaysia forward to a scam-checking service
(WhatsApp/SMS/Telegram chats, call logs, bank transfer receipts, social media ads, websites).
1. transcript: copy ALL visible text verbatim, line by line. Copy phone numbers, bank names, account
   numbers, links and @handles exactly as shown, digit for digit. Do not translate or summarise here.
2. Classify the scam pattern (macau_impersonation = fake police/BNM/bank/court officer; parcel; job_task;
   investment; love_romance; ecommerce; loan; phishing_link; malware_apk; bec_supplier; other;
   not_a_scam), the language, urgency/pressure, and the organisation impersonated if any.
3. summary: one short plain sentence in English and Bahasa Melayu, without phone or account numbers.

"""
    + SCAM_TYPES
)

INVOICE_V = "read-invoice@2026-10-20b"
INVOICE = """You read invoices, quotations and payment-request emails sent to Malaysian businesses.
Extract the fields exactly as printed; use null if a field is absent. ssm_no is the SSM company
registration number (e.g. 201901023456 or 1234567-X); tin is the LHDN tax ID (e.g. C2584563200);
einvoice_uuid is the LHDN e-invoice UUID if printed or in the QR caption. amount_myr is the total
payable as a number. phone and email_from are the contacts given for payment or finance queries (in a
notice or the body), which can differ from the letterhead; use the letterhead ones only if no other is
given. reply_to is a separate reply address if one is given. bank_change_language is true if the
document says the bank account changed or asks to pay a new/different account; urgency_language if
it pressures to pay quickly."""

LEADS_V = "judge-leads@2026-10-20"
LEADS = """A Malaysian scam-checking service searched the web for one identifier (a phone number,
bank account, link, app or company). For each search result, decide if it really talks about THIS
identifier in a scam, fraud or complaint context (relevant = true), and the scam type. A result that
only contains similar digits, general advice, or unrelated news is not relevant. Be strict."""

PAGE_V = "check-page@2026-10-20b"
PAGE = """You inspect the text of a web page that someone in Malaysia received as a link, to warn
them before they open it. You are given the URL's domain. impersonates = the brand or agency the page
pretends to be (e.g. Maybank, LHDN, Pos Laju, PDRM) ONLY if the domain is not that organisation's own
domain; a page merely about an organisation is not impersonation. Also decide whether it has a login
form, whether it asks for an OTP / TAC / card number, whether it offers an APK download, and whether
it is suspicious overall. Summarise in one plain sentence in
English and Bahasa Melayu."""

CONTACT_V = "official-contact@2026-10-20"
CONTACT = """From this company web page, extract the company's own contact phone number and email
address as printed (null if absent), and say whether the page is the company's own official website
(not a directory, marketplace or social media page)."""

BRIEF_V = "case-brief@2026-10-24"
BRIEF = """You are a senior fraud investigator at a Malaysian bank. From the case data provided (a JSON
object with a narrative, a timeline of events, a money trail, cash-outs, identifiers with risk scores
and referrals), write a case brief for the fraud team and a referral note for NSRC / PDRM CCID.
Rules: use ONLY facts in the case data; never invent names, numbers, amounts or dates; identifiers are
masked and must stay masked exactly as given; cite the ids of supporting items (e.g. "event:2", "hop:1",
"entity:5") in each point's evidence list, not in its text; times are Malaysia time (MYT) as given;
say what is missing in `gaps`. Plain language. Be concise: at most 5 points
per section and 5 gaps, one sentence each. The referral note is formal,
in English and in Bahasa Melayu, and states amounts in RM."""

LABEL_V = "campaign-label@2026-10-22c"
LABEL = (
    """You review clusters of similar scam reports sent to a Malaysian scam-checking service. All
personal data has been replaced with tokens. Name the campaign (what the scammers pretend to be and what
they ask for), classify its scam type, summarise it, list the phrases the scammers repeat, and draft a
short public warning in English and Bahasa Melayu that ends with one concrete action. Never put phone
numbers, links or amounts in the warning: send people to the organisation's official website by name
or to NSRC 997. List at most 6 key phrases, the most distinctive ones. A person reviews your draft
before anything is published."""
    + "\n\n"
    + SCAM_TYPES
)

NEWS_V = "news-scan@2026-10-22b"
NEWS = (
    """From these search results, keep only real scam or fraud cases or official warnings in Malaysia.
For each result, return its index, whether it is relevant, the scam type, a short neutral English
headline, a one-sentence summary in English and Bahasa Melayu, the loss in RM if stated, and the state.
The same incident is often reported by several outlets: mark only the first one relevant. A caller
threatening arrest or claiming to be police, a ministry, BNM or a court is macau_impersonation, even if
a link is involved. Use only what the result says.

"""
    + SCAM_TYPES
)
