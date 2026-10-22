import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Puzzle,
  CircleAlert,
  Download,
  FileWarning,
  HeartCrack,
  KeyRound,
  Landmark,
  Link2,
  Lock,
  MessageCircle,
  Package,
  PhoneCall,
  Scale,
  ScrollText,
  Search,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CompareTimeline } from "@/components/CompareTimeline";
import { FlowDiagram } from "@/components/FlowDiagram";
import { NewsSection, NewsSkeleton } from "@/components/NewsSection";
import { ScamGraph } from "@/components/ScamGraph";
import { TryIt } from "@/components/TryIt";
import { getToken } from "@/lib/session";

export const metadata: Metadata = {
  title: "CrowdShield: scam intelligence for Malaysia",
  description:
    "One shared scam graph for the public, banks, e-wallets and businesses. Check before you pay.",
};

const BOT_URL = "https://t.me/CrowdShieldBot";
const EXTENSION_URL = "/downloads/crowdshield-guard.zip";

// ---------- content ----------

const FRAUDS = [
  {
    icon: PhoneCall,
    name: "Fake police, BNM or court officer",
    ms: "Scam Macau",
    how: "A caller says your IC is linked to a crime, passes you to a “BNM officer” on a video call, and tells you to move savings to a “safe account”.",
    flags: [
      "Asks you to transfer money to protect it",
      "“Don’t tell your family”",
      "A warrant shown on a video call",
    ],
    cs: "Checks the caller and the account; the bank sees the live call during the transfer.",
  },
  {
    icon: TrendingUp,
    name: "Investment scam",
    ms: "Scam pelaburan",
    how: "A Telegram “mentor” and a trading app show huge profits; withdrawing needs “tax” or “fees” first.",
    flags: [
      "Guaranteed or very high returns",
      "Unlicensed platform or app",
      "Pay to withdraw your own money",
    ],
    cs: "Checks the app, domain and account; searches the SC and BNM alert lists.",
  },
  {
    icon: Package,
    name: "Parcel or courier fee",
    ms: "Bungkusan palsu",
    how: "An SMS says your parcel is held for a small fee; the link asks for card details and an OTP.",
    flags: ["A tiny fee through a link", "Asks for your OTP or TAC", "Urgent deadline"],
    cs: "Opens the link safely on your behalf and checks the sender’s number.",
  },
  {
    icon: Wallet,
    name: "Part-time job or task scam",
    ms: "Kerja sambilan palsu",
    how: "Paid small amounts to like or review, then asked to “top up” to unlock bigger tasks.",
    flags: [
      "Pay to get paid",
      "Tasks through WhatsApp or Telegram",
      "Withdrawals keep getting delayed",
    ],
    cs: "Checks the WhatsApp number and the e-wallet you are asked to pay.",
  },
  {
    icon: HeartCrack,
    name: "Love scam",
    ms: "Scam cinta",
    how: "Someone met online builds trust, then needs money for an emergency, customs or a ticket.",
    flags: ["Never meets or video-calls", "A sudden emergency", "Money to a third party’s account"],
    cs: "Checks the account and numbers; one tap to report.",
  },
  {
    icon: Link2,
    name: "Phishing link, fake LHDN refund",
    ms: "Pautan pancingan data",
    how: "A “refund” or “account suspended” message links to a fake login page that steals your banking login.",
    flags: [
      "A link to log in to your bank",
      "A refund you didn’t expect",
      "Look-alike web address",
    ],
    cs: "Flags known links and spots fresh waves early from report spikes.",
  },
  {
    icon: Smartphone,
    name: "Malicious app (APK)",
    ms: "Aplikasi berbahaya",
    how: "You’re asked to install an app from a link; it reads your OTPs or takes over your phone.",
    flags: [
      "An app outside the Play Store or App Store",
      "Asks for accessibility permissions",
      "Sent by a “courier” or “officer”",
    ],
    cs: "Checks the app’s package name or file hash against reports.",
  },
  {
    icon: FileWarning,
    name: "Fake supplier or bank-detail change",
    ms: "Pembekal palsu",
    how: "A supplier’s email is spoofed: “we changed bank, please pay the new account”, often to a personal account.",
    flags: [
      "New bank account for a known supplier",
      "Company invoice to a person’s account",
      "Slightly different email domain",
    ],
    cs: "Semak supplier: SSM, LHDN, account name, payment history and scam checks, then a payment hold.",
  },
  {
    icon: Users,
    name: "Mule accounts",
    ms: "Akaun keldai",
    how: "Accounts opened or rented to receive scam money and pass it on fast, often across several banks.",
    flags: [
      "Many transfers from strangers",
      "Money moved out within minutes",
      "A newly opened account",
    ],
    cs: "Follows the money trail; one bank’s confirmation warns every other bank.",
  },
] as const;

