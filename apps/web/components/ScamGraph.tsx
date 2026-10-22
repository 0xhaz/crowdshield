"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The demo story as a graph: one report links a mule account to a known scam caller, and the
// bank, other banks and a business are protected from it. Numbers are the demo's real scores.

type Tone = "confirmed" | "high" | "caution" | "info" | "person" | "business";
type NodeId = "reports" | "caller" | "retiree" | "mule" | "customer" | "cimb" | "hlb" | "shop";
type Pos = { x: number; y: number };

const TONE: Record<Tone, { fill: string; stroke: string; text: string }> = {
  confirmed: { fill: "#FEF3F2", stroke: "#D92D20", text: "#B42318" },
  high: { fill: "#FFF4ED", stroke: "#EC4A0A", text: "#B93815" },
  caution: { fill: "#FFFAEB", stroke: "#DC9F00", text: "#93370D" },
  info: { fill: "#EFF8FF", stroke: "#2E90FA", text: "#175CD3" },
  person: { fill: "#F9FAFB", stroke: "#98A2B3", text: "#344054" },
  business: { fill: "#F6FEF9", stroke: "#039855", text: "#027A48" },
};

/** Wide layout for desktop, tall for phones (so labels stay readable). */
const POS: Record<NodeId, { wide: Pos; tall: Pos }> = {
  reports: { wide: { x: 130, y: 70 }, tall: { x: 110, y: 70 } },
  caller: { wide: { x: 180, y: 250 }, tall: { x: 110, y: 230 } },
  retiree: { wide: { x: 230, y: 430 }, tall: { x: 110, y: 420 } },
  mule: { wide: { x: 500, y: 300 }, tall: { x: 390, y: 420 } },
  customer: { wide: { x: 520, y: 90 }, tall: { x: 390, y: 230 } },
  cimb: { wide: { x: 800, y: 210 }, tall: { x: 110, y: 620 } },
  hlb: { wide: { x: 800, y: 400 }, tall: { x: 390, y: 620 } },
  shop: { wide: { x: 800, y: 70 }, tall: { x: 110, y: 800 } },
};

type NodeState = { label: string; sub: string; tone: Tone };
type Edge = { from: NodeId; to: NodeId; label: string; kind: "solid" | "dashed" | "money" };
type Step = {
  caption: string;
  nodes: Partial<Record<NodeId, NodeState>>;
  edges: Edge[];
  focus: NodeId;
};

const CALLER: NodeState = {
  label: "+60 11-***-4821",
  sub: "Confirmed scam · 100",
  tone: "confirmed",
};
const REPORTS: NodeState = { label: "37 public reports", sub: "+ 1 NSRC 997 case", tone: "info" };
const RETIREE: NodeState = {
  label: "Retiree’s report",
  sub: "paid after the call",
  tone: "person",
};
const BASE_EDGES: Edge[] = [{ from: "reports", to: "caller", label: "reported", kind: "solid" }];
const LINK_EDGES: Edge[] = [
  ...BASE_EDGES,
  { from: "retiree", to: "mule", label: "paid", kind: "money" },
  { from: "caller", to: "mule", label: "same scam", kind: "solid" },
];

const STEPS: Step[] = [
  {
    caption: "A scam caller is already known: 37 people and an NSRC case reported it.",
    nodes: { reports: REPORTS, caller: CALLER },
    edges: BASE_EDGES,
    focus: "caller",
  },
  {
    caption:
      "A retiree reports she paid MBB ****8812 after that call. The account inherits risk from the caller.",
    nodes: {
      reports: REPORTS,
      caller: CALLER,
      retiree: RETIREE,
      mule: { label: "MBB ****8812", sub: "Be careful · 47", tone: "caution" },
    },
    edges: LINK_EDGES,
    focus: "mule",
  },
  {
    caption:
      "Another customer tries to pay it while on a call with the same number. Payee + live call = 79: the bank pauses the transfer.",
    nodes: {
      reports: REPORTS,
      caller: CALLER,
      retiree: RETIREE,
      mule: { label: "MBB ****8812", sub: "High · 79 · paused", tone: "high" },
      customer: { label: "Customer on a call", sub: "transfer RM 25,000", tone: "person" },
    },
    edges: [
      ...LINK_EDGES,
      { from: "caller", to: "customer", label: "calling", kind: "dashed" },
      { from: "customer", to: "mule", label: "paused", kind: "dashed" },
    ],
    focus: "customer",
  },
  {
    caption:
      "The analyst confirms the mule. Accounts it passed money on to are flagged, and every bank is warned.",
    nodes: {
      reports: REPORTS,
      caller: CALLER,
      retiree: RETIREE,
      mule: { label: "MBB ****8812", sub: "Confirmed mule", tone: "confirmed" },
      customer: { label: "Customer on a call", sub: "money kept", tone: "business" },
      cimb: { label: "CIMB ****6677", sub: "Be careful", tone: "caution" },
      hlb: { label: "HLB ****3365", sub: "Be careful", tone: "caution" },
    },
    edges: [
      ...LINK_EDGES,
      { from: "mule", to: "cimb", label: "RM 30,000", kind: "money" },
      { from: "mule", to: "hlb", label: "RM 15,000", kind: "money" },
    ],
    focus: "mule",
  },
  {
    caption:
      "A shop gets a “we changed bank” invoice to CIMB ****6677. Semak supplier: hold, and call the supplier back.",
    nodes: {
      reports: REPORTS,
      caller: CALLER,
      retiree: RETIREE,
      mule: { label: "MBB ****8812", sub: "Confirmed mule", tone: "confirmed" },
      customer: { label: "Customer on a call", sub: "money kept", tone: "business" },
      cimb: { label: "CIMB ****6677", sub: "Be careful", tone: "caution" },
      hlb: { label: "HLB ****3365", sub: "Be careful", tone: "caution" },
      shop: { label: "Hardware shop", sub: "payment held", tone: "business" },
    },
    edges: [
      ...LINK_EDGES,
      { from: "mule", to: "cimb", label: "RM 30,000", kind: "money" },
      { from: "mule", to: "hlb", label: "RM 15,000", kind: "money" },
      { from: "shop", to: "cimb", label: "new bank details?", kind: "dashed" },
    ],
    focus: "shop",
  },
];

