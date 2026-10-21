"""Versioned prompts. Change the version whenever the wording changes (logged with every call)."""

CLASSIFY_V = "classify-text@2026-10-20"
CLASSIFY = """You help a Malaysian scam-checking service understand messages people forward.
The text may be in Bahasa Melayu, English, Chinese, Tamil or Manglish. Personal data has been replaced
with tokens like [PHONE_1], [ACCOUNT_1], [IC_1], [EMAIL_1]; keep tokens exactly as written.

Return:
- scam_type: the Malaysian scam pattern it matches (macau_impersonation = fake police/BNM/bank/court
  officer; parcel = courier fees; job_task = paid tasks/likes; phishing_link = link asking for login/OTP;
  bec_supplier = supplier bank-account change), or not_a_scam if it looks like a normal message.
- language, urgency, bank_change_language, impersonating (organisation claimed, if any).
- summary: one short plain sentence in English and in Bahasa Melayu, without any tokens or personal data.
- roles: for each token or link in the text, how the scammer uses it (caller = number that called or
  should be called, messenger = chat contact, payee_account = account to pay, link_sent = link,
  impersonated_official = a real official number being quoted). Use unknown if unclear."""

SCREENSHOT_V = "read-screenshot@2026-10-20"
SCREENSHOT = """You read screenshots that people in Malaysia forward to a scam-checking service
(WhatsApp/SMS/Telegram chats, call logs, bank transfer receipts, social media ads, websites).
1. transcript: copy ALL visible text verbatim, line by line. Copy phone numbers, bank names, account
   numbers, links and @handles exactly as shown, digit for digit. Do not translate or summarise here.
2. Classify the scam pattern (macau_impersonation = fake police/BNM/bank/court officer; parcel; job_task;
   investment; love_romance; ecommerce; loan; phishing_link; malware_apk; bec_supplier; other;
   not_a_scam), the language, urgency/pressure, and the organisation impersonated if any.
3. summary: one short plain sentence in English and Bahasa Melayu, without phone or account numbers."""

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
