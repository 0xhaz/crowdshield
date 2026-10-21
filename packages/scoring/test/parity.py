"""Parity harness: reads JSON cases on stdin, scores each with the reference scoring.py, prints JSON.

Run with `python3 -I parity.py <path to scoring.py>` (the TS parity test does this).
"""
import importlib.util
import json
import sys
from datetime import datetime

spec = importlib.util.spec_from_file_location("scoring", sys.argv[1])
scoring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scoring)


def parse(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


out = []
for case in json.load(sys.stdin):
    obs = [
        {
            "source_kind": o["sourceKind"],
            "source_weight": o["sourceWeight"],
            "reporter_trust": o["reporterTrust"],
            "verification": o["verification"],
            "observed_at": parse(o["observedAt"]),
            "case_id": o["caseId"],
            "reporter_id": o.get("reporterId"),
            "sybil_cluster": o.get("sybilCluster"),
        }
        for o in case["observations"]
    ]
    neighbours = [tuple(n) for n in case["neighbours"]]
    r = scoring.score(case["entity"], obs, neighbours, case["appealUpheld"], parse(case["now"]))
    out.append(r)
print(json.dumps(out))
