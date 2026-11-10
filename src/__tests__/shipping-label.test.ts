import { describe, it, expect } from "vitest";

import {
  LABELS_PER_PAGE,
  defaultLabelCopies,
  defaultLabelLines,
  fitLabelFontSize,
  isB2BOrder,
  paginateLabels,
} from "@/lib/shipping-label";
import { orderRecordToRow, orderRowToRecord } from "@/lib/order-utils";
import type { CustomOrder } from "@/lib/types";

// 老闆原本用 Keynote「獨立筒列印底稿」手改三行字再印。這份測試守的是
// 「不用改就能印」：預設三行要跟他手打的一樣（米羅柚木 261025D101 為實例）。

function makeOrder(overrides: Partial<CustomOrder> = {}): CustomOrder {
  const base = orderRowToRecord(["ORD-TEST-001"]);
  return { ...base, ...overrides };
}

const MILO = makeOrder({
  clientName: "米羅柚木有限公司",
  clientId: "CLI-1783958271535",
  orderNumber: "261025D101 新店",
  clientPoNumber: "261025D101 新店",
  itemCategory: "大和樂活" as CustomOrder["itemCategory"],
  materialName: "新亞麻系列",
  materialCode: "600-71",
  items: [
    { id: "h", name: "【大和樂活】單人沙發墊四組", dimensions: "", quantity: "", foamSpec: "", foamColor: null, itemType: "header" },
    { id: "a", name: "大和/樂活坐墊", dimensions: "W60 x 63 x 15cm", quantity: "四只", foamSpec: "", foamColor: null },
  ] as CustomOrder["items"],
});

describe("defaultLabelLines", () => {
  it("米羅實例：三行與手打版本一致", () => {
    expect(defaultLabelLines(MILO)).toEqual({
      line1: "261025D101 新店門市",
      line2: "【大和樂活】單人沙發墊",
      line3: "新亞麻系列 600-71",
    });
  });

  it("單號已經寫「門市」就不重複加", () => {
    expect(defaultLabelLines(makeOrder({ orderNumber: "260610D101 新店門市" })).line1)
      .toBe("260610D101 新店門市");
  });

  it("單號結尾不是「店」就照原樣", () => {
    expect(defaultLabelLines(makeOrder({ orderNumber: "PO-8899" })).line1).toBe("PO-8899");
  });

  it("客戶單號優先於內部工單編號", () => {
    expect(
      defaultLabelLines(makeOrder({ orderNumber: "內部-01", clientPoNumber: "261101D102 板橋店" })).line1,
    ).toBe("261101D102 板橋店");
  });

  it("沒有標題品項時用【品項分類】＋訂單標題", () => {
    const o = makeOrder({
      itemCategory: "大和樂活" as CustomOrder["itemCategory"],
      orderTitle: "單人沙發墊",
      items: [],
    });
    expect(defaultLabelLines(o).line2).toBe("【大和樂活】單人沙發墊");
  });

  it("標題品項沒有【】時補上品項分類", () => {
    const o = makeOrder({
      itemCategory: "大和樂活" as CustomOrder["itemCategory"],
      items: [{ id: "h", name: "單人沙發墊 2組", dimensions: "", quantity: "", foamSpec: "", foamColor: null, itemType: "header" }] as CustomOrder["items"],
    });
    expect(defaultLabelLines(o).line2).toBe("【大和樂活】單人沙發墊");
  });

  it("面料只有名稱或只有色號時不留多餘空白", () => {
    expect(defaultLabelLines(makeOrder({ materialName: "新亞麻系列", materialCode: "" })).line3).toBe("新亞麻系列");
    expect(defaultLabelLines(makeOrder({ materialName: "", materialCode: "600-71" })).line3).toBe("600-71");
  });
});

describe("isB2BOrder", () => {
  it("有關聯客戶主檔或有客戶單號才算 B2B", () => {
    expect(isB2BOrder(MILO)).toBe(true);
    expect(isB2BOrder(makeOrder({ clientPoNumber: "X1" }))).toBe(true);
    expect(isB2BOrder(makeOrder({ clientId: "CLI-1" }))).toBe(true);
    expect(isB2BOrder(makeOrder({ clientName: "S1092 黃淑惠" }))).toBe(false);
  });
});

describe("defaultLabelCopies", () => {
  it("照訂單包數；沒填就 1 張", () => {
    expect(defaultLabelCopies(makeOrder({ packageCount: 2 }))).toBe(2);
    expect(defaultLabelCopies(makeOrder())).toBe(1);
    expect(defaultLabelCopies(makeOrder({ packageCount: 0 }))).toBe(1);
  });
});

describe("paginateLabels", () => {
  it(`一頁最多 ${LABELS_PER_PAGE} 張，超過換頁`, () => {
    expect(paginateLabels(2)).toEqual([2]);
    expect(paginateLabels(LABELS_PER_PAGE)).toEqual([LABELS_PER_PAGE]);
    expect(paginateLabels(LABELS_PER_PAGE + 2)).toEqual([LABELS_PER_PAGE, 2]);
    expect(paginateLabels(0)).toEqual([]);
  });
});

describe("fitLabelFontSize", () => {
  it("短字維持原字級，長字等比縮小不溢出", () => {
    expect(fitLabelFontSize("261025D101 新店門市", 45, 540)).toBe(45);
    const long = "這是一個非常非常長的品名會超過標籤寬度的字串";
    const size = fitLabelFontSize(long, 36, 540);
    expect(size).toBeLessThan(36);
    expect(size * long.length).toBeLessThanOrEqual(540);
  });
});

describe("訂單包數寫進試算表（AZ 欄）", () => {
  it("存進去讀回來一樣；沒填寫空字串", () => {
    const row = orderRecordToRow(makeOrder({ packageCount: 3 }));
    // 鎖「包數在索引 51（AZ 欄）」，不鎖整列長度——後面還會加欄位，
    // 列變長是正常的，鎖長度只會讓每次加欄位都無謂地紅一次。
    expect(row.length).toBeGreaterThanOrEqual(52);
    expect(row[51]).toBe("3");
    expect(orderRowToRecord(row).packageCount).toBe(3);
    expect(orderRecordToRow(makeOrder())[51]).toBe("");
    expect(orderRowToRecord(orderRecordToRow(makeOrder())).packageCount).toBeUndefined();
  });
});
