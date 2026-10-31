import { describe, it, expect } from "vitest";

import {
  COMPLETED_VISIBLE_DAYS,
  canSetProductionStatus,
  isProductionSettableStatus,
  isVisibleOnProductionList,
  pickProductionOrderView,
} from "@/lib/production-orders";
import type { CustomOrder, OrderStatus } from "@/lib/types";

// 工廠師傅的生產訂單。這份測試守的是「什麼不能離開伺服器」：
// 客戶姓名、地址電話、金額、內部備註一個都不能出現在投影結果裡。

// 每個敏感欄位都放一個獨一無二、好搜尋的值
const SECRET = {
  clientName: "王大明客戶",
  clientId: "CL-SECRET-0042",
  orderTitle: "王府客廳L型沙發",
  lineChatUrl: "https://chat.line.biz/secret-room",
  clientPoNumber: "PO-SECRET-7788",
  clientPoPhoto: "https://blob.example/client-po-secret.jpg",
  installAddress: "台北市信義區祕密路99號",
  installContactName: "王太太",
  installContactPhone: "0912-345-678",
  internalNotes: "客人很會殺價，底價不能再降",
  caseId: "CA-SECRET-01",
  versionId: "VER-SECRET-01",
  notionPageId: "notion-secret-page",
  createdBy: "boss@secret.example",
  installAssignedTo: "安裝技師阿華",
  purchaseItem: "祕密採購布料",
  receipt: "https://blob.example/receipt-secret.jpg",
};

const AMOUNTS = {
  quotedAmount: 987654,
  materialCost: 123457,
  laborCost: 234568,
  shippingCost: 3456,
  otherCost: 4567,
  purchaseAmount: 56789,
};

function order(over: Partial<CustomOrder> = {}): CustomOrder {
  return {
    orderId: "ORD-001",
    caseId: SECRET.caseId,
    versionId: SECRET.versionId,
    clientName: SECRET.clientName,
    orderNumber: "P1234",
    orderTitle: SECRET.orderTitle,
    itemCategory: "訂製沙發",
    deliveryMethod: "到府施工",
    status: "production",
    sourceType: "quote",
    orderDate: "2026-10-01",
    supplierOrderDate: "2026-10-02",
    productionDueDate: "2026-11-10",
    installDate: "2026-11-15",
    completedDate: "",
    quotedAmount: AMOUNTS.quotedAmount,
    materialCost: AMOUNTS.materialCost,
    laborCost: AMOUNTS.laborCost,
    shippingCost: AMOUNTS.shippingCost,
    otherCost: AMOUNTS.otherCost,
    materialName: "貓抓布",
    materialCode: "LY-123",
    materialImageUrl: "https://blob.example/swatch.jpg",
    materialImageScale: 1.1,
    photoLayout: [],
    fontScale: 1,
    workOrderPdfUrl: "https://blob.example/work-order.pdf",
    workOrderPdfUpdatedAt: "2026-10-20T00:00:00Z",
    paidDate: "2026-10-03",
    clientId: SECRET.clientId,
    lineChatUrl: SECRET.lineChatUrl,
    clientPoNumber: SECRET.clientPoNumber,
    clientPoPhotos: [SECRET.clientPoPhoto],
    shipDate: "2026-11-14",
    extraInstallDates: ["2026-11-16"],
    installAssignedTo: SECRET.installAssignedTo,
    installAddress: SECRET.installAddress,
    installContactName: SECRET.installContactName,
    installContactPhone: SECRET.installContactPhone,
    deadline: "2026-11-12",
    items: [
      {
        id: "it1",
        name: "三人座",
        dimensions: "W240 D95 H85\n座高 42",
        quantity: "1",
        foamSpec: "高支撐",
        foamColor: "red",
        itemType: "normal",
        colorCode: "C-07",
        subNote: "扶手加寬",
        photos: ["https://blob.example/item1.jpg"],
        imageUrl: "https://blob.example/legacy-item.jpg",
      },
    ],
    notes: [{ id: "n1", text: "車線要用同色", color: "red", isWarning: true }],
    photos: ["https://blob.example/site.jpg"],
    invoiceStatus: "issued",
    isArchived: false,
    internalNotes: SECRET.internalNotes,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-20T00:00:00Z",
    createdBy: SECRET.createdBy,
    materialPurchases: [
      {
        id: "mp1",
        costType: "material",
        item: SECRET.purchaseItem,
        amount: AMOUNTS.purchaseAmount,
        date: "2026-10-05",
        receiptUrls: [SECRET.receipt],
      },
    ],
    notionPageId: SECRET.notionPageId,
    ...over,
  };
}

