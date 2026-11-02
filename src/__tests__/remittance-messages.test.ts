import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as legacy from "./fixtures/remittance-legacy";
import {
  BANK_ACCOUNTS,
  PAYMENT_REF_PLACEHOLDER,
  buildClientReply,
  buildReceiptMessage,
  buildRemittanceMessage,
  receiptPayLabelForSchedule,
  receivingAccountLabelById,
  receivingAccountOptions,
  type MessageType,
  type PaymentType,
} from "@/lib/remittance";

const PAYMENT_TYPES: PaymentType[] = ["匯款", "刷卡", "LINE PAY"];
const MSG_TYPES: MessageType[] = ["客戶回覆聯", "完整記錄"];

describe("搬到 @/lib/remittance 後，匯款資訊頁輸出一字不差", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 14, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("帳戶清單與末五碼提示相同", () => {
    expect(BANK_ACCOUNTS).toEqual(legacy.BANK_ACCOUNTS);
    expect(PAYMENT_REF_PLACEHOLDER).toEqual(legacy.PAYMENT_REF_PLACEHOLDER);
  });

  it("收款確認：匯款/刷卡/LINE PAY × 訂金/尾款 × 有無末五碼 × 客戶回覆聯/完整記錄", () => {
    const cardInfos = [
      undefined,
      { due: "2026-11-05T10:00:00+08:00", dueComplete: false, driverName: "簡先生" },
      { due: "2026-11-05T10:00:00+08:00", dueComplete: true, driverName: "" },
    ];
    let count = 0;
    for (const paymentType of PAYMENT_TYPES) {
      for (const isBalance of [false, true]) {
        for (const ref of ["", "18173", "LP123456789"]) {
          for (const msgType of MSG_TYPES) {
            for (const isPotato of [true, false]) {
              for (const orderNo of ["", "P6123"]) {
                for (const cardInfo of cardInfos) {
                  const args = [
                    "4600", ref, orderNo, paymentType, msgType, isBalance, ref, isPotato, cardInfo,
                  ] as const;
                  expect(buildReceiptMessage(...args)).toBe(legacy.buildReceiptMessage(...args));
                  count++;
                }
              }
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  it("客戶回覆聯樣本", () => {
    expect(
      buildReceiptMessage("4600", "18173", "", "匯款", "客戶回覆聯", false, "18173"),
    ).toBe("115/11/2 已經確認收到訂金款項 $4,600 (18173) 囉！ 非常感謝😊");
  });

  it("匯款訊息：每個帳戶 × 訂金/尾款 × 有無訂單編號", () => {
    for (const [i, acct] of BANK_ACCOUNTS.entries()) {
      for (const isBalance of [false, true]) {
        for (const orderNo of ["", " S1234 "]) {
          expect(buildRemittanceMessage(acct, "12000", isBalance, orderNo)).toBe(
            legacy.buildRemittanceMessage(legacy.BANK_ACCOUNTS[i], "12000", isBalance, orderNo),
          );
        }
      }
    }
  });
});

describe("buildClientReply：可指定日期與款項名稱", () => {
  const date = new Date(2026, 9, 28);

  it("用指定日期（實收日期）而非今天", () => {
    expect(
      buildClientReply({ date, payLabel: "餘額", amount: 32000, paymentType: "刷卡", paymentRef: "55667" }),
    ).toBe("115/10/28 已經確認收到餘額款項 $32,000 (刷卡55667) 囉！ 非常感謝😊");
  });

  it("「款項」不重複成「款項款項」", () => {
    expect(
      buildClientReply({ date, payLabel: "款項", amount: 9800, paymentType: "匯款", paymentRef: "" }),
    ).toBe("115/10/28 已經確認收到款項 $9,800 囉！ 非常感謝😊");
  });

  it("LINE PAY 驗證碼／現金不附末五碼", () => {
    expect(
      buildClientReply({ date, payLabel: "訂金", amount: 1000, paymentType: "LINE PAY", paymentRef: "ABC123" }),
    ).toBe("115/10/28 已經確認收到訂金款項 $1,000 (LINE PAY驗證碼： ABC123) 囉！ 非常感謝😊");
    expect(
      buildClientReply({ date, payLabel: "訂金", amount: 1000, paymentType: null, paymentRef: "12345" }),
    ).toBe("115/10/28 已經確認收到訂金款項 $1,000 囉！ 非常感謝😊");
  });
});

describe("receiptPayLabelForSchedule", () => {
  it("標籤優先", () => {
    expect(receiptPayLabelForSchedule("訂金", 1, 2)).toBe("訂金");
    expect(receiptPayLabelForSchedule("尾款", 2, 2)).toBe("餘額");
    expect(receiptPayLabelForSchedule("餘額", 3, 3)).toBe("餘額");
    // 標籤說訂金就算不是第 1 期也寫訂金
    expect(receiptPayLabelForSchedule("第二筆訂金", 2, 3)).toBe("訂金");
  });

  it("多期：第 1 期訂金、最後一期餘額、中間款項", () => {
    expect(receiptPayLabelForSchedule("第 1 期", 1, 3)).toBe("訂金");
    expect(receiptPayLabelForSchedule("期中款", 2, 3)).toBe("款項");
    expect(receiptPayLabelForSchedule("第 3 期", 3, 3)).toBe("餘額");
  });

  it("一次付清 → 款項", () => {
    expect(receiptPayLabelForSchedule("全額", 1, 1)).toBe("款項");
  });
});

describe("receivingAccountOptions：同一實體帳戶只出現一次", () => {
  const options = receivingAccountOptions();

  it("台新與台新（簡式）合併為一個，保留 taishin", () => {
    const ids = options.map((o) => o.id);
    expect(ids).toContain("taishin");
    expect(ids).not.toContain("taishin_simple");
    expect(new Set(options.map((o) => o.label)).size).toBe(options.length);
    expect(options).toHaveLength(BANK_ACCOUNTS.length - 1);
  });

  it("標籤格式", () => {
    expect(options.find((o) => o.id === "big_custom")?.label).toBe("大戶（訂製）周春懋 …5918");
    expect(options.find((o) => o.id === "sinopac_custom")?.label).toBe("大戶（陳涵儀） …8474");
    expect(options.find((o) => o.id === "chen")?.label).toBe("陳金水 …7189");
    expect(options.find((o) => o.id === "taishin")?.label).toBe("台新銀行 陳涵儀 …3394");
  });

  it("依 id 找標籤；舊 id 原樣回傳", () => {
    expect(receivingAccountLabelById("taishin_simple")).toBe("台新（簡式）陳涵儀 …3394");
    expect(receivingAccountLabelById("gone")).toBe("gone");
    expect(receivingAccountLabelById("")).toBe("");
  });
});
