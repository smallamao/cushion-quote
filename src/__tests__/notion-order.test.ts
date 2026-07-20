import { describe, it, expect } from "vitest";
import { mapNotionStatus, buildNotionProperties } from "@/lib/notion-order";
import type { CustomOrder } from "@/lib/types";

// 最小可用的訂單物件（只填 buildNotionProperties 會用到的欄位）
function mkOrder(patch: Partial<CustomOrder>): CustomOrder {
  return {
    orderId: "ORD-2026-07-003",
    orderNumber: "S882",
    clientName: "Kevin",
    status: "completed",
    quotedAmount: 9500,
    materialCost: 0,
    laborCost: 0,
    shippingCost: 0,
    otherCost: 0,
    materialPurchases: [],
    items: [],
    ...patch,
  } as CustomOrder;
}

describe("mapNotionStatus", () => {
  it("完成 completed → 完成 | Completed（先前錯映射成待出貨）", () => {
    expect(mapNotionStatus("completed")).toBe("完成 | Completed");
  });

  it("待出貨 waiting → 待出貨 | Wait For Shipping（先前錯映射成排程）", () => {
    expect(mapNotionStatus("waiting")).toBe("待出貨 | Wait For Shipping");
  });

  it("排程/生產中 production → 排程 | Production", () => {
    expect(mapNotionStatus("production")).toBe("排程 | Production");
  });

  it("取消 cancelled → null（Notion 無對應選項，不覆寫）", () => {
    expect(mapNotionStatus("cancelled")).toBeNull();
  });

  it("未知狀態 → null", () => {
    expect(mapNotionStatus("whatever")).toBeNull();
  });
});

describe("buildNotionProperties 狀態欄位", () => {
  it("completed 會寫入 狀態 = 完成 | Completed", () => {
    const props = buildNotionProperties(mkOrder({ status: "completed" })) as Record<string, unknown>;
    expect(props["狀態"]).toEqual({ select: { name: "完成 | Completed" } });
  });

  it("waiting 會寫入 狀態 = 待出貨 | Wait For Shipping", () => {
    const props = buildNotionProperties(mkOrder({ status: "waiting" })) as Record<string, unknown>;
    expect(props["狀態"]).toEqual({ select: { name: "待出貨 | Wait For Shipping" } });
  });

  it("cancelled 不寫入 狀態（維持 Notion 原值，避免推錯或誤建選項）", () => {
    const props = buildNotionProperties(mkOrder({ status: "cancelled" })) as Record<string, unknown>;
    expect(props["狀態"]).toBeUndefined();
  });
});
