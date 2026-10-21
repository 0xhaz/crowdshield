import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleAlert,
  FileWarning,
  Fingerprint,
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
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getToken } from "@/lib/session";

export const metadata: Metadata = {
  title: "CrowdShield: scam intelligence for Malaysia",
  description:
    "One shared scam graph for the public, banks, e-wallets and businesses. Check before you pay.",
};

const BOT_URL = "https://t.me/CrowdShieldBot";

// ---------- content ----------

const ROLES = [
  {
    icon: Building2,
    who: "Business owner",
    portal: "Semak supplier",
    does: "Checks an invoice or a “we changed bank” email before paying. Holds the payment and calls the supplier back on the number in their own records.",
    gives:
      "Fake supplier accounts, phone numbers and look-alike domains, once a change is rejected.",
    gets: "Scam history on the account, SSM, LHDN TIN and e-invoice, account-name and payment-history checks.",
  },
  {
    icon: Landmark,
    who: "Bank analyst",
    portal: "Fraud operations",
    does: "Runs a payee check before a transfer, sees if the customer is on a call with a flagged number, then holds, calls back, freezes or confirms a mule.",
    gives: "Bank-confirmed mule accounts and money trails: the strongest evidence in the graph.",
    gets: "Risk on every payee, with reasons; alerts, cases, timelines and the one-hop graph.",
  },
  {
    icon: ScrollText,
    who: "Bank supervisor",
    portal: "Oversight",
    does: "Reviews every decision in the audit log and rules on appeals from people who say they were wrongly listed.",
    gives:
      "Upheld appeals, which cut a listing’s risk tenfold, so recycled numbers and innocent owners recover.",
    gets: "Everything the analyst sees, plus the audit trail with the policy version of each decision.",
  },
] as const;

const STORY = [
  {
    who: "Public",
    icon: MessageCircle,
    text: "A retiree forwards a screenshot to the bot: a “police inspector” and a “safe account”. She reports it.",
    result: "The account is now “Be careful”: it’s linked to a confirmed scam caller.",
  },
  {
    who: "Bank analyst",
    icon: Landmark,
    text: "Minutes later, another customer tries to pay that account while on a call with the same number.",
    result: "Combined risk: high. The transfer is held and the analyst confirms the mule.",
  },
  {
    who: "Business owner",
    icon: Building2,
    text: "A hardware shop gets an invoice from its usual steel supplier: “we changed bank”. The new account received money from that mule.",
    result: "Do not pay yet. Callback, reject, and the account is reported back.",
  },
  {
    who: "Bank supervisor",
    icon: ScrollText,
    text: "Reviews the decisions in the audit log, and upholds an appeal from someone whose recycled number was reported.",
    result: "The graph stays accurate and fair for everyone who relies on it.",
  },
] as const;

const ACCESS = [
  [
    "Sees",
    "Their own suppliers and checks",
    "Alerts and cases; money trails; cash-outs from their own bank only",
    "Everything the analyst sees, plus the audit log and appeals",
  ],
  [
    "Decides",
    "Pay, hold, release or reject a supplier payment",
    "Hold, call back, release, freeze, confirm mule, clear",
    "Uphold or reject appeals; reviews analysts’ decisions",
  ],
  [
    "Adds to the graph",
    "Rejected fake accounts, phones and domains",
    "Bank-confirmed mules and outcomes",
    "Upheld appeals (clearing)",
  ],
  [
    "Never sees",
    "Other businesses’ data, bank cases",
    "Raw numbers or accounts, reporter identities, other banks’ cash-outs",
    "Raw numbers or accounts, reporter identities",
  ],
] as const;

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