describe("pickProductionOrderView — 白名單投影", () => {
  const view = pickProductionOrderView(order());
  const json = JSON.stringify(view);

  it("只有規格列出的欄位", () => {
    expect(Object.keys(view).sort()).toEqual(
      [
        "orderId",
        "orderNumber",
        "itemCategory",
        "deliveryMethod",
        "status",
        "productionDueDate",
        "deadline",
        "shipDate",
        "installDate",
        "completedDate",
        "materialName",
        "materialCode",
        "materialImageUrl",
        "materialImageScale",
        "items",
        "notes",
        "photos",
        "workOrderPdfUrl",
      ].sort(),
    );
    expect(Object.keys(view.items[0]).sort()).toEqual(
      ["id", "name", "dimensions", "quantity", "foamSpec", "foamColor", "itemType", "colorCode", "subNote", "photos"].sort(),
    );
    expect(Object.keys(view.notes[0]).sort()).toEqual(["id", "text", "color", "isWarning"].sort());
  });

  it.each(Object.entries(SECRET))("敏感值不出現在輸出任何地方：%s", (_k, value) => {
    expect(json).not.toContain(value);
  });

  it.each(Object.entries(AMOUNTS))("金額不出現在輸出任何地方：%s", (_k, value) => {
    expect(json).not.toContain(String(value));
  });

  const forbiddenKeys = [
    "clientName",
    "clientId",
    "orderTitle",
    "lineChatUrl",
    "clientPoNumber",
    "clientPoPhotos",
    "installAddress",
    "installContactName",
    "installContactPhone",
    "quotedAmount",
    "materialCost",
    "laborCost",
    "shippingCost",
    "otherCost",
    "materialPurchases",
    "paidDate",
    "invoiceStatus",
    "internalNotes",
    "caseId",
    "versionId",
    "notionPageId",
    "createdBy",
    "installAssignedTo",
    "imageUrl",
  ];

  it.each(forbiddenKeys)("輸出沒有 %s 這個鍵", (key) => {
    expect(json).not.toContain(`"${key}"`);
  });

  it("製作需要的內容都在", () => {
    expect(view.orderNumber).toBe("P1234");
    expect(view.items[0].dimensions).toBe("W240 D95 H85\n座高 42");
    expect(view.items[0].photos).toEqual(["https://blob.example/item1.jpg"]);
    expect(view.notes[0]).toEqual({ id: "n1", text: "車線要用同色", color: "red", isWarning: true });
    expect(view.workOrderPdfUrl).toBe("https://blob.example/work-order.pdf");
    expect(view.materialImageScale).toBe(1.1);
  });

  it("CustomOrder 以後多了新欄位，預設也不會被帶出去", () => {
    const withExtra = { ...order(), futureSecretField: "未來的敏感欄位" } as CustomOrder;
    expect(JSON.stringify(pickProductionOrderView(withExtra))).not.toContain("未來的敏感欄位");
  });

  it("選填欄位缺漏時給預設值，不丟錯", () => {
    const v = pickProductionOrderView(
      order({ shipDate: undefined, workOrderPdfUrl: undefined, materialImageScale: undefined, items: [{ id: "x", name: "墊", dimensions: "", quantity: "2", foamSpec: "", foamColor: null }] }),
    );
    expect(v.shipDate).toBe("");
    expect(v.workOrderPdfUrl).toBe("");
    expect(v.materialImageScale).toBe(1);
    expect(v.items[0]).toMatchObject({ itemType: "normal", colorCode: "", subNote: "", photos: [] });
  });
});

describe("isVisibleOnProductionList — 清單篩選", () => {
  const today = "2026-11-01";

  it.each<[OrderStatus, boolean]>([
    ["production", true],
    ["waiting", true],
    ["pending_setup", false],
    ["cancelled", false],
  ])("狀態 %s → %s", (status, expected) => {
    expect(isVisibleOnProductionList(order({ status }), today)).toBe(expected);
  });

  it("封存的單一律不顯示", () => {
    expect(isVisibleOnProductionList(order({ status: "production", isArchived: true }), today)).toBe(false);
    expect(
      isVisibleOnProductionList(order({ status: "completed", completedDate: today, isArchived: true }), today),
    ).toBe(false);
  });

  it(`已完成：${COMPLETED_VISIBLE_DAYS} 天內顯示，更早的不顯示`, () => {
    const done = (d: string) => isVisibleOnProductionList(order({ status: "completed", completedDate: d }), today);
    expect(done("2026-11-01")).toBe(true);
    expect(done("2026-10-25")).toBe(true); // 剛好 7 天前
    expect(done("2026-10-24")).toBe(false); // 8 天前
    expect(done("2026-09-01")).toBe(false);
    expect(done("")).toBe(false); // 完成卻沒有完成日 → 不知道多久以前，不顯示
  });

  it("跨月也算得對", () => {
    expect(
      isVisibleOnProductionList(order({ status: "completed", completedDate: "2026-02-26" }), "2026-03-04"),
    ).toBe(true);
  });
});

describe("canSetProductionStatus — 師傅改狀態規則", () => {
  it.each<[OrderStatus, string, boolean]>([
    ["production", "completed", true],
    ["waiting", "completed", true],
    ["completed", "production", true], // 改正按錯
    ["waiting", "production", true],
    ["production", "production", true],
    ["production", "waiting", false],
    ["production", "cancelled", false],
    ["production", "pending_setup", false],
    ["completed", "cancelled", false],
    ["pending_setup", "production", false],
    ["pending_setup", "completed", false],
    ["cancelled", "production", false],
    ["cancelled", "completed", false],
  ])("%s → %s：%s", (current, next, expected) => {
    expect(canSetProductionStatus(current, next)).toBe(expected);
  });

  it("非字串、亂打的值一律拒絕", () => {
    for (const v of [undefined, null, 1, {}, ["completed"], "Completed", "done"]) {
      expect(isProductionSettableStatus(v)).toBe(false);
      expect(canSetProductionStatus("production", v)).toBe(false);
    }
  });
});
