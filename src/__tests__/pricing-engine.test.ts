import { describe, it, expect } from "vitest";
import {
  calculateCaiCount,
  calculateLaborRate,
  inferHeightTier,
  inferPanelSizeTier,
  calculateInstallSurcharge,
  applyInstallSurcharge,
  calculateLineItem,
} from "@/lib/pricing-engine";
import { METHODS } from "@/lib/constants";
import type { QuoteLineItem, PricingConfig } from "@/lib/types";

const mockConfig: PricingConfig = {
  qualityPremium: 0,
  wasteRate: 0,
  fabricDiscount: 0.5,
  channelMultipliers: {
    wholesale: 1.0,
    designer: 1.25,
    retail: 1.35,
    luxury_retail: 1.5,
  },
  taxRate: 5,
  commissionMode: "price_gap",
  commissionRate: 12,
  commissionFixedAmount: 0,
};

describe("施工加給分級 - 推論函式", () => {
  describe("inferHeightTier", () => {
    it("應回傳 'normal' 當高度 ≤200cm", () => {
      expect(inferHeightTier(150)).toBe("normal");
      expect(inferHeightTier(200)).toBe("normal");
    });

    it("應回傳 'mid_high' 當高度介於 200-300cm", () => {
      expect(inferHeightTier(201)).toBe("mid_high");
      expect(inferHeightTier(250)).toBe("mid_high");
      expect(inferHeightTier(300)).toBe("mid_high");
    });

    it("應回傳 'high_altitude' 當高度 >300cm", () => {
      expect(inferHeightTier(301)).toBe("high_altitude");
      expect(inferHeightTier(400)).toBe("high_altitude");
    });
  });

  describe("inferPanelSizeTier", () => {
    it("應回傳 'standard' 當長邊 ≤180cm", () => {
      expect(inferPanelSizeTier(100, 150)).toBe("standard");
      expect(inferPanelSizeTier(180, 150)).toBe("standard");
      expect(inferPanelSizeTier(150, 180)).toBe("standard");
    });

    it("應回傳 'large' 當長邊介於 180-240cm", () => {
      expect(inferPanelSizeTier(200, 150)).toBe("large");
      expect(inferPanelSizeTier(150, 200)).toBe("large");
      expect(inferPanelSizeTier(240, 150)).toBe("large");
    });

    it("應回傳 'extra_large' 當長邊 >240cm", () => {
      expect(inferPanelSizeTier(250, 150)).toBe("extra_large");
      expect(inferPanelSizeTier(150, 250)).toBe("extra_large");
      expect(inferPanelSizeTier(300, 200)).toBe("extra_large");
    });
  });
});

describe("施工加給分級 - 計算函式", () => {
  describe("calculateInstallSurcharge", () => {
    it("應回傳 0% 當兩個等級都是基準值", () => {
      expect(calculateInstallSurcharge("normal", "standard")).toBe(0);
    });

    it("應回傳 25% 當僅高度加給", () => {
      expect(calculateInstallSurcharge("mid_high", "standard")).toBe(25);
    });

    it("應回傳 60% 當僅高空作業加給", () => {
      expect(calculateInstallSurcharge("high_altitude", "standard")).toBe(60);
    });

    it("應回傳 20% 當僅尺寸加給（大型）", () => {
      expect(calculateInstallSurcharge("normal", "large")).toBe(20);
    });

    it("應回傳 40% 當僅尺寸加給（超大型）", () => {
      expect(calculateInstallSurcharge("normal", "extra_large")).toBe(40);
    });

    it("應回傳 45% 當中高 + 大型", () => {
      expect(calculateInstallSurcharge("mid_high", "large")).toBe(45);
    });

    it("應回傳 65% 當中高 + 超大型", () => {
      expect(calculateInstallSurcharge("mid_high", "extra_large")).toBe(65);
    });

    it("應回傳 100% 當高空 + 超大型", () => {
      expect(calculateInstallSurcharge("high_altitude", "extra_large")).toBe(100);
    });
  });

  describe("applyInstallSurcharge", () => {
    it("應正確計算加給後工資（0%）", () => {
      expect(applyInstallSurcharge(100, 0)).toBe(100);
    });

    it("應正確計算加給後工資（25%）", () => {
      expect(applyInstallSurcharge(100, 25)).toBe(125);
    });

    it("應正確計算加給後工資（45%）", () => {
      expect(applyInstallSurcharge(100, 45)).toBe(145);
    });

    it("應正確計算加給後工資（100%）", () => {
      expect(applyInstallSurcharge(100, 100)).toBe(200);
    });

    it("應四捨五入到整數", () => {
      expect(applyInstallSurcharge(100, 33)).toBe(133);
      expect(applyInstallSurcharge(100, 66)).toBe(166);
    });
  });
});

