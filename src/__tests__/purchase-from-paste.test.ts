import { describe, expect, it } from "vitest";

import {
  buildPurchaseGroupsFromPaste,
  cloneProductAsNew,
  extractProductPrefix,
  findBestTemplate,
} from "@/lib/purchase-from-paste";
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
const BG = "PS-BG"; // 布谷

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
  supplier(BG, "布谷"),
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
      "布谷",
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

// ---------------------------------------------------------------------------
// extractProductPrefix — 規格書四個範例 + 邊界
// ---------------------------------------------------------------------------

describe("extractProductPrefix — 規格書指定範例", () => {
  it("BBL5-17 → BBL5（有連字號，取 - 前部分）", () => {
    expect(extractProductPrefix("BBL5-17")).toBe("BBL5");
  });

  it("谷806 → 谷（無連字號，取開頭 CJK 序列）", () => {
    expect(extractProductPrefix("谷806")).toBe("谷");
  });

  it("BG114 → BG（無連字號，取開頭字母序列）", () => {
    expect(extractProductPrefix("BG114")).toBe("BG");
  });

  it("谷PVC806 → 谷PVC（無連字號，CJK + 字母混合序列）", () => {
    expect(extractProductPrefix("谷PVC806")).toBe("谷PVC");
  });
});

describe("extractProductPrefix — 邊界", () => {
  it("純數字開頭（如 3200A22）→ 空字串（無法建立前綴）", () => {
    expect(extractProductPrefix("3200A22")).toBe("");
  });

  it("多段連字號（如 BBL5-17-A）→ 取第一個 - 前", () => {
    expect(extractProductPrefix("BBL5-17-A")).toBe("BBL5");
  });

  it("空字串 → 空字串", () => {
    expect(extractProductPrefix("")).toBe("");
  });

  it("LY9705 → LY", () => {
    expect(extractProductPrefix("LY9705")).toBe("LY");
  });

  it("S6901 → S", () => {
    expect(extractProductPrefix("S6901")).toBe("S");
  });
});

// ---------------------------------------------------------------------------
// findBestTemplate — 選出同前綴、最近更新的 active 商品
// ---------------------------------------------------------------------------

describe("findBestTemplate", () => {
  const templateCatalog: PurchaseProduct[] = [
    {
      ...product("BBL5-12", SC),
      updatedAt: "2026-01-15",
    },
    {
      ...product("BBL5-09", SC),
      updatedAt: "2026-01-10",
    },
    product("BG114", BG),
    product("LY9705", LY),
    { ...product("BG115", BG), isActive: false }, // inactive — 不應被選
  ];

  it("BBL5-17 → 回傳同前綴 BBL5- 中最近更新的 BBL5-12", () => {
    const result = findBestTemplate("BBL5-17", templateCatalog);
    expect(result?.productCode).toBe("BBL5-12");
  });

  it("BG116 → 回傳同前綴 BG 中 active 範本（不選 inactive BG115）", () => {
    const result = findBestTemplate("BG116", templateCatalog);
    expect(result?.productCode).toBe("BG114");
    expect(result?.isActive).toBe(true);
  });

  it("無同前綴 → 回傳 null（不應自動建立）", () => {
    expect(findBestTemplate("ZZ9999", templateCatalog)).toBeNull();
  });

  it("前綴為空（純數字開頭）→ 回傳 null", () => {
    expect(findBestTemplate("3200A99", templateCatalog)).toBeNull();
  });

  it("欄位不對稱：BBL5 前綴只在 colorCode、productCode 是內部碼 → 仍找得到（線上 bug 修正）", () => {
    // 線上真實情形：BBL5-12 的 productCode 是內部碼(SC…)，BBL5 前綴在 colorCode。
    // 修正前 findBestTemplate 只看 productCode → 前綴 SC≠BBL5 → 回 null（對得到卻複製不出來）。
    const internalCoded: PurchaseProduct = {
      ...product("SC59885", SC),
      colorCode: "BBL5-12",
    };
    const result = findBestTemplate("BBL5-17", [internalCoded]);
    expect(result?.productCode).toBe("SC59885");
    expect(result?.supplierId).toBe(SC); // 供應商正確沿用範本
  });

  it("欄位不對稱：前綴在 specification / supplierProductCode 亦可命中", () => {
    const bySpec: PurchaseProduct = { ...product("X001", BG), specification: "BG115 布料" };
    const bySupCode: PurchaseProduct = { ...product("X002", BG), supplierProductCode: "BG114" };
    expect(findBestTemplate("BG116", [bySpec])?.productCode).toBe("X001");
    expect(findBestTemplate("BG116", [bySupCode])?.productCode).toBe("X002");
  });
});

// ---------------------------------------------------------------------------
// autoCreateMissing 驗收案例（純函式流程，不連網）
//
// 目錄刻意移除 BBL5-17 與 BG116，讓它們成為 unmatched，
// 再模擬 route 的自動補建流程（findBestTemplate → cloneProductAsNew → 重解析）。
// ---------------------------------------------------------------------------