const TIERS = [
  {
    label: "Confirmed scam",
    ms: "Scam disahkan",
    cls: "border-risk-critical-border bg-risk-critical-bg text-risk-critical",
    icon: ShieldAlert,
  },
  {
    label: "High risk",
    ms: "Risiko tinggi",
    cls: "border-risk-high-border bg-risk-high-bg text-risk-high",
    icon: CircleAlert,
  },
  {
    label: "Be careful",
    ms: "Berhati-hati",
    cls: "border-risk-caution-border bg-risk-caution-bg text-risk-caution",
    icon: CircleAlert,
  },
  {
    label: "No reports found",
    ms: "Tiada laporan",
    cls: "border-risk-none-border bg-risk-none-bg text-risk-none",
    icon: Search,
  }, // never a ✓: not "safe"
] as const;

const TRUST = [
  { icon: KeyRound, t: "Hashed identifiers" },
  { icon: Lock, t: "Masked on every screen" },
  { icon: BadgeCheck, t: "Redacted before AI" },
  { icon: UserCheck, t: "Reporters never named" },
  { icon: Scale, t: "Appeals" },
  { icon: ScrollText, t: "Full audit trail" },
] as const;

const PROTECT = [
  {
    icon: MessageCircle,
    title: "Telegram bot",
    line: "Forward a number, link, message or screenshot. Report a scam and get your 997 call sheet.",
    href: BOT_URL,
    cta: "Open @CrowdShieldBot",
  },
  {
    icon: Puzzle,
    title: "Browser extension",
    line: "Snip any part of the screen to check it, and get warnings inside WhatsApp Web, Telegram Web and Gmail.",
    href: EXTENSION_URL,
    cta: "Download for Chrome",
  },
  {
    icon: Landmark,
    title: "Your bank’s app",
    line: "Banks call one API before a transfer. A payment to a mule during a scam call is paused.",
    href: "/demo/bank-app",
    cta: "See the banking-app demo",
  },
] as const;

