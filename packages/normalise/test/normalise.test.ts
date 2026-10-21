import { describe, expect, it } from "vitest";
import {
  identify,
  lookupHash,
  normalise,
  NormaliseError,
  normaliseSsmNo,
  normaliseTin,
} from "../src/index.js";

const PEPPER = "x".repeat(64);

describe("phone", () => {
  it.each([
    "011-2345 4821",
    "+60 11-2345 4821",
    "60112345 4821",
    "0060112345 4821",
    "(011) 2345-4821",
  ])("normalises %s to one E.164 value", (raw) => {
    expect(normalise("phone", raw)).toMatchObject({
      value: "+601123454821",
      masked: "+60 11-***-4821",
    });
  });

  it("handles 10-digit mobiles and landlines", () => {
    expect(normalise("phone", "012-345 6789")).toMatchObject({
      value: "+60123456789",
      masked: "+60 12-***-6789",
      attrs: { prefix: "012" },
    });
    expect(normalise("phone", "03-2698 8044")).toMatchObject({
      value: "+60326988044",
      attrs: { prefix: "03" },
    });
    expect(normalise("phone", "1-300-88-5465").value).toBe("+601300885465");
  });

  it("keeps foreign numbers and masks without the Malaysian layout", () => {
    expect(normalise("phone", "+65 8123 4567")).toMatchObject({
      value: "+6581234567",
      masked: "+65 ***-4567",
    });
  });

  it.each(["12", "hello", "0123"])("rejects %s", (raw) => {
    expect(() => normalise("phone", raw)).toThrow(NormaliseError);
  });
});

describe("whatsapp and telegram", () => {
  it("reads wa.me links", () => {
    expect(normalise("whatsapp", "https://wa.me/60112345482?text=hi").value).toBe("+60112345482");
    expect(normalise("whatsapp", "api.whatsapp.com/send?phone=60112345482").value).toBe(
      "+60112345482",
    );
  });

  it("shares the hash between a number's phone and WhatsApp entities", () => {
    expect(identify("whatsapp", "011-2345 482", PEPPER).lookupHash).toEqual(
      identify("phone", "+6011 2345482", PEPPER).lookupHash,
    );
  });

  it("normalises Telegram usernames and links", () => {
    expect(normalise("telegram", "@Qorvanta_Admin")).toMatchObject({
      value: "@qorvanta_admin",
      masked: "@qo***",
    });
    expect(normalise("telegram", "https://t.me/Qorvanta_Admin").value).toBe("@qorvanta_admin");
  });
});

describe("bank_account", () => {
  it.each([
    ["Maybank 5123 4567 8812", {}],
    ["MBB:512345678812", {}],
    ["512345678812", { bank: "maybank" }],
    ["malayan banking - 5123-4567-8812", {}],
  ])("normalises %s", (raw, opts) => {
    expect(normalise("bank_account", raw, opts)).toMatchObject({
      value: "MBB:512345678812",
      masked: "MBB ****8812",
      attrs: { bank_code: "MBB" },
    });
  });

  it("resolves multi-word bank names", () => {
    expect(normalise("bank_account", "Hong Leong Bank 1234 5678 90").value).toBe("HLB:1234567890");
  });

  it("requires a known bank and a plausible account number", () => {
    expect(() => normalise("bank_account", "512345678812")).toThrow(/bank/);
    expect(() => normalise("bank_account", "Bank Nowhere 512345678812")).toThrow(NormaliseError);
    expect(() => normalise("bank_account", "MBB 12")).toThrow(/account/);
  });
});

describe("ewallet", () => {
  it("keys e-wallets by provider and phone", () => {
    expect(normalise("ewallet", "TNG 012-345 6789")).toMatchObject({
      value: "TNG:+60123456789",
      masked: "TNG +60 12-***-6789",
    });
    expect(normalise("ewallet", "0123456789", { provider: "Touch 'n Go" }).value).toBe(
      "TNG:+60123456789",
    );
  });
});

