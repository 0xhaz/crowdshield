import {
  ArrowLeft,
  Crop,
  Download,
  FolderOpen,
  Lock,
  Puzzle,
  ScanEye,
  ToggleRight,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CrowdShield Guard for Chrome",
  description:
    "Check scam messages without copying anything, and get warnings inside WhatsApp Web, Telegram Web and Gmail.",
};

const ZIP = "/downloads/crowdshield-guard.zip";

const FEATURES = [
  {
    icon: Crop,
    title: "Snip anything",
    line: "Alt+Shift+S, drag over a message, email or chat. Nemotron reads it; the graph checks every number in it.",
    img: "/demo/extension-snip.png",
    alt: "A snipped scam chat checked by CrowdShield: a known scam wave and two confirmed scam identifiers",
  },
  {
    icon: ScanEye,
    title: "Warnings inside your chats",
    line: "On WhatsApp Web, Telegram Web and Gmail, scam-linked numbers are highlighted, and “new number, send money” messages are flagged.",
    img: "/demo/extension-watch.png",
    alt: "WhatsApp Web with a scam account highlighted and CrowdShield's warning",
  },
];

const STEPS = [
  { icon: Download, t: "Download the zip", d: "and unzip it" },
  { icon: Puzzle, t: "Open chrome://extensions", d: "turn on Developer mode" },
  { icon: FolderOpen, t: "Load unpacked", d: "choose the unzipped folder" },
  { icon: ToggleRight, t: "Pick your sites", d: "in the toolbar popup" },
];

export default function ExtensionPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6">
        <Link href="/" className="flex items-center gap-1 text-14 text-brand">
          <ArrowLeft className="size-4" aria-hidden /> CrowdShield
        </Link>
        <header className="flex flex-col items-start gap-4">
          <p className="chip border-indigo-500/30 bg-blue-25 text-indigo-700">
            <Puzzle className="size-3.5" aria-hidden /> Chrome extension
          </p>
          <h1 className="text-36 sm:text-[48px] sm:leading-[56px] font-bold text-gray-900">
            CrowdShield Guard
          </h1>
          <p className="max-w-2xl text-18 text-gray-600">
            No screenshots to save, nothing to paste. Check a scam where you see it.
          </p>
          <a href={ZIP} download className="btn-primary px-5 py-3">
            <Download className="size-4" aria-hidden /> Download for Chrome
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-25 p-5"
            >
              <h2 className="flex items-center gap-2 text-18 font-bold text-gray-900">
                <f.icon className="size-5 text-brand" aria-hidden /> {f.title}
              </h2>
              <p className="text-14 text-gray-600">{f.line}</p>
              <Image
                src={f.img}
                alt={f.alt}
                width={1280}
                height={720}
                className="mt-auto rounded-xl border border-gray-200"
              />
            </article>
          ))}
        </div>

        <section aria-labelledby="install-title" className="flex flex-col gap-4">
          <h2 id="install-title" className="text-24 font-bold text-gray-900">
            Install in a minute
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="flex gap-3 rounded-xl border border-gray-200 p-4">
                <span className="flex-center size-9 shrink-0 rounded-full bg-blue-25 text-14 font-bold text-brand">
                  {i + 1}
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-14 font-semibold text-gray-900">
                    <s.icon className="size-4 text-brand" aria-hidden /> {s.t}
                  </span>
                  <span className="text-14 text-gray-600">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-12 text-gray-500">
            The hackathon build installs this way; a Chrome Web Store listing comes next.
          </p>
        </section>

        <section className="flex gap-3 rounded-2xl border border-gray-200 p-5">
          <Lock className="size-6 shrink-0 text-brand" aria-hidden />
          <div className="flex flex-col gap-1 text-14 text-gray-700">
            <h2 className="text-16 font-semibold text-gray-900">
              Your messages stay on your computer
            </h2>
            <p>
              Each site is off until you turn it on, and Chrome asks you first. Numbers, accounts
              and links are found on your computer and only those are checked. Message text is sent
              only when you snip or tap “Check with AI”, and IC, phone and account numbers are
              removed before any AI model reads it. Nothing you check is stored.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
