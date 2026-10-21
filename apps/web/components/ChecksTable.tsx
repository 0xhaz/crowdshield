import type { InvoiceCheckSummary } from "@crowdshield/contracts";
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
import { formatDateTime, formatMyr } from "@/lib/utils";
import { StatusChip } from "./StatusChip";

const RISK_CHIP = {
  high: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
  caution: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
  low: "border-success-100 bg-success-25 text-success-700",
} as const;
const RISK_LABEL = { high: "Do not pay yet", caution: "Check first", low: "No problems" } as const;

export function ChecksTable({ checks }: { checks: z.infer<typeof InvoiceCheckSummary>[] }) {
  if (!checks.length)
    return (
      <p className="muted rounded-lg border border-dashed border-gray-300 p-6 text-center">
        No checks yet.{" "}
        <Link className="text-brand" href="/sme/check">
          Check an invoice
        </Link>
      </p>
    );
  return (
    <Table>
      <TableHeader className="bg-gray-50">
        <TableRow>
          <TableHead className="px-2">Supplier</TableHead>
          <TableHead className="px-2">Result</TableHead>
          <TableHead className="px-2">Amount</TableHead>
          <TableHead className="px-2">Hold</TableHead>
          <TableHead className="px-2 max-md:hidden">Checked</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {checks.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="px-2">
              <Link
                href={`/sme/checks/${c.id}`}
                className="font-semibold text-gray-900 hover:text-brand"
              >
                {c.supplier?.name ?? c.supplierName ?? "Unknown supplier"}
              </Link>
              {c.bankDetailChanged && (
                <p className="text-12 font-medium text-risk-critical">Bank account changed</p>
              )}
            </TableCell>
            <TableCell className="px-2">
              {c.risk && <span className={`chip ${RISK_CHIP[c.risk]}`}>{RISK_LABEL[c.risk]}</span>}
            </TableCell>
            <TableCell className="whitespace-nowrap px-2 tabular-nums">
              {formatMyr(c.amountMyr)}
            </TableCell>
            <TableCell className="px-2">
              {c.holdStatus ? <StatusChip status={c.holdStatus} /> : "—"}
            </TableCell>
            <TableCell className="min-w-32 px-2 max-md:hidden">
              {formatDateTime(c.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
