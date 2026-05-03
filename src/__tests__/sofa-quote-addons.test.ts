import { describe, it, expect } from "vitest";
import { calcAddons, getSlideRailRate, type SofaAddons, buildQuoteOutput, SOFA_PRODUCTS, MATERIAL_GRADES, getBasePrice, DEFAULT_ADDONS } from "@/lib/sofa-quote-data";

const base: Readonly<SofaAddons> = {
  groundOption: "none",
  heightReduction: false,
  removeArmrestCount: 0,
  usbCount: 0,
  removeStandardUsb: false,
  wirelessChargeCount: 0,
  slideRailCount: 0,
  slideRailRatePerSeat: 1000,
  platformNoStorage: false,
};

describe("getSlideRailRate", () => {
  it("BOOM returns 800", () => {
    expect(getSlideRailRate("BOOM")).toBe(800);
  });
  it("BOOMs returns 800", () => {
    expect(getSlideRailRate("BOOMs")).toBe(800);
  });
  it("ELEC returns 1000", () => {
    expect(getSlideRailRate("ELEC")).toBe(1000);
  });
  it("unknown code returns 1000", () => {
    expect(getSlideRailRate("ANYTHING")).toBe(1000);
  });
});

describe("calcAddons", () => {
  it("全部預設值時回傳 0", () => {
    expect(calcAddons(base)).toBe(0);
  });

  it("半落地 +1500", () => {
    expect(calcAddons({ ...base, groundOption: "half" })).toBe(1500);
  });

  it("全落地 +2000", () => {
    expect(calcAddons({ ...base, groundOption: "full" })).toBe(2000);
  });

  it("高度削減 -1000", () => {
    expect(calcAddons({ ...base, heightReduction: true })).toBe(-1000);
  });

  it("移除 2 個扶手 -3000", () => {
    expect(calcAddons({ ...base, removeArmrestCount: 2 })).toBe(-3000);
  });

  it("USB 2 組 +3000", () => {
    expect(calcAddons({ ...base, usbCount: 2 })).toBe(3000);
  });

  it("扣除標配 USB -1000", () => {
    expect(calcAddons({ ...base, removeStandardUsb: true })).toBe(-1000);
  });

  it("無線充電 1 組 +1200", () => {
    expect(calcAddons({ ...base, wirelessChargeCount: 1 })).toBe(1200);
  });

  it("滑軌 3 座 rate 1000 → +3000", () => {
    expect(calcAddons({ ...base, slideRailCount: 3, slideRailRatePerSeat: 1000 })).toBe(3000);
  });

  it("BOOM 滑軌 3 座 rate 800 → +2400", () => {
    expect(calcAddons({ ...base, slideRailCount: 3, slideRailRatePerSeat: 800 })).toBe(2400);
  });

  it("平台無置物 -1000", () => {
    expect(calcAddons({ ...base, platformNoStorage: true })).toBe(-1000);
  });

  it("複合：半落地 + USB 2 組 + 移除扶手 1 個", () => {
    expect(calcAddons({
      ...base,
      groundOption: "half",
      usbCount: 2,
      removeArmrestCount: 1,
    })).toBe(1500 + 3000 - 1500);
  });
});

describe("buildQuoteOutput with addons", () => {
  const product = SOFA_PRODUCTS.find((p) => p.displayName === "ELEC")!;
  const grade = MATERIAL_GRADES.find((g) => g.id === "TW_LV1")!;
  const basePrice = getBasePrice("ELEC", "TW_LV1");

  it("無附加時輸出不含進階選項段落", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice);
    expect(copyText).not.toContain("進階選項");
  });

  it("有附加費時 copyText 含各項目", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice, {
      ...DEFAULT_ADDONS,
      groundOption: "half",
      usbCount: 1,
    });
    expect(copyText).toContain("桶身落地（半落地）+1,500");
    expect(copyText).toContain("加裝 USB 充電 ×1 +1,500");
  });

  it("有附加費時總價正確", () => {
    const { copyText } = buildQuoteOutput(product, grade, 262, 3, basePrice, {
      ...DEFAULT_ADDONS,
      groundOption: "full",
    });
    // basePrice 42600 + groundOption full 2000 = 44600
    expect(copyText).toContain("44,600");
  });
});

describe("calcAddons — new params", () => {
  it("改背枕 with seatCount=3 → +1500", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, backrestChange: true, backrestTargetStyle: "GALI" }, 3, 0)).toBe(1500);
  });
  it("改背枕 with seatCount=2 → +1000", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, backrestChange: true, backrestTargetStyle: "GALI" }, 2, 0)).toBe(1000);
  });
  it("改置物平台 → +1500", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, changeStoragePlatform: true, storagePlatformStyle: "BOOM", storagePlatformWidthAdj: 0, storagePlatformDepthAdj: 0 }, 3, 0)).toBe(1500);
  });
  it("armCost 直接加入總計", () => {
    expect(calcAddons(DEFAULT_ADDONS, 3, 1400)).toBe(1400);
  });
  it("複合：半落地 + 改背枕 + armCost 700", () => {
    expect(calcAddons({ ...DEFAULT_ADDONS, groundOption: "half", backrestChange: true, backrestTargetStyle: "ICE" }, 3, 700)).toBe(1500 + 1500 + 700);
  });
});
