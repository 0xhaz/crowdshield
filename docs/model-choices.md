# Model choices and trade-offs

CrowdShield uses NVIDIA Nemotron models on Nebius Token Factory for what models are good at: reading, classifying, searching and drafting. **Decisions stay deterministic:** risk scores come from the evidence graph (noisy-OR plus one-hop propagation, parity-tested against `scoring.py`), and payment decisions never wait on a model. A payee check takes 5 ms at p95 with no model in the path.

## Where each model is used

| Task | Model on Token Factory | Reasoning | Why |
|---|---|---|---|
| Classify a forwarded message (scam type, roles, language) | Nemotron 3 Ultra 550B | off | Most accurate (41/41) **and** fastest (p50 1.1 s) in our evaluation |
| Read a scam screenshot (verbatim transcript + classification) | Nemotron 3.5 Super VL | off | The vision model; keeps phone and account digits exact |
| Read an invoice PDF or image (supplier, SSM, TIN, bank, amount) | Nemotron 3.5 Super VL | off | PDF pages rendered with PyMuPDF; strict schema for every field |
| Judge web search results, inspect link pages, find official contacts | Nemotron 3 Ultra 550B | off | Interactive: follow-up messages in the bot |
| **Case brief** for the fraud team + NSRC/PDRM referral note (BM/EN) | Nemotron 3 Ultra 550B | **on** | Long, multi-source reasoning over the timeline, money trail and evidence; must cite evidence ids |
| **Label a new scam campaign** + draft a public warning | Nemotron 3 Ultra 550B | **on** | Abstracting many reports into one pattern; a person approves the warning |
| News scan ("scams in the news this week") | Nemotron 3 Super 120B | off | Batch, not latency-sensitive |
| Similarity of scam scripts (campaign matching and detection) | Qwen3-Embedding-8B (1024 dims) | n/a | Multilingual embeddings into pgvector (HNSW) |

Routing lives in `apps/ml/src/crowdshield_ml/config.py` and can be overridden per task (`ROUTE_CLASSIFY=super` …). Every response carries an **AI trace** (model, prompt version, time, tokens, reasoning on/off, cache hit), and the web app and bot show it.

## What we measured (`docs/model-eval.md`)

41 hand-labelled messages: Bahasa Melayu, English, Manglish and Chinese, 12 scam types plus normal messages.

1. **The prompt mattered more than the model.** Our first classify prompt defined only 5 of the 12 scam types. Super scored **68%**, mislabelling investment scams as "job tasks" and love scams as "parcels". With every type defined in one line each, the same model scored **100%**.
2. **Strict schema decoding stays on.** Relaxing enums to free strings (validated afterwards) produced invalid nested values in 40 of 41 answers. With good definitions, strict decoding is accurate and always parses.
3. **Reasoning doesn't help classification.** Super with reasoning was as accurate as without, but 2.5× slower; Ultra with reasoning slipped to 98%. We turn reasoning off for interactive tasks (`chat_template_kwargs.enable_thinking=false`, measured 0.7–0.9 s vs ~2.3 s per call) and on only where the task needs it.
4. **Long structured outputs need a little temperature.** With strict JSON decoding at temperature 0, Ultra's case brief sometimes ran away (blank lines until the token limit) on 2 of 3 fresh cases, and a temperature-0 retry repeated it. Starting long free-text tasks (brief, campaign labels) at 0.3 fixed it: 4 of 4 fresh briefs first time, 7–11 s. Classification stays at 0.
5. **Bigger can be faster.** Ultra (550B MoE, ~55B active) returned faster than Super and Lightning on Token Factory in our runs, so it handles the interactive text tasks. Lightning and Nano scored 93%: good fallbacks if cost becomes the constraint.

## Privacy and safety choices around the models

- **Redaction before any text model:** IC numbers, phone numbers, account numbers and emails become tokens (`[PHONE_1]`) and are mapped back afterwards. Tests check none reach the request. Screenshots and invoices are images, so they go as-is; this relies on Token Factory's zero data retention and is in scope for the PDPA review.
- **Models never decide risk.** An "AI model guess" has evidence weight 0.00 in the scoring; web search results are shown as cited leads, not evidence.
- **Exact duplicates skip the model.** The same screenshot or invoice, by SHA-256, is read once (architecture §10), which also makes the demo resilient.
- **Guard rails on web intelligence:** a lead counts only if the result actually mentions the identifier; official domains are never flagged as impersonation; an "official contact" is accepted only if the page names the company.
- **Failures degrade safely:** schema-invalid output is retried once, then becomes "needs human review", never a guess.
