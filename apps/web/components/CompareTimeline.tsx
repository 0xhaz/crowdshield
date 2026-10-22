"use client";

import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

type Tone = { line: string; dot: string; on: string };
const RED: Tone = { line: "bg-risk-critical-solid", dot: "bg-risk-critical-solid", on: "#D92D20" };
const GREEN: Tone = { line: "bg-success-600", dot: "bg-success-600", on: "#039855" };

/**
 * One timeline: a line draws from dot to dot and each dot lights up as the line reaches it.
 * `step` is seconds per segment, so the classic track is visibly slower than CrowdShield's.
 */
function Track({
  title,
  good,
  steps,
  step,
  play,
}: {
  title: string;
  good: boolean;
  steps: typeof CLASSIC;
  step: number;
  play: number; // bumps to replay
}) {
  const Icon = good ? CircleCheck : CircleX;
  const tone = good ? GREEN : RED;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        good
          ? "border-success-600/30 bg-success-25"
          : "border-risk-critical-border bg-risk-critical-bg",
      )}
    >
      <h3
        className={cn(
          "flex items-center gap-2 text-16 font-bold",
          good ? "text-success-700" : "text-risk-critical",
        )}
      >
        <Icon className="size-5" aria-hidden /> {title}
      </h3>
      <ol key={play} className="mt-4 grid gap-3 sm:grid-cols-5">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={i} className="relative flex gap-3 sm:flex-col sm:gap-2">
              {/* track and the animated fill to the next dot (vertical on phones, horizontal on wider screens) */}
              {!last && (
                <>
                  <span
                    aria-hidden
                    className="absolute left-[5px] top-3 h-[calc(100%+12px)] w-0.5 bg-gray-300 sm:left-3 sm:top-[5px] sm:h-0.5 sm:w-[calc(100%+12px)]"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[5px] top-3 h-[calc(100%+12px)] w-0.5 origin-top scale-y-0 sm:left-3 sm:top-[5px] sm:h-0.5 sm:w-[calc(100%+12px)] sm:origin-left sm:scale-x-0 sm:scale-y-100",
                      "motion-reduce:!scale-100",
                      play > 0 &&
                        "animate-[timeline-grow-y_var(--d)_linear_forwards] sm:animate-[timeline-grow-x_var(--d)_linear_forwards]",
                      tone.line,
                    )}
                    style={{ ["--d" as string]: `${step}s`, animationDelay: `${i * step + 0.2}s` }}
                  />
                </>
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-[1] mt-1 size-3 shrink-0 rounded-full bg-gray-400 sm:mt-0",
                  "motion-reduce:!bg-[var(--on)]",
                  play > 0 && "animate-[timeline-dot_0.35s_ease-out_forwards]",
                )}
                style={{
                  ["--on" as string]: tone.on,
                  animationDelay: `${i * step + 0.2}s`,
                }}
              />
              <span>
                <span className="block text-12 font-semibold uppercase tracking-wide text-gray-500">
                  {s.t}
                </span>
                <span className="text-14 text-gray-900">{s.e}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Classic reporting vs CrowdShield: the same scam as two timelines, drawn as you scroll to them. */
export function CompareTimeline() {
  const box = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(0);

  useEffect(() => {
    if (!box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setPlay(1);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="flex flex-col gap-4">
      <Track
        title="Classic reporting: after the money is gone"
        good={false}
        steps={CLASSIC}
        step={1.1}
        play={play}
      />
      <Track
        title="CrowdShield: before the money moves"
        good
        steps={CROWDSHIELD}
        step={0.35}
        play={play}
      />
      <button
        type="button"
        onClick={() => setPlay((p) => p + 1)}
        className="btn-secondary self-start"
        aria-label="Replay the timelines"
      >
        <RotateCcw className="size-4" aria-hidden /> Replay
      </button>
    </div>
  );
}
