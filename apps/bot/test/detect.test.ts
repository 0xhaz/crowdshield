import { describe, expect, it } from "vitest";
import { detectIdentifiers } from "../src/detect.js";

const kinds = (text: string) => detectIdentifiers(text).map((f) => `${f.type}=${f.value}`);

describe("detectIdentifiers", () => {
  it("finds a Malaysian number in a forwarded message", () => {
    expect(kinds("Encik, saya pegawai PDRM. Sila hubungi 011-2345 4821 segera.")).toEqual([
      "phone=+601123454821",
    ]);
  });

  it("finds bank accounts by bank name without mistaking them for phones", () => {
    expect(kinds("Transfer ke akaun selamat Maybank 5123 4567 8812 sekarang")).toEqual([
      "bank_account=MBB:512345678812",
    ]);
    expect(kinds("CIMB acc no: 8001-2345-6677 dan Public Bank 6471 2093 5518")).toEqual([
      "bank_account=CIMB:800123456677",
      "bank_account=PBB:647120935518",
    ]);
  });

  it("finds e-wallets, links, wa.me, t.me and handles in one message", () => {
    expect(
      kinds(
        "Bayar TNG 018-355 7024 atau klik https://lhdn-refund-my.com/claim?utm_source=sms. WhatsApp wa.me/60172083391, Telegram @Qorvanta_Admin",
      ),
    ).toEqual([
      "ewallet=TNG:+60183557024",
      "url=lhdn-refund-my.com/claim",
      "whatsapp=+60172083391",
      "telegram=@qorvanta_admin",
    ]);
  });

  it("treats bare domains as links but ignores email addresses and amounts", () => {
    expect(
      kinds("visit pos-redelivery-my.top/pay now, email help@courier.com, fee RM1.280.00"),
    ).toEqual(["url=pos-redelivery-my.top/pay"]);
  });

  it("reads Play Store links as apps", () => {
    expect(
      kinds("download https://play.google.com/store/apps/details?id=com.qorvanta.trade"),
    ).toEqual(["app=pkg:com.qorvanta.trade"]);
  });

  it("reads other phone shapes, and not digits inside longer numbers", () => {
    expect(
      kinds("+60 11-2345 4821 | (011) 2345-4821 | 03-2698 8044 | 1-300-88-5465 | +65 8123 4567"),
    ).toEqual([
      "phone=+601123454821",
      "phone=+60326988044",
      "phone=+601300885465",
      "phone=+6581234567",
    ]);
    expect(kinds("ref 99012345678901234")).toEqual([]);
  });

  it("ignores short numbers, dates and amounts", () => {
    expect(kinds("Saya rugi RM 12000 pada 18/10/2026, kod OTP 123456")).toEqual([]);
  });

  it("de-duplicates and caps at five", () => {
    expect(kinds("0112345482 011-234 5482 +60112345482")).toHaveLength(1);
    const many = Array.from({ length: 8 }, (_, i) => `012-345 67${10 + i}`).join(" ");
    expect(detectIdentifiers(many)).toHaveLength(5);
  });
});
