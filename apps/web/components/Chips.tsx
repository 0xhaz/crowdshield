import Link from "next/link";
import { cn, withParam } from "@/lib/utils";

/** Filter chips as plain links (server-rendered, shareable URLs). */
export function Chips({
  path,
  params,
  name,
  options,
}: {
  path: string;
  params: Record<string, string | undefined>;
  name: string;
  options: { value?: string; label: string }[];
}) {
  return (
    <nav
      className="custom-scrollbar flex gap-2 overflow-x-auto pb-1"
      aria-label={`Filter by ${name}`}
    >
      {options.map((o) => {
        const active = (params[name] ?? undefined) === o.value;
        return (
          <Link
            key={o.label}
            href={withParam(path, params, name, o.value)}
            aria-current={active ? "true" : undefined}
            className={cn("chip-link whitespace-nowrap", active && "chip-link-active")}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({
  path,
  params,
  page,
  total,
  pageSize,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-14">
      {page > 1 ? (
        <Link className="btn-secondary" href={withParam(path, params, "page", String(page - 1))}>
          ← Prev
        </Link>
      ) : (
        <span className="btn-secondary opacity-50">← Prev</span>
      )}
      <p className="tabular-nums text-gray-600">
        {page} / {pages} · {total} total
      </p>
      {page < pages ? (
        <Link className="btn-secondary" href={withParam(path, params, "page", String(page + 1))}>
          Next →
        </Link>
      ) : (
        <span className="btn-secondary opacity-50">Next →</span>
      )}
    </div>
  );
}