type Cell = { ok: boolean; text: string };
const COMPARE: [string, Cell, Cell][] = [
  [
    "When it helps",
    { ok: false, text: "After the money is gone" },
    { ok: true, text: "Before you pay, and during the scam" },
  ],
  [
    "The call and the transfer",
    { ok: false, text: "Seen separately by the telco and the bank" },
    { ok: true, text: "Joined at the payee check, with the customer’s consent" },
  ],
  [
    "Who gets warned",
    { ok: false, text: "Mostly the victim’s own bank, case by case" },
    { ok: true, text: "Every bank, e-wallet, business and bot user on the network" },
  ],
  [
    "How fast others are warned",
    { ok: false, text: "Once the case is processed" },
    { ok: true, text: "On the next check: scores update as reports arrive" },
  ],
  [
    "Near misses (no money lost)",
    { ok: false, text: "Rarely reported" },
    { ok: true, text: "Counted: they warn the next person" },
  ],
  [
    "Report quality",
    { ok: false, text: "From memory, under stress, on the phone" },
    { ok: true, text: "A pre-filled 997 call sheet: time, amount, account, reference" },
  ],
  [
    "Evidence",
    { ok: false, text: "Screenshots left on the victim’s phone" },
    { ok: true, text: "Stored with a hash and attached to the report" },
  ],
  [
    "Supplier invoices",
    { ok: false, text: "Manual phone calls, if anyone checks" },
    { ok: true, text: "Registration, tax ID, account name, history and scam checks at once" },
  ],
  [
    "Answer you get",
    { ok: false, text: "Often none until an investigation" },
    { ok: true, text: "A verdict in seconds, with reasons and one clear action" },
  ],
];

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
            <a href="#roles" className="hover:text-brand">
              How it works
            </a>
            <a href="#frauds" className="hover:text-brand">
              Common frauds
            </a>
            <a href="#compare" className="hover:text-brand">
              Why it’s different
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

        {/* ---------- roles ---------- */}
        <Section
          id="roles"
          eyebrow="How it works"
          title="One graph, three roles, one shared picture"
          intro="The business owner, the bank analyst and the bank supervisor each see a different part of a scam. CrowdShield connects them, alongside the public on Telegram, without anyone handing over customer data."
        >
          <div className="grid gap-6 md:grid-cols-3">
            {ROLES.map((r) => (
              <article
                key={r.who}
                className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-chart"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-center size-11 rounded-full bg-brand-light">
                    <r.icon className="size-5 text-brand" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-18 font-semibold text-gray-900">{r.who}</h3>
                    <p className="text-14 text-gray-500">{r.portal}</p>
                  </div>
                </div>
                <p className="text-16 text-gray-700">{r.does}</p>
                <dl className="flex flex-col gap-3 border-t border-gray-200 pt-4 text-14">
                  <div>
                    <dt className="font-semibold text-gray-900">Adds to the graph</dt>
                    <dd className="text-gray-600">{r.gives}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-900">Gets from the graph</dt>
                    <dd className="text-gray-600">{r.gets}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* the shared-graph hub */}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand/20 bg-brand-light/50 p-6 text-center sm:flex-row sm:text-left">
            <span className="flex-center size-14 shrink-0 rounded-full bg-brand">
              <Fingerprint className="size-7 text-white" aria-hidden />
            </span>
            <p className="text-16 text-gray-800">
              <b>The shared scam graph</b> links phone numbers, accounts, e-wallets, links and apps
              that appear in the same scams or money trails. Risk flows along those links: an
              account that receives money from a confirmed mule is flagged too, but a victim’s own
              account never is.
            </p>
          </div>

          {/* one story across roles */}
          <div className="flex flex-col gap-4">
            <h3 className="text-20 font-semibold text-gray-900">
              One mule account, four points of view
            </h3>
            <ol className="grid gap-4 lg:grid-cols-4">
              {STORY.map((s, i) => (
                <li
                  key={s.who}
                  className="relative flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-25 p-5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex-center size-8 rounded-full bg-brand text-14 font-bold text-white"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <s.icon className="size-5 text-brand" aria-hidden />
                    <span className="text-14 font-semibold text-gray-900">{s.who}</span>
                  </div>
                  <p className="text-14 text-gray-700">{s.text}</p>
                  <p className="mt-auto rounded-lg bg-white p-3 text-14 font-medium text-gray-900">
                    {s.result}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* who sees what */}
          <div className="flex flex-col gap-4">
            <h3 className="text-20 font-semibold text-gray-900">Who sees and decides what</h3>
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full min-w-[720px] text-left text-14">
                <caption className="sr-only">Access and decisions by role</caption>
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th scope="col" className="p-4 font-semibold"></th>
                    <th scope="col" className="p-4 font-semibold">
                      Business owner
                    </th>
                    <th scope="col" className="p-4 font-semibold">
                      Bank analyst
                    </th>
                    <th scope="col" className="p-4 font-semibold">
                      Bank supervisor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ACCESS.map(([row, ...cells]) => (
                    <tr key={row}>
                      <th scope="row" className="whitespace-nowrap p-4 font-semibold text-gray-900">
                        {row}
                      </th>
                      {cells.map((c, i) => (
                        <td key={i} className="p-4 text-gray-700">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ---------- frauds ---------- */}
        <Section
          id="frauds"
          tone="tint"
          eyebrow="Common frauds in Malaysia"
          title="Know the patterns, spot the red flags"
          intro="Most losses are transfers the victim makes themselves, coached by someone they trust. These are the patterns CrowdShield is built to catch."
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FRAUDS.map((f) => (
              <article
                key={f.name}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-chart"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-center size-10 shrink-0 rounded-full bg-risk-high-bg">
                    <f.icon className="size-5 text-risk-high" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-16 font-semibold text-gray-900">{f.name}</h3>
                    <p className="text-12 text-gray-500" lang="ms">
                      {f.ms}
                    </p>
                  </div>
                </div>
                <p className="text-14 text-gray-700">{f.how}</p>
                <div>
                  <p className="text-12 font-semibold uppercase tracking-wide text-gray-500">
                    Red flags
                  </p>
                  <ul className="mt-1 flex flex-col gap-1 text-14 text-gray-800">
                    {f.flags.map((x) => (
                      <li key={x} className="flex gap-2">
                        <CircleAlert
                          className="mt-0.5 size-4 shrink-0 text-risk-caution"
                          aria-hidden
                        />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-auto flex gap-2 rounded-lg bg-brand-light/60 p-3 text-14 text-gray-900">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>
                    <b>CrowdShield:</b> {f.cs}
                  </span>
                </p>
              </article>
            ))}
          </div>
          <p className="text-14 text-gray-600">
            The rule that stops almost all of them:{" "}
            <b>police, BNM and banks never ask you to transfer money to protect it.</b> When in
            doubt, hang up and call back on an official number.
          </p>
        </Section>

        {/* ---------- compare ---------- */}
        <Section
          id="compare"
          eyebrow="Why it’s different"
          title="Classic reporting vs CrowdShield"
          intro="Calling NSRC 997 and making a police report are still essential after a loss. CrowdShield doesn’t replace them: it gets people there faster with better information, and stops more scams before any money moves."
        >
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[720px] text-left text-14">
              <caption className="sr-only">Classic reporting compared with CrowdShield</caption>
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="w-[24%] p-4 font-semibold text-gray-700"></th>
                  <th scope="col" className="w-[38%] p-4 font-semibold text-gray-700">
                    Classic reporting
                  </th>
                  <th scope="col" className="w-[38%] p-4 font-semibold text-brand">
                    With CrowdShield
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {COMPARE.map(([row, before, after]) => (
                  <tr key={row}>
                    <th scope="row" className="p-4 font-semibold text-gray-900">
                      {row}
                    </th>
                    <td className="p-4 text-gray-700">
                      <span className="flex gap-2">
                        <X
                          className="mt-0.5 size-4 shrink-0 text-gray-400"
                          aria-label="Limitation"
                        />
                        {before.text}
                      </span>
                    </td>
                    <td className="bg-brand-light/30 p-4 text-gray-900">
                      <span className="flex gap-2">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-success-700"
                          aria-label="With CrowdShield"
                        />
                        {after.text}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-20 font-semibold text-gray-900">Clear answers, never “safe”</h3>
            <div className="flex flex-wrap gap-3">
              {TIERS.map((t) => (
                <span key={t.label} className={`chip text-14 px-3 py-1.5 ${t.cls}`}>
                  <t.icon className="size-4" aria-hidden />
                  {t.label} · <span lang="ms">{t.ms}</span>
                </span>
              ))}
              <span className="chip text-14 border-risk-info-border bg-risk-info-bg px-3 py-1.5 text-risk-info">
                <PhoneCall className="size-4" aria-hidden />
                Official number, may be spoofed
              </span>
            </div>
            <p className="text-14 text-gray-600">
              Every verdict shows its reasons and one action. An unknown number gets “No reports
              found”, with a reminder of the rules, never a green light.
            </p>
          </div>
        </Section>

        {/* ---------- trust ---------- */}
        <Section
          id="trust"
          tone="tint"
          eyebrow="Trust by design"
          title="Built for PDPA, and fair to the people listed"
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: KeyRound,
                t: "Hashed identifiers",
                d: "Numbers and accounts are looked up by keyed hash; raw values stay encrypted.",
              },
              {
                icon: Lock,
                t: "Masked everywhere",
                d: "+60 11-***-4821 in every screen and message. No public blacklist.",
              },
              {
                icon: BadgeCheck,
                t: "Redacted before AI",
                d: "IC numbers, phones and accounts are removed from text before any AI model sees it.",
              },
              {
                icon: UserCheck,
                t: "Reporters never named",
                d: "Verdicts show evidence counts and sources, never who reported.",
              },
              {
                icon: Scale,
                t: "Appeals",
                d: "Wrongly listed? A supervisor reviews it; an upheld appeal clears the score.",
              },
              {
                icon: ScrollText,
                t: "Audit trail",
                d: "Every lookup and decision is logged with the policy in force.",
              },
            ].map((x) => (
              <div key={x.t} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                <x.icon className="size-6 shrink-0 text-brand" aria-hidden />
                <div>
                  <h3 className="text-16 font-semibold text-gray-900">{x.t}</h3>
                  <p className="text-14 text-gray-600">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

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