// ---------- page ----------

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  tone = "light",
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  tone?: "light" | "tint";
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-16 py-16 sm:py-24 ${tone === "tint" ? "bg-gray-25" : "bg-white"}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="text-14 font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
          <h2 id={`${id}-title`} className="text-30 sm:text-36 font-bold text-gray-900">
            {title}
          </h2>
          {intro && <p className="text-16 sm:text-18 text-gray-600">{intro}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

export default async function Landing() {
  const signedIn = Boolean(await getToken());
  const cta = signedIn
    ? { href: "/go", label: "Open your dashboard" }
    : { href: "/sign-in", label: "Sign in" };

  return (
    <div className="min-h-screen bg-white">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" width={30} height={30} alt="" />
            <span className="text-18 font-bold text-black-1">CrowdShield</span>
          </Link>
          <nav
            aria-label="Sections"
            className="hidden items-center gap-6 text-14 font-medium text-gray-700 md:flex"
          >
            <a href="#try" className="hover:text-brand">
              Try it
            </a>
            <a href="#how" className="hover:text-brand">
              How it works
            </a>
            <a href="#graph" className="hover:text-brand">
              The graph
            </a>
            <a href="#protect" className="hover:text-brand">
              Get protected
            </a>
            <a href="#frauds" className="hover:text-brand">
              Scams
            </a>
          </nav>
          <Link href={cta.href} className="btn-primary">
            {cta.label}
          </Link>
        </div>
      </header>

      <main>
        {/* ---------- hero ---------- */}
        <section className="bg-brand-dark-gradient text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-6">
              <p className="chip w-fit border-white/30 bg-white/10 text-white">
                Scam intelligence for Malaysia
              </p>
              <h1 className="text-36 sm:text-[56px] sm:leading-[64px] font-bold">
                The bank sees the transfer.{" "}
                <span className="text-blue-100">The crowd saw the call.</span>
              </h1>
              <p className="text-18 text-white/85">
                CrowdShield is one shared scam graph for the public, banks, e-wallets and
                businesses. Every report, every bank confirmation and every rejected fake invoice
                protects the next person.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={BOT_URL}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-14 font-semibold text-brand-dark shadow-form hover:bg-blue-25"
                >
                  <MessageCircle className="size-4" aria-hidden /> Check a number on Telegram
                </a>
                <Link
                  href={cta.href}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-14 font-semibold text-white hover:bg-white/10"
                >
                  {signedIn ? "Open your dashboard" : "Sign in for banks and businesses"}{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>

            <div
              className="flex flex-col gap-4"
              aria-label="Example: a scam caller and a payee check"
            >
              <article className="rounded-2xl border border-risk-critical-border bg-white p-5 text-gray-900 shadow-profile">
                <div className="flex items-center gap-2 text-risk-critical">
                  <ShieldAlert className="size-5" aria-hidden />
                  <span className="text-14 font-bold uppercase tracking-wide">
                    Confirmed scam · Scam disahkan
                  </span>
                </div>
                <p className="mt-2 font-mono text-18">+60 11-***-4821</p>
                <p className="text-14 text-gray-600">
                  37 reports from the public · 1 NSRC (997) case
                </p>
                <p className="mt-2 text-14">
                  <b>What to do:</b> Hang up. Police and BNM never ask you to transfer money.
                </p>
              </article>
              <div className="flex justify-center text-white/70" aria-hidden>
                <ArrowDown className="size-6" />
              </div>
              <article className="rounded-2xl border border-risk-high-border bg-white p-5 text-gray-900 shadow-profile">
                <p className="text-12 font-semibold uppercase tracking-wide text-gray-500">
                  Payee check · customer on a call
                </p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-36 font-bold tabular-nums text-risk-high">79</span>
                  <span className="chip border-risk-high-border bg-risk-high-bg text-risk-high">
                    <CircleAlert className="size-3.5" aria-hidden />
                    High risk
                  </span>
                </div>
                <p className="mt-1 text-16 font-semibold">
                  Hold the transfer and call the customer back
                </p>
              </article>
              <p className="text-center text-12 text-white/70">
                Illustration from the demo, with synthetic data.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- try it ---------- */}
        <Section
          id="try"
          tone="tint"
          eyebrow="Try it now"
          title="Got a suspicious message? Check it here"
          intro="The same check as the Telegram bot. Paste a number, an account, a link or the whole message, or upload a screenshot. No sign-in."
        >
          <TryIt />
        </Section>

        {/* ---------- how it works ---------- */}
        <Section id="how" eyebrow="How it works" title="From scam message to stopped payment">
          <FlowDiagram />
        </Section>

        {/* ---------- the graph ---------- */}
        <Section
          id="graph"
          tone="tint"
          eyebrow="The scam graph"
          title="Watch one report protect everyone"
          intro="Numbers, accounts and links are linked when they appear in the same scam. Risk flows along the links."
        >
          <ScamGraph />
        </Section>

        {/* ---------- get protected ---------- */}
        <Section id="protect" eyebrow="Get protected" title="Three ways in, one graph behind them">
          <div className="grid gap-5 md:grid-cols-3">
            {PROTECT.map((p) => (
              <a
                key={p.title}
                href={p.href}
                className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-chart hover:border-brand"
              >
                <span className="flex-center size-11 rounded-full bg-blue-25">
                  <p.icon className="size-5 text-brand" aria-hidden />
                </span>
                <h3 className="text-18 font-bold text-gray-900">{p.title}</h3>
                <p className="text-14 text-gray-600">{p.line}</p>
                <span className="mt-auto flex items-center gap-1.5 pt-2 text-14 font-semibold text-brand">
                  {p.href.endsWith(".zip") ? <Download className="size-4" aria-hidden /> : null}
                  {p.cta}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </a>
            ))}
          </div>
        </Section>

        {/* ---------- compare ---------- */}
        <Section
          id="compare"
          tone="tint"
          eyebrow="Why it’s different"
          title="Classic reporting vs CrowdShield"
        >
          <CompareTimeline />
        </Section>

        {/* ---------- frauds ---------- */}
        <Section
          id="frauds"
          eyebrow="Common scams in Malaysia"
          title="What we catch, and the red flag to watch for"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FRAUDS.map((f) => (
              <article
                key={f.name}
                className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4"
                title={f.how}
              >
                <f.icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-14 font-semibold text-gray-900">
                    {f.name}{" "}
                    <span lang="ms" className="font-normal text-gray-500">
                      · {f.ms}
                    </span>
                  </h3>
                  <p className="text-14 text-gray-600">🚩 {f.flags[0]}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Verdicts you will see">
            {TIERS.map((t) => (
              <span key={t.label} className={`chip text-14 px-3 py-1.5 ${t.cls}`}>
                <t.icon className="size-4" aria-hidden />
                {t.label}
              </span>
            ))}
            <span className="chip text-14 px-3 py-1.5 text-gray-500">Never a “safe” tick</span>
          </div>
        </Section>

        {/* ---------- news ---------- */}
        <Section
          id="news"
          eyebrow="This week"
          title="Scams in the Malaysian news"
          intro="Found by a live web search (Tavily) and sorted by Nemotron, which keeps only real Malaysian cases and warnings. Every item links to its source."
        >
          <Suspense fallback={<NewsSkeleton />}>
            <NewsSection />
          </Suspense>
        </Section>

        {/* ---------- trust ---------- */}
        <section
          className="border-y border-gray-200 bg-gray-25 py-10"
          aria-label="Privacy and fairness"
        >
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-4 px-4 sm:px-6">
            {TRUST.map((x) => (
              <li key={x.t} className="flex items-center gap-2 text-14 font-medium text-gray-700">
                <x.icon className="size-5 text-brand" aria-hidden />
                {x.t}
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="bg-brand-dark-gradient py-16 text-white sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-30 sm:text-36 font-bold">Semak dulu. Check first.</h2>
              <p className="text-16 text-white/85">
                Forward anything suspicious to the bot, or sign in to the bank and business portals.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={BOT_URL}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-14 font-semibold text-brand-dark hover:bg-blue-25"
              >
                <MessageCircle className="size-4" aria-hidden /> @CrowdShieldBot
              </a>
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-14 font-semibold text-white hover:bg-white/10"
              >
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-12 text-gray-500 sm:flex-row sm:justify-between sm:px-6">
          <p>
            CrowdShield · hackathon demo build. All names, numbers and accounts shown are synthetic.
          </p>
          <p>
            Lost money to a scam? Call <b className="text-gray-700">NSRC 997</b> now.
          </p>
        </div>
      </footer>
    </div>
  );
}
