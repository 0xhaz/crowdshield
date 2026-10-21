import type { AiTrace as AiTraceSchema } from "@crowdshield/contracts";
import { modelLabel, traceSummary } from "@crowdshield/i18n";
import { Sparkles } from "lucide-react";
import type { z } from "zod";
import { cn } from "@/lib/utils";

type Trace = z.infer<typeof AiTraceSchema>;

/**
 * "Which AI did this": a chip with the models, web searches and time, expanding to every call
 * (prompt version, tokens, reasoning tokens). Shown wherever a model wrote what the user reads.
 */
export function AiTrace({
  trace,
  className,
}: {
  trace: Trace | null | undefined;
  className?: string;
}) {
  const line = traceSummary(trace);
  if (!trace || !line) return null;
  return (
    <details className={cn("group text-12", className)}>
      <summary className="chip w-fit cursor-pointer list-none border-indigo-500/30 bg-blue-25 text-indigo-700 [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-3.5" aria-hidden />
        {line}
      </summary>
      {trace.calls.length > 0 && (
        <table className="mt-2 w-full max-w-xl text-left text-gray-600">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Step</th>
              <th className="py-1 pr-3 font-medium">Prompt</th>
              <th className="py-1 pr-3 text-right font-medium">Time</th>
              <th className="py-1 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {trace.calls.map((c, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-3">
                  {c.kind === "tavily" ? `Tavily ${c.op ?? "search"}` : modelLabel(c.model)}
                  {c.reasoning && <span className="text-indigo-700"> · reasoning</span>}
                </td>
                <td className="py-1 pr-3 font-mono">{c.prompt ?? "—"}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{(c.ms / 1000).toFixed(1)} s</td>
                <td className="py-1 text-right tabular-nums">
                  {c.tokens ?? "—"}
                  {c.reasoningTokens ? ` (${c.reasoningTokens} thinking)` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
