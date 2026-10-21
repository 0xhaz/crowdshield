import type { Neighbours } from "@crowdshield/contracts";
import type { z } from "zod";
import { TIER_STYLE, type Tier } from "@/lib/risk";
import { titleCase } from "@/lib/utils";

/** One-hop graph around an entity: centre node, neighbours on a ring, edges labelled by kind. */
export function GraphView({
  graph,
  centre,
}: {
  graph: z.infer<typeof Neighbours>;
  centre: number;
}) {
  const others = graph.nodes.filter((n) => n.id !== centre).slice(0, 12);
  const me = graph.nodes.find((n) => n.id === centre);
  if (!me || !others.length) return <p className="muted">No links to other entities yet.</p>;
  const W = 640,
    H = 360,
    cx = W / 2,
    cy = H / 2,
    R = 135;
  const pos = new Map<number, { x: number; y: number }>([[centre, { x: cx, y: cy }]]);
  others.forEach((n, i) => {
    const a = (2 * Math.PI * i) / others.length - Math.PI / 2;
    pos.set(n.id!, { x: cx + R * 1.6 * Math.cos(a), y: cy + R * Math.sin(a) });
  });
  const colour = (t: string) => TIER_STYLE[t as Tier]?.hex ?? "#98A2B3";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Links between this entity and others"
    >
      {graph.edges
        .filter((e) => pos.has(e.src) && pos.has(e.dst))
        .map((e, i) => {
          const a = pos.get(e.src)!,
            b = pos.get(e.dst)!;
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.kind === "money_flow" ? "#D92D20" : "#D0D5DD"}
                strokeWidth={e.kind === "money_flow" ? 2.5 : 1.5}
                strokeDasharray={e.kind === "co_case" ? "4 3" : undefined}
                markerEnd={e.kind === "money_flow" ? "url(#arrow)" : undefined}
              />
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 4}
                fontSize="10"
                textAnchor="middle"
                fill="#667085"
              >
                {titleCase(e.kind)}
                {e.amountMyr ? ` RM${Math.round(e.amountMyr).toLocaleString()}` : ""}
              </text>
            </g>
          );
        })}
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="22"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#D92D20" />
        </marker>
      </defs>
      {[me, ...others].map((n) => {
        const p = pos.get(n.id!)!;
        const isMe = n.id === centre;
        return (
          <a key={n.id} href={`/bank/entities/${n.id}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isMe ? 18 : 12}
              fill={colour(n.tier)}
              stroke="#fff"
              strokeWidth={3}
            />
            <text
              x={p.x}
              y={p.y + (isMe ? 34 : 26)}
              fontSize={isMe ? 13 : 11}
              fontWeight={isMe ? 700 : 500}
              textAnchor="middle"
              fill="#101828"
              fontFamily="monospace"
            >
              {n.masked}
            </text>
          </a>
        );
      })}
    </svg>
  );
}
