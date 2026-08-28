import { getSheetsClient } from "@/lib/sheets-client";
import type {
  PurchaseProduct,
  PurchaseProductCategory,
  PurchaseUnit,
  Supplier,
} from "@/lib/types";

/**
 * 採購商品／廠商 Sheet 讀寫對照，供 from-paste 與 products/lookup 共用。
 * 欄位對照鏡射自 /api/sheets/purchase-products 與 /api/sheets/suppliers，切勿擅自改欄數。
 */

export type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

export const PRODUCT_RANGE = "採購商品!A2:Y";
export const PRODUCT_RANGE_FULL = "採購商品!A:Y"; // append 用（25 欄，與 /api/sheets/purchase-products 一致）
export const SUPPLIER_RANGE = "廠商!A2:P";

function safeNumber(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function rowToProduct(row: string[]): PurchaseProduct {
  const unitPrice = safeNumber(row[10]) ?? 0;
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[2] ?? "",
    productName: row[3] ?? "",
    specification: row[4] ?? "",
    category: (row[5] as PurchaseProductCategory) ?? "其他",
    unit: (row[6] as PurchaseUnit) ?? "碼",
    supplierId: row[7] ?? "",
    supplierName: row[8] ?? "",
    widthCm: safeNumber(row[9]),
    unitPrice,
    listPricePerCai: safeNumber(row[11]),
    brand: row[12] ?? "",
    series: row[13] ?? "",
    colorCode: row[14] ?? "",
    colorName: row[15] ?? "",
    imageUrl: row[16] ?? "",
    notes: row[17] ?? "",
    isActive: (row[21] ?? "TRUE") !== "FALSE",
    createdAt: row[22] ?? "",
    updatedAt: row[23] ?? "",
  };
}

/** 商品 → Sheet 列（25 欄，A:Y）。 */
export function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,                                                        // A
    p.productCode,                                               // B
    p.supplierProductCode || p.productCode,                      // C — fallback
    p.productName,                                               // D
    p.specification,                                             // E
    p.category,                                                  // F
    p.unit,                                                      // G
    p.supplierId,                                                // H
    p.supplierName ?? "",                                        // I
    p.widthCm != null ? String(p.widthCm) : "",                  // J
    String(p.unitPrice ?? 0),                                    // K (進價)
    p.listPricePerCai != null ? String(p.listPricePerCai) : "",  // L (牌價)
    p.brand ?? "",                                               // M
    p.series ?? "",                                              // N
    p.colorCode ?? "",                                           // O
    p.colorName ?? "",                                           // P
    p.imageUrl ?? "",                                            // Q
    p.notes ?? "",                                               // R
    "",                                                          // S 最小訂量
    "",                                                          // T 交期
    "",                                                          // U 庫存狀態
    p.isActive ? "TRUE" : "FALSE",                               // V
    p.createdAt,                                                 // W
    p.updatedAt,                                                 // X
    p.updatedAt,                                                 // Y (mirror)
  ];
}

export function rowToSupplier(row: string[]): Supplier {
  return {
    supplierId: row[0] ?? "",
    name: row[1] ?? "",
    shortName: row[2] ?? "",
    contactPerson: row[3] ?? "",
    phone: row[4] ?? "",
    mobile: row[5] ?? "",
    fax: row[6] ?? "",
    email: row[7] ?? "",
    taxId: row[8] ?? "",
    address: row[9] ?? "",
    paymentMethod: row[10] ?? "",
    paymentTerms: row[11] ?? "",
    notes: row[12] ?? "",
    isActive: row[13] !== "FALSE",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

/** 讀取「啟用中」商品目錄與全部廠商 */
export async function loadCatalogAndSuppliers(
  client: SheetsClient,
  options: { includeInactive?: boolean } = {},
): Promise<{ catalog: PurchaseProduct[]; suppliers: Supplier[] }> {
  const [productRes, supplierRes] = await Promise.all([
    client.sheets.spreadsheets.values.get({ spreadsheetId: client.spreadsheetId, range: PRODUCT_RANGE }),
    client.sheets.spreadsheets.values.get({ spreadsheetId: client.spreadsheetId, range: SUPPLIER_RANGE }),
  ]);
  const catalog = (productRes.data.values ?? [])
    .map(rowToProduct)
    .filter((p) => p.id && (options.includeInactive || p.isActive));
  const suppliers = (supplierRes.data.values ?? [])
    .map(rowToSupplier)
    .filter((s) => s.supplierId);
  return { catalog, suppliers };
}

/** 排程系統 server-to-server 金鑰驗證（from-paste 與 lookup 共用）。回 null 表示通過。 */
export function authorizeSchedulerRequest(request: Request): { status: number; error: string } | null {
  const configuredKey = process.env.SCHEDULER_API_KEY?.trim();
  if (!configuredKey) return { status: 503, error: "SCHEDULER_API_KEY 未設定，端點停用" };
  const providedKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!providedKey || providedKey.length !== configuredKey.length) return { status: 401, error: "unauthorized" };
  // timing-safe 比對
  let diff = 0;
  for (let i = 0; i < configuredKey.length; i += 1) {
    diff |= providedKey.charCodeAt(i) ^ configuredKey.charCodeAt(i);
  }
  return diff === 0 ? null : { status: 401, error: "unauthorized" };
}
