import { describe, expect, it } from "vitest";

import { productToRow, rowToProduct } from "@/lib/purchase-products-sheet";
import type { PurchaseProduct } from "@/lib/types";

/**
 * 「採購商品」工作表欄位對應的回歸測試。
 *
 * 老闆 2026-09-01：「複製後編輯請全部欄位都確認更改成功，前面都發現有錯誤的狀況欄位對應不到」。
 * 欄位對應一旦錯位（少一欄、多一欄），值就會寫到隔壁欄——表面上看起來有資料，
 * 實際上品名跑到規格、單價跑到幅寬。這裡把 A~Y 的位置逐欄釘死。
 */

const SAMPLE: PurchaseProduct = {
  id: "uuid-1",
  productCode: "SC53392",
  supplierProductCode: "SC53392",
  productName: "533系列 北歐雲朵貓抓布",
  specification: "533-92 迷霧藍",
  category: "面料",
  unit: "碼",
  supplierId: "PS009",
  supplierName: "勝騏SC",
  widthCm: 140,
  unitPrice: 380,
  costPerCai: 0,
  listPricePerCai: 500,
  brand: "勝騏",
  series: "533系列",
  colorCode: "533-92",
  colorName: "迷霧藍",
  imageUrl: "http://www.shengchyi.com.tw/ImgShowroom/20230526140157.jpg",
  notes: "由 SC53395 複製建立（排程系統）",
  isActive: true,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
} as PurchaseProduct;

describe("採購商品 欄位對應", () => {
  it("productToRow 寫出 25 欄（A:Y）", () => {
    expect(productToRow(SAMPLE)).toHaveLength(25);
  });

  it("每一欄都落在正確位置（錯位＝值寫到隔壁欄）", () => {
    const r = productToRow(SAMPLE);
    expect(r[1]).toBe("SC53392");                       // B 商品編號
    expect(r[3]).toBe("533系列 北歐雲朵貓抓布");          // D 商品名稱
    expect(r[4]).toBe("533-92 迷霧藍");                  // E 規格
    expect(r[6]).toBe("碼");                             // G 單位
    expect(r[7]).toBe("PS009");                          // H 廠商編號
    expect(r[9]).toBe("140");                            // J 幅寬
    expect(r[10]).toBe("380");                           // K 進價
    expect(r[14]).toBe("533-92");                        // O 色號
    expect(r[15]).toBe("迷霧藍");                        // P 色名
    expect(r[16]).toContain("ImgShowroom");              // Q 圖片URL
    expect(r[21]).toBe("TRUE");                          // V 啟用
  });

  it("寫出去再讀回來要一模一樣（round-trip）", () => {
    const back = rowToProduct(productToRow(SAMPLE));
    for (const k of [
      "productCode", "supplierProductCode", "productName", "specification",
      "category", "unit", "supplierId", "supplierName", "widthCm", "unitPrice",
      "listPricePerCai", "brand", "series", "colorCode", "colorName",
      "imageUrl", "notes", "isActive", "createdAt", "updatedAt",
    ] as const) {
      expect(back[k], `欄位 ${k} round-trip 不一致`).toEqual(SAMPLE[k]);
    }
  });

  it("supplierProductCode 空白時退回商品編號（C 欄不可留空）", () => {
    const r = productToRow({ ...SAMPLE, supplierProductCode: "" });
    expect(r[2]).toBe("SC53392");
  });

  it("停用商品寫 FALSE、讀回 isActive=false", () => {
    const r = productToRow({ ...SAMPLE, isActive: false });
    expect(r[21]).toBe("FALSE");
    expect(rowToProduct(r).isActive).toBe(false);
  });

  it("空列讀回不會爆，且 id 為空（呼叫端據此過濾）", () => {
    const p = rowToProduct([]);
    expect(p.id).toBe("");
    expect(p.unit).toBe("碼");
  });
});
