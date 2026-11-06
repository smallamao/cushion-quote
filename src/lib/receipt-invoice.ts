/**
 * 收款確認 → 開發票（老闆 2026-11-06）。
 *
 * 匯款資訊頁按完「輸出收款確認」，LINE PAY／刷卡（QR PAY 也是刷卡）的款項可以直接
 * 帶到發票頁的快速開立：金額、品項、日期、收款憑證都填好，老闆看過再按開立。
 * 匯款不在這裡開，照月底銀行對帳批次開（那邊要對末五碼與入帳，不是收款當下能確定的）。
 *
 * 防重複：收款憑證寫進發票「內部註記」，同一筆收款再按一次會先找到前一張。
 * 重複開發票是報稅層級的錯，作廢重開要走流程，刪紀錄救不回來。
 */

import type { PaymentType } from "@/lib/remittance";
import type { EInvoiceRecord, EInvoiceStatus } from "@/lib/types";

export const INVOICE_PAYMENT_TYPES: readonly PaymentType[] = ["LINE PAY", "刷卡"];

/** 老闆月底開票原則：品項只寫「沙發」（bank-recon-invoice skill 同一條規則） */
export const RECEIPT_INVOICE_ITEM_NAME = "沙發";

/** 這些狀態代表「這筆已經開了或正在開」；作廢與失敗的可以重開 */
const ACTIVE_STATUSES: readonly EInvoiceStatus[] = ["draft", "issuing", "issued", "needs_review"];

export interface ReceiptInvoiceInfo {
  /** 實收金額（含稅） */
  amount: number;
  /** 訂單編號（Pxxxx／Sxxxx），可空 */
  orderNumber: string;
  paymentType: PaymentType;
  /** LINE PAY 驗證碼／卡號末五碼，可空 */
  paymentRef: string;
  /** 收款日 YYYY-MM-DD */
  receivedDate: string;
}

export function canInvoiceFromReceipt(paymentType: PaymentType): boolean {
  return INVOICE_PAYMENT_TYPES.includes(paymentType);
}

/**
 * 寫進發票內部註記的收款憑證，也是防重複的比對鍵。
 * 帶日期：同一張卡訂金與尾款各刷一半時，單號／卡號／金額都一樣，只有日期不同。
 */
export function receiptVoucherTag(info: ReceiptInvoiceInfo): string {
  const pay = info.paymentRef ? `${info.paymentType} ${info.paymentRef}` : info.paymentType;
  return [
    `收款憑證：${info.orderNumber || "無單號"}`,
    pay,
    `$${info.amount.toLocaleString("en-US")}`,
    info.receivedDate,
  ].join("／");
}

/**
 * 收款開的發票用固定來源 ID：後端建草稿時會擋「同來源已有進行中或已開立的發票」（409），
 * 所以就算前端的清單沒載到、連點兩下，同一筆收款也開不出第二張。
 */
export function receiptSourceId(info: ReceiptInvoiceInfo): string {
  const part = (v: string) => v.replace(/[^0-9A-Za-z]/g, "") || "NA";
  return [
    "RECEIPT",
    part(info.orderNumber),
    part(info.paymentType),
    part(info.paymentRef),
    String(Math.round(info.amount)),
    info.receivedDate.replace(/-/g, ""),
  ].join("-");
}

/** 收款日只接受合理範圍：不在未來、不超過 31 天前（舊網址、書籤不能開出舊日期的發票） */
const MAX_RECEIPT_AGE_DAYS = 31;

function isReasonableReceiptDate(date: string, now: Date): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = (today.getTime() - parsed.getTime()) / 86_400_000;
  return ageDays >= 0 && ageDays <= MAX_RECEIPT_AGE_DAYS;
}

export function buildReceiptInvoiceQuery(info: ReceiptInvoiceInfo): string {
  return new URLSearchParams({
    fromReceipt: "1",
    amount: String(info.amount),
    order: info.orderNumber,
    pay: info.paymentType,
    ref: info.paymentRef,
    date: info.receivedDate,
  }).toString();
}

