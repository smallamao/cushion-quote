import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseProduct, PurchaseProductCategory, PurchaseUnit } from "@/lib/types";

const SHEET = "採購商品";
const RANGE_FULL = `${SHEET}!A:M`;
const RANGE_DATA = `${SHEET}!A2:M`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToProduct(row: string[]): PurchaseProduct {
  return {
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    supplierProductCode: row[13] ?? "",
    productName: row[2] ?? "",
    specification: row[3] ?? "",
    category: (row[4] as PurchaseProductCategory) ?? "其他",
    unit: (row[5] as PurchaseUnit) ?? "碼",
    supplierId: row[6] ?? "",
    unitPrice: Number(row[7] ?? 0),
    imageUrl: row[8] ?? "",
    notes: row[9] ?? "",
    isActive: row[10] !== "FALSE",
    createdAt: row[11] ?? "",
    updatedAt: row[12] ?? "",
  };
}

function productToRow(p: PurchaseProduct): string[] {
  return [
    p.id,
    p.productCode,
    p.productName,
    p.specification,
    p.category,
    p.unit,
    p.supplierId,
    String(p.unitPrice),
    p.imageUrl,
    p.notes,
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
    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: RANGE_FULL,
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
