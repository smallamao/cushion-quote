import { describe, it, expect } from "vitest";

import { pickMyInstallView } from "@/lib/my-installs";
import type { CustomOrder } from "@/lib/types";

// 技師「我的安裝」投影：金額與內部備註不能出去。
function order(): CustomOrder {
  return {
    orderId: "ORD-002",
    caseId: "CA-1",
    versionId: "V-1",
    clientName: "林小姐",
    orderNumber: "P2000",
    orderTitle: "臥榻墊",
    itemCategory: "臥榻墊",
    deliveryMethod: "到府施工",
    status: "production",
    sourceType: "quote",
    orderDate: "2026-10-01",
    supplierOrderDate: "",
    productionDueDate: "2026-11-05",
    installDate: "2026-11-08",
    completedDate: "",
    quotedAmount: 876543,
    materialCost: 65432,
    laborCost: 0,
    shippingCost: 0,
    otherCost: 0,
    materialName: "布",
    materialCode: "X1",
    materialImageUrl: "",
    installAssignedTo: "阿明",
    installAddress: "新北市板橋區某路1號",
    installContactName: "林小姐",
    installContactPhone: "0988-000-111",
    deadline: "",
    items: [],
    notes: [],
    photos: [],
    invoiceStatus: "pending",
    isArchived: false,
    internalNotes: "內部備註：這位客人上次退過貨",
    createdAt: "",
    updatedAt: "",
    createdBy: "",
    materialPurchases: [],
  };
}

describe("pickMyInstallView", () => {
  const view = pickMyInstallView(order());
  const json = JSON.stringify(view);

  it("不再回傳 internalNotes", () => {
    expect(view).not.toHaveProperty("internalNotes");
    expect(json).not.toContain("內部備註");
  });

  it("不含任何金額", () => {
    expect(json).not.toContain("876543");
    expect(json).not.toContain("65432");
    expect(json).not.toContain("quotedAmount");
    expect(json).not.toContain("materialCost");
  });

  it("施工需要的資訊照舊", () => {
    expect(view.installAddress).toBe("新北市板橋區某路1號");
    expect(view.installContactPhone).toBe("0988-000-111");
    expect(view.clientName).toBe("林小姐");
    expect(view.extraInstallDates).toEqual([]);
    expect(view.shipDate).toBe("");
  });
});
