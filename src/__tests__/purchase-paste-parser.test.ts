import { describe, expect, it } from "vitest";

import {
  parsePurchasePasteLine,
  parsePurchasePasteText,
  resolveParsedLines,
  summarizeCaseRefs,
} from "@/lib/purchase-paste-parser";
import type { PurchaseProduct } from "@/lib/types";

describe("parsePurchasePasteLine", () => {
  it("解析單一品項 + 碼", () => {
    const r = parsePurchasePasteLine("LY9802 15y #P5999");
    expect(r).not.toBeNull();
    expect(r!.productCode).toBe("LY9802");
    expect(r!.caseRef).toBe("P5999");
    expect(r!.subItems).toEqual([{ qty: 15, unit: "碼" }]);
  });

  it("解析小數數量", () => {
    const r = parsePurchasePasteLine("LY3139-5 6.5y #P6005");
    expect(r!.productCode).toBe("LY3139-5");
    expect(r!.subItems).toEqual([{ qty: 6.5, unit: "碼" }]);
  });

  it("解析大寫 Y", () => {
    const r = parsePurchasePasteLine("彩虹皮8852 2Y #S847");
    expect(r!.productCode).toBe("彩虹皮8852");
    expect(r!.subItems).toEqual([{ qty: 2, unit: "碼" }]);
  });

  it("解析中文商品編號", () => {
    const r = parsePurchasePasteLine("勝3925 7.5y #P6000");
    expect(r!.productCode).toBe("勝3925");
    expect(r!.subItems).toEqual([{ qty: 7.5, unit: "碼" }]);
  });

  it("解析複合 件+碼", () => {
    const r = parsePurchasePasteLine("S6901 3件+10y #P6002");
    expect(r!.productCode).toBe("S6901");
    expect(r!.caseRef).toBe("P6002");
    expect(r!.subItems).toEqual([
      { qty: 3, unit: "件" },
      { qty: 10, unit: "碼" },
    ]);
  });

  it("無 # 時 caseRef 為空", () => {
    const r = parsePurchasePasteLine("LY9802 15y");
    expect(r!.caseRef).toBe("");
    expect(r!.subItems).toHaveLength(1);
  });

  it("空白行回傳 null", () => {
    expect(parsePurchasePasteLine("   ")).toBeNull();
  });

  it("無數量時標記 warning", () => {
    const r = parsePurchasePasteLine("LY9802 #P5999");
    expect(r!.warning).toBe("缺少數量");
  });
});

describe("parsePurchasePasteText", () => {
  it("解析使用者實際範例", () => {
    const text = `LY9802 15y #P5999

LY3139-5 6.5y #P6005

彩虹皮8852 2Y #S847
S8478882 10y #S847

勝3925 7.5y #P6000

S6901 3件+10y #P6002

S6909 3件+10y #P6003`;

    const lines = parsePurchasePasteText(text);
    expect(lines).toHaveLength(7);
    expect(lines[0].productCode).toBe("LY9802");
    expect(lines[6].productCode).toBe("S6909");
    expect(lines[5].subItems).toHaveLength(2); // 3件+10y
  });
});

describe("summarizeCaseRefs", () => {
  it("彙整不重複案件編號", () => {
    const lines = parsePurchasePasteText(
      "A 1y #P1\nB 2y #P2\nC 3y #P1\nD 4y #P3"
    );
    expect(summarizeCaseRefs(lines)).toBe("P1, P2, P3");
  });
});

describe("resolveParsedLines", () => {
  const catalog: PurchaseProduct[] = [
    {
      id: "LY9802-PS007",
      productCode: "LY9802",
      supplierProductCode: "",
      productName: "蘭陽 LY9802 系列",
      specification: "9802",
      category: "面料",
      unit: "碼",
      supplierId: "PS007",
      unitPrice: 320,
      imageUrl: "",
      notes: "",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "S6901-PS009",
      productCode: "S6901",
      supplierProductCode: "",
      productName: "南亞呼吸皮 6901",
      specification: "6901",
      category: "皮革",
      unit: "碼",
      supplierId: "PS009",
      unitPrice: 240,
      imageUrl: "",
      notes: "",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    },
  ];

  it("精準匹配填入單價", () => {
    const lines = parsePurchasePasteText("LY9802 15y #P5999");
    const items = resolveParsedLines(lines, catalog);
    expect(items).toHaveLength(1);
    expect(items[0].matched).toBe(true);
    expect(items[0].unitPrice).toBe(320);
    expect(items[0].amount).toBe(15 * 320);
    expect(items[0].productId).toBe("LY9802-PS007");
  });

  it("件+碼 拆成兩筆", () => {
    const lines = parsePurchasePasteText("S6901 3件+10y #P6002");
    const items = resolveParsedLines(lines, catalog);
    expect(items).toHaveLength(2);
    expect(items[0].unit).toBe("件");
    expect(items[0].quantity).toBe(3);
    expect(items[1].unit).toBe("碼");
    expect(items[1].quantity).toBe(10);
  });

  it("查無商品時 matched=false", () => {
    const lines = parsePurchasePasteText("UNKNOWN 5y #X1");
    const items = resolveParsedLines(lines, catalog);
    expect(items[0].matched).toBe(false);
    expect(items[0].warning).toBe("查無此商品");
    expect(items[0].quantity).toBe(5);
  });
});
