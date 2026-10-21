// Identifier normalisation, keyed hashing and masking (architecture §7, techstacks §3).
// Every identifier is normalised to one canonical string before hashing, so the same
// number/account/link always maps to the same entity. Lookups use the hash only;
// responses show the masked form only.
import { createHmac } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { parse as parseDomain } from "tldts";
import { BANKS, EWALLETS, resolveBankCode, resolveEwalletCode } from "./banks.js";

export { BANKS, EWALLETS, resolveBankCode, resolveEwalletCode } from "./banks.js";

export type IdentifierType =
  | "phone"
  | "whatsapp"
  | "telegram"
  | "bank_account"
  | "ewallet"
  | "url"
  | "domain"
  | "app"
  | "social_profile"
  | "crypto_wallet";

export interface Identifier {
  type: IdentifierType;
  /** Canonical value: the HMAC input. */
  value: string;
  /** Safe to show anywhere. */
  masked: string;
  /** Non-identifying attributes for entity.attrs (bank code, registrable domain…). */
  attrs: Record<string, string>;
}

export class NormaliseError extends Error {
  constructor(
    public readonly type: IdentifierType | "tin" | "ssm_no",
    message: string,
  ) {
    super(message);
    this.name = "NormaliseError";
  }
}

export interface NormaliseOptions {
  /** Bank (code, name or alias) for bank_account, if not part of the input. */
  bank?: string;
  /** E-wallet provider for ewallet, if not part of the input. */
  provider?: string;
  /** Platform for social_profile (facebook, instagram, tiktok…), if not part of the input. */
  platform?: string;
}

// ---------- phone (also whatsapp, and telegram numbers) ----------

function normalisePhoneValue(raw: string): { e164: string; national: string; country: string } {
  const cleaned = raw.trim().replace(/^00/, "+");
  const phone = parsePhoneNumberFromString(cleaned, "MY");
  if (!phone || !phone.isPossible())
    throw new NormaliseError("phone", `not a phone number: ${raw}`);
  return { e164: phone.number, national: phone.nationalNumber, country: phone.countryCallingCode };
}

/** '+60 12-***-4567' (Malaysia); '+65 ***-4567' elsewhere. */
function maskPhone(e164: string, country: string, national: string): string {
  const last4 = national.slice(-4);
  if (country === "60") return `+60 ${national.slice(0, 2)}-***-${last4}`;
  return `+${country} ***-${last4}`;
}

function phone(raw: string, type: "phone" | "whatsapp"): Identifier {
  const { e164, national, country } = normalisePhoneValue(raw);
  const attrs: Record<string, string> = { country };
  if (country === "60") attrs.prefix = `0${national.slice(0, national.startsWith("1") ? 2 : 1)}`;
  return { type, value: e164, masked: maskPhone(e164, country, national), attrs };
}

function telegram(raw: string): Identifier {
  const s = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "");
  if (/^[a-z][a-z0-9_]{3,31}$/i.test(s)) {
    const handle = s.toLowerCase();
    return {
      type: "telegram",
      value: `@${handle}`,
      masked: `@${handle.slice(0, 2)}***`,
      attrs: { kind: "username" },
    };
  }
  const p = phone(s, "phone");
  return { ...p, type: "telegram", attrs: { ...p.attrs, kind: "phone" } };
}

// ---------- bank accounts and e-wallets ----------

