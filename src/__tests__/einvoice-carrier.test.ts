import { describe, expect, it } from "vitest";

import {
  CITIZEN_CERT_UNSUPPORTED_MESSAGE,
  autoCarrierType,
  buildQuickBuyerPayload,
  checkBuyerContactFields,
  detectCarrierType,
  normalizeCarrier,
  quickBuyerErrors,
  validateCarrier,
  validateDonationCode,
  validateInvoiceEmail,
  type QuickBuyerInput,
} from "@/lib/einvoice-carrier";

// 規則來源：Giveme API 文件 addB2C 的 phone／orderCode／email／state／donationCode 欄位說明

describe("normalizeCarrier", () => {
  it("全形轉半形、轉大寫、去空白", () => {
    expect(normalizeCarrier("  ／ａｂｃ１２３４ ")).toBe("/ABC1234");
    expect(normalizeCarrier("/abc+-.1")).toBe("/ABC+-.1");
  });
});

describe("detectCarrierType", () => {
  it.each([
    ["/ABC1234", "mobile_barcode"],
    ["/abc1234", "mobile_barcode"],
    ["／ＡＢＣ１２３４", "mobile_barcode"],
    ["/A+-.123", "mobile_barcode"],
    ["/ABC123", null],
    ["/ABC12345", null],
    ["ABC12345", null],
    ["/ABC_123", null],
    ["AB12345678901234", "citizen_cert"],
    ["ab12345678901234", "citizen_cert"],
    ["AB1234567890123", null],
    ["0912345678", null],
    ["", null],
  ])("%s → %s", (value, expected) => {
    expect(detectCarrierType(value)).toBe(expected);
  });
});

describe("validateCarrier", () => {
  it("無載具、沒填 → 通過", () => {
    expect(validateCarrier("none", "")).toBeNull();
    expect(validateCarrier("none", "  ")).toBeNull();
  });
  it("無載具卻填了號碼 → 擋（以前會被默默丟掉）", () => {
    expect(validateCarrier("none", "/ABC1234")).toContain("手機條碼");
    expect(validateCarrier("none", "0912345678")).toContain("會員載具");
  });
  it("手機條碼格式", () => {
    expect(validateCarrier("mobile_barcode", "/abc1234")).toBeNull();
    expect(validateCarrier("mobile_barcode", "／ＡＢＣ１２３４")).toBeNull();
    expect(validateCarrier("mobile_barcode", "")).toBe("請輸入手機條碼");
    expect(validateCarrier("mobile_barcode", "/ABC123")).toContain("格式錯誤");
    expect(validateCarrier("mobile_barcode", "ABC12345")).toContain("格式錯誤");
  });
  it("自然人憑證不論選哪種類型都擋", () => {
    expect(validateCarrier("none", "AB12345678901234")).toBe(CITIZEN_CERT_UNSUPPORTED_MESSAGE);
    expect(validateCarrier("mobile_barcode", "AB12345678901234")).toBe(CITIZEN_CERT_UNSUPPORTED_MESSAGE);
    expect(validateCarrier("member_code", "AB12345678901234")).toBe(CITIZEN_CERT_UNSUPPORTED_MESSAGE);
  });
  it("會員載具：必填、上限 64 字", () => {
    expect(validateCarrier("member_code", "0912345678")).toBeNull();
    expect(validateCarrier("member_code", "P6337")).toBeNull();
    expect(validateCarrier("member_code", "")).toContain("請輸入會員載具");
    expect(validateCarrier("member_code", "x".repeat(64))).toBeNull();
    expect(validateCarrier("member_code", "x".repeat(65))).toContain("64");
  });
});

describe("validateDonationCode / validateInvoiceEmail", () => {
  it("捐贈碼 3～7 位數字（含全形數字）", () => {
    expect(validateDonationCode("919")).toBeNull();
    expect(validateDonationCode("1234567")).toBeNull();
    expect(validateDonationCode("９１９")).toBeNull();
    expect(validateDonationCode("")).toContain("請輸入捐贈碼");
    expect(validateDonationCode("12")).toContain("格式錯誤");
    expect(validateDonationCode("12345678")).toContain("格式錯誤");
    expect(validateDonationCode("12a")).toContain("格式錯誤");
  });
  it("Email 選填、只能一個", () => {
    expect(validateInvoiceEmail("")).toBeNull();
    expect(validateInvoiceEmail(" a@b.com ")).toBeNull();
    expect(validateInvoiceEmail("a@b")).not.toBeNull();
    expect(validateInvoiceEmail("a@b.com,c@d.com")).not.toBeNull();
    expect(validateInvoiceEmail("a@b.com c@d.com")).not.toBeNull();
  });
});

