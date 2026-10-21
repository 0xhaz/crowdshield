import { ActionForm } from "@/components/ActionForm";
import { CasesTable } from "@/components/CasesTable";
import { GraphView } from "@/components/GraphView";
import { HeaderBox } from "@/components/HeaderBox";
import { StatusChip } from "@/components/StatusChip";
import { VerdictCard } from "@/components/VerdictCard";
import { Progress } from "@/components/ui/progress";
import { decideAppeal, entityAction } from "@/lib/actions/bank";
import { api, getMe } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";

function Bar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-14">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-900">{value.toFixed(3)}</span>
      </div>
      <Progress
        value={value * 100}
        className="h-2 bg-gray-100"
        indicatorClassName="bg-brand"
        aria-label={label}
      />
      <p className="text-12 text-gray-500">{hint}</p>
    </div>
  );
}

export default async function EntityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await api();
  const [d, graph, me] = await Promise.all([
    client.call("getEntity", { params: { id: Number(id) } }),
    client.call("getNeighbours", { params: { id: Number(id) } }),
    getMe(),
  ]);
  const e = d.entity;
  const canDecide = me.role === "bank_supervisor" || me.role === "admin";
  return (
    <section className="page">
      <HeaderBox
        title={e.masked}
        subtext={`${titleCase(e.type)} · first seen ${formatDate(e.firstSeen)} · last seen ${formatDate(e.lastSeen)}`}
        actions={<StatusChip status={e.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <VerdictCard v={d.verdict} />
          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Graph (one hop)</h2>
            <GraphView graph={graph} centre={Number(id)} />
            <p className="text-12 text-gray-500">
              Red arrows: money flow (risk passes downstream only). Dashed: used in the same case.
              Colour = risk tier.
            </p>
          </section>
          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Cases ({d.cases.length})</h2>
            <CasesTable cases={d.cases} />
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {d.score && (
            <section className="panel flex flex-col gap-4">
              <h2 className="panel-title">Score breakdown</h2>
              <Bar
                label="Direct evidence"
                value={d.score.pDirect}
                hint="Reports and confirmations about this entity (noisy-OR)"
              />
              <Bar
                label="From linked entities"
                value={d.score.pGraph}
                hint="Risk inherited through the graph (one hop)"
              />
              <p className="text-12 text-gray-500">
                Final risk = 100 × (1 − (1 − direct)(1 − 0.8 × linked)) × {d.score.clearing}{" "}
                {d.score.clearing < 1 && "(appeal upheld)"} · {d.score.modelVersion}
              </p>
            </section>
          )}
          <section className="panel flex flex-col gap-3">
            <h2 className="panel-title">Act</h2>
            <ActionForm
              act={entityAction}
              hidden={{ id: e.id! }}
              buttons={[
                { value: "confirm_mule", label: "Confirm mule", tone: "danger" },
                { value: "freeze", label: "Freeze" },
                { value: "clear", label: "Mark cleared" },
              ]}
            />
          </section>
          {d.appeals.length > 0 && (
            <section className="panel flex flex-col gap-3">
              <h2 className="panel-title">Appeals</h2>
              {d.appeals.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <StatusChip status={a.status} />
                    <span className="text-12 text-gray-500">{formatDate(a.createdAt)}</span>
                  </div>
                  <p className="text-14 text-gray-700">{a.reason}</p>
                  {a.status === "open" && canDecide && (
                    <ActionForm
                      act={decideAppeal}
                      hidden={{ appealId: a.id, entityId: e.id! }}
                      note={false}
                      buttons={[
                        { name: "decision", value: "upheld", label: "Uphold", tone: "primary" },
                        { name: "decision", value: "rejected", label: "Reject" },
                      ]}
                    />
                  )}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
