import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

const SHEET = "採購商品";
// Sheet schema (matches init/route.ts — 15 columns A:O):
// A ID | B 商品編號 | C 商品名稱 | D 規格 | E 分類 | F 單位 | G 廠商編號 |
// H 單價 | I 進價/才 | J 牌價/才 | K 圖片URL | L 備註 | M 啟用 | N 建立時間 | O 更新時間
const RANGE_FULL = `${SHEET}!A:O`;
const RANGE_DATA = `${SHEET}!A2:O`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToProduct(row: string[]): PurchaseProduct {
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    productName: row[2] ?? "",
    specification: row[3] ?? "",
    category: (row[4] as PurchaseProductCategory) ?? "其他",
    unit: (row[5] as PurchaseUnit) ?? "碼",
    supplierId: row[6] ?? "",
    unitPrice: Number(row[7] ?? 0),
    costPerCai: Number(row[8] ?? 0),
    listPricePerCai: Number(row[9] ?? 0),
    imageUrl: row[10] ?? "",
    notes: row[11] ?? "",
    isActive: row[12] !== "FALSE",
    createdAt: row[13] ?? "",
    updatedAt: row[14] ?? "",
    // Fields not persisted in this sheet — populated from suppliers lookup
    // or left empty. Kept on the type for compatibility with downstream code.
    supplierName: "",
    supplierProductCode: "",
  };
}

function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,                    // ID
    p.productCode,           // 商品編號
    p.supplierProductCode,  // 廠商產品編號
    p.productName,           // 商品名稱
    p.specification,         // 規格
    p.category,              // 分類
    p.unit,                   // 單位
    p.supplierId,             // 廠商編號
    p.supplierName ?? "",     // 廠商名稱
    String(p.unitPrice ?? 0), // 單價
    String(p.widthCm ?? ""),  // 幅寬(cm)
    String(p.costPerCai ?? 0), // 進價/才
    String(p.listPricePerCai ?? 0), // 牌價/才
    p.brand ?? "",            // 品牌
    p.series ?? "",           // 系列
    p.colorCode ?? "",        // 色號
    p.colorName ?? "",        // 色名
    p.imageUrl ?? "",          // 圖片URL
    p.notes ?? "",            // 備註
    p.minOrder ?? "",         // 最小訂量
    String(p.leadTimeDays ?? 0), // 交期
    "",                       // 庫存狀態 (由庫存系統管理)
    p.isActive ? "TRUE" : "FALSE", // 啟用
    p.createdAt,              // 建立時間
    p.updatedAt,              // 更新時間
  ];
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ products: [] as PurchaseProduct[], source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const products = (response.data.values ?? [])
      .map(rowToProduct)
      .filter((p) => p.id);
    return NextResponse.json({ products, source: "sheets" as const });
  } catch {
    return NextResponse.json({ products: [] as PurchaseProduct[], source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as PurchaseProduct | PurchaseProduct[];
  const now = new Date().toISOString().slice(0, 10);
  const items = Array.isArray(payload) ? payload : [payload];

  for (const item of items) {
    item.createdAt = item.createdAt || now;
    item.updatedAt = now;
    if (item.isActive === undefined) item.isActive = true;
  }

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Determine next empty row explicitly — avoid values.append table-detection,
    // which can land at wrong columns when the sheet has unusual data layout
    // (e.g., from legacy Ragic import that left gaps in column A).
    const idRes = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: RANGE_IDS,
    });
    const existingCount = (idRes.data.values ?? []).length;
    const startRow = existingCount + 2; // +2: skip header row (1) + 1-indexed
    const endRow = startRow + items.length - 1;

    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${startRow}:M${endRow}`,
      valueInputOption: "RAW",
      requestBody: { values: items.map(productToRow) },
    });
    return NextResponse.json(
      { ok: true, products: items, count: items.length },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as PurchaseProduct;
  payload.updatedAt = new Date().toISOString().slice(0, 10);

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: RANGE_IDS,
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(payload.id);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${sheetRow}:M${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [productToRow(payload)] },
    });
    return NextResponse.json({ ok: true, product: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
