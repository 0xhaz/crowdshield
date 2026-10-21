"""Redaction before any text goes to Nebius (techstacks §3).

IC numbers, phone numbers, bank/e-wallet account numbers and email addresses are replaced with
tokens like [PHONE_1]; the mapping stays in this process and is re-attached to the model output.
Links, company names and app names are public and are kept, because the model needs them.
Personal names are not caught by regex; a small NER model is the planned next step.
"""

import re
from dataclasses import dataclass, field

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("IC", re.compile(r"(?<!\d)\d{6}-?\d{2}-?\d{4}(?!\d)")),
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("PHONE", re.compile(r"(?<![\d+])(?:\+?60[\s-]?|\(?0)1\d\)?[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")),
    ("PHONE", re.compile(r"(?<![\d+])(?:\+?60[\s-]?|\(?0)[3-9]\d?\)?[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")),
    ("PHONE", re.compile(r"(?<![\d])\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}(?:[\s-]?\d{3,4})?(?!\d)")),
    ("ACCOUNT", re.compile(r"(?<![\d])\d[\d\s-]{6,20}\d(?![\d])")),
]


@dataclass
class Redacted:
    text: str
    tokens: dict[str, str] = field(default_factory=dict)

    def restore(self, value: str) -> str:
        """Replace tokens in a model output string with the original values."""
        for token, original in self.tokens.items():
            value = value.replace(token, original)
        return value


def redact(text: str) -> Redacted:
    tokens: dict[str, str] = {}
    seen: dict[str, str] = {}
    counters: dict[str, int] = {}

    def make_sub(kind: str):
        def sub(m: re.Match[str]) -> str:
            original = m.group(0)
            if original.strip().isdigit() and len(re.sub(r"\D", "", original)) < 7:
                return original
            if original in seen:
                return seen[original]
            counters[kind] = counters.get(kind, 0) + 1
            token = f"[{kind}_{counters[kind]}]"
            seen[original] = token
            tokens[token] = original
            return token

        return sub

    out = text
    for kind, pattern in PATTERNS:
        out = pattern.sub(make_sub(kind), out)
    return Redacted(out, tokens)
