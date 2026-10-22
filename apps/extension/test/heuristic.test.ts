import { describe, expect, it } from "vitest";
import { looksLikeImpersonation } from "../src/shared.js";

describe("impersonation heuristic (runs on the device)", () => {
  it.each([
    "Mak, ni nombor baru adik. Phone lama rosak. Boleh pindahkan RM800 dulu? Urgent",
    "Hi Dad, this is my new number, my phone broke. Can you transfer RM1,500 to this account today?",
    "Abang, adik kat hospital sekarang, tolong bank in RM2000 cepat, jangan beritahu mak",
    "Boss, saya guna nombor ni dulu. Tolong transfer duit supplier sekarang, urgent",
    "Sayang I accident, need you send money right now please",
  ])("flags: %s", (text) => expect(looksLikeImpersonation(text)).toBe(true));

  it.each([
    "Mak, adik dah sampai rumah. Esok kita makan sama-sama",
    "Your Grab receipt: RM 23.40 paid with card ending 4821",
    "This is my new number, please save it", // no money request
    "Dad can you transfer RM50 for my book this weekend", // money from family but no new number, no urgency
    "Payment of RM1,200 received. Thank you for banking with us.",
  ])("leaves alone: %s", (text) => expect(looksLikeImpersonation(text)).toBe(false));
});