/** 發票頁讀網址參數；資料不完整或不是 LINE PAY／刷卡就回 null，不帶任何東西 */
export function parseReceiptInvoiceQuery(
  params: URLSearchParams,
  now: Date = new Date(),
): ReceiptInvoiceInfo | null {
  if (params.get("fromReceipt") !== "1") return null;
  const amount = Number((params.get("amount") ?? "").replace(/[,$\s]/g, ""));
  const pay = params.get("pay") ?? "";
  const date = params.get("date") ?? "";
  if (!Number.isInteger(amount) || amount <= 0) return null;
  if (!INVOICE_PAYMENT_TYPES.includes(pay as PaymentType)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isReasonableReceiptDate(date, now)) return null;
  return {
    amount,
    orderNumber: (params.get("order") ?? "").trim(),
    paymentType: pay as PaymentType,
    paymentRef: (params.get("ref") ?? "").trim(),
    receivedDate: date,
  };
}

export interface QuickInvoiceForm {
  buyerName: string;
  buyerTaxId: string;
  totalAmount: string;
  amountType: "含稅" | "未稅";
  content: string;
  remark: string;
  overallRemark: string;
  internalNote: string;
  invoiceDate: string;
}

export function buildQuickInvoiceForm(info: ReceiptInvoiceInfo, buyerName: string): QuickInvoiceForm {
  return {
    buyerName,
    buyerTaxId: "",
    totalAmount: String(info.amount),
    amountType: "含稅",
    content: RECEIPT_INVOICE_ITEM_NAME,
    remark: "",
    overallRemark: "",
    internalNote: receiptVoucherTag(info),
    invoiceDate: info.receivedDate,
  };
}

/** 同一筆收款已經開過（或正在開）的發票：收款憑證或固定來源 ID 相同 */
export function findReceiptDuplicates(
  invoices: EInvoiceRecord[],
  info: ReceiptInvoiceInfo,
): EInvoiceRecord[] {
  const tag = receiptVoucherTag(info);
  const sourceId = receiptSourceId(info);
  return invoices.filter(
    (inv) =>
      ACTIVE_STATUSES.includes(inv.status) &&
      ((inv.internalNote ?? "").includes(tag) || inv.sourceId === sourceId),
  );
}

/** 送出前補回收款憑證：內部註記被改掉或清空時，防重複就失去比對依據 */
export function ensureVoucherInNote(note: string, info: ReceiptInvoiceInfo): string {
  const tag = receiptVoucherTag(info);
  const trimmed = note.trim();
  if (trimmed.includes(tag)) return trimmed;
  return trimmed ? `${tag}\n${trimmed}` : tag;
}

/**
 * 能不能按「建立並開立」：
 * - 發票清單沒載到 → 擋（沒資料就不知道有沒有重複）
 * - 收款憑證完全相同 → 擋，不能勾選略過（那就是同一筆錢）
 * - 只是同買方同金額（可能重複）→ 要勾選確認，而且勾的是「現在這一組」；名單變了要重勾
 */
export function receiptIssueBlockReason(args: {
  invoicesLoaded: boolean;
  exactDuplicates: EInvoiceRecord[];
  possibleDuplicates: EInvoiceRecord[];
  ackedKey: string;
}): "" | "not_loaded" | "exact_duplicate" | "needs_ack" {
  if (!args.invoicesLoaded) return "not_loaded";
  if (args.exactDuplicates.length > 0) return "exact_duplicate";
  if (args.possibleDuplicates.length > 0 && args.ackedKey !== duplicateKey(args.possibleDuplicates)) {
    return "needs_ack";
  }
  return "";
}

export function duplicateKey(invoices: EInvoiceRecord[]): string {
  return invoices.map((i) => i.invoiceId).sort().join(",");
}

/** Trello 卡片名稱「P6337 陳品妤」→「陳品妤」；自訂欄位有主要聯絡人時呼叫端優先用那個 */
export function buyerNameFromCardName(cardName: string, orderNumber: string): string {
  return cardName.replace(orderNumber, "").replace(/\s+/g, " ").trim();
}
