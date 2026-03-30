import { describe, expect, it } from "vitest";
import {
  calculateSurfaceSplit,
  calculateSurfaceSplitPieces,
  calculateCaiCountDual,
  calculateCaiCountDualForPieces,
} from "../lib/pricing-engine";

describe("Surface Split Calculations (v0.3.3)", () => {
  describe("calculateSurfaceSplit", () => {
    it("should split horizontally (along height)", () => {
      const result = calculateSurfaceSplit(180, 240, "horizontal", 3);
      expect(result).toEqual({
        panelWidthCm: 180,
        panelHeightCm: 80,
      });
    });

    it("should split vertically (along width)", () => {
      const result = calculateSurfaceSplit(180, 240, "vertical", 2);
      expect(result).toEqual({
        panelWidthCm: 90,
        panelHeightCm: 240,
      });
    });

    it("should handle splitCount = 1 (no split)", () => {
      const result = calculateSurfaceSplit(180, 240, "horizontal", 1);
      expect(result).toEqual({
        panelWidthCm: 180,
        panelHeightCm: 240,
      });
    });

    it("should handle splitCount = 0 (guard)", () => {
      const result = calculateSurfaceSplit(180, 240, "horizontal", 0);
      expect(result).toEqual({
        panelWidthCm: 180,
        panelHeightCm: 240,
      });
    });

    it("should handle non-even splits", () => {
      const result = calculateSurfaceSplit(100, 100, "horizontal", 3);
      expect(result.panelWidthCm).toBe(100);
      expect(result.panelHeightCm).toBeCloseTo(33.33, 1);
    });
  });

  describe("calculateCaiCountDual", () => {
    it("should calculate per-piece ceil > surface ceil (fractional panels)", () => {
      // 單片 50x50cm = 2500/900 = 2.78才 -> ceil = 3才
      // 3片逐片進位: 3 × 3 = 9才
      // 3片整面進位: 2.78 × 3 = 8.33 -> ceil = 9才
      const result = calculateCaiCountDual(50, 50, 3, 1);
      expect(result.perPieceCeilTotal).toBe(9);
      expect(result.surfaceCeilTotal).toBe(9);
      expect(result.difference).toBe(0);
    });

    it("should show difference when per-piece rounding creates excess", () => {
      // 單片 40x40cm = 1600/900 = 1.78才 -> ceil = 2才
      // 5片逐片進位: 2 × 5 = 10才
      // 5片整面進位: 1.78 × 5 = 8.89 -> ceil = 9才
      const result = calculateCaiCountDual(40, 40, 5, 1);
      expect(result.perPieceCeilTotal).toBe(10);
      expect(result.surfaceCeilTotal).toBe(9);
      expect(result.difference).toBe(1);
    });

    it("should enforce minCai per panel in per-piece mode", () => {
      // 單片 10x10cm = 100/900 = 0.11才 -> minCai = 3才
      // 2片逐片進位: 3 × 2 = 6才
      const result = calculateCaiCountDual(10, 10, 2, 3);
      expect(result.perPieceCeilTotal).toBe(6);
    });

    it("should handle large split counts", () => {
      // 單片 30x30cm = 900/900 = 1才（剛好整數）
      // 10片: 逐片進位 = 1 × 10 = 10才, 整面進位 = 10才
      const result = calculateCaiCountDual(30, 30, 10, 1);
      expect(result.perPieceCeilTotal).toBe(10);
      expect(result.surfaceCeilTotal).toBe(10);
      expect(result.difference).toBe(0);
    });

    it("should calculate raw per-piece cai correctly", () => {
      const result = calculateCaiCountDual(60, 60, 1, 1);
      expect(result.perPieceRaw).toBeCloseTo(4, 1); // 3600/900 = 4
    });
  });

  describe("custom split panels", () => {
    it("should preserve custom horizontal split sizes", () => {
      const result = calculateSurfaceSplitPieces(217, 174, "horizontal", 4, [30, 57, 57, 30]);
      expect(result).toEqual([
        { panelWidthCm: 217, panelHeightCm: 30, splitSizeCm: 30 },
        { panelWidthCm: 217, panelHeightCm: 57, splitSizeCm: 57 },
        { panelWidthCm: 217, panelHeightCm: 57, splitSizeCm: 57 },
        { panelWidthCm: 217, panelHeightCm: 30, splitSizeCm: 30 },
      ]);
    });

    it("should calculate mixed-size cai totals", () => {
      const panels = calculateSurfaceSplitPieces(217, 174, "horizontal", 4, [30, 57, 57, 30]);
      const result = calculateCaiCountDualForPieces(panels, 1);

      expect(result.perPieceCeilTotal).toBe(44);
      expect(result.surfaceCeilTotal).toBe(42);
      expect(result.difference).toBe(2);
      expect(result.rawTotal).toBeCloseTo(41.95, 1);
    });
  });
});
