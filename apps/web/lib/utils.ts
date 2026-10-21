import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MY = "en-MY";
const TZ = "Asia/Kuala_Lumpur";

export const formatMyr = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined
    ? "—"
    : `RM ${n.toLocaleString(MY, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(MY, {
        timeZone: TZ,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(MY, {
        timeZone: TZ,
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Builds a URL with one search param changed (page reset unless it's the page param). */
export function withParam(
  path: string,
  params: Record<string, string | undefined>,
  key: string,
  value?: string,
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v && k !== key && (key === "page" || k !== "page")) q.set(k, v);
  if (value) q.set(key, value);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
