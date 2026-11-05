import { describe, expect, it } from "vitest";

import { buildMaterialReport, type MaterialReportInput } from "@/lib/assistant/order-materials";
import type { CustomOrder } from "@/lib/types";

function order(orderId: string, clientName: string): CustomOrder {
  return {
    orderId,
    clientName,
    orderTitle: "訂製坐墊",
    status: "production",
  } as CustomOrder;
}

function input(overrides: Partial<MaterialReportInput> = {}): MaterialReportInput {
  return {
    orders: [order("ORD-2026-10-018", "蔡傑峻")],
    purchases: [
      {
        purchaseId: "PS-20261027-01",
        purchaseDate: "2026-10-27",
        supplierName: "伊思奈家飾",
        status: "draft",
        relatedOrderIds: ["ORD-2026-10-018"],
      },
    ],
    items: [
      {
        purchaseId: "PS-20261027-01",
        productName: "新亞麻 600-71",
        category: "面料",
        quantity: "6.5",
        unit: "碼",
      },
    ],
    totalPurchaseCount: 1310,
    ...overrides,
  };
}

describe("buildMaterialReport", () => {
  it("有關聯採購單時列出採購單、廠商、狀態與料的品項", () => {
    const out = buildMaterialReport(input());
    expect(out).toContain("ORD-2026-10-018");
    expect(out).toContain("PS-20261027-01");
    expect(out).toContain("伊思奈家飾");
    expect(out).toContain("新亞麻 600-71");
    expect(out).toContain("6.5碼");
    expect(out).toContain("共 1 張訂單，其中 1 張查得到關聯採購單");
  });

  it("把 draft 譯成草稿，不要把英文原樣丟給使用者", () => {
    expect(buildMaterialReport(input())).toContain("草稿");
  });

  it("sent 狀態要有標籤——1,310 張裡有 129 張是這個狀態", () => {
    const out = buildMaterialReport(
      input({
        purchases: [
          {
            purchaseId: "PS-20260818-01",
            purchaseDate: "2026-08-18",
            supplierName: "久保",
            status: "sent",
            relatedOrderIds: ["ORD-2026-10-018"],
          },
        ],
        items: [],
      }),
    );
    expect(out).toContain("已送出給廠商");
    expect(out).not.toContain("／sent／");
  });

  it("沒有關聯採購單時明講查無，不可省略", () => {
    const out = buildMaterialReport(input({ purchases: [], items: [] }));
    expect(out).toContain("查無關聯採購單");
    expect(out).toContain("共 1 張訂單，其中 0 張查得到關聯採購單");
  });

  it("判讀限制一定會附上，而且帶實際覆蓋率數字", () => {
    const out = buildMaterialReport(input());
    expect(out).toContain("判讀限制");
    expect(out).toContain("1,310 張採購單裡，只有 1 張有填「關聯訂單」");
    expect(out).toContain("不等於沒採購");
    expect(out).toContain("不要下「已採購／未採購」的結論");
  });

  it("一張採購單綁多張訂單時，兩張訂單都要查得到", () => {
    const out = buildMaterialReport(
      input({
        orders: [order("ORD-2026-10-018", "蔡傑峻"), order("ORD-2026-10-021", "何渝婷")],
        purchases: [
          {
            purchaseId: "PS-20261027-01",
            purchaseDate: "2026-10-27",
            supplierName: "伊思奈家飾",
            status: "draft",
            relatedOrderIds: ["ORD-2026-10-018", "ORD-2026-10-021"],
          },
        ],
      }),
    );
    expect(out).toContain("共 2 張訂單，其中 2 張查得到關聯採購單");
  });

  it("採購單有明細但都不是料時，照樣列出來而不是裝作沒有", () => {
    const out = buildMaterialReport(
      input({
        items: [
          {
            purchaseId: "PS-20261027-01",
            productName: "運費",
            category: "其他",
            quantity: "1",
            unit: "式",
          },
        ],
      }),
    );
    expect(out).toContain("運費");
  });

  it("採購單沒有明細時要講清楚，不要留白讓人以為沒買料", () => {
    const out = buildMaterialReport(input({ items: [] }));
    expect(out).toContain("這張採購單沒有明細");
  });

  it("沒有符合條件的訂單就直說", () => {
    expect(buildMaterialReport(input({ orders: [] }))).toBe("查無符合條件的訂製訂單。");
  });
});
