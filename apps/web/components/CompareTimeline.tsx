import { CircleCheck, CircleX } from "lucide-react";

const CLASSIC = [
  { t: "0 min", e: "Scam call" },
  { t: "+20 min", e: "Victim transfers" },
  { t: "+40 min", e: "Money moves to more mules" },
  { t: "Hours later", e: "Victim realises, calls 997" },
  { t: "Days", e: "Case processed; most money gone" },
];
const CROWDSHIELD = [
  { t: "0 min", e: "Scam call" },
  { t: "+1 min", e: "Number checked: confirmed scam" },
  { t: "+20 min", e: "Payee check: transfer paused" },
  { t: "Same hour", e: "Mule confirmed by the bank" },
  { t: "Next check", e: "Every bank, business and bot user warned" },
];

function Track({ title, good, steps }: { title: string; good: boolean; steps: typeof CLASSIC }) {
  const Icon = good ? CircleCheck : CircleX;
  const dot = good ? "bg-success-600" : "bg-risk-critical-solid";
  return (
    <div
      className={`rounded-2xl border p-5 ${good ? "border-success-600/30 bg-success-25" : "border-risk-critical-border bg-risk-critical-bg"}`}
    >
      <h3
        className={`flex items-center gap-2 text-16 font-bold ${good ? "text-success-700" : "text-risk-critical"}`}
      >
        <Icon className="size-5" aria-hidden /> {title}
      </h3>
      <ol className="mt-4 grid gap-3 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 sm:flex-col sm:gap-2">
            <span
              className={`mt-1 size-3 shrink-0 rounded-full sm:mt-0 ${i === steps.length - 1 ? dot : "bg-gray-400"}`}
              aria-hidden
            />
            <span>
              <span className="block text-12 font-semibold uppercase tracking-wide text-gray-500">
                {s.t}
              </span>
              <span className="text-14 text-gray-900">{s.e}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Classic reporting vs CrowdShield, as two timelines of the same scam. */
export function CompareTimeline() {
  return (
    <div className="flex flex-col gap-4">
      <Track title="Classic reporting: after the money is gone" good={false} steps={CLASSIC} />
      <Track title="CrowdShield: before the money moves" good steps={CROWDSHIELD} />
    </div>
  );
}
