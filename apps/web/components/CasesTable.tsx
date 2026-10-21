import type { CaseSummary } from "@crowdshield/contracts";
import Link from "next/link";
import type { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { scamLabel, sourceLabel } from "@/lib/risk";
import { formatDateTime, formatMyr, titleCase } from "@/lib/utils";
import { RiskBadge } from "./RiskBadge";

export function CasesTable({ cases }: { cases: z.infer<typeof CaseSummary>[] }) {
  if (!cases.length)
    return (
      <p className="muted rounded-lg border border-dashed border-gray-300 p-6 text-center">
        No cases.
      </p>
    );
  return (
    <Table>
      <TableHeader className="bg-gray-50">
        <TableRow>
          <TableHead className="px-2">Reported</TableHead>
          <TableHead className="px-2">Scam type</TableHead>
          <TableHead className="px-2">Source</TableHead>
          <TableHead className="px-2">Loss</TableHead>
          <TableHead className="px-2 max-lg:hidden">Identifiers</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="min-w-32 px-2">
              <Link
                href={`/bank/cases/${c.id}`}
                className="font-semibold text-gray-900 hover:text-brand"
              >
                {formatDateTime(c.reportedAt)}
              </Link>
              {c.nsrcRef && <p className="text-12 text-gray-500">{c.nsrcRef}</p>}
            </TableCell>
            <TableCell className="px-2">
              {scamLabel(c.scamType)}
              {c.campaign && (
                <p
                  className="max-w-[220px] truncate text-12 text-gray-500"
                  title={c.campaign.label}
                >
                  {c.campaign.label}
                </p>
              )}
            </TableCell>
            <TableCell className="px-2">
              {sourceLabel(c.source)}
              <p className="text-12 text-gray-500">{titleCase(c.verification)}</p>
            </TableCell>
            <TableCell className="whitespace-nowrap px-2 tabular-nums">
              {c.nearMiss ? <span className="text-gray-500">Near miss</span> : formatMyr(c.lossMyr)}
            </TableCell>
            <TableCell className="px-2 max-lg:hidden">
              <div className="flex flex-wrap gap-1.5">
                {c.entities
                  .filter((e) => e.role !== "impersonated_official")
                  .slice(0, 4)
                  .map((e) => (
                    <Link
                      key={`${e.id}-${e.role}`}
                      href={`/bank/entities/${e.id}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span className="font-mono text-12">{e.masked}</span>
                      {e.tier && <RiskBadge tier={e.tier} />}
                    </Link>
                  ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
