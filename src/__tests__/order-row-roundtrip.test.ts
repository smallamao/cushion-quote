import { describe, expect, it } from "vitest";
import {
  ORDER_RANGE_DATA,
  ORDER_RANGE_FULL,
  ORDER_ROW_RANGE,
  columnLetter,
  orderRecordToRow,
  orderRowToRecord,
} from "@/lib/order-utils";
import type { CustomOrder, OrderRework } from "@/lib/types";

/**
 * 訂製訂單欄位的 write → read 來回測試。
 *
 * ★ 為什麼特別測這個：這張表加欄位已經踩過四次坑（range 常數、單列 range、
 *   實體 grid 欄數、排序欄數）。症狀都一樣——寫得進去但讀不回來，或是
 *   最後一欄被 Sheets 默默截掉，而且當下不會報錯，要等幾天後查資料才發現是空的。
 */

const rework = (p: Partial<OrderRework> = {}): OrderRework => ({
  id: "RW-1",
  at: "2026-11-10T03:00:00.000Z",
  itemId: "i1",
  itemName: "背墊",
  symptom: "尺寸",
  cause: "工單抄錯",
  foundAt: "製作中",
  note: "做成 40 高，圖面寫 35",
  recordedBy: "boss@example.com",
  ...p,
});

const order = (p: Partial<CustomOrder>): CustomOrder =>
  ({
    orderId: "o1", caseId: "c1", versionId: "v1", clientName: "客", orderNumber: "S1",
    orderTitle: "品", itemCategory: "臥榻墊", deliveryMethod: "", status: "production",
    sourceType: "quote", orderDate: "2026-11-11", supplierOrderDate: "", productionDueDate: "",
    installDate: "", completedDate: "", quotedAmount: 1000, materialCost: 0, laborCost: 0,
    shippingCost: 0, otherCost: 0, materialName: "", materialCode: "", materialImageUrl: "",
    deadline: "", items: [], notes: [], photos: [], invoiceStatus: "none", isArchived: false,
    internalNotes: "", createdAt: "", updatedAt: "", createdBy: "", materialPurchases: [],
    ...p,
  }) as CustomOrder;

describe("訂製訂單列 write → read", () => {
  it("重做紀錄來回之後完全一樣", () => {
    const before = order({ reworks: [rework(), rework({ id: "RW-2", cause: "" })] });
    const after = orderRowToRecord(orderRecordToRow(before));
    expect(after.reworks).toEqual(before.reworks);
  });

  it("沒有重做紀錄時讀回來是空陣列，不是 undefined", () => {
    const after = orderRowToRecord(orderRecordToRow(order({})));
    expect(after.reworks).toEqual([]);
  });

  it("歸因留空（還沒查出根因）要能原樣存回來，不可被填成某一類", () => {
    const before = order({ reworks: [rework({ cause: "" })] });
    const after = orderRowToRecord(orderRecordToRow(before));
    expect(after.reworks?.[0].cause).toBe("");
  });

  it("舊的列（只有 52 欄、沒有 reworks 那欄）讀起來不會爆", () => {
    const legacy = orderRecordToRow(order({ reworks: [rework()] })).slice(0, 52);
    expect(orderRowToRecord(legacy).reworks).toEqual([]);
  });
});

describe("欄位範圍與實際欄數要對得上", () => {
  // 這是四次坑裡最致命的一個：range 停在 AZ 而資料有 53 欄時，
  // 最後一欄寫不進去也讀不回來，而且 Sheets 不會回報錯誤。
  const width = orderRecordToRow(order({})).length;

  it("最後一欄的字母正好是 range 的結尾", () => {
    const last = columnLetter(width - 1);
    expect(ORDER_RANGE_FULL).toBe(`訂製訂單!A:${last}`);
    expect(ORDER_RANGE_DATA).toBe(`訂製訂單!A2:${last}10000`);
    expect(ORDER_ROW_RANGE(7)).toBe(`訂製訂單!A7:${last}7`);
  });

  it("目前是 53 欄（加欄位時這個數字要跟著改，順便提醒去改 Google Sheet 的實體欄數）", () => {
    expect(width).toBe(53);
  });
});