function splitProviderPrefix(raw: string, resolve: (s: string) => string | undefined) {
  // "Maybank 5123 4567 8901", "MBB:512345678901", "CIMB-8000123456"
  const m = raw.trim().match(/^([a-z][a-z' .&-]*?)[\s:-]*([+\d][\d\s-]*)$/i);
  if (m) {
    const code = resolve(m[1]!);
    if (code) return { code, rest: m[2]! };
  }
  return { code: undefined, rest: raw };
}

function bankAccount(raw: string, opts: NormaliseOptions): Identifier {
  const split = splitProviderPrefix(raw, resolveBankCode);
  const code = opts.bank ? resolveBankCode(opts.bank) : split.code;
  if (!code) throw new NormaliseError("bank_account", `unknown or missing bank for: ${raw}`);
  const digits = split.rest.replace(/[\s-]/g, "");
  if (!/^\d{7,17}$/.test(digits))
    throw new NormaliseError("bank_account", `not an account number: ${raw}`);
  return {
    type: "bank_account",
    value: `${code}:${digits}`,
    masked: `${code} ****${digits.slice(-4)}`,
    attrs: { bank_code: code, bank_name: BANKS[code]!.name },
  };
}

function ewallet(raw: string, opts: NormaliseOptions): Identifier {
  const split = splitProviderPrefix(raw, resolveEwalletCode);
  const code = opts.provider ? resolveEwalletCode(opts.provider) : split.code;
  if (!code)
    throw new NormaliseError("ewallet", `unknown or missing e-wallet provider for: ${raw}`);
  // Malaysian e-wallets are keyed by the registered phone number
  const { e164, national, country } = normalisePhoneValue(split.rest);
  return {
    type: "ewallet",
    value: `${code}:${e164}`,
    masked: `${code} ${maskPhone(e164, country, national)}`,
    attrs: { provider: code, provider_name: EWALLETS[code]!.name },
  };
}

// ---------- links ----------

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|igshid|mc_eid|mc_cid|_ga|ref_src)$/i;

function parseUrl(raw: string): URL {
  const s = raw.trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `http://${s}`);
  } catch {
    throw new NormaliseError("url", `not a URL: ${raw}`);
  }
}

function hostOf(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function url(raw: string): Identifier {
  const u = parseUrl(raw);
  if (!["http:", "https:"].includes(u.protocol))
    throw new NormaliseError("url", `unsupported scheme: ${u.protocol}`);
  const host = hostOf(u);
  if (!host.includes(".")) throw new NormaliseError("url", `not a URL: ${raw}`);
  // http/https and default ports collapse to one entity; tracking params and fragments are dropped
  const params = [...u.searchParams]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  const port = u.port ? `:${u.port}` : "";
  const value = `${host}${port}${path}${query}`;
  const domain = parseDomain(host).domain ?? host;
  return {
    type: "url",
    value,
    masked: path || query ? `${host}/…` : host,
    attrs: { host, registrable_domain: domain },
  };
}

function domain(raw: string): Identifier {
  const host = hostOf(parseUrl(raw));
  const parsed = parseDomain(host);
  if (!parsed.domain || !parsed.isIcann) throw new NormaliseError("domain", `not a domain: ${raw}`);
  // Domains are infrastructure, not personal data: shown in full
  return {
    type: "domain",
    value: parsed.domain,
    masked: parsed.domain,
    attrs: { tld: parsed.publicSuffix ?? "" },
  };
}

// ---------- apps, social profiles, crypto ----------

function app(raw: string): Identifier {
  const s = raw.trim().replace(/^(sha256|pkg):/i, ""); // already-normalised values stay stable
  if (/^[a-f0-9]{64}$/i.test(s)) {
    const hash = s.toLowerCase();
    return {
      type: "app",
      value: `sha256:${hash}`,
      masked: `APK ${hash.slice(0, 8)}…`,
      attrs: { kind: "apk_sha256" },
    };
  }
  const pkg = s.replace(/^.*[?&]id=([^&]+).*$/, "$1").toLowerCase(); // Play Store link → package
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(pkg))
    throw new NormaliseError("app", `not a package name or APK hash: ${raw}`);
  return { type: "app", value: `pkg:${pkg}`, masked: pkg, attrs: { kind: "package" } };
}

const SOCIAL_HOSTS: Record<string, string> = {
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "m.facebook.com": "facebook",
  "instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "x.com": "x",
  "twitter.com": "x",
  "threads.net": "threads",
  "youtube.com": "youtube",
  "linkedin.com": "linkedin",
};

