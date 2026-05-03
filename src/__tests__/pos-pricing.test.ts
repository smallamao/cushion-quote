import { describe, it, expect } from "vitest";
import {
  parsePosBasePrices,
  parsePosAdjRates,
  calcPosCost,
  type SeatRates,
} from "@/lib/pos-pricing-engine";

describe("parsePosBasePrices", () => {
  it("parses header + data rows into nested lookup", () => {
    const rows = [
      ["款式", "座位", "TW_LV1", "TW_LV2"],
      ["ELEC", "3人", "30200", "30600"],
      ["POINT", "3人", "31600", "32100"],
    ];
    const result = parsePosBasePrices(rows);
    expect(result["ELEC"]["3人"]["TW_LV1"]).toBe(30200);
    expect(result["POINT"]["3人"]["TW_LV2"]).toBe(32100);
  });

  it("skips empty rows", () => {
    const rows = [
      ["款式", "座位", "TW_LV1"],
      ["ELEC", "3人", "30200"],
      ["", "", ""],
    ];
    const result = parsePosBasePrices(rows);
    expect(Object.keys(result)).toEqual(["ELEC"]);
  });

  it("returns empty object for empty input", () => {
    const result = parsePosBasePrices([]);
    expect(result).toEqual({});
  });
});

describe("parsePosAdjRates", () => {
  it("maps each materialId in the tier to its seat-based rates", () => {
    const rows = [
      ["費率群組", "適用材質IDs", "1人_深/6cm", "1人_背/6cm", "2人_深/6cm", "2人_背/6cm", "3人_深/6cm", "3人_背/6cm", "加寬/1cm"],
      ["TW", "TW_LV1,TW_LV2", "700", "500", "900", "700", "1300", "1000", "150"],
    ];
    const result = parsePosAdjRates(rows);
    expect(result["TW_LV1"]["3人"].depthPer6cm).toBe(1300);
    expect(result["TW_LV1"]["3人"].heightPer6cm).toBe(1000);
    expect(result["TW_LV2"]["1人"].widthPer1cm).toBe(150);
  });
});

const mockRates: SeatRates = {
  "1人": { depthPer6cm: 700, heightPer6cm: 500, widthPer1cm: 150 },
  "2人": { depthPer6cm: 900, heightPer6cm: 700, widthPer1cm: 150 },
  "3人": { depthPer6cm: 1300, heightPer6cm: 1000, widthPer1cm: 150 },
};

const noAdj = {
  widthAdjCm: 0, depthAdjCm: 0, heightAdjCm: 0,
  platformWidthAdj: 0, platformDepthAdj: 0,
  groundOption: "none" as const, heightReduction: false,
  removeArmrestCount: 0, usbCount: 0, wirelessChargeCount: 0, slideRailCount: 0,
};

describe("calcPosCost", () => {
  it("base only, no adjustments", () => {
    const r = calcPosCost(30200, mockRates, "3人", noAdj);
    expect(r.basePrice).toBe(30200);
    expect(r.widthCost).toBe(0);
    expect(r.depthCost).toBe(0);
    expect(r.subtotal).toBe(30200);
    expect(r.deposit).toBe(Math.round(30200 * 0.3));
  });

  it("+6cm depth for 3人 = 1300", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, depthAdjCm: 6 });
    expect(r.depthCost).toBe(1300);
  });

  it("+3cm depth costs same as +6cm (ceiling to 6cm unit)", () => {
    const r3 = calcPosCost(30200, mockRates, "3人", { ...noAdj, depthAdjCm: 3 });
    const r6 = calcPosCost(30200, mockRates, "3人", { ...noAdj, depthAdjCm: 6 });
    expect(r3.depthCost).toBe(r6.depthCost);
  });

  it("+9cm depth costs 2 units", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, depthAdjCm: 9 });
    expect(r.depthCost).toBe(2600); // 2 × 1300
  });

  it("full ground = 2000", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, groundOption: "full" });
    expect(r.groundCost).toBe(2000);
  });

  it("height reduction = -1000", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, heightReduction: true });
    expect(r.heightReductionDiscount).toBe(-1000);
  });

  it("platform with positive adj uses widthRate/2", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, platformWidthAdj: 10 });
    // 10 * 150 / 2 = 750, max(750, 500) = 750
    expect(r.platformCost).toBe(750);
  });

  it("platform shrink only = 500 minimum", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, platformWidthAdj: -5 });
    expect(r.platformCost).toBe(500);
  });

  it("no platform change = 0 cost", () => {
    const r = calcPosCost(30200, mockRates, "3人", noAdj);
    expect(r.platformCost).toBe(0);
  });

  it("remove 1 armrest = -1500", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, removeArmrestCount: 1 });
    expect(r.armrestDiscount).toBe(-1500);
  });

  it("USB 1500 + wireless 1200", () => {
    const r = calcPosCost(30200, mockRates, "3人", { ...noAdj, usbCount: 1, wirelessChargeCount: 1 });
    expect(r.usbCost).toBe(1500);
    expect(r.wirelessCost).toBe(1200);
  });
});