describe("url and domain", () => {
  it("collapses scheme, www, case, tracking params, fragments and trailing slashes", () => {
    const a = normalise("url", "HTTPS://www.LHDN-Refund-MY.com/claim/?utm_source=sms&id=42#top");
    const b = normalise("url", "lhdn-refund-my.com/claim?id=42");
    expect(a.value).toBe("lhdn-refund-my.com/claim?id=42");
    expect(b.value).toBe(a.value);
    expect(a).toMatchObject({
      masked: "lhdn-refund-my.com/…",
      attrs: { registrable_domain: "lhdn-refund-my.com" },
    });
  });

  it("sorts query params so equivalent links match", () => {
    expect(normalise("url", "bit.ly/x?b=2&a=1").value).toBe(
      normalise("url", "bit.ly/x?a=1&b=2").value,
    );
  });

  it("reduces hosts to the registrable domain, including .com.my", () => {
    expect(normalise("domain", "https://secure.maybank2u-login.com.my/path").value).toBe(
      "maybank2u-login.com.my",
    );
    expect(normalise("domain", "pos-parcel.top").value).toBe("pos-parcel.top");
  });

  it("rejects non-web input", () => {
    expect(() => normalise("url", "javascript:alert(1)")).toThrow(NormaliseError);
    expect(() => normalise("url", "not a link")).toThrow(NormaliseError);
    expect(() => normalise("domain", "localhost")).toThrow(NormaliseError);
  });
});

describe("app, social_profile, crypto_wallet", () => {
  it("normalises package names, Play Store links and APK hashes", () => {
    expect(normalise("app", "com.Qorvanta.Trade").value).toBe("pkg:com.qorvanta.trade");
    expect(
      normalise("app", "https://play.google.com/store/apps/details?id=com.qorvanta.trade&hl=en")
        .value,
    ).toBe("pkg:com.qorvanta.trade");
    expect(normalise("app", "A".repeat(64)).value).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("normalises social profile URLs and handles", () => {
    expect(
      normalise("social_profile", "https://www.facebook.com/Cikgu.Forex.Official/"),
    ).toMatchObject({ value: "facebook:cikgu.forex.official", masked: "facebook:ci***" });
    expect(
      normalise("social_profile", "https://www.facebook.com/profile.php?id=1000123").value,
    ).toBe("facebook:1000123");
    expect(normalise("social_profile", "@CikguForex", { platform: "TikTok" }).value).toBe(
      "tiktok:cikguforex",
    );
  });

  it("normalises wallet addresses by chain", () => {
    expect(normalise("crypto_wallet", "0xAbCdEf0123456789aBcDeF0123456789ABCDEF01")).toMatchObject({
      value: "0xabcdef0123456789abcdef0123456789abcdef01",
      attrs: { chain: "evm" },
    });
    expect(normalise("crypto_wallet", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE").attrs.chain).toBe(
      "tron",
    );
  });
});

describe("hashing", () => {
  it("is deterministic, keyed, and 32 bytes", () => {
    const h = lookupHash("+601123454821", PEPPER);
    expect(h).toHaveLength(32);
    expect(lookupHash("+601123454821", PEPPER)).toEqual(h);
    expect(lookupHash("+601123454821", "y".repeat(64))).not.toEqual(h);
  });

  it("refuses a weak pepper", () => {
    expect(() => lookupHash("x", "short")).toThrow(/pepper/);
  });
});

describe("SME identifiers", () => {
  it("normalises TINs and SSM numbers", () => {
    expect(normaliseTin("c 2584563200")).toBe("C2584563200");
    expect(normaliseSsmNo("2019 0102 3456")).toBe("201901023456");
    expect(normaliseSsmNo("1234567 x")).toBe("1234567-X");
    expect(() => normaliseSsmNo("abc")).toThrow(NormaliseError);
  });
});

describe("idempotence", () => {
  it.each([
    ["phone", "011-2345 4821"],
    ["whatsapp", "wa.me/60112345482"],
    ["telegram", "@Qorvanta_Admin"],
    ["bank_account", "Maybank 5123 4567 8812"],
    ["ewallet", "TNG 012-345 6789"],
    ["url", "https://www.Bit.ly/x?utm_source=a&b=1"],
    ["domain", "https://secure.maybank2u-login.com.my/x"],
    ["app", "https://play.google.com/store/apps/details?id=com.x.y"],
    ["app", "A".repeat(64)],
    ["social_profile", "https://www.facebook.com/Cikgu.Forex/"],
    ["crypto_wallet", "0xAbCdEf0123456789aBcDeF0123456789ABCDEF01"],
  ] as const)("normalise(%s, normalise(x).value) is stable", (type, raw) => {
    const once = normalise(type, raw);
    expect(normalise(type, once.value)).toEqual(once);
  });
});
