// Finds identifiers (numbers, bank accounts, e-wallets, links, handles) in forwarded text.
// Deterministic regex + the shared normaliser; free-text understanding by Nemotron comes in Phase 3.
import { BANKS, EWALLETS, normalise, type IdentifierType } from "@crowdshield/normalise";

export interface Found {
  type: IdentifierType;
  /** Canonical value (normalised); sent to the API as the identifier value. */
  value: string;
  masked: string;
}

const MAX = 5;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const aliases = (table: Record<string, { name: string; aliases: string[] }>) =>
  Object.entries(table)
    .flatMap(([code, b]) => [code, b.name, ...b.aliases])
    .sort((a, b) => b.length - a.length)
    .map(escRe)
    .join("|");

const QUALIFIER = "(?:\\s*(?:a\\/c|acc(?:ount)?|akaun|no\\.?|number|nombor)\\b\\.?)*";
const BANK_RE = new RegExp(
  `\\b(${aliases(BANKS)})\\b${QUALIFIER}\\s*[:#-]?\\s*(\\d[\\d\\s-]{5,22}\\d)`,
  "gi",
);
const EWALLET_RE = new RegExp(
  `\\b(${aliases(EWALLETS)})\\b${QUALIFIER}\\s*[:#-]?\\s*(\\+?\\d[\\d\\s-]{7,16}\\d)`,
  "gi",
);
const URL_RE =
  /\b(?:https?:\/\/[^\s<>"']+|(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/[^\s<>"']*)?)/gi;
const HANDLE_RE = /(?:^|[\s(])@([A-Za-z][A-Za-z0-9_]{4,31})\b/g;
// Malaysian shapes (mobile 01x, landline 0[3-9], 1-300/1-800) or an explicit +country number;
// separators are single spaces/dashes inside the number, so neighbouring numbers don't merge
const PHONE_RE = new RegExp(
  [
    String.raw`(?:\+?60[\s-]?|\(?0)1\d\)?[\s-]?\d{3,4}[\s-]?\d{4}`,
    String.raw`(?:\+?60[\s-]?|\(?0)[3-9]\d?\)?[\s-]?\d{3,4}[\s-]?\d{4}`,
    String.raw`1[\s-]?[38]00[\s-]?\d{2}[\s-]?\d{4}`,
    String.raw`\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}(?:[\s-]?\d{3,4})?`,
  ]
    .map((p) => String.raw`(?<![\d+])(?:${p})(?!\d)`)
    .join("|"),
  "g",
);

function tryNorm(type: IdentifierType, raw: string, opts = {}): Found | null {
  try {
    const id = normalise(type, raw, opts);
    return { type, value: id.value, masked: id.masked };
  } catch {
    return null;
  }
}

export function detectIdentifiers(text: string): Found[] {
  const found: (Found & { at: number })[] = [];
  let rest = ` ${text} `;
  const take = (m: RegExpMatchArray, f: Found | null) => {
    if (!f) return;
    found.push({ ...f, at: m.index! });
    rest = rest.replace(m[0], " ".repeat(m[0].length)); // don't re-detect digits as phones
  };

  for (const m of rest.matchAll(BANK_RE)) take(m, tryNorm("bank_account", `${m[1]} ${m[2]}`));
  for (const m of rest.matchAll(EWALLET_RE)) take(m, tryNorm("ewallet", `${m[1]} ${m[2]}`));
  for (const m of rest.matchAll(URL_RE)) {
    const raw = m[0].replace(/[).,;!?]+$/, "");
    const before = rest[m.index! - 1];
    if (before === "@") continue; // email address, not a link
    const host = raw
      .replace(/^https?:\/\//i, "")
      .split(/[/?#]/)[0]!
      .toLowerCase();
    if (/^(wa\.me|api\.whatsapp\.com)$/.test(host)) take(m, tryNorm("whatsapp", raw));
    else if (/^(t\.me|telegram\.me)$/.test(host)) take(m, tryNorm("telegram", raw));
    else if (host === "play.google.com") take(m, tryNorm("app", raw));
    else if (/^\d+(\.\d+)+$/.test(host))
      continue; // amounts like 1.280.00
    else take(m, tryNorm("url", raw));
  }
  for (const m of rest.matchAll(HANDLE_RE)) take(m, tryNorm("telegram", `@${m[1]}`));
  for (const m of rest.matchAll(PHONE_RE)) take(m, tryNorm("phone", m[0]));

  const seen = new Set<string>();
  // in the order they appear in the message
  return found
    .sort((a, b) => a.at - b.at)
    .map((f): Found => ({ type: f.type, value: f.value, masked: f.masked }))
    .filter((f) => {
      const k = `${f.type}:${f.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX);
}

/** Default role of an identifier in a report, by type. */
export function defaultRole(type: IdentifierType) {
  switch (type) {
    case "phone":
      return "caller" as const;
    case "whatsapp":
    case "telegram":
      return "messenger" as const;
    case "bank_account":
    case "ewallet":
      return "payee_account" as const;
    case "url":
    case "domain":
      return "link_sent" as const;
    case "app":
      return "app_installed" as const;
    case "social_profile":
      return "profile_used" as const;
    case "crypto_wallet":
      return "wallet_used" as const;
  }
}
