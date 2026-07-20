import { describe, it, expect } from "vitest";
import {
  parseRelatedOrderIds,
  joinRelatedOrderIds,
  relatedOrderIncludes,
  purchaseItemBelongsToOrder,
  attributedPurchaseAmount,
} from "@/lib/purchase-order-link";
import type { PurchaseOrderItem } from "@/lib/types";

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

  describe("purchaseItemBelongsToOrder（品項備註歸屬）", () => {
    const ref = { orderNumber: "S909", caseId: "CA-202607-003" };

    it("備註含 orderNumber → 歸屬", () => {
      expect(purchaseItemBelongsToOrder("S909追加", ref)).toBe(true);
      expect(purchaseItemBelongsToOrder("S909", ref)).toBe(true);
    });

    it("備註是別張訂單單號 → 不歸屬", () => {
      expect(purchaseItemBelongsToOrder("P6157", ref)).toBe(false);
    });

    it("空備註 / 純中文備註 → 預設歸屬此關聯訂單", () => {
      expect(purchaseItemBelongsToOrder("", ref)).toBe(true);
      expect(purchaseItemBelongsToOrder("   ", ref)).toBe(true);
      expect(purchaseItemBelongsToOrder("加購抱枕", ref)).toBe(true);
    });

    it("token 精確比對，避免 S909 誤中 S9091", () => {
      expect(purchaseItemBelongsToOrder("S9091", ref)).toBe(false);
    });

    it("備註以 caseId 標註 → 歸屬（正規化比對，容許連字號）", () => {
      expect(purchaseItemBelongsToOrder("CA-202607-003 補料", ref)).toBe(true);
    });

    it("訂單無識別碼時不強行排除（交由呼叫端保底）", () => {
      expect(purchaseItemBelongsToOrder("P6157", { orderNumber: "", caseId: "" })).toBe(false);
    });
  });

  describe("attributedPurchaseAmount（採購單成本歸屬）", () => {
    const ref = { orderNumber: "S909", caseId: "CA-202607-003" };
    const mkItem = (notes: string, amount: number): PurchaseOrderItem =>
      ({ notes, amount } as PurchaseOrderItem);

    it("混採多單：只算歸屬本單的品項金額", () => {
      // PS-20260720-01：S909追加 $570 + P6157 $6840，合計 $7410
      const items = [mkItem("S909追加", 570), mkItem("P6157", 6840)];
      expect(attributedPurchaseAmount({ totalAmount: 7410 }, items, ref)).toBe(570);
    });

    it("全部品項皆歸本單 → 回整張金額（含運費/稅額）", () => {
      const items = [mkItem("S909", 2090)];
      // 整張 totalAmount 可能含運費/稅，故回 totalAmount 而非品項小計
      expect(attributedPurchaseAmount({ totalAmount: 2100 }, items, ref)).toBe(2100);
    });

    it("無品項歸本單 → 0（此採購單雖關聯但料全屬別張單）", () => {
      const items = [mkItem("P6157", 6840)];
      expect(attributedPurchaseAmount({ totalAmount: 6840 }, items, ref)).toBe(0);
    });

    it("無品項資料 → 保底退回整張金額（避免低估）", () => {
      expect(attributedPurchaseAmount({ totalAmount: 5000 }, undefined, ref)).toBe(5000);
      expect(attributedPurchaseAmount({ totalAmount: 5000 }, [], ref)).toBe(5000);
    });

    it("訂單無識別碼 → 保底退回整張金額", () => {
      const items = [mkItem("P6157", 6840)];
      expect(attributedPurchaseAmount({ totalAmount: 6840 }, items, { orderNumber: "", caseId: "" })).toBe(6840);
    });

    it("本案實例：S909 兩張採購單合計應為 2,660 而非 9,500", () => {
      const po1Items = [mkItem("S909追加", 570), mkItem("P6157", 6840)];
      const po2Items = [mkItem("S909", 2090)];
      const cost =
        attributedPurchaseAmount({ totalAmount: 7410 }, po1Items, ref) +
        attributedPurchaseAmount({ totalAmount: 2090 }, po2Items, ref);
      expect(cost).toBe(2660);
    });
  });
});
