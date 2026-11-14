import { describe, expect, it } from "vitest";
import { REWORK_TRACKING_SINCE, newReworkId, summarizeReworks } from "@/lib/order-rework";
import type { CustomOrder, OrderRework } from "@/lib/types";

const rework = (p: Partial<OrderRework> = {}): OrderRework => ({
  id: "rw1",
  at: "2026-11-10T03:00:00.000Z",
  itemId: "i1",
  itemName: "背墊",
  symptom: "尺寸",
  cause: "工單抄錯",
  foundAt: "製作中",
  note: "",
  recordedBy: "boss@example.com",
  ...p,
});

const order = (p: Partial<CustomOrder>): CustomOrder =>
  ({
    orderId: "o", caseId: "c", versionId: "v", clientName: "客", orderNumber: "S1",
    orderTitle: "品", itemCategory: "臥榻墊", deliveryMethod: "", status: "production",
    sourceType: "quote", orderDate: "2026-11-11", supplierOrderDate: "", productionDueDate: "",
    installDate: "", completedDate: "", quotedAmount: 1000, materialCost: 0, laborCost: 0,
    shippingCost: 0, otherCost: 0, materialName: "", materialCode: "", materialImageUrl: "",
    ...p,
  }) as CustomOrder;

describe("summarizeReworks — 分母誠實", () => {
  it("開始記錄之前的舊單不進分母，避免把重做率稀釋成假的低百分比", () => {
    const s = summarizeReworks([
      order({ orderId: "old1", orderDate: "2026-03-01" }),
      order({ orderId: "old2", orderDate: "2026-07-15" }),
      order({ orderId: "new1", orderDate: "2026-11-12", reworks: [rework()] }),
      order({ orderId: "new2", orderDate: "2026-11-13" }),
    ]);
    expect(s.scopeOrders).toBe(2);
    expect(s.orderCount).toBe(1);
    expect(s.rate).toBe(0.5);
    expect(s.since).toBe(REWORK_TRACKING_SINCE);
  });

  it("起算日當天的訂單要算進去（邊界用 >=，不是 >）", () => {
    const s = summarizeReworks([order({ orderDate: REWORK_TRACKING_SINCE })]);
    expect(s.scopeOrders).toBe(1);
  });

  it("沒有任何可算的訂單時 rate 回 0，不會變成 NaN", () => {
    const s = summarizeReworks([order({ orderDate: "2026-01-01" })]);
    expect(s.scopeOrders).toBe(0);
    expect(s.rate).toBe(0);
  });

  it("舊單上補記的重做照樣算次數，但不影響分母", () => {
    const s = summarizeReworks([
      order({ orderId: "old", orderDate: "2026-05-01", reworks: [rework()] }),
      order({ orderId: "new", orderDate: "2026-11-20" }),
    ]);
    expect(s.total).toBe(1);
    expect(s.scopeOrders).toBe(1);
    expect(s.orderCount).toBe(0);
  });

  it("一張單記多筆時，訂單數只算一次、筆數照算", () => {
    const s = summarizeReworks([
      order({
        orderId: "a",
        reworks: [rework({ id: "r1" }), rework({ id: "r2", symptom: "件數" })],
      }),
    ]);
    expect(s.total).toBe(2);
    expect(s.orderCount).toBe(1);
  });
});

describe("summarizeReworks — 分類計數", () => {
  const orders = [
    order({
      orderId: "a",
      itemCategory: "臥榻墊",
      reworks: [
        rework({ id: "r1", symptom: "尺寸", cause: "工單抄錯", foundAt: "製作中" }),
        rework({ id: "r2", symptom: "尺寸", cause: "師傅做錯", foundAt: "出貨前" }),
      ],
    }),
    order({
      orderId: "b",
      itemCategory: "繃布裱板",
      reworks: [rework({ id: "r3", symptom: "材質色號", cause: "", foundAt: "客人反映" })],
    }),
  ];

  it("症狀由多到少排序", () => {
    expect(summarizeReworks(orders).bySymptom).toEqual([
      { key: "尺寸", count: 2 },
      { key: "材質色號", count: 1 },
    ]);
  });

  it("歸因留空的不會被算成某一類，而是單獨記成「還沒查出根因」", () => {
    const s = summarizeReworks(orders);
    expect(s.unknownCause).toBe(1);
    expect(new Set(s.byCause.map((x) => x.key))).toEqual(new Set(["師傅做錯", "工單抄錯"]));
    expect(s.byCause.reduce((n, x) => n + x.count, 0)).toBe(2);
  });

  it("品類是從訂單帶過來的，一張單有幾筆就算幾筆", () => {
    expect(summarizeReworks(orders).byCategory).toEqual([
      { key: "臥榻墊", count: 2 },
      { key: "繃布裱板", count: 1 },
    ]);
  });

  it("品類空白的訂單歸到「未分類」，不會消失", () => {
    const s = summarizeReworks([order({ itemCategory: "", reworks: [rework()] })]);
    expect(s.byCategory).toEqual([{ key: "未分類", count: 1 }]);
  });

  it("完全沒有重做時各分類是空陣列而不是出錯", () => {
    const s = summarizeReworks([order({})]);
    expect(s.total).toBe(0);
    expect(s.bySymptom).toEqual([]);
    expect(s.unknownCause).toBe(0);
  });
});

describe("newReworkId", () => {
  it("連續產生不會撞號", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newReworkId()));
    expect(ids.size).toBe(200);
  });
});
