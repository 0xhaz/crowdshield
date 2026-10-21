"use client";

import { TriangleAlert } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="page items-start">
      <div className="panel flex max-w-xl flex-col gap-3">
        <div className="flex items-center gap-2 text-risk-high">
          <TriangleAlert className="size-5" aria-hidden />
          <h1 className="text-18 font-semibold">This page couldn&apos;t load</h1>
        </div>
        <p className="muted">
          The CrowdShield API may be restarting, or this record no longer exists. Try again in a
          moment.
        </p>
        {error.digest && <p className="text-12 text-gray-500">Reference: {error.digest}</p>}
        <button type="button" onClick={reset} className="btn-primary self-start">
          Try again
        </button>
      </div>
    </section>
  );
}
