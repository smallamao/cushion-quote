import { describe, it, expect } from "vitest";

import {
  buildQuickInvoiceForm,
  buildReceiptInvoiceQuery,
  canInvoiceFromReceipt,
  duplicateKey,
  ensureVoucherInNote,
  findReceiptDuplicates,
  parseReceiptInvoiceQuery,
  receiptIssueBlockReason,
  receiptShortNote,
  receiptSourceId,
  receiptVoucherTag,
  type ReceiptInvoiceInfo,
} from "@/lib/receipt-invoice";
import type { EInvoiceRecord } from "@/lib/types";

// 老闆的流程：匯款資訊頁 → 收款確認（複製客戶聯／內部聯）→ 開發票。
// 這份測試守兩件事：帶過去的資料跟他手開的一樣（品項「沙發」、含稅實收金額），
// 以及同一筆收款不會被開兩次（重複開發票是報稅層級的錯，刪紀錄救不回來）。

const P6337: ReceiptInvoiceInfo = {
  amount: 10000,
  orderNumber: "P6337",
  paymentType: "LINE PAY",
  paymentRef: "P4833",
  receivedDate: "2026-11-06",
};

const NOW = new Date(2026, 10, 6, 15, 0); // 2026-11-06 下午（本地時間）

function inv(overrides: Partial<EInvoiceRecord>): EInvoiceRecord {
  return { invoiceId: "INV-X", status: "issued", internalNote: "", ...overrides } as EInvoiceRecord;
}

describe("canInvoiceFromReceipt", () => {
  it("只有 LINE PAY 與刷卡（含 QR PAY）有開發票鈕；匯款照月底對帳批次開", () => {
    expect(canInvoiceFromReceipt("LINE PAY")).toBe(true);
    expect(canInvoiceFromReceipt("刷卡")).toBe(true);
    expect(canInvoiceFromReceipt("匯款")).toBe(false);
  });
});

describe("網址參數來回", () => {
  it("匯款資訊頁帶過去，發票頁讀回來一樣", () => {
    const qs = buildReceiptInvoiceQuery(P6337);
    expect(parseReceiptInvoiceQuery(new URLSearchParams(qs), NOW)).toEqual(P6337);
  });

  it("金額不是正數或付款方式不支援就不帶（避免開出 0 元或匯款發票）", () => {
    const bad = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
    bad.set("amount", "0");
    expect(parseReceiptInvoiceQuery(bad, NOW)).toBeNull();
    const wire = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
    wire.set("pay", "匯款");
    expect(parseReceiptInvoiceQuery(wire, NOW)).toBeNull();
    expect(parseReceiptInvoiceQuery(new URLSearchParams(""), NOW)).toBeNull();
  });

  it("收款日在未來、超過 31 天前或不是真的日期都不帶（舊網址、書籤）", () => {
    for (const date of ["2026-11-07", "2026-10-05", "2026-02-30", "2026-99-99"]) {
      const qs = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
      qs.set("date", date);
      expect(parseReceiptInvoiceQuery(qs, NOW), date).toBeNull();
    }
    const ok = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
    ok.set("date", "2026-10-06");
    expect(parseReceiptInvoiceQuery(ok, NOW)).not.toBeNull();
  });

  it("金額不是整數不帶", () => {
    const qs = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
    qs.set("amount", "100.5");
    expect(parseReceiptInvoiceQuery(qs, NOW)).toBeNull();
  });

  it("金額有逗號也讀得到", () => {
    const qs = new URLSearchParams(buildReceiptInvoiceQuery(P6337));
    qs.set("amount", "10,000");
    expect(parseReceiptInvoiceQuery(qs, NOW)?.amount).toBe(10000);
  });
});

describe("buildQuickInvoiceForm", () => {
  it("照老闆手開的格式：含稅實收金額、品項只寫「沙發」、收款憑證寫進內部註記", () => {
    const form = buildQuickInvoiceForm(P6337, "陳品妤");
    expect(form).toMatchObject({
      buyerName: "陳品妤",
      buyerTaxId: "",
      totalAmount: "10000",
      amountType: "含稅",
      content: "沙發",
      invoiceDate: "2026-11-06",
    });
    // 老闆指定格式：總備註與內部註記只放「驗證碼： XXXX」
    expect(form.overallRemark).toBe("驗證碼： P4833");
    expect(form.internalNote).toBe("驗證碼： P4833");
    // 送出前補回完整收款憑證，防重複照常
    const sent = ensureVoucherInNote(form.internalNote, P6337);
    expect(sent).toBe(`${receiptVoucherTag(P6337)}\n驗證碼： P4833`);
    expect(findReceiptDuplicates([inv({ internalNote: sent })], P6337)).toHaveLength(1);
  });

  it("刷卡寫卡號末五碼；沒有憑證碼就留空", () => {
    expect(receiptShortNote({ ...P6337, paymentType: "刷卡", paymentRef: "12345" })).toBe("卡號末五碼： 12345");
    expect(receiptShortNote({ ...P6337, paymentRef: "" })).toBe("");
  });
});

