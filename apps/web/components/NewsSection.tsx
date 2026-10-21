import type { NewsFeed } from "@crowdshield/contracts";
import { ExternalLink, Newspaper } from "lucide-react";
import type { z } from "zod";
import { apiBase } from "@/lib/api";
import { scamLabel } from "@/lib/risk";
import { formatMyr } from "@/lib/utils";
import { AiTrace } from "./AiTrace";

type Feed = z.infer<typeof NewsFeed>;

async function loadNews(): Promise<Feed | null> {
  try {
    const res = await fetch(`${apiBase()}/v1/news`, {
      next: { revalidate: 3 * 3600 },
      signal: AbortSignal.timeout(90_000),
    });
    return res.ok ? ((await res.json()) as Feed) : null;
  } catch {
    return null;
  }
}

/** "Scams in the news this week": Tavily news search, Nemotron keeps the real Malaysian cases. */
export async function NewsSection() {
  const feed = await loadNews();
  if (!feed?.items.length)
    return (
      <p className="muted">The news feed is unavailable right now. Please check back later.</p>
    );
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {feed.items.slice(0, 6).map((n) => (
          <li key={n.url}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-chart hover:border-brand"
            >
              <span className="flex items-center gap-2 text-12 text-gray-500">
                <Newspaper className="size-4" aria-hidden />
                {n.source}
                {n.publishedAt &&
                  ` · ${new Date(n.publishedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`}
                <ExternalLink className="ml-auto size-3.5" aria-label="opens in a new tab" />
              </span>
              <span className="text-16 font-semibold text-gray-900">{n.headline}</span>
              <span className="text-14 text-gray-600">{n.summary.en}</span>
              <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {n.scamType && (
                  <span className="chip border-gray-200 bg-gray-50 text-gray-700">
                    {scamLabel(n.scamType as never)}
                  </span>
                )}
                {n.lossMyr !== null && (
                  <span className="chip border-risk-high-border bg-risk-high-bg text-risk-high">
                    {formatMyr(n.lossMyr, 0)} lost
                  </span>
                )}
                {n.state && (
                  <span className="chip border-gray-200 bg-gray-50 text-gray-700">{n.state}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <AiTrace trace={feed.trace} />
    </div>
  );
}

export function NewsSkeleton() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading news">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-gray-25" />
      ))}
    </ul>
  );
}
