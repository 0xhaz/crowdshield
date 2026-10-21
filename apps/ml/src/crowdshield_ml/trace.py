"""Per-request trace of model and web calls: shown to users as the "AI trace" (model, time,
prompt version, tokens). Collected through a context variable so call sites stay unchanged."""

import time
from contextlib import contextmanager
from contextvars import ContextVar

_calls: ContextVar[list[dict] | None] = ContextVar("crowdshield_trace", default=None)


def record(entry: dict) -> None:
    calls = _calls.get()
    if calls is not None:
        calls.append(entry)


@contextmanager
def collect():
    """Collects every recorded call made inside the block (one request)."""
    calls: list[dict] = []
    token = _calls.set(calls)
    started = time.perf_counter()
    box = {"calls": calls}
    try:
        yield box
    finally:
        box["total_ms"] = round((time.perf_counter() - started) * 1000)
        _calls.reset(token)
