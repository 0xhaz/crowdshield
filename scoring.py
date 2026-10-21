"""Reference scoring for the scam intelligence graph (illustrative weights, tune on outcomes)."""
import math
from collections import defaultdict
from datetime import datetime, timezone

HALF_LIFE_DAYS = {  # numbers get recycled; app hashes don't
    "phone": 90, "whatsapp": 90, "telegram": 120, "bank_account": 365, "ewallet": 365,
    "url": 30, "domain": 120, "app": 3650, "social_profile": 180, "crypto_wallet": 730,
}
VERIFICATION_MULT = {"unverified": 1.0, "evidence_attached": 1.3, "reviewed": 1.6, "confirmed": 2.0, "rejected": 0.0}
USER_ONLY_CAP = 59          # user reports alone can never exceed "caution"
BETA = 0.8                  # how much graph evidence counts vs direct
TIERS = [(85, "confirmed"), (60, "high"), (30, "caution"), (1, "reported"), (0, "no_known_risk")]


def decay(entity_type, observed_at, now):
    age = (now - observed_at).days
    return 0.5 ** (age / HALF_LIFE_DAYS[entity_type])


def observation_weight(obs, entity_type, now):
    """w = base source weight x reporter trust (user sources only) x verification x recency."""
    w = obs["source_weight"]
    if obs["source_kind"].startswith("user_report"):
        w *= obs["reporter_trust"]
    w *= VERIFICATION_MULT[obs["verification"]]
    w *= decay(entity_type, obs["observed_at"], now)
    return min(w, 0.99)


def direct_probability(observations, entity_type, now):
    """Noisy-OR over independent evidence; one vote per reporter and per sybil cluster."""
    best = {}
    for o in observations:
        key = o.get("sybil_cluster") or o.get("reporter_id") or (o["source_kind"], o["case_id"])
        best[key] = max(best.get(key, 0.0), observation_weight(o, entity_type, now))
    p = 1.0 - math.prod(1.0 - w for w in best.values())
    user_only = all(o["source_kind"].startswith("user_report") for o in observations)
    return p, user_only, len(best)


def graph_probability(neighbours):
    """neighbours: list of (alpha_edge, p_direct_neighbour). One hop here; nightly GPU job does two."""
    return 1.0 - math.prod(1.0 - a * p for a, p in neighbours)


def score(entity, observations, neighbours, appeal_upheld=False, now=None):
    now = now or datetime.now(timezone.utc)
    if entity.get("protected"):          # official numbers that scammers spoof
        return {"risk": 0, "tier": "protected_official", "note": "Official number, may be spoofed: hang up and call back"}
    p_d, user_only, n_indep = direct_probability(observations, entity["type"], now)
    p_g = graph_probability(neighbours)
    clearing = 0.1 if appeal_upheld else 1.0
    risk = 100 * (1 - (1 - p_d) * (1 - BETA * p_g)) * clearing
    if user_only and not neighbours:
        risk = min(risk, USER_ONLY_CAP)
    risk = round(risk)
    tier = next(t for cut, t in TIERS if risk >= cut)
    confidence = "high" if n_indep >= 3 or p_d > 0.8 else "medium" if n_indep >= 2 or p_g > 0.5 else "low"
    return {"risk": risk, "tier": tier, "confidence": confidence,
            "p_direct": round(p_d, 3), "p_graph": round(p_g, 3), "independent_sources": n_indep}


if __name__ == "__main__":
    now = datetime(2026, 10, 20, tzinfo=timezone.utc)
    d = lambda days: datetime(2026, 10, 20 - days, tzinfo=timezone.utc)
    phone = {"type": "phone"}
    users = [
        {"source_kind": "user_report", "source_weight": 0.25, "reporter_trust": 0.3, "verification": "unverified",
         "observed_at": d(2), "reporter_id": "u1", "case_id": "c1"},
        {"source_kind": "user_report", "source_weight": 0.25, "reporter_trust": 0.3, "verification": "evidence_attached",
         "observed_at": d(1), "reporter_id": "u2", "case_id": "c2"},
    ]
    print("1. Two user reports only:          ", score(phone, users, []))
    linked = [(0.5, 0.92)]  # same case as a bank-confirmed mule account
    print("2. + linked to confirmed mule acct:", score(phone, users, linked))
    nsrc = users + [{"source_kind": "nsrc_case", "source_weight": 0.85, "reporter_trust": 1, "verification": "confirmed",
                     "observed_at": d(1), "reporter_id": "nsrc", "case_id": "c3"}]
    print("3. + NSRC case reference:          ", score(phone, nsrc, linked))
    print("4. Same, owner appeal upheld:      ", score(phone, nsrc, linked, appeal_upheld=True))
