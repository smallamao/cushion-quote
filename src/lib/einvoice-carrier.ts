import type { EInvoiceBuyerType, EInvoiceCarrierType } from "@/lib/types";

/**
 * B2C 載具／Email／捐贈的格式規則（前端即時檢查與後端防呆共用）。
 *
 * 依據 Giveme API 文件 addB2C：
 * - phone = 財政部載具（手機條碼）：第 1 碼為「/」，其餘 7 碼由 0-9、大寫 A-Z、「+」「-」「.」組成
 * - orderCode = 編號載具（自行定義：訂單號、消費者手機號碼、會員編號…），與 phone 擇一
 * - email 只支援單一信箱
 * - state 0／1；捐贈（1）時 donationCode 必填
 * Giveme API 不支援自然人憑證載具（網頁後台才有），遇到要擋下來。
 */

export const MOBILE_BARCODE_PATTERN = /^\/[0-9A-Z+\-.]{7}$/;
export const CITIZEN_CERT_PATTERN = /^[A-Z]{2}\d{14}$/;
/** Giveme 文件沒寫捐贈碼格式；用財政部愛心碼規則：3～7 位數字 */
export const DONATION_CODE_PATTERN = /^\d{3,7}$/;
/** Giveme 文件沒寫編號載具長度；取財政部載具號碼欄位上限 64 字 */
export const MEMBER_CODE_MAX_LENGTH = 64;

export const CITIZEN_CERT_UNSUPPORTED_MESSAGE =
  "Giveme API 不支援自然人憑證，請改用手機條碼，或到 Giveme 後台手動開立";

export type DetectedCarrier = "mobile_barcode" | "citizen_cert";

/** 去頭尾空白、全形轉半形（／→/、Ａ→A）、轉大寫 */
export function normalizeCarrier(raw: string): string {
  return raw.normalize("NFKC").trim().toUpperCase();
}

/** 從輸入內容判斷載具種類；判斷不出來回 null */
export function detectCarrierType(value: string): DetectedCarrier | null {
  const normalized = normalizeCarrier(value);
  if (MOBILE_BARCODE_PATTERN.test(normalized)) return "mobile_barcode";
  if (CITIZEN_CERT_PATTERN.test(normalized)) return "citizen_cert";
  return null;
}

/** 載具檢查：回傳中文錯誤訊息，沒問題回 null */
export function validateCarrier(type: EInvoiceCarrierType, value: string): string | null {
  const normalized = normalizeCarrier(value);
  if (CITIZEN_CERT_PATTERN.test(normalized)) return CITIZEN_CERT_UNSUPPORTED_MESSAGE;
  if (type === "none") {
    if (!normalized) return null;
    if (MOBILE_BARCODE_PATTERN.test(normalized)) return "這是手機條碼，載具類型請選「手機條碼」";
    return "有填載具號碼但沒選載具類型：手機號碼或訂單編號請選「會員載具」，不需要載具請清空";
  }
  if (type === "mobile_barcode") {
    if (!normalized) return "請輸入手機條碼";
    if (!MOBILE_BARCODE_PATTERN.test(normalized)) {
      return "手機條碼格式錯誤：要 8 碼，第 1 碼為「/」，其餘為數字、大寫英文或 + - .";
    }
    return null;
  }
  if (!normalized) return "請輸入會員載具號碼（訂單編號或手機號碼）";
  if (normalized.length > MEMBER_CODE_MAX_LENGTH) return `會員載具號碼最多 ${MEMBER_CODE_MAX_LENGTH} 字`;
  return null;
}

export function validateDonationCode(code: string): string | null {
  const normalized = normalizeCarrier(code);
  if (!normalized) return "要捐贈發票請輸入捐贈碼";
  if (!DONATION_CODE_PATTERN.test(normalized)) return "捐贈碼格式錯誤：應為 3～7 位數字";
  return null;
}

/** Giveme 只支援單一信箱；空白視為不寄送 */
export function validateInvoiceEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(trimmed)) return "Email 格式錯誤（只能填一個信箱）";
  return null;
}

/** 存檔／送出用的載具號碼：手機條碼統一成半形大寫，其他只轉半形去空白 */
export function normalizeCarrierValue(type: EInvoiceCarrierType, value: string): string {
  if (type === "none") return "";
  if (type === "mobile_barcode") return normalizeCarrier(value);
  return value.normalize("NFKC").trim();
}

