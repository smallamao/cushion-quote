import { describe, expect, it } from "vitest";

import { calculateFabric, calculateFabricForPanels, getCutPieces } from "@/lib/fabric-calculator";

describe("fabric-calculator daybed formulas", () => {
  it("uses long-edge zipper cover for single daybed", () => {
    const pieces = getCutPieces("single_daybed", 190, 83, 15);
    const zipperCover = pieces.find((piece) => piece.name === "拉鍊蓋片");

    expect(zipperCover).toBeDefined();
    expect(zipperCover?.lengthCm).toBeCloseTo(192.4);
    expect(zipperCover?.qty).toBe(2);
  });

  it("chooses the lower-fabric split-border option for this single daybed size", () => {
    const pieces = getCutPieces("single_daybed", 190, 83, 15);
    const borderNames = pieces
      .filter((piece) => piece.name.startsWith("側邊條"))
      .map((piece) => piece.name);

    expect(borderNames).toEqual(["側邊條（前後）", "側邊條（左右）"]);
  });

  it("keeps rounded yard estimate stable for daybed output", () => {
    const result = calculateFabric("single_daybed", 190, 83, 15 / 2.54, 1);

    expect(result.exactYards).toBeGreaterThan(0);
    expect(result.roundedYards).toBeGreaterThanOrEqual(result.exactYards);
    expect(result.pricingMode).toBe("reserve");
    expect(result.pricingRoundedYards).toBeGreaterThanOrEqual(result.roundedYards);
  });

  it("keeps layout pricing for non-daybed methods", () => {
    const result = calculateFabric("flat", 120, 60, 1, 1);

    expect(result.pricingMode).toBe("layout");
    expect(result.pricingRoundedYards).toBe(result.roundedYards);
  });

  it("aggregates fabric usage across unequal split panels", () => {
    const result = calculateFabricForPanels("flat", [
      { widthCm: 217, lengthCm: 30 },
      { widthCm: 217, lengthCm: 57 },
      { widthCm: 217, lengthCm: 57 },
      { widthCm: 217, lengthCm: 30 },
    ], 1);

    expect(result.cutPieces).toHaveLength(4);
    expect(result.roundedYards).toBeGreaterThan(0);
    expect(result.pricingMode).toBe("layout");
  });

  it("uses provided fabric width when calculating yards", () => {
    const narrowWidthResult = calculateFabric("flat", 222, 62, 1, 4, 137);
    const wideWidthResult = calculateFabric("flat", 222, 62, 1, 4, 280);

    expect(wideWidthResult.roundedYards).toBeLessThanOrEqual(narrowWidthResult.roundedYards);
    expect(wideWidthResult.totalLengthCm).toBeLessThanOrEqual(narrowWidthResult.totalLengthCm);
  });
});
