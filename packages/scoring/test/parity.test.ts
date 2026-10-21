// Parity with the reference scoring.py: the four worked examples (architecture §8), then
// random cases scored by both implementations (needs python3 on PATH; skipped otherwise).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type EntityType,
  type Neighbour,
  type Observation,
  type Verification,
  HALF_LIFE_DAYS,
  pyRound,
  score,
  VERIFICATION_MULT,
} from "../src/index.js";

const NOW = new Date("2026-10-20T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const user = (
  reporterId: string,
  caseId: string,
  verification: Verification,
  days: number,
): Observation => ({
  sourceKind: "user_report",
  sourceWeight: 0.25,
  reporterTrust: 0.3,
  verification,
  observedAt: daysAgo(days),
  reporterId,
  caseId,
});

describe("worked examples (architecture §8, scoring.py __main__)", () => {
  const phone = { type: "phone" as const };
  const users = [user("u1", "c1", "unverified", 2), user("u2", "c2", "evidence_attached", 1)];
  const linked: Neighbour[] = [[0.5, 0.92]]; // same case as a bank-confirmed mule account
  const nsrc: Observation[] = [
    ...users,
    {
      sourceKind: "nsrc_case",
      sourceWeight: 0.85,
      reporterTrust: 1,
      verification: "confirmed",
      observedAt: daysAgo(1),
      reporterId: "nsrc",
      caseId: "c3",
    },
  ];

  it.each([
    ["two user reports only", users, [], false, 16, "reported"],
    ["+ linked to a bank-confirmed mule", users, linked, false, 47, "caution"],
    ["+ NSRC case reference", nsrc, linked, false, 99, "confirmed"],
    ["same, owner appeal upheld", nsrc, linked, true, 10, "reported"],
  ] as const)("%s → %i", (_, obs, nb, appealUpheld, risk, tier) => {
    expect(score(phone, [...obs], nb, { appealUpheld, now: NOW })).toMatchObject({ risk, tier });
  });

  it("protected official numbers are never scored as scams", () => {
    expect(score({ type: "phone", protected: true }, nsrc, linked, { now: NOW })).toMatchObject({
      risk: 0,
      tier: "protected_official",
    });
  });

  it("caps user reports alone at 59", () => {
    const many = Array.from({ length: 40 }, (_, i) => user(`u${i}`, `c${i}`, "confirmed", 0));
    expect(score(phone, many, [], { now: NOW })).toMatchObject({ risk: 59, tier: "caution" });
  });

  it("counts one vote per sybil cluster", () => {
    const sybil = Array.from({ length: 10 }, (_, i) => ({
      ...user(`u${i}`, `c${i}`, "unverified", 0),
      sybilCluster: "dev1",
    }));
    expect(score(phone, sybil, [], { now: NOW })).toMatchObject({ independentSources: 1 });
  });
});

describe("pyRound matches Python round()", () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [46.5, 46],
    [47.5, 48],
    [16.3, 16],
    [-0.5, -0],
  ])("%d → %d", (x, y) => {
    expect(pyRound(x)).toBe(y);
  });
});

// ---------- randomised cross-check against scoring.py ----------
const SCORING_PY = fileURLToPath(new URL("../../../scoring.py", import.meta.url));
const HARNESS = fileURLToPath(new URL("./parity.py", import.meta.url));
const hasPython = spawnSync("python3", ["--version"]).status === 0;

function rng(seed: number) {
  // mulberry32
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOURCES: [string, number][] = [
  ["pdrm_semakmule", 0.95],
  ["bank_confirmed", 0.9],
  ["nsrc_case", 0.85],
  ["regulator_alert", 0.8],
  ["threat_feed", 0.6],
  ["news_extraction", 0.5],
  ["user_report_verified", 0.4],
  ["user_report", 0.25],
  ["model_inference", 0],
];

function randomCase(r: () => number) {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const types = Object.keys(HALF_LIFE_DAYS) as EntityType[];
  const verifs = Object.keys(VERIFICATION_MULT) as Verification[];
  const userHeavy = r() < 0.5;
  const observations = Array.from({ length: Math.floor(r() * 8) }, () => {
    const [sourceKind, sourceWeight] = userHeavy && r() < 0.8 ? SOURCES[7]! : pick(SOURCES);
    return {
      sourceKind,
      sourceWeight,
      reporterTrust: pyRound(r(), 2),
      verification: pick(verifs),
      observedAt: daysAgo(Math.floor(r() * 800)).toISOString(),
      caseId: `c${Math.floor(r() * 5)}`,
      reporterId: r() < 0.7 ? `u${Math.floor(r() * 4)}` : null,
      sybilCluster: r() < 0.2 ? `s${Math.floor(r() * 2)}` : null,
    };
  });
  const neighbours: Neighbour[] =
    r() < 0.5
      ? []
      : Array.from({ length: 1 + Math.floor(r() * 3) }, (): Neighbour => [
          pyRound(r(), 2),
          pyRound(r(), 3),
        ]);
  return {
    entity: { type: pick(types), protected: r() < 0.05 },
    observations,
    neighbours,
    appealUpheld: r() < 0.1,
    now: NOW.toISOString(),
  };
}

describe.skipIf(!hasPython)("random cases match scoring.py", () => {
  it("500 cases", () => {
    const r = rng(20261020);
    const cases = Array.from({ length: 500 }, () => randomCase(r));
    const py = spawnSync("python3", ["-I", HARNESS, SCORING_PY], {
      input: JSON.stringify(cases),
      encoding: "utf8",
    });
    expect(py.status, py.stderr).toBe(0);
    const expected = JSON.parse(py.stdout) as Record<string, unknown>[];

    cases.forEach((c, i) => {
      const got = score(
        c.entity,
        c.observations.map((o) => ({ ...o, observedAt: new Date(o.observedAt) })),
        c.neighbours,
        { appealUpheld: c.appealUpheld, now: NOW },
      );
      const want = expected[i]!;
      const ctx = JSON.stringify(c);
      expect(got.risk, ctx).toBe(want.risk);
      expect(got.tier, ctx).toBe(want.tier);
      if ("confidence" in got) {
        expect(got.confidence, ctx).toBe(want.confidence);
        expect(got.pDirect, ctx).toBeCloseTo(want.p_direct as number, 3);
        expect(got.pGraph, ctx).toBeCloseTo(want.p_graph as number, 3);
        expect(got.independentSources, ctx).toBe(want.independent_sources);
      }
    });
  });
});
