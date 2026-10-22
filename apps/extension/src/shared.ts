// Shared by the service worker, the in-page snip/result panel and the chat watcher.
import type { PublicCheckResult, Verdict } from "@crowdshield/contracts";
import type { z } from "zod";

export type CheckResult = z.infer<typeof PublicCheckResult>;
export type { Verdict };

export const DEFAULT_API = "https://crowdshield.184-197-8-50.sslip.io";

/** Sites the watcher can run on, each enabled by the user (optional host permission). */
export const WATCH_SITES = [
  { id: "whatsapp", name: "WhatsApp Web", match: "https://web.whatsapp.com/*" },
  { id: "telegram", name: "Telegram Web", match: "https://web.telegram.org/*" },
  { id: "gmail", name: "Gmail", match: "https://mail.google.com/*" },
] as const;
export type SiteId = (typeof WATCH_SITES)[number]["id"];

export type Msg =
  | { type: "snip-start" }
  | { type: "snip-rect"; rect: { x: number; y: number; w: number; h: number }; dpr: number }
  | { type: "check-text"; text: string }
  | { type: "lookup"; identifiers: { type: string; value: string }[] }
  | { type: "show-busy"; label: string }
  | { type: "show-result"; result: CheckResult }
  | { type: "show-error"; message: string };

/** Tiers worth a warning in someone's chat; "no reports" is never shown as safe, just left alone. */
export const RISKY = new Set(["reported", "caution", "high", "confirmed"]);

export const TIER_COLOR: Record<string, { fg: string; bg: string; border: string }> = {
  confirmed: { fg: "#B42318", bg: "#FEF3F2", border: "#FECDCA" },
  high: { fg: "#B93815", bg: "#FFF4ED", border: "#FDD3BA" },
  caution: { fg: "#93370D", bg: "#FFFAEB", border: "#FEDF89" },
  reported: { fg: "#5E5A3F", bg: "#F8F7F1", border: "#E2DFC9" },
  no_known_risk: { fg: "#475467", bg: "#F9FAFB", border: "#EAECF0" },
  protected_official: { fg: "#175CD3", bg: "#EFF8FF", border: "#B2DDFF" },
};

// ---------- "It's me, new number, send money" ----------
// Runs on the device. A message is flagged when it asks for money AND either claims a new or broken
// phone, or pairs urgency with someone the victim trusts. The text only leaves the browser if the
// user taps "Check with AI".
const MONEY =
  /\b(transfer|bank[- ]?in|pindah(kan)?|hantar duit|send (me )?(some )?money|pinjam|borrow|lend me|top ?up|duitnow|tng|rm\s?\d[\d,.]*)\b/i;
const NEW_NUMBER =
  /\b(new (phone )?number|nombor baru|no\.? baru|nombor lain|tukar (nombor|no|phone|fon|hp)|this is my new|phone (rosak|hilang|broke|broken|lost|spoil)|hp (rosak|hilang)|guna nombor ni|save (this|my new) number|simpan nombor ni)\b/i;
const URGENT =
  /\b(urgent|segera|cepat|right now|sekarang|emergency|kecemasan|hospital|accident|kemalangan|jangan beritahu|don'?t tell|before \d|hari ni juga)\b/i;
const TRUSTED =
  /\b(mak|mama|mum|mom|ibu|ayah|abah|dad|papa|abang|kakak|adik|boss|bos|anak|sayang|uncle|aunty|cikgu)\b/i;

export function looksLikeImpersonation(text: string): boolean {
  if (text.length < 12 || text.length > 2000 || !MONEY.test(text)) return false;
  return NEW_NUMBER.test(text) || (URGENT.test(text) && TRUSTED.test(text));
}