const catalogWithoutMissing: PurchaseProduct[] = [
  product("3200A22", MILU),
  product("2200A71", MILU),
  product("1800A04", MILU),
  product("2200A76", MILU),
  // BBL5-17 刻意移除
  product("BBL5-09", SC),
  product("BBL5-12", SC),
  product("BBL5-19", SC),
  product("谷806", GM),
  product("LY9705", LY),
  product("LY9409", LY),
  product("BG114", BG),
  product("BG115", BG),
  product("BG102", BG),
  // BG116 刻意不在目錄
];

describe("autoCreateMissing 流程（模擬 route 行為，不連網）", () => {
  it("0 unmatched + 5 供應商群組，autoCreated 含兩筆", () => {
    // Step 1: 初次分組 → 取 unmatched
    const initial = buildPurchaseGroupsFromPaste(
      ACCEPTANCE_PASTE,
      catalogWithoutMissing,
      suppliers,
    );

    // BBL5-17 和 BG116 應在 unmatched（谷PVC806 透過 resolver 模糊比對已命中谷806）
    const unmatchedCodes = initial.unmatched.map((u) => u.productCode);
    expect(unmatchedCodes).toContain("BBL5-17");
    expect(unmatchedCodes).toContain("BG116");

    // Step 2: 對每個 unmatched 找範本、複製
    const now = "2026-07-23";
    let idCounter = 0;
    const toCreate: PurchaseProduct[] = [];
    const autoCreated: { productCode: string; copiedFrom: string }[] = [];

    const seenCodes = new Set<string>();
    for (const um of initial.unmatched) {
      if (seenCodes.has(um.productCode)) continue;
      seenCodes.add(um.productCode);

      const template = findBestTemplate(um.productCode, catalogWithoutMissing);
      if (!template) continue;

      const newProduct = cloneProductAsNew(
        template,
        um.productCode,
        now,
        `test-id-${++idCounter}`,
      );
      toCreate.push(newProduct);
      autoCreated.push({ productCode: um.productCode, copiedFrom: template.productCode });
    }

    // Step 3: 擴充目錄後重新分組
    const extendedCatalog = [...catalogWithoutMissing, ...toCreate];
    const final = buildPurchaseGroupsFromPaste(ACCEPTANCE_PASTE, extendedCatalog, suppliers);

    expect(final.groups).toHaveLength(5);
    expect(final.unmatched).toHaveLength(0);

    // autoCreated 應有 BBL5-17 (from BBL5-12) 和 BG116 (from BG114/BG115/BG102)
    expect(autoCreated).toHaveLength(2);
    const ac17 = autoCreated.find((a) => a.productCode === "BBL5-17");
    expect(ac17).toBeDefined();
    expect(ac17?.copiedFrom).toMatch(/^BBL5-/);

    const ac116 = autoCreated.find((a) => a.productCode === "BG116");
    expect(ac116).toBeDefined();
    expect(ac116?.copiedFrom).toMatch(/^BG/);
  });

  it("cloneProductAsNew 繼承供應商/價格，所有識別代碼欄改新碼並加 notes", () => {
    const template = product("BBL5-12", SC, 250);
    const cloned = cloneProductAsNew(template, "BBL5-17", "2026-07-23", "new-id");

    expect(cloned.id).toBe("new-id");
    expect(cloned.productCode).toBe("BBL5-17");
    expect(cloned.colorCode).toBe("BBL5-17");
    expect(cloned.supplierId).toBe(SC);          // 繼承供應商
    expect(cloned.unitPrice).toBe(250);           // 繼承價格
    expect(cloned.notes).toContain("BBL5-12");   // 審計備註
    expect(cloned.createdAt).toBe("2026-07-23");
    expect(cloned.updatedAt).toBe("2026-07-23");
  });

  it("cloneProductAsNew 不殘留範本的規格/廠商產品編號（線上 BBL5 情形）", () => {
    // 真實情形：BBL5 系列 productCode 是內部碼、真正色號存在 specification。
    const template: PurchaseProduct = {
      ...product("GABBL504", SC, 300),
      specification: "BBL5-04",       // 範本色號在規格欄
      supplierProductCode: "GABBL502", // 範本殘留的廠商產品編號
      productName: "BBL5 北歐輕絨貓抓布",
    };
    const cloned = cloneProductAsNew(template, "BBL5-17", "2026-07-23", "new-id");

    expect(cloned.specification).toBe("BBL5-17");       // 規格＝新碼，不殘留 BBL5-04
    expect(cloned.supplierProductCode).toBe("BBL5-17"); // 廠商產品編號＝新碼，不殘留 GABBL502
    expect(cloned.productName).toBe("BBL5 北歐輕絨貓抓布"); // 系列品名沿用
    expect(cloned.supplierId).toBe(SC);
  });

  it("無同前綴範本 → 維持 unmatched，不自動建立", () => {
    // ZZ9999 在 catalogWithoutMissing 中完全沒有 ZZ 前綴商品
    const template = findBestTemplate("ZZ9999", catalogWithoutMissing);
    expect(template).toBeNull(); // 不應建立
  });
});
