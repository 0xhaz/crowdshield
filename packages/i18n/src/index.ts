// Human-written copy in BM and EN (techstacks §11). Critical warnings are written and reviewed by
// people, not generated on the fly. Consumer wording avoids jargon ("account used by scammers to
// receive money", not "mule account"). ZH and TA come later.

export type Lang = "en" | "ms";
export type Text = Record<Lang, string>;

export const TIER_LABEL = {
  confirmed: { en: "Confirmed scam", ms: "Scam disahkan" },
  high: { en: "High risk", ms: "Risiko tinggi" },
  caution: { en: "Be careful", ms: "Berhati-hati" },
  reported: { en: "Some reports", ms: "Ada laporan" },
  no_known_risk: { en: "No reports found", ms: "Tiada laporan" },
  protected_official: {
    en: "Official number, may be spoofed",
    ms: "Nombor rasmi, mungkin dipalsukan",
  },
} as const satisfies Record<string, Text>;

export type TierKey = keyof typeof TIER_LABEL;

/** One concrete action per tier (techstacks §11 risk-tier table). Never says "safe". */
export const TIER_ACTION = {
  confirmed: { en: "Do not pay or reply. Report it.", ms: "Jangan bayar atau balas. Laporkan." },
  high: {
    en: "Stop. Verify through official channels before you do anything.",
    ms: "Berhenti. Sahkan melalui saluran rasmi sebelum berbuat apa-apa.",
  },
  caution: { en: "Verify before you act.", ms: "Sahkan dahulu sebelum bertindak." },
  reported: { en: "Proceed carefully.", ms: "Teruskan dengan berhati-hati." },
  no_known_risk: {
    en: "No reports found, but that doesn't mean it is safe. Police and BNM never ask you to transfer money.",
    ms: "Tiada laporan, tetapi ini tidak bermakna ia selamat. Polis dan BNM tidak pernah meminta anda memindahkan wang.",
  },
  protected_official: {
    en: "Hang up and call back on the official number.",
    ms: "Letak telefon dan hubungi semula nombor rasmi.",
  },
} as const satisfies Record<TierKey, Text>;

export const SCAM_TYPE_LABEL = {
  macau_impersonation: {
    en: "fake police / BNM officer (Macau scam)",
    ms: "pegawai polis / BNM palsu (scam Macau)",
  },
  investment: { en: "investment scam", ms: "scam pelaburan" },
  parcel: { en: "fake parcel / courier", ms: "bungkusan / kurier palsu" },
  job_task: { en: "fake part-time job", ms: "kerja sambilan palsu" },
  love_romance: { en: "love scam", ms: "scam cinta" },
  ecommerce: { en: "online shopping scam", ms: "scam belian dalam talian" },
  loan: { en: "fake loan", ms: "pinjaman palsu" },
  phishing_link: { en: "phishing link", ms: "pautan pancingan data" },
  malware_apk: { en: "malicious app (APK)", ms: "aplikasi berbahaya (APK)" },
  account_takeover: { en: "account takeover", ms: "pengambilalihan akaun" },
  bec_supplier: {
    en: "fake supplier / bank-detail change",
    ms: "pembekal palsu / tukar akaun bank",
  },
  other: { en: "other scam", ms: "scam lain" },
} as const satisfies Record<string, Text>;

export type ScamTypeKey = keyof typeof SCAM_TYPE_LABEL;

/** Scam-specific action, used instead of the tier action for high-risk and confirmed results. */
export const SCAM_TYPE_ACTION: Partial<Record<ScamTypeKey, Text>> = {
  macau_impersonation: {
    en: "Hang up. Police and BNM never ask you to transfer money.",
    ms: "Letak telefon. Polis dan BNM tidak pernah meminta anda memindahkan wang.",
  },
  investment: {
    en: "Do not invest. Licensed firms never promise guaranteed returns. Check the SC Investor Alert List.",
    ms: "Jangan melabur. Syarikat berlesen tidak menjanjikan pulangan terjamin. Semak Senarai Amaran Pelabur SC.",
  },
  parcel: {
    en: "Don't click the link. Couriers don't ask for payment through SMS links.",
    ms: "Jangan klik pautan. Syarikat kurier tidak meminta bayaran melalui pautan SMS.",
  },
  job_task: {
    en: "Don't pay to get a job or to 'unlock' tasks.",
    ms: "Jangan bayar untuk mendapatkan kerja atau untuk 'membuka' tugasan.",
  },
  phishing_link: {
    en: "Don't open the link or enter your banking login or OTP.",
    ms: "Jangan buka pautan atau masukkan log masuk bank atau OTP anda.",
  },
  love_romance: {
    en: "Never send money to someone you have only met online.",
    ms: "Jangan hantar wang kepada orang yang anda kenali hanya dalam talian.",
  },
  ecommerce: {
    en: "Pay only through the platform's own checkout.",
    ms: "Bayar hanya melalui sistem pembayaran platform.",
  },
  loan: {
    en: "Licensed lenders never ask for fees upfront.",
    ms: "Pemberi pinjaman berlesen tidak meminta bayaran pendahuluan.",
  },
  malware_apk: {
    en: "Don't install apps from links. If you did, turn on flight mode and call your bank's official number.",
    ms: "Jangan pasang aplikasi daripada pautan. Jika sudah, hidupkan mod pesawat dan hubungi nombor rasmi bank anda.",
  },
  account_takeover: {
    en: "Call your bank's official number now and use the kill switch to lock your account.",
    ms: "Hubungi nombor rasmi bank anda sekarang dan gunakan suis pemati untuk mengunci akaun anda.",
  },
  bec_supplier: {
    en: "Hold the payment. Call the supplier on a number from your own records, not the one in the email.",
    ms: "Tahan pembayaran. Hubungi pembekal melalui nombor dalam rekod anda sendiri, bukan nombor dalam e-mel.",
  },
};