describe("receiptVoucherTag", () => {
  it("單號、付款方式、憑證碼、金額、日期都在裡面", () => {
    expect(receiptVoucherTag(P6337)).toBe("收款憑證：P6337／LINE PAY P4833／$10,000／2026-11-06");
  });
});

describe("findReceiptDuplicates", () => {
  const tag = receiptVoucherTag(P6337);

  it("同一筆收款已經開過（含開立中、待確認）就找得到", () => {
    for (const status of ["issued", "issuing", "needs_review", "draft"] as const) {
      expect(findReceiptDuplicates([inv({ status, internalNote: tag })], P6337)).toHaveLength(1);
    }
  });

  it("作廢或開立失敗的不算", () => {
    expect(findReceiptDuplicates([inv({ status: "cancelled", internalNote: tag })], P6337)).toHaveLength(0);
    expect(findReceiptDuplicates([inv({ status: "failed", internalNote: tag })], P6337)).toHaveLength(0);
  });

  it("同一張卡、同訂單、同金額但不同天（訂金與尾款各刷一半）不算重複", () => {
    const card: ReceiptInvoiceInfo = { ...P6337, paymentType: "刷卡", paymentRef: "12345" };
    const balance: ReceiptInvoiceInfo = { ...card, receivedDate: "2026-11-20" };
    expect(findReceiptDuplicates([inv({ internalNote: receiptVoucherTag(card) })], balance)).toHaveLength(0);
  });

  it("內部註記後面多寫了字也認得", () => {
    expect(findReceiptDuplicates([inv({ internalNote: `${tag}\n客人要求改抬頭` })], P6337)).toHaveLength(1);
  });
});

describe("receiptSourceId", () => {
  it("同一筆收款永遠是同一個來源 ID（後端靠它擋第二張）", () => {
    expect(receiptSourceId(P6337)).toBe("RECEIPT-P6337-LINEPAY-P4833-10000-20261106");
    expect(receiptSourceId({ ...P6337 })).toBe(receiptSourceId(P6337));
    expect(receiptSourceId({ ...P6337, receivedDate: "2026-11-07" })).not.toBe(receiptSourceId(P6337));
  });

  it("來源 ID 相同也算重複（內部註記被改掉時的第二道）", () => {
    expect(findReceiptDuplicates([inv({ sourceId: receiptSourceId(P6337) })], P6337)).toHaveLength(1);
  });
});

describe("ensureVoucherInNote", () => {
  it("內部註記被清空或改掉，送出前補回收款憑證", () => {
    const tag = receiptVoucherTag(P6337);
    expect(ensureVoucherInNote("", P6337)).toBe(tag);
    expect(ensureVoucherInNote("客人要改抬頭", P6337)).toBe(`${tag}\n客人要改抬頭`);
    expect(ensureVoucherInNote(`${tag} 備註`, P6337)).toBe(`${tag} 備註`);
  });
});

describe("receiptIssueBlockReason", () => {
  const a = inv({ invoiceId: "A" });
  const b = inv({ invoiceId: "B" });
  const base = { invoicesLoaded: true, exactDuplicates: [], possibleDuplicates: [], ackedKey: "" };

  it("發票清單沒載到就擋（沒資料不知道有沒有重複）", () => {
    expect(receiptIssueBlockReason({ ...base, invoicesLoaded: false })).toBe("not_loaded");
  });

  it("收款憑證相同直接擋，勾選也沒用", () => {
    expect(receiptIssueBlockReason({ ...base, exactDuplicates: [a], ackedKey: duplicateKey([a]) })).toBe("exact_duplicate");
  });

  it("可能重複要勾選；名單變了要重勾", () => {
    expect(receiptIssueBlockReason({ ...base, possibleDuplicates: [a] })).toBe("needs_ack");
    expect(receiptIssueBlockReason({ ...base, possibleDuplicates: [a], ackedKey: duplicateKey([a]) })).toBe("");
    expect(receiptIssueBlockReason({ ...base, possibleDuplicates: [a, b], ackedKey: duplicateKey([a]) })).toBe("needs_ack");
  });

  it("沒有重複就放行", () => {
    expect(receiptIssueBlockReason(base)).toBe("");
  });
});
