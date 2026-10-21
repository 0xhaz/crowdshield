// Channel-agnostic messages. The flows produce these; each channel adapter (Telegram now,
// WhatsApp later) maps them to its own API. Text uses a tiny HTML subset: <b>, <i>, <code>, <a href>.

export type Lang = "en" | "ms";

export interface Button {
  label: string;
  /** Opaque callback data (≤ 64 bytes). */
  data?: string;
  /** Or a link button. */
  url?: string;
}

export interface OutMessage {
  html: string;
  buttons?: Button[][];
}

export interface Media {
  data: Buffer;
  mime: string;
}

export type InEvent =
  | { kind: "text"; text: string }
  | { kind: "command"; name: string; arg: string }
  | { kind: "button"; data: string }
  | { kind: "photo"; load: () => Promise<Media> }
  | { kind: "document"; fileName?: string; mime?: string; load: () => Promise<Media> };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