/** Explanation lines per evidence source; {n} = count. Never names reporters. */
export const SOURCE_LINE = {
  pdrm_semakmule: { en: "Listed by PDRM Semak Mule", ms: "Disenaraikan oleh PDRM Semak Mule" },
  bank_confirmed: { en: "Confirmed by a member bank", ms: "Disahkan oleh bank ahli" },
  bank_trace: {
    en: "Received money a member bank traced from {n} scam case(s)",
    ms: "Menerima wang yang dijejak oleh bank ahli daripada {n} kes penipuan",
  },
  nsrc_case: { en: "{n} NSRC (997) case(s)", ms: "{n} kes NSRC (997)" },
  regulator_alert: { en: "On the BNM / SC alert list", ms: "Dalam senarai amaran BNM / SC" },
  threat_feed: {
    en: "Listed in phishing / malware feeds",
    ms: "Disenaraikan dalam suapan pancingan data / perisian hasad",
  },
  user_report_verified: {
    en: "{n} report(s) from the public with evidence",
    ms: "{n} laporan orang awam dengan bukti",
  },
  user_report: { en: "{n} report(s) from the public", ms: "{n} laporan orang awam" },
  news_extraction: {
    en: "Mentioned in {n} news or web source(s)",
    ms: "Disebut dalam {n} sumber berita atau web",
  },
  model_inference: {
    en: "Flagged by a model (a lead, not evidence)",
    ms: "Ditanda oleh model (petunjuk, bukan bukti)",
  },
} as const satisfies Record<string, Text>;

export const GRAPH_LINE = {
  money_flow: {
    en: "Received money from an account used by scammers ({masked})",
    ms: "Menerima wang daripada akaun yang digunakan oleh penipu ({masked})",
  },
  co_case: {
    en: "Used in the same scam as {masked}",
    ms: "Digunakan dalam scam yang sama dengan {masked}",
  },
  same_device: { en: "Same device as {masked}", ms: "Peranti yang sama dengan {masked}" },
  redirects_to: { en: "Linked to {masked}", ms: "Dipautkan kepada {masked}" },
  same_campaign: {
    en: "Part of the same scam campaign as {masked}",
    ms: "Sebahagian daripada kempen scam yang sama dengan {masked}",
  },
} as const satisfies Record<string, Text>;

export const APPEAL_LINE: Text = {
  en: "The owner's appeal was upheld; earlier reports count much less",
  ms: "Rayuan pemilik diterima; laporan terdahulu kurang diambil kira",
};

export function fill(text: Text, vars: Record<string, string | number>): Text {
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  return { en: sub(text.en), ms: sub(text.ms) };
}

// ---------- AI trace (which model did what, shown in the bot and the web app) ----------
const MODEL_NAMES: [RegExp, string][] = [
  [/ultra/i, "Nemotron 3 Ultra"],
  [/super-vl|super_vl/i, "Nemotron 3.5 Super VL"],
  [/super/i, "Nemotron 3 Super"],
  [/nano/i, "Nemotron 3 Nano"],
  [/lightning/i, "Nemotron 3.5 Lightning"],
  [/embedding/i, "Qwen3 Embedding"],
];

/** "nvidia/Nemotron-3-Ultra-550b-a55b" → "Nemotron 3 Ultra" */
export const modelLabel = (id: string | undefined) =>
  MODEL_NAMES.find(([re]) => re.test(id ?? ""))?.[1] ?? id ?? "model";

export interface TraceLike {
  calls: { kind: string; model?: string; ms: number; reasoning?: boolean }[];
  totalMs: number;
  cached: boolean;
}

/** One line: "Nemotron 3 Ultra (reasoning) · Tavily ×2 · 3.1 s", or "cached" when nothing ran. */
export function traceSummary(t: TraceLike | null | undefined): string | null {
  if (!t) return null;
  if (!t.calls.length) return t.cached ? "cached result" : null;
  const parts = new Map<string, number>();
  for (const c of t.calls) {
    const name =
      c.kind === "tavily"
        ? "Tavily web search"
        : `${modelLabel(c.model)}${c.reasoning ? " (reasoning)" : ""}`;
    parts.set(name, (parts.get(name) ?? 0) + 1);
  }
  const list = [...parts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(" · ");
  return `${list} · ${(t.totalMs / 1000).toFixed(1)} s`;
}