function socialProfile(raw: string, opts: NormaliseOptions): Identifier {
  const s = raw.trim();
  let platform = opts.platform?.toLowerCase();
  let handle = s.replace(/^@/, "");
  const canonical = s.match(/^([a-z]+):(?!\/\/)(.+)$/i); // already-normalised "platform:handle"
  if (canonical && !platform && Object.values(SOCIAL_HOSTS).includes(canonical[1]!.toLowerCase())) {
    platform = canonical[1]!.toLowerCase();
    handle = canonical[2]!;
  } else if (/[./]/.test(s) && !platform) {
    const u = parseUrl(s);
    platform = SOCIAL_HOSTS[hostOf(u)];
    handle = u.pathname.split("/").filter(Boolean).join("/").replace(/^@/, "");
    const id = u.searchParams.get("id"); // facebook.com/profile.php?id=…
    if (id) handle = id;
  }
  if (!platform) throw new NormaliseError("social_profile", `unknown platform for: ${raw}`);
  handle = handle.toLowerCase();
  if (!handle) throw new NormaliseError("social_profile", `missing handle: ${raw}`);
  return {
    type: "social_profile",
    value: `${platform}:${handle}`,
    masked: `${platform}:${handle.slice(0, 2)}***`,
    attrs: { platform },
  };
}

function cryptoWallet(raw: string): Identifier {
  const s = raw.trim();
  let chain: string;
  let value: string;
  if (/^0x[a-f0-9]{40}$/i.test(s)) [chain, value] = ["evm", s.toLowerCase()];
  else if (/^bc1[a-z0-9]{8,87}$/i.test(s)) [chain, value] = ["btc", s.toLowerCase()];
  else if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s))
    [chain, value] = ["btc", s]; // base58: case-sensitive
  else if (/^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(s)) [chain, value] = ["tron", s];
  else throw new NormaliseError("crypto_wallet", `unrecognised wallet address: ${raw}`);
  return {
    type: "crypto_wallet",
    value,
    masked: `${value.slice(0, 6)}…${value.slice(-4)}`,
    attrs: { chain },
  };
}

// ---------- public API ----------

export function normalise(
  type: IdentifierType,
  raw: string,
  opts: NormaliseOptions = {},
): Identifier {
  switch (type) {
    case "phone":
      return phone(raw, "phone");
    case "whatsapp": {
      // wa.me/60123456789?text=… and api.whatsapp.com/send?phone=… links
      const m = raw
        .trim()
        .match(/^(?:https?:\/\/)?(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)([+\d]+)/i);
      return phone(m ? m[1]! : raw, "whatsapp");
    }
    case "telegram":
      return telegram(raw);
    case "bank_account":
      return bankAccount(raw, opts);
    case "ewallet":
      return ewallet(raw, opts);
    case "url":
      return url(raw);
    case "domain":
      return domain(raw);
    case "app":
      return app(raw);
    case "social_profile":
      return socialProfile(raw, opts);
    case "crypto_wallet":
      return cryptoWallet(raw);
  }
}

/**
 * entity.lookup_hash = HMAC-SHA256(pepper, normalised value) (schema.sql). The type is not part of
 * the message, so a number's phone and WhatsApp entities share a hash and are easy to link.
 */
export function lookupHash(value: string, pepper: string): Buffer {
  if (pepper.length < 32) throw new Error("HMAC pepper must be at least 32 characters");
  return createHmac("sha256", pepper).update(value, "utf8").digest();
}

/** Normalise + hash in one step: what every lookup and report does. */
export function identify(
  type: IdentifierType,
  raw: string,
  pepper: string,
  opts: NormaliseOptions = {},
) {
  const id = normalise(type, raw, opts);
  return { ...id, lookupHash: lookupHash(id.value, pepper) };
}

// ---------- SME identifiers (supplier records, not graph entities) ----------

/** LHDN TIN, e.g. 'C2584563200', 'IG12345678901'. */
export function normaliseTin(raw: string): string {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}\d{8,12}$/.test(s)) throw new NormaliseError("tin", `not a TIN: ${raw}`);
  return s;
}

/** SSM registration number: new 12-digit format ('202301012345') or old ('1234567-X'). */
export function normaliseSsmNo(raw: string): string {
  const s = raw.replace(/\s/g, "").toUpperCase();
  const newFormat = s.replace(/-/g, "");
  if (/^(19|20)\d{10}$/.test(newFormat)) return newFormat;
  const old = s.match(/^(\d{1,7})-?([A-Z])$/);
  if (old) return `${old[1]}-${old[2]}`;
  throw new NormaliseError("ssm_no", `not an SSM registration number: ${raw}`);
}
