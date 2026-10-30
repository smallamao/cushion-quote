import { describe, it, expect } from "vitest";
import { compareOrders, cmpDateDesc, cmpInstallDate } from "@/lib/order-sort";
import { resolveWorkOrderMaterialImage } from "@/lib/order-utils";
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

describe("cmpInstallDate（安裝/出貨日：無日期排最前）", () => {
  it("有日期時新到舊", () => {
    expect(cmpInstallDate("2026-07-24", "2026-07-22")).toBeLessThan(0);
    expect(cmpInstallDate("2026-07-22", "2026-07-24")).toBeGreaterThan(0);
  });
  it("空值排最前（不論另一邊新舊）", () => {
    expect(cmpInstallDate("", "2026-01-01")).toBeLessThan(0);
    expect(cmpInstallDate("2026-01-01", "")).toBeGreaterThan(0);
    expect(cmpInstallDate("", "")).toBe(0);
  });
});

describe("compareOrders（狀態分組排序）", () => {
  it("狀態分組 → 無安裝日在前→有安裝日新舊 → 下單日新舊 → 建立時間舊新", () => {
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
      // 待出貨排在生產中之前（老闆 2026-10-25）：快要出貨的最需要盯
      "W1",
      // production：先「無安裝日」者（依下單日新→舊、再建立時間舊→新），
      "P_order21",
      "P_order12",
      "P_noDate_old",
      "P_noDate_new",
      // 再「有安裝日」者，新→舊
      "P_install24",
      "P_install22",
      // 結案狀態在最後
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

describe("待出貨排在排程/生產中之前（老闆 2026-10-25）", () => {
  it("即使生產中的那筆出貨日更近，待出貨仍排在前面", () => {
    const waiting = mk({ status: "waiting", installDate: "2026-12-31" });
    const prod = mk({ status: "production", installDate: "2026-01-01" });
    expect(compareOrders(waiting, prod)).toBeLessThan(0);
    expect(compareOrders(prod, waiting)).toBeGreaterThan(0);
  });

  it("整體順序：待建立內容 → 待出貨 → 排程/生產中 → 完成 → 取消", () => {
    const seq = ["pending_setup", "waiting", "production", "completed", "cancelled"] as const;
    const sorted = [...seq].reverse().map((s) => mk({ status: s })).sort(compareOrders);
    expect(sorted.map((o) => o.status)).toEqual([...seq]);
  });
});

describe("待建立內容（pending_setup）排最前", () => {
  it("即使已排期，待建立內容仍排在生產中之前", () => {
    // 排在最前是刻意的：客人已簽核但交期/排程還沒填，混進生產中的單裡就會被漏掉。
    const pending = mk({ status: "pending_setup", installDate: "2026-01-01" });
    const prod = mk({ status: "production", installDate: "2026-12-31" });
    expect(compareOrders(pending, prod)).toBeLessThan(0);
    expect(compareOrders(prod, pending)).toBeGreaterThan(0);
  });

  it("待建立內容排在所有其他狀態之前", () => {
    const pending = mk({ status: "pending_setup" });
    for (const s of ["production", "waiting", "completed", "cancelled"] as const) {
      expect(compareOrders(pending, mk({ status: s }))).toBeLessThan(0);
    }
  });

  it("同為待建立內容時，仍照安裝/出貨日與下單日往下比", () => {
    const a = mk({ status: "pending_setup", installDate: "", orderDate: "2026-05-01" });
    const b = mk({ status: "pending_setup", installDate: "2026-05-01", orderDate: "2026-05-01" });
    expect(compareOrders(a, b)).toBeLessThan(0); // 無日期者仍排前
  });
});

describe("resolveWorkOrderMaterialImage", () => {
  const cropped = "https://res.cloudinary.com/x/image/upload/v2/work-order-swatch/cropped.jpg";
  const original = "https://res.cloudinary.com/x/image/upload/v1/quote-attachments/original.jpg";

  it("帶了裁切圖就用裁切圖（PDF 印什麼、訂單就存什麼）", () => {
    expect(resolveWorkOrderMaterialImage(cropped, original)).toBe(cropped);
  });

  it("沒帶值時沿用既有的，不可洗掉", () => {
    expect(resolveWorkOrderMaterialImage(undefined, original)).toBe(original);
    expect(resolveWorkOrderMaterialImage(null, original)).toBe(original);
  });

  it("空字串／空白也不可洗掉——沒有布樣圖的單也會走這條路", () => {
    expect(resolveWorkOrderMaterialImage("", original)).toBe(original);
    expect(resolveWorkOrderMaterialImage("   ", original)).toBe(original);
  });

  it("本來就沒有圖時回空字串", () => {
    expect(resolveWorkOrderMaterialImage("", "")).toBe("");
    expect(resolveWorkOrderMaterialImage(undefined, undefined)).toBe("");
  });
});
