import { describe, expect, it } from "vitest";

import { cloneProductAsNew, deriveIdentityFields } from "@/lib/purchase-from-paste";
import type { PurchaseProduct } from "@/lib/types";

/**
 * 守門測試：編號／名稱／規格三欄不得指向別的商品。
 * 廠商看的就是這三欄，落差大等於整張採購單在講另一塊布。
 * 這裡的案例全是真實事故，不是假想情境。
 */
function p(over: Partial<PurchaseProduct> = {}): PurchaseProduct {
  return {
    id: "x", productCode: "GC75503", supplierProductCode: "GC75503",
    productName: "755 舒柔貓抓布", specification: "75503", category: "面料",
    unit: "碼", supplierId: "PS005", supplierName: "", unitPrice: 210,
    imageUrl: "", notes: "", isActive: true, createdAt: "", updatedAt: "",
    ...over,
  } as PurchaseProduct;
}

describe("建檔時識別欄位不得殘留範本的值", () => {
  it("真實事故 PS-20261011-08：GC75503 → GC32219，規格不可殘留 75503", () => {
    const f = deriveIdentityFields(p(), "GC32219");
    expect(f.specification).not.toBe("75503");
    expect(f.specification).toBe("GC32219");
    expect(f.productCode).toBe("GC32219");
    expect(f.supplierProductCode).toBe("GC32219");
  });

  it("真實事故 PS-20260910-11：跨系列不可掛別人的品名", () => {
    const f = deriveIdentityFields(
      p({ productCode: "BBL5-04", productName: "BBL5 北歐輕絨貓抓布", specification: "BBL5-04" }),
      "PVC6916",
    );
    expect(f.productName).not.toContain("BBL5");
    expect(f.productName).toBe("PVC6916");
  });

  it("品名帶著範本自己的代碼時，換成新碼而不是整包照抄", () => {
    const f = deriveIdentityFields(
      p({ productCode: "S6934", productName: "半牛皮 S6934", specification: "S6934" }),
      "S6916",
    );
    expect(f.productName).toBe("半牛皮 S6916");
  });

  it("呼叫端明確指定時以呼叫端為準", () => {
    const f = deriveIdentityFields(p(), "SC53392", {
      specification: "533-92 迷霧藍", colorCode: "533-92", productName: "舒柔布 迷霧藍",
    });
    expect(f.specification).toBe("533-92 迷霧藍");
    expect(f.colorCode).toBe("533-92");
    expect(f.productName).toBe("舒柔布 迷霧藍");
  });

  it("空字串視同未指定，不可把識別欄寫成空的", () => {
    const f = deriveIdentityFields(p(), "TJ7604", { specification: "   ", colorCode: "" });
    expect(f.specification).toBe("TJ7604");
    expect(f.colorCode).toBe("TJ7604");
  });

  it("cloneProductAsNew 走同一套規則，兩條建檔路徑結果一致", () => {
    const tpl = p();
    const cloned = cloneProductAsNew(tpl, "GC32219", "2026-10-13", "new-id");
    const f = deriveIdentityFields(tpl, "GC32219");
    expect(cloned.specification).toBe(f.specification);
    expect(cloned.productCode).toBe(f.productCode);
    expect(cloned.productName).toBe(f.productName);
    expect(cloned.supplierProductCode).toBe(f.supplierProductCode);
  });

  it("規格永遠跟著新碼，連「同前綴」也不例外——這條不依賴系列判斷", () => {
    for (const code of ["GC32219", "TJ7604", "PVC6916", "S6916"]) {
      const f = deriveIdentityFields(p(), code);
      expect(f.specification).toBe(code);
      expect(f.productCode).toBe(code);
      expect(f.supplierProductCode).toBe(code);
    }
  });

  /**
   * ⚠️ 已知缺口（2026-10-13 發現，尚未修）：
   * extractProductPrefix 對「GC+5 碼」只抽得到 GC——那是廠商代號（綠都），不是產品系列。
   * 於是 GC75503 與 GC32219 被判為同系列，品名會被沿用。
   * 規格已由 deriveIdentityFields 無條件擋住，但品名仍有風險。
   * 這條測試是「現況存證」，不是認可：真要修得動 extractProductPrefix，
   * 那同時影響範本選取，必須單獨評估。修好後請把這條改成 not.toContain。
   */
  it("存證：同廠商前綴（GC）目前仍會沿用品名——待修", () => {
    const f = deriveIdentityFields(p(), "GC32219");
    expect(f.specification).toBe("GC32219");          // 規格已安全
    expect(f.productName).toBe("755 舒柔貓抓布");      // 品名仍沿用 ← 缺口
  });
});
