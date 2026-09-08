import { describe, it, expect } from "vitest";
import { versionLinesToOrderItems } from "@/lib/quote-mappers";
import type { VersionLineRecord } from "@/lib/types";

function mkLine(o: Partial<VersionLineRecord>): VersionLineRecord {
  return {
    itemId: "",
    versionId: "V1",
    quoteId: "Q1",
    caseId: "C1",
    lineNo: 1,
    itemName: "",
    spec: "",
    materialId: "",
    qty: 1,
    unit: "式",
    unitPrice: 0,
    lineAmount: 0,
    estimatedUnitCost: 0,
    estimatedCostAmount: 0,
    lineMarginAmount: 0,
    lineMarginRate: 0,
    isCostItem: false,
    showOnQuote: true,
    notes: "",
    imageUrl: "",
    specImageUrl: "",
    createdAt: "",
    updatedAt: "",
    installHeightTier: "",
    panelSizeTier: "",
    installSurchargeRate: 0,
    panelInputMode: "",
    surfaceWidthCm: 0,
    surfaceHeightCm: 0,
    splitDirection: "",
    splitCount: 0,
    caiRoundingMode: "",
    customSplitSizesCsv: "",
    ...o,
  };
}

describe("versionLinesToOrderItems", () => {
  it("把明細對應到訂單品項（名稱/尺寸/數量/色號/備註）", () => {
    const items = versionLinesToOrderItems(
      [mkLine({ itemName: "座墊", spec: "w60 x 60cm", qty: 5, unit: "只", materialId: "M1", notes: "牛皮" })],
      new Map([["M1", "1000-02"]]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "座墊",
      dimensions: "w60 x 60cm",
      quantity: "5只",
      colorCode: "1000-02",
      subNote: "牛皮",
      foamSpec: "",
      foamColor: null,
      itemType: "normal",
    });
  });

  it("略過內部成本列、隱藏列與空名稱列", () => {
    const items = versionLinesToOrderItems([
      mkLine({ lineNo: 1, itemName: "座墊" }),
      mkLine({ lineNo: 2, itemName: "利潤調整", isCostItem: true }),
      mkLine({ lineNo: 3, itemName: "內部備註", showOnQuote: false }),
      mkLine({ lineNo: 4, itemName: "   " }),
    ]);
    expect(items.map((i) => i.name)).toEqual(["座墊"]);
  });

  it("依 lineNo 排序，泡棉獨立列原樣帶入", () => {
    const items = versionLinesToOrderItems([
      mkLine({ lineNo: 3, itemName: "泡棉內裡 標準35k", spec: "0.08 黑硬Q" }),
      mkLine({ lineNo: 1, itemName: "座墊" }),
      mkLine({ lineNo: 2, itemName: "背墊" }),
    ]);
    expect(items.map((i) => i.name)).toEqual(["座墊", "背墊", "泡棉內裡 標準35k"]);
    // 泡棉不塞進 foamSpec，而是成為獨立品項、規格帶在 dimensions
    expect(items[2].foamSpec).toBe("");
    expect(items[2].dimensions).toBe("0.08 黑硬Q");
  });

  it("沒有材質時色號留空；數量為 0 時不硬湊單位", () => {
    const items = versionLinesToOrderItems([mkLine({ itemName: "工資", qty: 0 })]);
    expect(items[0].colorCode).toBeUndefined();
    expect(items[0].quantity).toBe("");
  });
});