const W = { wide: { w: 1000, h: 500, nw: 200, nh: 64 }, tall: { w: 500, h: 870, nw: 200, nh: 70 } };

export function ScamGraph() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [layout, setLayout] = useState<"wide" | "tall">("wide");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const set = () => setLayout(mq.matches ? "tall" : "wide");
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // Start playing when the graph scrolls into view (unless the visitor prefers less motion)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (step >= STEPS.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 4200);
    return () => clearTimeout(t);
  }, [playing, step]);

  const s = STEPS[step]!;
  const dim = W[layout];
  const at = (id: NodeId) => POS[id][layout];
  const go = (n: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  };

  return (
    <div ref={box} className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-chart">
        <svg
          viewBox={`0 0 ${dim.w} ${dim.h}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Scam graph, step ${step + 1} of ${STEPS.length}: ${s.caption}`}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#98A2B3" />
            </marker>
            <marker
              id="arrow-money"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#EC4A0A" />
            </marker>
          </defs>
          {s.edges.map((e) => {
            const a = at(e.from);
            const b = at(e.to);
            // stop the line at the node's edge
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const pad =
              Math.min(
                dim.nw / 2 / Math.abs(dx / len || 1e-6),
                dim.nh / 2 / Math.abs(dy / len || 1e-6),
              ) + 6;
            const x2 = b.x - (dx / len) * pad;
            const y2 = b.y - (dy / len) * pad;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const money = e.kind === "money";
            return (
              <g key={`${e.from}-${e.to}`} className="animate-[fadein_0.6s_ease]">
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={x2}
                  y2={y2}
                  stroke={money ? "#EC4A0A" : "#98A2B3"}
                  strokeWidth={money ? 3 : 2}
                  strokeDasharray={e.kind === "dashed" ? "8 6" : undefined}
                  markerEnd={money ? "url(#arrow-money)" : "url(#arrow)"}
                />
                <text
                  x={mx}
                  y={my - 8}
                  textAnchor="middle"
                  fontSize={layout === "tall" ? 17 : 15}
                  fill={money ? "#B93815" : "#475467"}
                  stroke="#ffffff"
                  strokeWidth={5}
                  paintOrder="stroke"
                >
                  {e.label}
                </text>
              </g>
            );
          })}
          {(Object.keys(s.nodes) as NodeId[]).map((id) => {
            const n = s.nodes[id]!;
            const p = at(id);
            const t = TONE[n.tone];
            const focus = s.focus === id;
            return (
              <g
                key={id}
                transform={`translate(${p.x - dim.nw / 2}, ${p.y - dim.nh / 2})`}
                className="animate-[fadein_0.6s_ease]"
              >
                {focus && (
                  <rect
                    x={-6}
                    y={-6}
                    width={dim.nw + 12}
                    height={dim.nh + 12}
                    rx={18}
                    fill="none"
                    stroke={t.stroke}
                    strokeOpacity={0.35}
                    strokeWidth={6}
                    className="animate-pulse"
                  />
                )}
                <rect
                  width={dim.nw}
                  height={dim.nh}
                  rx={14}
                  fill={t.fill}
                  stroke={t.stroke}
                  strokeWidth={focus ? 3 : 2}
                  style={{ transition: "fill 0.6s, stroke 0.6s" }}
                />
                <text
                  x={dim.nw / 2}
                  y={dim.nh / 2 - 4}
                  textAnchor="middle"
                  fontSize={layout === "tall" ? 19 : 17}
                  fontWeight={700}
                  fill="#101828"
                  fontFamily={/\*{3}/.test(n.label) ? "ui-monospace, monospace" : undefined}
                >
                  {n.label}
                </text>
                <text
                  x={dim.nw / 2}
                  y={dim.nh / 2 + 20}
                  textAnchor="middle"
                  fontSize={layout === "tall" ? 16 : 14}
                  fontWeight={600}
                  fill={t.text}
                >
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-12 text-16 text-gray-800 sm:max-w-3xl" aria-live="polite">
          <b className="text-brand">{step + 1}.</b> {s.caption}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2.5"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            aria-label="Previous step"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex gap-1.5" role="tablist" aria-label="Steps">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}`}
                onClick={() => go(i)}
                className={cn("size-2.5 rounded-full", i === step ? "bg-brand" : "bg-gray-300")}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary px-2.5"
            onClick={() => go(step + 1)}
            disabled={step === STEPS.length - 1}
            aria-label="Next step"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            className="btn-secondary px-2.5"
            onClick={() => {
              if (step === STEPS.length - 1) setStep(0);
              setPlaying(!playing);
            }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
