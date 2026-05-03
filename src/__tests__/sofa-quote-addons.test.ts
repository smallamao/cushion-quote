import { describe, it, expect } from "vitest";
import { calcAddons, type SofaAddons } from "@/lib/sofa-quote-data";

const base: SofaAddons = {
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
