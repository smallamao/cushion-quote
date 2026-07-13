import { describe, it, expect } from "vitest";
import {
  parseRelatedOrderIds,
  joinRelatedOrderIds,
  relatedOrderIncludes,
} from "@/lib/purchase-order-link";

describe("purchase-order-link", () => {
  describe("parseRelatedOrderIds", () => {
    it("空值回傳空陣列", () => {
      expect(parseRelatedOrderIds("")).toEqual([]);
      expect(parseRelatedOrderIds(undefined)).toEqual([]);
      expect(parseRelatedOrderIds(null)).toEqual([]);
    });

    it("單值（舊資料相容）", () => {
      expect(parseRelatedOrderIds("ORD-2026-07-001")).toEqual(["ORD-2026-07-001"]);
    });

    it("多值以逗號分隔、去空白", () => {
      expect(parseRelatedOrderIds("A, B ,C")).toEqual(["A", "B", "C"]);
    });

    it("去除空值與重複", () => {
      expect(parseRelatedOrderIds("A,,A,B,")).toEqual(["A", "B"]);
    });
  });

  describe("joinRelatedOrderIds", () => {
    it("陣列序列化為逗號分隔字串", () => {
      expect(joinRelatedOrderIds(["A", "B"])).toBe("A,B");
    });

    it("去空白、去空值、去重", () => {
      expect(joinRelatedOrderIds([" A ", "", "A", "B"])).toBe("A,B");
    });

    it("空陣列回傳空字串", () => {
      expect(joinRelatedOrderIds([])).toBe("");
    });
  });

  describe("relatedOrderIncludes", () => {
    it("命中多值其中一個", () => {
      expect(relatedOrderIncludes("A,B,C", "B")).toBe(true);
    });

    it("未命中回傳 false", () => {
      expect(relatedOrderIncludes("A,B", "Z")).toBe(false);
    });

    it("單值舊資料相容", () => {
      expect(relatedOrderIncludes("ORD-1", "ORD-1")).toBe(true);
    });

    it("空關聯回傳 false", () => {
      expect(relatedOrderIncludes("", "A")).toBe(false);
    });

    it("不做部分字串比對（避免誤命中）", () => {
      expect(relatedOrderIncludes("ORD-10,ORD-11", "ORD-1")).toBe(false);
    });
  });

  it("round-trip：parse ∘ join 保持一致", () => {
    const ids = ["S906", "S912", "S913"];
    expect(parseRelatedOrderIds(joinRelatedOrderIds(ids))).toEqual(ids);
  });
});
