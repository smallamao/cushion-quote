import { describe, it, expect } from "vitest";
import { versionLinesToOrderItems } from "@/lib/quote-mappers";
import type { VersionLineRecord } from "@/lib/types";

// 測試素材全部取自 2026-10-12 清查的真實報價（雅帝、林峻丘、詹莉卉、林政霆）。
function line(o: Partial<VersionLineRecord>): VersionLineRecord {
  return {
    lineNo: 1,
    itemName: "",
    spec: "",
    qty: 1,
    unit: "式",
    unitPrice: 0,
    lineAmount: 0,
    isCostItem: false,
    showOnQuote: true,
    notes: "",
    materialId: "",
    ...o,
  } as VersionLineRecord;
}

describe("versionLinesToOrderItems", () => {
  it("濾掉運費／自取／折讓——這些不是師傅要做的東西", () => {
    const items = versionLinesToOrderItems([
      line({ lineNo: 1, itemName: "訂製坐墊\n\nW90 x 60 x 7cm * 二只" }),
      line({ lineNo: 2, itemName: "來回運費\n（沙發載回工廠施工）" }),
      line({ lineNo: 3, itemName: "自行取件" }),
      line({ lineNo: 4, itemName: "折讓" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("訂製坐墊");
  });

  it("部位名獨立成行時拆成多項（雅帝 L 型案，含英文開頭的部位名）", () => {
    const items = versionLinesToOrderItems([
      line({
        itemName:
          "訂製坐墊\n\n貴妃坐墊\nW90 x 167.5 x 10cm * 一只\n\nL型三人坐墊\nW183 x 90 x 10cm * 一只\n\n抽屜折疊坐墊\nW183 x 77.5 x 14cm * 一只",
      }),
    ]);
    expect(items.map((i) => i.name)).toEqual([
      "訂製坐墊｜貴妃坐墊",
      "訂製坐墊｜L型三人坐墊",
      "訂製坐墊｜抽屜折疊坐墊",
    ]);
    expect(items[1].dimensions).toBe("W183 x 90 x 10cm");
    expect(items[1].quantity).toBe("一只");
  });

  it("部位名與尺寸同行時也拆得開（林峻丘 坐墊／背墊）", () => {
    const items = versionLinesToOrderItems([
      line({
        itemName:
          "坐背墊泡棉更換\n\n坐墊 W66.5 x 64 x 11cm * 四塊\n背墊 W64 x 55 x 10cm * 四塊",
        spec: "高支撐高密度泡棉 40 ~ 50 kg/m³",
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("坐背墊泡棉更換｜坐墊");
    expect(items[0].dimensions).toBe("W66.5 x 64 x 11cm");
    expect(items[0].quantity).toBe("四塊");
    expect(items[1].dimensions).toBe("W64 x 55 x 10cm");
  });

  it("尺寸支援「公分」寫法（詹莉卉）", () => {
    const items = versionLinesToOrderItems([
      line({ itemName: "訂製款沙發\n\nw216 x 90公分 一座\nw165 x 90公分 一座" }),
    ]);
    expect(items[0].dimensions).toContain("216");
    expect(items[0].dimensions).toContain("165");
  });

  it("規格欄的布料與泡棉各自歸位，不互相污染", () => {
    const items = versionLinesToOrderItems([
      line({
        itemName: "訂製臥榻墊\n\nW181.8 x D60 x 5cm * 一塊",
        spec: "BF02-04｜進階面料\n高支撐高密度泡棉 40 ~ 50 kg/m³",
      }),
    ]);
    expect(items[0].colorCode).toBe("BF02-04");
    expect(items[0].foamSpec).toContain("高支撐");
    expect(items[0].dimensions).toBe("W181.8 x D60 x 5cm");
  });

  it("「泡棉沿用」是說明不是規格，不要寫進泡棉欄（林政霆）", () => {
    const items = versionLinesToOrderItems([
      line({ itemName: "更換坐墊皮面\n\n（皮面龜裂，更換表面皮料）\n（泡棉與內裡沿用）" }),
    ]);
    expect(items[0].foamSpec).toBe("");
    expect(items[0].subNote).toContain("皮面龜裂");
  });

  it("行銷文案不進備註——師傅不需要看", () => {
    const items = versionLinesToOrderItems([
      line({
        itemName:
          "訂製坐墊\n\nW90 x 60 x 7cm * 二只\n\n(標準高密度泡棉 -\n一般商用空間最常使用，\n兼顧舒適度與預算)",
      }),
    ]);
    expect(items[0].subNote ?? "").not.toContain("兼顧");
    expect(items[0].subNote ?? "").not.toContain("最常使用");
    expect(items[0].foamSpec).toContain("標準高密度泡棉");
  });

  it("成本列與不顯示的行一律不帶進訂單", () => {
    const items = versionLinesToOrderItems([
      line({ lineNo: 1, itemName: "內部成本", isCostItem: true }),
      line({ lineNo: 2, itemName: "不顯示項", showOnQuote: false }),
      line({ lineNo: 3, itemName: "訂製坐墊\n\nW90 x 60 x 7cm * 二只" }),
    ]);
    expect(items).toHaveLength(1);
  });
});