describe("施工加給分級 - calculateLineItem 整合測試", () => {
  const baseItem: QuoteLineItem = {
    id: "test-1",
    itemName: "測試床頭板",
    method: "single_headboard",
    widthCm: 180,
    heightCm: 120,
    qty: 1,
    foamThickness: 1,
    material: null,
    customMaterialCost: 50,
    useListPrice: false,
    extras: [],
    powerHoleCount: 0,
    notes: "",
  };

  it("向下相容：不傳入分級參數時行為應與 v0.2 一致", () => {
    const result = calculateLineItem(baseItem, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBeUndefined();
    expect(result.installSurchargePercent).toBeUndefined();
    expect(result.laborRate).toBe(100);
    expect(result.materialRate).toBe(50);
    expect(result.costPerCai).toBe(150);
  });

  it("應正確計算一般高度 + 標準尺寸（無加給）", () => {
    const itemWithTier = {
      ...baseItem,
      installHeightTier: "normal" as const,
      panelSizeTier: "standard" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(100);
    expect(result.installSurchargePercent).toBe(0);
    expect(result.laborRate).toBe(100);
    expect(result.costPerCai).toBe(150);
  });

  it("應正確計算中高 + 標準尺寸（25% 加給）", () => {
    const itemWithTier = {
      ...baseItem,
      installHeightTier: "mid_high" as const,
      panelSizeTier: "standard" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(100);
    expect(result.installSurchargePercent).toBe(25);
    expect(result.laborRate).toBe(125);
    expect(result.costPerCai).toBe(175);
  });

  it("應正確計算一般高度 + 大型尺寸（20% 加給）", () => {
    const itemWithTier = {
      ...baseItem,
      installHeightTier: "normal" as const,
      panelSizeTier: "large" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(100);
    expect(result.installSurchargePercent).toBe(20);
    expect(result.laborRate).toBe(120);
    expect(result.costPerCai).toBe(170);
  });

  it("應正確計算中高 + 大型（45% 加給）", () => {
    const itemWithTier = {
      ...baseItem,
      installHeightTier: "mid_high" as const,
      panelSizeTier: "large" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(100);
    expect(result.installSurchargePercent).toBe(45);
    expect(result.laborRate).toBe(145);
    expect(result.costPerCai).toBe(195);
  });

  it("應正確計算高空 + 超大型（100% 加給）", () => {
    const itemWithTier = {
      ...baseItem,
      installHeightTier: "high_altitude" as const,
      panelSizeTier: "extra_large" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(100);
    expect(result.installSurchargePercent).toBe(100);
    expect(result.laborRate).toBe(200);
    expect(result.costPerCai).toBe(250);
  });

  it("品質加成應在施工加給之前計算", () => {
    const configWithPremium: PricingConfig = {
      ...mockConfig,
      qualityPremium: 10,
    };

    const itemWithTier = {
      ...baseItem,
      installHeightTier: "mid_high" as const,
      panelSizeTier: "standard" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, configWithPremium);

    expect(result.baseLaborRate).toBe(110);
    expect(result.installSurchargePercent).toBe(25);
    expect(result.laborRate).toBe(138);
    expect(result.costPerCai).toBe(188);
  });

  it("泡棉厚度應影響基礎工資，再套用施工加給", () => {
    const itemWithThickness = {
      ...baseItem,
      foamThickness: 2,
      installHeightTier: "mid_high" as const,
      panelSizeTier: "standard" as const,
    };

    const result = calculateLineItem(itemWithThickness, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBe(130);
    expect(result.installSurchargePercent).toBe(25);
    expect(result.laborRate).toBe(163);
    expect(result.costPerCai).toBe(213);
  });

  it("應正確傳播到 pieceCost 與 channelPrices", () => {
    const itemWithTier = {
      ...baseItem,
      widthCm: 180,
      heightCm: 120,
      installHeightTier: "mid_high" as const,
      panelSizeTier: "standard" as const,
    };

    const result = calculateLineItem(itemWithTier, METHODS.single_headboard, mockConfig);
    const cai = calculateCaiCount(180, 120, 3);

    expect(result.caiCount).toBe(cai);
    expect(result.laborRate).toBe(125);
    expect(result.costPerCai).toBe(175);
    expect(result.pieceCost).toBe(175 * cai);

    expect(result.channelPrices.wholesale.perPiece).toBeGreaterThan(0);
    expect(result.channelPrices.designer.perPiece).toBeGreaterThan(result.channelPrices.wholesale.perPiece);
  });

  it("僅傳入 heightTier 無效，不應套用加給", () => {
    const itemPartial = {
      ...baseItem,
      installHeightTier: "mid_high" as const,
    };

    const result = calculateLineItem(itemPartial, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBeUndefined();
    expect(result.installSurchargePercent).toBeUndefined();
    expect(result.laborRate).toBe(100);
  });

  it("僅傳入 panelSizeTier 無效，不應套用加給", () => {
    const itemPartial = {
      ...baseItem,
      panelSizeTier: "large" as const,
    };

    const result = calculateLineItem(itemPartial, METHODS.single_headboard, mockConfig);

    expect(result.baseLaborRate).toBeUndefined();
    expect(result.installSurchargePercent).toBeUndefined();
    expect(result.laborRate).toBe(100);
  });
});

describe("施工加給分級 - 邊界測試", () => {
  it("inferHeightTier 邊界值測試", () => {
    expect(inferHeightTier(0)).toBe("normal");
    expect(inferHeightTier(200.5)).toBe("mid_high");
    expect(inferHeightTier(300.5)).toBe("high_altitude");
  });

  it("inferPanelSizeTier 邊界值測試", () => {
    expect(inferPanelSizeTier(180.5, 100)).toBe("large");
    expect(inferPanelSizeTier(100, 180.5)).toBe("large");
    expect(inferPanelSizeTier(240.5, 100)).toBe("extra_large");
  });

  it("calculateInstallSurcharge 應處理無效輸入（使用 fallback 0）", () => {
    expect(calculateInstallSurcharge("normal", "standard")).toBe(0);
  });

  it("applyInstallSurcharge 負數測試（不應發生，但確保不會崩潰）", () => {
    expect(applyInstallSurcharge(100, -10)).toBe(90);
  });
});
