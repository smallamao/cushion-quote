import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

const SHEET = "採購商品";
const RANGE_FULL = `${SHEET}!A:Z`;
const RANGE_DATA = `${SHEET}!A2:Z`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToProduct(row: string[]): PurchaseProduct {
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
    widthCm: row[9] ? Number(row[9]) : undefined,
    costPerCai: row[10] ? Number(row[10]) : undefined,
    listPricePerCai: row[11] ? Number(row[11]) : undefined,
    brand: row[12] ?? undefined,
    series: row[13] ?? undefined,
    colorCode: row[14] ?? undefined,
    colorName: row[15] ?? undefined,
    imageUrl: row[16] ?? "",
    notes: row[17] ?? "",
    minOrder: row[18] ?? undefined,
    leadTimeDays: row[19] ? Number(row[19]) : undefined,
    isActive: row[21] !== "FALSE",
    createdAt: row[22] ?? "",
    updatedAt: row[23] ?? "",
  };
}

function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,
    p.productCode,
    p.supplierProductCode,
    p.productName,
    p.specification,
    p.category,
    p.unit,
    p.supplierId,
    p.supplierName ?? "",
    String(p.widthCm ?? ""),
    String(p.costPerCai ?? ""),
    String(p.listPricePerCai ?? ""),
    p.brand ?? "",
    p.series ?? "",
    p.colorCode ?? "",
    p.colorName ?? "",
    p.imageUrl ?? "",
    p.notes ?? "",
    p.minOrder ?? "",
    String(p.leadTimeDays ?? ""),
    "",
    p.isActive ? "TRUE" : "FALSE",
    p.createdAt,
    p.updatedAt,
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
      range: `${SHEET}!A${startRow}:Z${endRow}`,
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
      range: `${SHEET}!A${sheetRow}:Z${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [productToRow(payload)] },
    });
    return NextResponse.json({ ok: true, product: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
