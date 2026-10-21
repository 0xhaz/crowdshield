"use client";

import { BrainCircuit, Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { type BriefState, caseBrief } from "@/lib/actions/bank";
import { cn } from "@/lib/utils";
import { AiTrace } from "./AiTrace";

type Brief = NonNullable<BriefState["brief"]>;
type Point = Brief["modusOperandi"][number];

/** "event:3" → the timeline item on this page, "entity:5" → the entity page. */
function Evidence({ id }: { id: string }) {
  const [kind, n] = id.split(":");
  const href =
    kind === "entity"
      ? `/bank/entities/${n}`
      : ["event", "hop", "cashout"].includes(kind ?? "")
        ? `#${kind}-${n}`
        : undefined;
  const cls = "chip border-gray-200 bg-gray-50 px-1.5 py-0 font-mono text-[11px] text-gray-600";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-brand hover:text-brand")}>
      {id}
    </Link>
  ) : (
    <span className={cls}>{id}</span>
  );
}

function Points({ title, points }: { title: string; points: Point[] }) {
  if (!points.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-14 font-semibold text-gray-900">{title}</h3>
      <ul className="flex flex-col gap-2">
        {points.map((p, i) => (
          <li key={i} className="text-14 text-gray-700">
            {p.text}{" "}
            <span className="inline-flex flex-wrap gap-1 align-middle">
              {p.evidence.map((e) => (
                <Evidence key={e} id={e} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Referral({ text }: { text: Brief["referral"] }) {
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [copied, setCopied] = useState(false);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-14 font-semibold text-gray-900">Referral note for NSRC / PDRM CCID</h3>
        <div className="flex gap-1" role="tablist" aria-label="Language">
          {(["en", "ms"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className={cn("chip-link", lang === l && "chip-link-active")}
            >
              {l === "en" ? "English" : "Bahasa Melayu"}
            </button>
          ))}
          <button
            type="button"
            className="btn-secondary py-1"
            onClick={() => {
              void navigator.clipboard.writeText(text[lang]).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="whitespace-pre-line text-14 text-gray-800">{text[lang]}</p>
    </section>
  );
}

/** Case brief by Nemotron 3 Ultra with reasoning: every point cites the case items it rests on. */
export function CaseBriefPanel({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState(caseBrief, {});
  const b = state.brief;
  return (
    <section className="panel flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="panel-title flex items-center gap-2">
            <BrainCircuit className="size-5 text-indigo-700" aria-hidden /> AI case brief
          </h2>
          <p className="text-12 text-gray-600">
            Nemotron 3 Ultra reasons over the timeline, money trail and evidence. It sees masked
            identifiers only, and every point links to what it rests on.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={caseId} />
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Reasoning…" : b ? "Regenerate" : "Write the brief"}
          </button>
        </form>
      </div>
      {pending && !b && (
        <p className="muted" role="status">
          Ultra is reading the case. This takes 10–30 seconds the first time.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-14 text-risk-critical">
          {state.error}
        </p>
      )}
      {b && (
        <div className={cn("flex flex-col gap-4", pending && "opacity-60")}>
          <p className="text-16 font-semibold text-gray-900">{b.headline.en}</p>
          <Points title="How the scam worked" points={b.modusOperandi} />
          <Points title="Money trail" points={b.moneyTrail} />
          <Points title="Red flags" points={b.redFlags} />
          <Points title="Recommended actions" points={b.recommendedActions} />
          {b.gaps.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-14 font-semibold text-gray-900">What’s missing</h3>
              <ul className="list-disc pl-5 text-14 text-gray-700">
                {b.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </section>
          )}
          <Referral text={b.referral} />
          <p className="text-12 text-gray-500">
            Drafted by AI for an analyst to check. It doesn’t change any risk score.
          </p>
          <AiTrace trace={b.trace} />
        </div>
      )}
    </section>
  );
}
