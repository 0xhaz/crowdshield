// TypeScript port of scoring.py (reference risk scoring for the scam intelligence graph).
// Keep this 1:1 with scoring.py; test/parity.test.ts checks both against each other.
// Weights are illustrative and will be tuned on outcomes.

export type EntityType =
  | "phone"
  | "whatsapp"
  | "telegram"
  | "bank_account"
  | "ewallet"
  | "url"
  | "domain"
  | "app"
  | "social_profile"
  | "crypto_wallet";

export type Verification =
  "unverified" | "evidence_attached" | "reviewed" | "confirmed" | "rejected";

export type Tier = "confirmed" | "high" | "caution" | "reported" | "no_known_risk";

export const MODEL_VERSION = "scoring-v1";

// Numbers get recycled; app hashes don't.
export const HALF_LIFE_DAYS: Record<EntityType, number> = {
  phone: 90,
  whatsapp: 90,
  telegram: 120,
  bank_account: 365,
  ewallet: 365,
  url: 30,
  domain: 120,
  app: 3650,
  social_profile: 180,
  crypto_wallet: 730,
};
export const VERIFICATION_MULT: Record<Verification, number> = {
  unverified: 1.0,
  evidence_attached: 1.3,
  reviewed: 1.6,
  confirmed: 2.0,
  rejected: 0.0,
};
export const USER_ONLY_CAP = 59; // user reports alone can never exceed "caution"
export const BETA = 0.8; // how much graph evidence counts vs direct
export const TIERS: readonly (readonly [number, Tier])[] = [
  [85, "confirmed"],
  [60, "high"],
  [30, "caution"],
  [1, "reported"],
  [0, "no_known_risk"],
];
export const PROTECTED_NOTE = "Official number, may be spoofed: hang up and call back";

export interface Observation {
  sourceKind: string;
  sourceWeight: number;
  reporterTrust: number;
  verification: Verification;
  observedAt: Date;
  caseId: string;
  reporterId?: string | null;
  sybilCluster?: string | null;
}

/** [alpha_edge, p_direct_neighbour]. One hop here; the nightly GPU job does two. */
export type Neighbour = readonly [alpha: number, pDirect: number];

export type ScoreResult =
  | { risk: 0; tier: "protected_official"; note: string }
  | {
      risk: number;
      tier: Tier;
      confidence: "low" | "medium" | "high";
      pDirect: number;
      pGraph: number;
      independentSources: number;
    };

const DAY_MS = 86_400_000;

const isUserReport = (o: Observation) => o.sourceKind.startsWith("user_report");

const prod = (xs: number[]) => xs.reduce((acc, x) => acc * x, 1);

/** Python's round(): half to even. */
export function pyRound(x: number, digits = 0): number {
  const f = 10 ** digits;
  const y = x * f;
  const r = Math.round(y);
  const rounded = Math.abs(y % 1) === 0.5 ? 2 * Math.round(y / 2) : r;
  return rounded / f;
}

export function decay(entityType: EntityType, observedAt: Date, now: Date): number {
  // timedelta.days floors towards negative infinity, like Math.floor
  const age = Math.floor((now.getTime() - observedAt.getTime()) / DAY_MS);
  return 0.5 ** (age / HALF_LIFE_DAYS[entityType]);
}

/** w = base source weight x reporter trust (user sources only) x verification x recency. */
export function observationWeight(obs: Observation, entityType: EntityType, now: Date): number {
  let w = obs.sourceWeight;
  if (isUserReport(obs)) w *= obs.reporterTrust;
  w *= VERIFICATION_MULT[obs.verification];
  w *= decay(entityType, obs.observedAt, now);
  return Math.min(w, 0.99);
}

/** Noisy-OR over independent evidence; one vote per reporter and per sybil cluster. */
export function directProbability(observations: Observation[], entityType: EntityType, now: Date) {
  const best = new Map<string, number>();
  for (const o of observations) {
    const key = o.sybilCluster || o.reporterId || `${o.sourceKind}|${o.caseId}`;
    best.set(key, Math.max(best.get(key) ?? 0, observationWeight(o, entityType, now)));
  }
  const p = 1 - prod([...best.values()].map((w) => 1 - w));
  const userOnly = observations.every(isUserReport);
  return { p, userOnly, nIndependent: best.size };
}

export function graphProbability(neighbours: readonly Neighbour[]): number {
  return 1 - prod(neighbours.map(([a, p]) => 1 - a * p));
}

export function score(
  entity: { type: EntityType; protected?: boolean },
  observations: Observation[],
  neighbours: readonly Neighbour[],
  options: { appealUpheld?: boolean; now?: Date } = {},
): ScoreResult {
  const now = options.now ?? new Date();
  if (entity.protected) {
    // official numbers that scammers spoof
    return { risk: 0, tier: "protected_official", note: PROTECTED_NOTE };
  }
  const { p: pD, userOnly, nIndependent } = directProbability(observations, entity.type, now);
  const pG = graphProbability(neighbours);
  const clearing = options.appealUpheld ? 0.1 : 1.0;
  let risk = 100 * (1 - (1 - pD) * (1 - BETA * pG)) * clearing;
  if (userOnly && neighbours.length === 0) risk = Math.min(risk, USER_ONLY_CAP);
  risk = pyRound(risk);
  const tier = TIERS.find(([cut]) => risk >= cut)![1];
  const confidence =
    nIndependent >= 3 || pD > 0.8 ? "high" : nIndependent >= 2 || pG > 0.5 ? "medium" : "low";
  return {
    risk,
    tier,
    confidence,
    pDirect: pyRound(pD, 3),
    pGraph: pyRound(pG, 3),
    independentSources: nIndependent,
  };
}
