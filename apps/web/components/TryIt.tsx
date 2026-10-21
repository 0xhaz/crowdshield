"use client";

import type { PublicCheckResult } from "@crowdshield/contracts";
import { ImageUp, Loader2, Megaphone, Search, ShieldQuestion } from "lucide-react";
import { useRef, useState } from "react";
import type { z } from "zod";
import { cn } from "@/lib/utils";
import { AiTrace } from "./AiTrace";
import { VerdictCard } from "./VerdictCard";

type Result = z.infer<typeof PublicCheckResult>;

const EXAMPLES = [
  { label: "A scam caller", text: "011-2345 4821" },
  { label: "A mule account", text: "Maybank 5123 4567 8812" },
  {
    label: "A ‘police’ call",
    text: "Ada orang call mengaku pegawai polis, kata akaun bank saya terlibat pengubahan wang haram dan suruh pindah duit ke akaun selamat. Betul ke?",
  },
  {
    label: "An LHDN SMS",
    text: "LHDN: Anda layak menerima bayaran balik cukai RM1,280. Sila tuntut sebelum 31/10 di https://lhdn-refund-my.com/claim",
  },
];
const MAX_BYTES = 5_500_000;

const toBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

async function post(path: string, body: unknown): Promise<Result> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429)
    throw new Error("You’ve run a lot of checks. Please try again in a few minutes.");
  if (!res.ok) throw new Error("We couldn’t check that right now. Please try again.");
  return (await res.json()) as Result;
}

/** Landing "Try it now": the same check as the Telegram bot, no sign-in, nothing stored. */
export function TryIt() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"text" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function run(work: () => Promise<Result>, kind: "text" | "image") {
    setBusy(kind);
    setError(null);
    try {
      setResult(await work());
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const checkText = (t: string) => run(() => post("/v1/public/check", { text: t }), "text");
  const checkImage = (blob: Blob) => {
    setText("");
    if (blob.size > MAX_BYTES) return setError("Please use an image under 5.5 MB.");
    const mime = ["image/png", "image/jpeg", "image/webp"].includes(blob.type)
      ? blob.type
      : "image/png";
    return run(
      async () => post("/v1/public/screenshot", { imageBase64: await toBase64(blob), mime }),
      "image",
    );
  };

  const nothing = result && !result.verdicts.length && !result.pattern && !result.campaign;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 self-start rounded-2xl border border-gray-200 bg-white p-5 shadow-chart">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 2) void checkText(text);
          }}
        >
          <label htmlFor="try-text" className="text-14 font-semibold text-gray-900">
            Paste a number, account, link or the whole message
          </label>
          <textarea
            id="try-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            className="input-class rounded-lg p-3 text-14"
            placeholder="e.g. Encik, akaun anda disiasat. Pindah ke Public Bank 6471 2093 5518 segera…"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={!!busy || text.trim().length < 2}
            >
              {busy === "text" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Check it
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => file.current?.click()}
            >
              {busy === "image" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageUp className="size-4" />
              )}
              Upload a screenshot
            </button>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Screenshot to check"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void checkImage(f);
                e.target.value = "";
              }}
            />
          </div>
        </form>
        <div className="flex flex-col gap-2">
          <p className="text-12 font-medium uppercase tracking-wide text-gray-500">
            Or try an example (synthetic data)
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button
                key={x.label}
                type="button"
                className="chip-link"
                disabled={!!busy}
                onClick={() => {
                  setText(x.text);
                  void checkText(x.text);
                }}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              className="chip-link"
              disabled={!!busy}
              onClick={() =>
                void fetch("/demo/scam-chat.png")
                  .then((r) => r.blob())
                  .then(checkImage)
              }
            >
              A scam chat screenshot
            </button>
          </div>
        </div>
        <p className="text-12 text-gray-500">
          Nothing you check here is stored. Text is stripped of IC, phone and account numbers before
          any AI model reads it.
        </p>
      </div>

      <div className="flex flex-col gap-4" aria-live="polite" aria-busy={!!busy}>
        {!result && !error && !busy && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 p-6 text-center text-14 text-gray-500">
            <ShieldQuestion className="size-8 text-gray-400" aria-hidden />
            The verdict appears here, with its reasons and what to do.
          </div>
        )}
        {busy && !result && (
          <div className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-gray-200 p-6 text-14 text-gray-600">
            <Loader2 className="size-5 animate-spin" />
            {busy === "image" ? "Nemotron is reading the screenshot…" : "Checking…"}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-risk-critical-border bg-risk-critical-bg p-4 text-14 text-risk-critical"
          >
            {error}
          </p>
        )}
        {result && (
          <div className={cn("flex flex-col gap-4", busy && "opacity-60")}>
            {result.campaign && (
              <div className="flex gap-3 rounded-xl border border-risk-high-border bg-risk-high-bg p-4 text-risk-high">
                <Megaphone className="size-5 shrink-0" aria-hidden />
                <p className="text-14">
                  <b>Known scam wave:</b> {result.campaign.label}. {result.campaign.reports24h}{" "}
                  report(s) in the last 24 hours.
                </p>
              </div>
            )}
            {result.pattern && (
              <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-chart">
                <p className="text-12 font-semibold uppercase tracking-wide text-gray-500">
                  {result.transcript !== null ? "What the screenshot shows" : "What the message is"}
                </p>
                <p className="mt-1 text-16 text-gray-900">{result.pattern.summary.en}</p>
                {result.pattern.action && (
                  <p className="mt-2 text-14">
                    <b>What to do:</b> {result.pattern.action.en}
                  </p>
                )}
              </article>
            )}
            {result.verdicts.map((v, i) => (
              <VerdictCard key={i} v={v} compact />
            ))}
            {nothing && (
              <p className="rounded-xl border border-gray-200 p-4 text-14 text-gray-600">
                No phone number, account or link found, and the text is too short to judge. Paste
                the whole message.
              </p>
            )}
            {result.transcript && (
              <details className="text-14 text-gray-600">
                <summary className="cursor-pointer">Text read from the screenshot</summary>
                <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-25 p-3">
                  {result.transcript}
                </p>
              </details>
            )}
            <AiTrace trace={result.trace} />
          </div>
        )}
      </div>
    </div>
  );
}
