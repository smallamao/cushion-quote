/**
 * 「採購商品」工作表的欄位對應（唯一真相來源）。
 *
 * 🔴 這份對應表**只能有一份**。原本 rowToProduct / productToRow 寫死在
 * `api/sheets/purchase-products/route.ts` 裡，新端點若各自再抄一份，
 * 兩邊就會漂移（改了 A 忘了 B → 欄位對應不到、值寫到隔壁欄）。
 * 需要讀寫這張表的路由一律 import 這裡。
 */
import { yardToCai } from "@/lib/utils";
import type { PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

export const SHEET = "採購商品";

// 實際欄位（A:Y，25 欄），對應使用者的表頭：
//  A ID / B 商品編號 / C 廠商產品編號 / D 商品名稱 / E 規格 / F 分類 / G 單位 /
//  H 廠商編號 / I 廠商名稱 / J 幅寬(cm) / K 進價 / L 牌價 / M 品牌 / N 系列 /
//  O 色號 / P 色名 / Q 圖片URL / R 備註 / S 最小訂量 / T 交期 / U 庫存狀態 /
//  V 啟用 / W 建立時間 / X 更新時間 / Y 更新時間(重複表頭，鏡射)
export const RANGE_FULL = `${SHEET}!A:Y`;
export const RANGE_DATA = `${SHEET}!A2:Y`;
export const RANGE_IDS = `${SHEET}!A2:A`;

export const CACHE_KEY = "purchase-products:all";
export const CACHE_TTL = 60_000; // 1 min

export function safeNumber(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function rowToProduct(row: string[]): PurchaseProduct {
  const unit = (row[6] as PurchaseUnit) ?? "碼";
  const widthCm = safeNumber(row[9]);
  const legacyUnitPrice = safeNumber(row[10]) ?? 0;
  // Convert per-unit purchase price to per-才 for calculator use
  const costPerCai = (() => {
    if (!legacyUnitPrice) return 0;
    if (unit === "才") return legacyUnitPrice;
    if (unit === "碼") return yardToCai(legacyUnitPrice, widthCm ?? 137);
    return legacyUnitPrice;
  })();
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[2] ?? "",
    productName: row[3] ?? "",
    specification: row[4] ?? "",
    category: (row[5] as PurchaseProductCategory) ?? "其他",
    unit,
    supplierId: row[7] ?? "",
    supplierName: row[8] ?? "",
    widthCm,
    unitPrice: legacyUnitPrice,
    costPerCai,
    listPricePerCai: safeNumber(row[11]),
    brand: row[12] ?? "",
    series: row[13] ?? "",
    colorCode: row[14] ?? "",
    colorName: row[15] ?? "",
    imageUrl: row[16] ?? "",
    notes: row[17] ?? "",
    // S(18)=最小訂量, T(19)=交期, U(20)=庫存狀態 — not modeled in type yet
    isActive: (row[21] ?? "TRUE") !== "FALSE",
    createdAt: row[22] ?? "",
    updatedAt: row[23] ?? "",
  };
}

export function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,                                                       // A
    p.productCode,                                              // B
    p.supplierProductCode || p.productCode,                     // C — fallback
    p.productName,                                              // D
    p.specification,                                            // E
    p.category,                                                 // F
    p.unit,                                                     // G
    p.supplierId,                                               // H
    p.supplierName ?? "",                                       // I
    p.widthCm != null ? String(p.widthCm) : "",                 // J
    String(p.unitPrice ?? 0),                                   // K (進價)
    p.listPricePerCai != null ? String(p.listPricePerCai) : "", // L (牌價)
    p.brand ?? "",                                              // M
    p.series ?? "",                                             // N
    p.colorCode ?? "",                                          // O
    p.colorName ?? "",                                          // P
    p.imageUrl ?? "",                                           // Q
    p.notes ?? "",                                              // R
    "",                                                         // S 最小訂量
    "",                                                         // T 交期
    "",                                                         // U 庫存狀態
    p.isActive ? "TRUE" : "FALSE",                              // V
    p.createdAt,                                                // W
    p.updatedAt,                                                // X
    p.updatedAt,                                                // Y (mirror)
  ];
}

/** 呼叫端可覆寫的欄位（其餘一律沿用範本，避免半套資料）。 */
export const AGENT_WRITABLE_FIELDS = [
  "productCode",
  "supplierProductCode",
  "productName",
  "specification",
  "category",
  "unit",
  "supplierId",
  "supplierName",
  "widthCm",
  "unitPrice",
  "listPricePerCai",
  "brand",
  "series",
  "colorCode",
  "colorName",
  "imageUrl",
  "notes",
  "isActive",
] as const;

export type AgentWritableField = (typeof AGENT_WRITABLE_FIELDS)[number];
