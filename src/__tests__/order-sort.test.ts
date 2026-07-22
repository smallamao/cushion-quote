import { describe, it, expect } from "vitest";
import { compareOrders, cmpDateDesc } from "@/lib/order-sort";
import type { CustomOrder } from "@/lib/types";

function mk(o: Partial<CustomOrder>): CustomOrder {
  return {
    orderNumber: "",
    status: "production",
    installDate: "",
    orderDate: "",
    createdAt: "",
    ...o,
  } as CustomOrder;
}

describe("cmpDateDesc", () => {
  it("新到舊", () => {
    expect(cmpDateDesc("2026-07-24", "2026-07-22")).toBeLessThan(0);
    expect(cmpDateDesc("2026-07-22", "2026-07-24")).toBeGreaterThan(0);
  });
  it("空值排最後（不論另一邊新舊）", () => {
    expect(cmpDateDesc("", "2026-01-01")).toBeGreaterThan(0);
    expect(cmpDateDesc("2026-01-01", "")).toBeLessThan(0);
    expect(cmpDateDesc("", "")).toBe(0);
  });
});

describe("compareOrders（對齊 Notion 排序）", () => {
  it("狀態分組 → 安裝日新舊 → 下單日新舊 → 建立時間舊新", () => {
    const orders = [
      mk({ orderNumber: "C1", status: "completed", installDate: "2026-07-20" }),
      mk({ orderNumber: "W1", status: "waiting", installDate: "2026-07-27" }),
      mk({ orderNumber: "P_noDate_old", status: "production", createdAt: "2026-01-01" }),
      mk({ orderNumber: "P_install24", status: "production", installDate: "2026-07-24" }),
      mk({ orderNumber: "P_install22", status: "production", installDate: "2026-07-22" }),
      mk({ orderNumber: "P_order21", status: "production", orderDate: "2026-07-21" }),
      mk({ orderNumber: "P_order12", status: "production", orderDate: "2026-07-12" }),
      mk({ orderNumber: "P_noDate_new", status: "production", createdAt: "2026-05-01" }),
      mk({ orderNumber: "X1", status: "cancelled" }),
    ];
    const sorted = [...orders].sort(compareOrders).map((o) => o.orderNumber);
    expect(sorted).toEqual([
      // production：安裝日新→舊，再下單日新→舊，最後建立時間舊→新
      "P_install24",
      "P_install22",
      "P_order21",
      "P_order12",
      "P_noDate_old",
      "P_noDate_new",
      // 其餘狀態依序在後
      "W1",
      "C1",
      "X1",
    ]);
  });

  it("安裝日相同時以下單日新→舊決勝", () => {
    const a = mk({ orderNumber: "A", installDate: "2026-07-24", orderDate: "2026-07-01" });
    const b = mk({ orderNumber: "B", installDate: "2026-07-24", orderDate: "2026-07-05" });
    expect([a, b].sort(compareOrders).map((o) => o.orderNumber)).toEqual(["B", "A"]);
  });
});
