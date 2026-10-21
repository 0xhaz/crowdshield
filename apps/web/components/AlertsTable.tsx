import type { AlertSummary } from "@crowdshield/contracts";
import { PhoneCall } from "lucide-react";
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
import { scamLabel } from "@/lib/risk";
import { formatDateTime, formatMyr, titleCase } from "@/lib/utils";
import { RiskBadge } from "./RiskBadge";
import { StatusChip } from "./StatusChip";

export function AlertsTable({ alerts }: { alerts: z.infer<typeof AlertSummary>[] }) {
  if (!alerts.length)
    return (
      <p className="muted rounded-lg border border-dashed border-gray-300 p-6 text-center">
        No alerts here.
      </p>
    );
  return (
    <Table>
      <TableHeader className="bg-gray-50">
        <TableRow>
          <TableHead className="px-2">Payee</TableHead>
          <TableHead className="px-2">Risk</TableHead>
          <TableHead className="px-2">Amount</TableHead>
          <TableHead className="px-2 max-md:hidden">Scam type</TableHead>
          <TableHead className="px-2">Status</TableHead>
          <TableHead className="px-2 max-md:hidden">Raised</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow key={a.id} className={a.status === "open" ? "bg-risk-high-bg/40" : undefined}>
            <TableCell className="px-2">
              <Link
                href={`/bank/alerts/${a.id}`}
                className="flex items-center gap-2 whitespace-nowrap font-mono text-14 font-semibold text-gray-900 hover:text-brand"
              >
                {a.entity.masked}
                {a.callSignal && (
                  <PhoneCall
                    className="size-4 text-risk-critical"
                    aria-label="Customer was on a call"
                  />
                )}
              </Link>
              <p className="text-12 text-gray-500">
                {titleCase(a.entity.type)} · {a.rail?.toUpperCase() ?? ""}
              </p>
            </TableCell>
            <TableCell className="px-2">
              <RiskBadge tier={a.tier} risk={a.risk} />
            </TableCell>
            <TableCell className="whitespace-nowrap px-2 font-semibold tabular-nums">
              {formatMyr(a.amountMyr)}
            </TableCell>
            <TableCell className="px-2 max-md:hidden">
              {a.topScamTypes.length ? scamLabel(a.topScamTypes[0]) : "—"}
            </TableCell>
            <TableCell className="px-2">
              <StatusChip status={a.status} />
            </TableCell>
            <TableCell className="min-w-32 px-2 max-md:hidden">
              {formatDateTime(a.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
