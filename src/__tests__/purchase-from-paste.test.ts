import { describe, expect, it } from "vitest";

import { buildPurchaseGroupsFromPaste } from "@/lib/purchase-from-paste";
import type { PurchaseProduct, Supplier } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock 商品目錄 / 廠商（不連網）
// ---------------------------------------------------------------------------

function product(
  productCode: string,
  supplierId: string,
  unitPrice = 100,
): PurchaseProduct {
  return {
    id: `${productCode}-${supplierId}`,
    productCode,
    supplierProductCode: "",
    productName: `${productCode} 商品`,
    specification: "",
    category: "面料",
    unit: "碼",
    supplierId,
    supplierName: "",
    unitPrice,
    imageUrl: "",
    notes: "",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

function supplier(supplierId: string, shortName: string): Supplier {
  return {
    supplierId,
    name: `${shortName}股份有限公司`,
    shortName,
    contactPerson: "",
    phone: "",
    mobile: "",
    fax: "",
    email: "",
    taxId: "",
    address: "",
    paymentMethod: "",
    paymentTerms: "",
    notes: "",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

// 供應商代碼
const MILU = "PS-MILU"; // 米盧
const SC = "PS-SC"; // 尚慶
const GM = "PS-GM"; // 谷懋
const LY = "PS-LY"; // 蘭陽
const BG = "PS-BG"; // 布穀

// 目錄刻意「不」放入 谷PVC806、BG116：
//   - BG116 → 無任何比對 → 進 unmatched
//   - 谷PVC806 → 現有 resolver 的模糊比對（尾碼 806）會對到 谷806，落在谷懋
const catalog: PurchaseProduct[] = [
  product("3200A22", MILU),
  product("2200A71", MILU),
  product("1800A04", MILU),
  product("2200A76", MILU),
  product("BBL5-17", SC),
  product("BBL5-09", SC),
  product("BBL5-12", SC),
  product("BBL5-19", SC),
  product("谷806", GM),
  product("LY9705", LY),
  product("LY9409", LY),
  product("BG114", BG),
  product("BG115", BG),
  product("BG102", BG),
];

const suppliers: Supplier[] = [
  supplier(MILU, "米盧"),
  supplier(SC, "尚慶"),
  supplier(GM, "谷懋"),
  supplier(LY, "蘭陽"),
  supplier(BG, "布穀"),
];

// 規格書第五節的 16 行驗收案例
const ACCEPTANCE_PASTE = `3200A22 21y #P6177
BBL5-17 14y #P6177
BBL5-09 1y #P6177
BBL5-12 1y #P6177
BBL5-19 1y #P6177
2200A71 12y #P6181
1800A04 9y #P6181
2200A76 4y #P6181
谷806 2件 #P6180
谷PVC806 12y #P6180
LY9705 11y #P6182
LY9409 6y #P6182
BG116 20y #P6178
BG114 1y #P6178
BG115 1y #P6178
BG102 1y #P6178`;

function codesOf(supplierId: string, groups: ReturnType<typeof buildPurchaseGroupsFromPaste>["groups"]) {
  return groups
    .find((g) => g.supplierId === supplierId)!
    .items.map((it) => it.productCode);
}

describe("buildPurchaseGroupsFromPaste — 驗收案例", () => {
  const result = buildPurchaseGroupsFromPaste(ACCEPTANCE_PASTE, catalog, suppliers);

  it("依供應商建立 5 個分組", () => {
    expect(result.groups).toHaveLength(5);
    expect(result.groups.map((g) => g.supplierId)).toEqual([
      MILU,
      SC,
      GM,
      LY,
      BG,
    ]);
    expect(result.groups.map((g) => g.supplier)).toEqual([
      "米盧",
      "尚慶",
      "谷懋",
      "蘭陽",
      "布穀",
    ]);
  });

  it("每個 item 依商品供應商落到正確分組", () => {
    expect(codesOf(MILU, result.groups)).toEqual([
      "3200A22",
      "2200A71",
      "1800A04",
      "2200A76",
    ]);
    expect(codesOf(SC, result.groups)).toEqual([
      "BBL5-17",
      "BBL5-09",
      "BBL5-12",
      "BBL5-19",
    ]);
    expect(codesOf(LY, result.groups)).toEqual(["LY9705", "LY9409"]);
    expect(codesOf(BG, result.groups)).toEqual(["BG114", "BG115", "BG102"]);
    // 谷懋：谷806 命中；谷PVC806 因 resolver 尾碼模糊比對亦落此組
    expect(codesOf(GM, result.groups)).toContain("谷806");
    expect(result.groups.find((g) => g.supplierId === GM)!.items).toHaveLength(2);
  });

  it("同一訂單(#P6177)的不同色拆到不同供應商", () => {
    // 3200A22(米盧) 與 BBL5-17(尚慶) 同屬 #P6177，落在兩張不同採購單
    expect(result.groups.find((g) => g.supplierId === MILU)!.caseRefs).toContain(
      "P6177",
    );
    expect(result.groups.find((g) => g.supplierId === SC)!.caseRefs).toContain(
      "P6177",
    );
  });

  it("彙整各組不重複案件號", () => {
    expect(result.groups.find((g) => g.supplierId === MILU)!.caseRefs).toEqual([
      "P6177",
      "P6181",
    ]);
    expect(result.groups.find((g) => g.supplierId === GM)!.caseRefs).toEqual([
      "P6180",
    ]);
  });

  it("目錄查無的色號進 unmatched（不靜默丟棄）", () => {
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toMatchObject({
      productCode: "BG116",
      line: "BG116 20y #P6178",
    });
    expect(result.unmatched[0].reason).toBeTruthy();
  });

  it("數量/單位正確帶入 matched item", () => {
    const milu = result.groups.find((g) => g.supplierId === MILU)!;
    expect(milu.items[0]).toMatchObject({
      productCode: "3200A22",
      qty: 21,
      unit: "碼",
      caseRef: "P6177",
      matched: true,
    });
    const gm = result.groups.find((g) => g.supplierId === GM)!;
    const guItem = gm.items.find((it) => it.productCode === "谷806")!;
    expect(guItem).toMatchObject({ qty: 2, unit: "件" });
  });
});

describe("buildPurchaseGroupsFromPaste — 邊界", () => {
  it("缺數量的行記為 warning 並略過，不進 unmatched", () => {
    const result = buildPurchaseGroupsFromPaste(
      "3200A22 #P6177",
      catalog,
      suppliers,
    );
    expect(result.groups).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("缺少數量"))).toBe(true);
  });

  it("空白輸入回傳空結果", () => {
    const result = buildPurchaseGroupsFromPaste("\n\n", catalog, suppliers);
    expect(result.groups).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });
});
