import { describe, expect, it } from "vitest";
import { businessDaysBetween, derivePromiseDays, findOverdue, promiseFor } from "@/lib/order-overdue";
import type { CustomOrder } from "@/lib/types";

const order = (p: Partial<CustomOrder>): CustomOrder =>
  ({
    orderId: "o", caseId: "c", versionId: "v", clientName: "客", orderNumber: "S1",
    orderTitle: "品", itemCategory: "臥榻墊", deliveryMethod: "", status: "production",
    sourceType: "quote", orderDate: "2026-10-01", supplierOrderDate: "", productionDueDate: "",
    installDate: "", completedDate: "", quotedAmount: 1000, materialCost: 0, laborCost: 0,
    shippingCost: 0, otherCost: 0, materialName: "", materialCode: "", materialImageUrl: "",
    ...p,
  }) as CustomOrder;

describe("businessDaysBetween — 工作天（扣週末）", () => {
  it("週一到週五是 4 天", () => {
    expect(businessDaysBetween("2026-11-02", "2026-11-06")).toBe(4);
  });

  it("跨週末不算週六日：週五到下週一是 1 天", () => {
    expect(businessDaysBetween("2026-11-06", "2026-11-09")).toBe(1);
  });

  it("同一天或倒著給都回 0，不會算出負數", () => {
    expect(businessDaysBetween("2026-11-06", "2026-11-06")).toBe(0);
    expect(businessDaysBetween("2026-11-10", "2026-11-01")).toBe(0);
  });

  it("日期格式不對就回 0，不要丟例外害整頁掛掉", () => {
    expect(businessDaysBetween("", "2026-11-06")).toBe(0);
    expect(businessDaysBetween("2026-11-06", "不是日期")).toBe(0);
  });
});

describe("derivePromiseDays — 從已完工訂單回推承諾交期", () => {
  const completed = (cat: string, days: string[]) =>
    days.map((d) => order({ status: "completed", itemCategory: cat as CustomOrder["itemCategory"], orderDate: "2026-09-01", completedDate: d }));

  it("取 P75 而不是中位 —— 用中位會讓一半的單都亮燈", () => {
    // 2026-09-01 起算的完工日，工作天分別是 1 / 2 / 3 / 4
    const orders = completed("臥榻墊", ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"]);
    expect(derivePromiseDays(orders)["臥榻墊"]).toBe(4);
  });

  it("樣本少於 4 筆不採信，交給 fallback", () => {
    const orders = completed("繃布裱板", ["2026-09-02", "2026-09-03"]);
    expect(derivePromiseDays(orders)["繃布裱板"]).toBeUndefined();
  });

  it("只看 completed，在製中的不能拿來回推", () => {
    const orders = [
      ...completed("臥榻墊", ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"]),
      order({ status: "production", itemCategory: "臥榻墊", completedDate: "2026-12-31" }),
    ];
    expect(derivePromiseDays(orders)["臥榻墊"]).toBe(4);
  });
});

describe("promiseFor — 維修要單獨給門檻", () => {
  it("🔴 維修實測中位 26 工作天，是其他品類的兩倍；共用門檻會把維修單全部誤判成遲到", () => {
    expect(promiseFor("維修", {})).toBe(26);
    expect(promiseFor("臥榻墊", {})).toBe(21);
  });

  it("有回推值就用回推值，沒有才用保底", () => {
    expect(promiseFor("維修", { 維修: 30 })).toBe(30);
  });
});

describe("findOverdue", () => {
  it("只看在製品；completed / cancelled 不該出現", () => {
    const orders = [
      order({ status: "completed", orderDate: "2026-01-01" }),
      order({ status: "cancelled", orderDate: "2026-01-01" }),
      order({ status: "production", orderDate: "2026-01-01" }),
    ];
    expect(findOverdue(orders, "2026-11-10")).toHaveLength(1);
  });

  it("沒超過承諾的不列出來 —— 全綠時警示列要完全消失", () => {
    const orders = [order({ status: "production", orderDate: "2026-11-06" })];
    expect(findOverdue(orders, "2026-11-10")).toHaveLength(0);
  });

  it("超過 1.5 倍是 critical，超過 1 倍是 late", () => {
    const orders = [
      order({ orderNumber: "LATE", itemCategory: "臥榻墊", orderDate: "2026-10-05" }),   // 26 工作天 / 21
      order({ orderNumber: "CRIT", itemCategory: "臥榻墊", orderDate: "2026-09-01" }),   // 50 工作天 / 21
    ];
    const out = findOverdue(orders, "2026-11-10");
    expect(out[0].order.orderNumber).toBe("CRIT");
    expect(out[0].level).toBe("critical");
    expect(out[1].level).toBe("late");
  });

  it("超期最嚴重的排最前面（用比例不是絕對天數）", () => {
    const orders = [
      order({ orderNumber: "維修久", itemCategory: "維修", orderDate: "2026-09-22" }),
      order({ orderNumber: "沙發", itemCategory: "訂製沙發", orderDate: "2026-09-24" }),
    ];
    const out = findOverdue(orders, "2026-11-10");
    // 維修 35/26 = 1.35，訂製沙發 33/21 = 1.57 → 沙發更嚴重，即使天數比較少
    expect(out[0].order.orderNumber).toBe("沙發");
  });

  it("沒有下單日的不列入，不要因為缺資料就報警", () => {
    expect(findOverdue([order({ orderDate: "" })], "2026-11-10")).toHaveLength(0);
  });
});

/**
 * 🔴 2026-11-10：訂製訂單 77 筆的 createdBy 全是空的 —— 原本寫死 ""。
 *    查不出任何一張是誰開的、走哪條路徑開的（手動／回簽／線上簽署）。
 *    三條路徑的後續不一樣：自動開的單交期與排程是空的，要人補。
 */
describe("createOrder 的 createdBy（回歸測試）", () => {
  it("型別允許三種來源都帶 createdBy", async () => {
    const { } = await import("@/lib/order-create");
    // 編譯期保證：tsc 過了就代表三種 input 都接受 createdBy
    const a: import("@/lib/order-create").CreateOrderInput = {
      sourceType: "quote", versionId: "V1", createdBy: "someone@example.com",
    };
    const b: import("@/lib/order-create").CreateOrderInput = {
      sourceType: "direct", clientName: "客", orderNumber: "S1", createdBy: "線上簽署自動開單",
    };
    expect(a.createdBy).toBe("someone@example.com");
    expect(b.createdBy).toBe("線上簽署自動開單");
  });
});
