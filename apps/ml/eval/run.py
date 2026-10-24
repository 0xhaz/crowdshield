"""Model evaluation for scam classification on the gold set (eval/gold.jsonl).

Runs the production classify step (redaction + prompt + strict JSON schema) against several Nemotron
models on Nebius Token Factory, with reasoning on and off, and writes docs/model-eval.md.
Usage: uv run python eval/run.py   (needs NEBIUS_API_KEY / NEBIUS_BASE_URL in the repo .env)
"""

import asyncio
import json
import statistics
import time
from pathlib import Path

from crowdshield_ml import prompts
from crowdshield_ml.config import load_root_env
from crowdshield_ml.llm import LlmError, NebiusClient
from crowdshield_ml.redact import redact
from crowdshield_ml.schemas import TextClassification

HERE = Path(__file__).parent
ROOT = HERE.parents[2]

# The classify prompt before 22 Oct defined only 5 of the 12 scam types (baseline for the prompt fix)
CLASSIFY_PREV = """You help a Malaysian scam-checking service understand messages people forward.
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

SUPER = "nvidia/nemotron-3-super-120b-a12b"
ULTRA = "nvidia/Nemotron-3-Ultra-550b-a55b"
# (name, model, reasoning, options)
CONFIGS = [
    ("Super, previous prompt (5 of 12 types defined)", SUPER, False, {"prompt": CLASSIFY_PREV}),
    ("Super, relaxed enum decoding", SUPER, False, {"strict": False}),
    ("Nemotron 3.5 Lightning", "nvidia/Nemotron-3_5-Lightning", False, {}),
    ("Nemotron 3 Nano 30B", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", False, {}),
    ("Nemotron 3 Super 120B", SUPER, False, {}),
    ("Nemotron 3 Super 120B + reasoning", SUPER, True, {}),
    ("Nemotron 3 Ultra 550B", ULTRA, False, {}),
    ("Nemotron 3 Ultra 550B + reasoning", ULTRA, True, {}),
]

# Realistically ambiguous items accept a second label
ACCEPT = {
    2: {"parcel"},  # Macau-style call that opens as a courier/customs story
    12: {"phishing_link"},  # parcel fee page asking for card + OTP
    32: {"phishing_link"},  # OTP-sharing call
    33: {"phishing_link"},
}


async def classify(llm: NebiusClient, model: str, thinking: bool, text: str, opts: dict):
    red = redact(text)
    t = time.perf_counter()
    out = await llm.json(
        model,
        opts.get("prompt", prompts.CLASSIFY),
        red.text,
        TextClassification,
        prompt_version=prompts.CLASSIFY_V,
        max_tokens=4000 if thinking else 1200,
        thinking=thinking,
        strict_enums=opts.get("strict", True),
    )
    return out, (time.perf_counter() - t) * 1000


async def run_config(llm, name, model, thinking, gold, opts):
    sem = asyncio.Semaphore(4)
    rows = []

    async def one(item):
        async with sem:
            try:
                out, ms = await classify(llm, model, thinking, item["text"], opts)
                got = out.scam_type
            except LlmError:
                got, ms = "error", None
            ok = got == item["expected"] or got in ACCEPT.get(item["id"], set())
            rows.append({**item, "got": got, "ok": ok, "ms": ms})

    await asyncio.gather(*(one(i) for i in gold))
    rows.sort(key=lambda r: r["id"])
    lat = [r["ms"] for r in rows if r["ms"] is not None]
    scam_ok = sum(
        (r["got"] != "not_a_scam") == (r["expected"] != "not_a_scam") for r in rows if r["got"] != "error"
    )
    by_lang = {}
    for lang in ("ms", "en", "mixed", "zh"):
        sub = [r for r in rows if r["lang"] == lang]
        by_lang[lang] = sum(r["ok"] for r in sub) / len(sub) if sub else None
    return {
        "name": name,
        "model": model,
        "reasoning": thinking,
        "options": {k: v for k, v in opts.items() if k != "prompt"},
        "accuracy": sum(r["ok"] for r in rows) / len(rows),
        "scam_vs_normal": scam_ok / len(rows),
        "false_alarms": sum(
            r["expected"] == "not_a_scam" and r["got"] not in ("not_a_scam", "error") for r in rows
        ),
        "missed_scams": sum(r["expected"] != "not_a_scam" and r["got"] == "not_a_scam" for r in rows),
        "errors": sum(r["got"] == "error" for r in rows),
        "p50_ms": statistics.median(lat) if lat else None,
        "p95_ms": sorted(lat)[int(len(lat) * 0.95) - 1] if lat else None,
        "by_lang": by_lang,
        "rows": rows,
    }


def pct(x):
    return "—" if x is None else f"{x * 100:.0f}%"


def write_report(results, n, run_date=None):
    lines = [
        "# Model evaluation: scam classification",
        "",
        f"Generated by `apps/ml/eval/run.py` on {run_date or time.strftime('%Y-%m-%d')} against Nebius Token Factory. "
        f"Gold set: {n} hand-labelled messages (`apps/ml/eval/gold.jsonl`): 15 Malay, 15 English, "
        "8 mixed Malay-English, 3 Chinese; 12 scam types plus 8 normal messages as controls. "
        "Same redaction, prompt and "
        "strict JSON schema as production. Latency is end-to-end from the development machine (single run, "
        "4 concurrent requests), so treat it as relative.",
        "",
        "| Model | Reasoning | Scam type correct | Scam vs normal | False alarms | Missed scams | Invalid output | p50 | p95 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['name'].replace(' + reasoning', '')} | {'on' if r['reasoning'] else 'off'} | {pct(r['accuracy'])} | "
            f"{pct(r['scam_vs_normal'])} | {r['false_alarms']} / 8 | {r['missed_scams']} / {n - 8} | {r['errors']} / {n} | "
            f"{(r['p50_ms'] or 0) / 1000:.1f} s | {(r['p95_ms'] or 0) / 1000:.1f} s |"
        )
    lines += [
        "",
        "**Scam type correct, by language**",
        "",
        "| Model | Reasoning | Malay | English | Mixed Malay-English | Chinese |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        b = r["by_lang"]
        lines.append(
            f"| {r['name'].replace(' + reasoning', '')} | {'on' if r['reasoning'] else 'off'} | {pct(b['ms'])} | {pct(b['en'])} | {pct(b['mixed'])} | {pct(b['zh'])} |"
        )
    lines += ["", "**Misclassified items** (id: expected → got)", ""]
    for r in results:
        wrong = [f"{x['id']}: {x['expected']} → {x['got']}" for x in r["rows"] if not x["ok"]]
        lines.append(f"- {r['name']}: " + ("none" if not wrong else "; ".join(wrong)))
    (ROOT / "docs" / "model-eval.md").write_text("\n".join(lines) + "\n")


async def main():
    import os

    load_root_env()
    llm = NebiusClient(os.environ["NEBIUS_BASE_URL"].rstrip("/"), os.environ["NEBIUS_API_KEY"])
    gold = [json.loads(line) for line in (HERE / "gold.jsonl").read_text().splitlines() if line.strip()]
    results = []
    for name, model, thinking, opts in CONFIGS:
        t = time.perf_counter()
        r = await run_config(llm, name, model, thinking, gold, opts)
        results.append(r)
        print(
            f"{name:<36} acc {pct(r['accuracy']):>4}  scam/normal {pct(r['scam_vs_normal']):>4}  "
            f"FA {r['false_alarms']}  miss {r['missed_scams']}  err {r['errors']}  p50 {(r['p50_ms'] or 0):.0f} ms  "
            f"({time.perf_counter() - t:.0f} s)"
        )
    (HERE / "results.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
    write_report(results, len(gold))
    print("wrote docs/model-eval.md")


if __name__ == "__main__":
    import sys

    if "--report-only" in sys.argv:  # re-render docs/model-eval.md from eval/results.json
        # keep the date the models were actually run, not today's
        saved_at = time.strftime("%Y-%m-%d", time.localtime((HERE / "results.json").stat().st_mtime))
        saved = json.loads((HERE / "results.json").read_text())
        write_report(saved, len(saved[0]["rows"]), saved_at)
    else:
        asyncio.run(main())