describe("autoCarrierType", () => {
  it("打出手機條碼自動切類型；清空時從手機條碼退回無", () => {
    expect(autoCarrierType("none", "/abc1234")).toBe("mobile_barcode");
    expect(autoCarrierType("member_code", "/ABC1234")).toBe("mobile_barcode");
    expect(autoCarrierType("none", "/ABC")).toBe("none");
    expect(autoCarrierType("member_code", "0912345678")).toBe("member_code");
    expect(autoCarrierType("mobile_barcode", "")).toBe("none");
    expect(autoCarrierType("member_code", "")).toBe("member_code");
  });
});

describe("checkBuyerContactFields（後端防呆）", () => {
  const base = { buyerType: "b2c" as const, email: "", carrierType: "none" as const, carrierValue: "", donationCode: "" };

  it("正規化手機條碼與捐贈碼", () => {
    const result = checkBuyerContactFields({ ...base, carrierType: "mobile_barcode", carrierValue: " ／abc1234 ", donationCode: "９１９" });
    expect(result).toEqual({ ok: true, fields: { email: "", carrierType: "mobile_barcode", carrierValue: "/ABC1234", donationCode: "919" } });
  });
  it("會員載具保留大小寫，只轉半形", () => {
    const result = checkBuyerContactFields({ ...base, carrierType: "member_code", carrierValue: " Ｐ6337a " });
    expect(result).toEqual({ ok: true, fields: { email: "", carrierType: "member_code", carrierValue: "P6337a", donationCode: "" } });
  });
  it("空字串類型視為無載具", () => {
    expect(checkBuyerContactFields({ ...base, carrierType: "" })).toMatchObject({ ok: true, fields: { carrierType: "none" } });
  });
  it.each([
    ["類型無但有值", { carrierValue: "/ABC1234" }],
    ["手機條碼格式錯", { carrierType: "mobile_barcode" as const, carrierValue: "/ABC" }],
    ["自然人憑證", { carrierType: "mobile_barcode" as const, carrierValue: "AB12345678901234" }],
    ["捐贈碼格式錯", { donationCode: "1" }],
    ["Email 錯", { email: "not-an-email" }],
  ])("%s → 擋", (_label, patch) => {
    expect(checkBuyerContactFields({ ...base, ...patch }).ok).toBe(false);
  });
  it("B2B 清空載具與捐贈，但仍檢查 Email", () => {
    expect(checkBuyerContactFields({ ...base, buyerType: "b2b", carrierValue: "垃圾", donationCode: "x", email: "a@b.com" }))
      .toEqual({ ok: true, fields: { email: "a@b.com", carrierType: "none", carrierValue: "", donationCode: "" } });
    expect(checkBuyerContactFields({ ...base, buyerType: "b2b", email: "bad" }).ok).toBe(false);
  });
});

describe("快速開立表單", () => {
  const form: QuickBuyerInput = { buyerTaxId: "", email: "", carrierType: "none", carrierValue: "", donate: false, donationCode: "" };

  it("B2C 帶載具與捐贈", () => {
    expect(buildQuickBuyerPayload({ ...form, carrierType: "mobile_barcode", carrierValue: "/abc1234", donate: true, donationCode: "919", email: " a@b.com " }))
      .toEqual({ buyerType: "b2c", buyerTaxId: "", email: "a@b.com", carrierType: "mobile_barcode", carrierValue: "/ABC1234", donationCode: "919" });
  });
  it("捐贈關閉時不送捐贈碼", () => {
    expect(buildQuickBuyerPayload({ ...form, donate: false, donationCode: "919" }).donationCode).toBe("");
  });
  it("有統編 → B2B，不帶載具／捐贈", () => {
    expect(buildQuickBuyerPayload({ ...form, buyerTaxId: "85164778", carrierType: "mobile_barcode", carrierValue: "/ABC1234", donate: true, donationCode: "919" }))
      .toEqual({ buyerType: "b2b", buyerTaxId: "85164778", email: "", carrierType: "none", carrierValue: "", donationCode: "" });
  });
  it("逐欄錯誤；B2B 不檢查載具與捐贈", () => {
    expect(quickBuyerErrors(form)).toEqual({ carrier: null, email: null, donation: null });
    const errors = quickBuyerErrors({ ...form, carrierValue: "0912345678", donate: true, email: "x" });
    expect(errors.carrier).toContain("會員載具");
    expect(errors.donation).toContain("請輸入捐贈碼");
    expect(errors.email).not.toBeNull();
    expect(quickBuyerErrors({ ...form, buyerTaxId: "85164778", carrierValue: "zzz", donate: true })).toEqual({ carrier: null, email: null, donation: null });
  });
});