export interface BuyerContactFields {
  buyerType: EInvoiceBuyerType;
  email: string;
  carrierType: EInvoiceCarrierType | "";
  carrierValue: string;
  donationCode: string;
}

export type BuyerContactResult =
  | { ok: true; fields: { email: string; carrierType: EInvoiceCarrierType; carrierValue: string; donationCode: string } }
  | { ok: false; error: string };

/**
 * 後端建立與開立前的防呆：檢查並正規化載具／Email／捐贈碼。
 * B2B 不送載具與捐贈（Giveme B2B 的 phone 欄位放的是統編），一律清空。
 * 捐贈與載具 Giveme 文件沒說互斥，兩者都允許。
 */
export function checkBuyerContactFields(input: BuyerContactFields): BuyerContactResult {
  const email = input.email.trim();
  const emailError = validateInvoiceEmail(email);
  if (emailError) return { ok: false, error: emailError };
  if (input.buyerType === "b2b") {
    return { ok: true, fields: { email, carrierType: "none", carrierValue: "", donationCode: "" } };
  }
  const carrierType: EInvoiceCarrierType = input.carrierType || "none";
  const carrierError = validateCarrier(carrierType, input.carrierValue);
  if (carrierError) return { ok: false, error: carrierError };
  const donationRaw = input.donationCode.trim();
  if (donationRaw) {
    const donationError = validateDonationCode(donationRaw);
    if (donationError) return { ok: false, error: donationError };
  }
  return {
    ok: true,
    fields: {
      email,
      carrierType,
      carrierValue: normalizeCarrierValue(carrierType, input.carrierValue),
      donationCode: donationRaw ? normalizeCarrier(donationRaw) : "",
    },
  };
}

/**
 * 輸入載具號碼時自動判斷類型：打出手機條碼就自動切到「手機條碼」；
 * 其他情況維持使用者選的類型（會員載具無固定格式，不猜）。
 */
export function autoCarrierType(current: EInvoiceCarrierType, value: string): EInvoiceCarrierType {
  if (detectCarrierType(value) === "mobile_barcode") return "mobile_barcode";
  if (!value.trim() && current === "mobile_barcode") return "none";
  return current;
}

/**
 * 還在打手機條碼（類型未選、以「/」開頭、不到 8 碼）：畫面先不提示「沒選載具類型」，
 * 等離開欄位或打滿再提示。只影響提示時機，送出一樣會擋。
 */
export function isCarrierStillTyping(type: EInvoiceCarrierType, value: string): boolean {
  const normalized = normalizeCarrier(value);
  return type === "none" && normalized.startsWith("/") && normalized.length < 8;
}

export interface QuickBuyerInput {
  buyerTaxId: string;
  email: string;
  carrierType: EInvoiceCarrierType;
  carrierValue: string;
  donate: boolean;
  donationCode: string;
}

export interface QuickBuyerPayload {
  buyerType: EInvoiceBuyerType;
  buyerTaxId: string;
  email: string;
  carrierType: EInvoiceCarrierType;
  carrierValue: string;
  donationCode: string;
}

/** 快速開立：有統編是 B2B（不帶載具／捐贈），否則 B2C；donate 關閉時不送捐贈碼 */
export function buildQuickBuyerPayload(input: QuickBuyerInput): QuickBuyerPayload {
  const buyerTaxId = input.buyerTaxId.trim();
  const email = input.email.trim();
  if (buyerTaxId) {
    return { buyerType: "b2b", buyerTaxId, email, carrierType: "none", carrierValue: "", donationCode: "" };
  }
  return {
    buyerType: "b2c",
    buyerTaxId: "",
    email,
    carrierType: input.carrierType,
    carrierValue: normalizeCarrierValue(input.carrierType, input.carrierValue),
    donationCode: input.donate ? normalizeCarrier(input.donationCode) : "",
  };
}

/** 快速開立表單的載具／Email／捐贈錯誤（各欄位分開，畫面逐欄顯示） */
export function quickBuyerErrors(input: QuickBuyerInput): { carrier: string | null; email: string | null; donation: string | null } {
  const isB2B = Boolean(input.buyerTaxId.trim());
  return {
    carrier: isB2B ? null : validateCarrier(input.carrierType, input.carrierValue),
    email: validateInvoiceEmail(input.email),
    donation: !isB2B && input.donate ? validateDonationCode(input.donationCode) : null,
  };
}
