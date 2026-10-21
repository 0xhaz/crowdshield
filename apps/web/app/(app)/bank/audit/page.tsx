import { Pagination } from "@/components/Chips";
import { HeaderBox } from "@/components/HeaderBox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/utils";

export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const data = await (await api()).call("audit", { query: { page, pageSize: 30 } });
  return (
    <section className="page">
      <HeaderBox
        title="Audit log"
        subtext="Every lookup, payee check and decision by your organisation, with the policy version in force."
      />
      <div className="panel flex flex-col gap-4">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="px-2">When</TableHead>
              <TableHead className="px-2">Action</TableHead>
              <TableHead className="px-2">Entity</TableHead>
              <TableHead className="px-2 max-md:hidden">Detail</TableHead>
              <TableHead className="px-2 max-md:hidden">Policy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="min-w-32 px-2">{formatDateTime(r.at)}</TableCell>
                <TableCell className="px-2 font-medium">{titleCase(r.action)}</TableCell>
                <TableCell className="px-2">
                  {r.entityId ? (
                    <a className="text-brand" href={`/bank/entities/${r.entityId}`}>
                      #{r.entityId}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-[360px] truncate px-2 font-mono text-12 text-gray-600 max-md:hidden">
                  {JSON.stringify(r.detail)}
                </TableCell>
                <TableCell className="px-2 text-12 text-gray-500 max-md:hidden">
                  {r.policyVersion}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          path="/bank/audit"
          params={params}
          page={page}
          total={data.total}
          pageSize={data.pageSize}
        />
      </div>
    </section>
  );
}
