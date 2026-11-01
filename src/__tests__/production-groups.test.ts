import { describe, expect, it } from "vitest";

import type { ProductionOrderView } from "@/lib/production-orders";
import {
  daysBetween,
  dueLabel,
  groupProductionOrders,
  productionDueOf,
  productionGroupOf,
  taipeiDateStr,
} from "@/lib/production-groups";

function order(partial: Partial<ProductionOrderView>): ProductionOrderView {
  return {
    orderId: "ORD-1",
    orderNumber: "S001",
    itemCategory: "訂製坐墊",
    deliveryMethod: "delivery",
    status: "production",
    productionDueDate: "",
    deadline: "",
    shipDate: "",
    installDate: "",
    completedDate: "",
    materialName: "",
    materialCode: "",
    materialImageUrl: "",
    materialImageScale: 1,
    items: [],
    notes: [],
    photos: [],
    workOrderPdfUrl: "",
    ...partial,
  } as ProductionOrderView;
}

describe("taipeiDateStr — 用台灣日期算今天", () => {
  it("台灣 23:30（UTC 15:30）仍是當天", () => {
    expect(taipeiDateStr(new Date("2026-11-01T15:30:00Z"))).toBe("2026-11-01");
  });

  it("台灣 00:30（UTC 前一天 16:30）已是隔天——UTC 算法會錯成前一天", () => {
    const now = new Date("2026-11-01T16:30:00Z");
    expect(taipeiDateStr(now)).toBe("2026-11-02");
    expect(now.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("台灣早上 07:59（UTC 前一天 23:59）", () => {
    expect(taipeiDateStr(new Date("2026-10-31T23:59:00Z"))).toBe("2026-11-01");
  });

  it("跨月、跨年", () => {
    expect(taipeiDateStr(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });
});

describe("productionGroupOf — 交期分群", () => {
  const today = "2026-11-01";
  const g = (due: string, status: ProductionOrderView["status"] = "production") =>
    productionGroupOf(order({ productionDueDate: due, status }), today);

  it("昨天以前＝逾期", () => {
    expect(g("2026-10-31")).toBe("overdue");
    expect(g("2026-09-01")).toBe("overdue");
  });

  it("今天＝今天", () => {
    expect(g("2026-11-01")).toBe("today");
  });

  it("明天～第 7 天＝本週（接下來 7 天，不是到星期日）", () => {
    expect(g("2026-11-02")).toBe("week");
    expect(g("2026-11-08")).toBe("week");
  });

  it("第 8 天以後＝之後", () => {
    expect(g("2026-11-09")).toBe("later");
    expect(g("2027-01-01")).toBe("later");
  });

  it("沒填交期、格式錯＝之後", () => {
    expect(g("")).toBe("later");
    expect(g("下週")).toBe("later");
  });

  it("已完成一律歸已完成，不看交期", () => {
    expect(g("2026-10-01", "completed")).toBe("done");
    expect(g("2026-11-01", "completed")).toBe("done");
  });

  it("待出貨也照交期分群", () => {
    expect(g("2026-10-30", "waiting")).toBe("overdue");
  });

  it("生產交期優先，沒填才用訂單交期；帶時間也只看日期", () => {
    expect(productionDueOf({ productionDueDate: "2026-11-05", deadline: "2026-10-01" })).toBe("2026-11-05");
    expect(productionDueOf({ productionDueDate: "", deadline: "2026-10-01" })).toBe("2026-10-01");
    expect(productionDueOf({ productionDueDate: "2026-11-05T10:00:00", deadline: "" })).toBe("2026-11-05");
  });

  it("台灣凌晨 00:30：昨天交期的單算逾期（UTC 日期會誤判成今天）", () => {
    const today0030 = taipeiDateStr(new Date("2026-11-01T16:30:00Z")); // 台灣 11/02 00:30
    expect(productionGroupOf(order({ productionDueDate: "2026-11-01" }), today0030)).toBe("overdue");
    // 台灣 11/01 23:30：同一張還是今天
    const today2330 = taipeiDateStr(new Date("2026-11-01T15:30:00Z"));
    expect(productionGroupOf(order({ productionDueDate: "2026-11-01" }), today2330)).toBe("today");
  });
});

describe("groupProductionOrders", () => {
  const today = "2026-11-01";

  it("只回有單的群組，順序固定：逾期→今天→本週→之後→已完成", () => {
    const groups = groupProductionOrders(
      [
        order({ orderId: "a", productionDueDate: "2026-12-01" }),
        order({ orderId: "b", status: "completed", completedDate: "2026-10-30" }),
        order({ orderId: "c", productionDueDate: "2026-10-20" }),
        order({ orderId: "d", productionDueDate: "2026-11-03" }),
      ],
      today,
    );
    expect(groups.map((x) => x.key)).toEqual(["overdue", "week", "later", "done"]);
  });

  it("群組內交期近的在前、沒交期的排最後；已完成最近完成的在前", () => {
    const groups = groupProductionOrders(
      [
        order({ orderId: "nodue", orderNumber: "S1" }),
        order({ orderId: "far", orderNumber: "S2", productionDueDate: "2026-12-20" }),
        order({ orderId: "near", orderNumber: "S3", productionDueDate: "2026-11-20" }),
        order({ orderId: "old", status: "completed", completedDate: "2026-10-26" }),
        order({ orderId: "new", status: "completed", completedDate: "2026-10-31" }),
      ],
      today,
    );
    const byKey = Object.fromEntries(groups.map((x) => [x.key, x.orders.map((o) => o.orderId)]));
    expect(byKey.later).toEqual(["near", "far", "nodue"]);
    expect(byKey.done).toEqual(["new", "old"]);
  });

  it("不改動傳入的陣列", () => {
    const input = [order({ orderId: "x", productionDueDate: "2026-12-01" }), order({ orderId: "y", productionDueDate: "2026-11-01" })];
    groupProductionOrders(input, today);
    expect(input.map((o) => o.orderId)).toEqual(["x", "y"]);
  });
});

describe("dueLabel / daysBetween", () => {
  const today = "2026-11-01";
  it("逾期顯示天數", () => {
    expect(dueLabel({ productionDueDate: "2026-10-29", deadline: "" }, today)).toBe("逾期 3 天（10/29）");
  });
  it("今天、明天、其他日期帶星期", () => {
    expect(dueLabel({ productionDueDate: "2026-11-01", deadline: "" }, today)).toBe("今天 11/01");
    expect(dueLabel({ productionDueDate: "2026-11-02", deadline: "" }, today)).toBe("明天 11/02");
    expect(dueLabel({ productionDueDate: "2026-11-05", deadline: "" }, today)).toBe("11/05（四）");
  });
  it("沒填交期", () => {
    expect(dueLabel({ productionDueDate: "", deadline: "" }, today)).toBe("未填交期");
  });
  it("跨月天數", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-11-01", "2026-10-01")).toBe(-31);
  });
});
