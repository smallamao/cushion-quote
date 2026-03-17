import { NextResponse } from "next/server";

import defaults from "@/data/defaults.json";
import { getSheetsClient } from "@/lib/sheets-client";
import type { Category, Material, StockStatus } from "@/lib/types";

const fallbackMaterials = defaults.materials as Material[];

function mapRowToMaterial(row: string[]): Material {
  return {
    id: row[0] ?? "",
    brand: row[1] ?? "",
    series: row[2] ?? "",
    colorCode: row[3] ?? "",
    colorName: row[4] ?? "",
    category: (row[5] as Category) ?? "fabric",
    costPerCai: Number(row[6] ?? 0),
    listPricePerCai: Number(row[7] ?? 0),
    supplier: row[8] ?? "",
    widthCm: Number(row[9] ?? 0),
    minOrder: row[10] ?? "",
    leadTimeDays: Number(row[11] ?? 0),
    stockStatus: (row[12] as StockStatus) ?? "in_stock",
    features: (row[13] ?? "").split(",").filter(Boolean),
    notes: row[14] ?? "",
    isActive: row[15] === "TRUE" || row[15] === "true" || row[15] === "1",
    createdAt: row[16] ?? "",
    updatedAt: row[17] ?? "",
  };
}

function materialToRow(m: Material): string[] {
  return [
    m.id,
    m.brand,
    m.series,
    m.colorCode,
    m.colorName,
    m.category,
    String(m.costPerCai),
    String(m.listPricePerCai),
    m.supplier,
    String(m.widthCm),
    m.minOrder,
    String(m.leadTimeDays),
    m.stockStatus,
    m.features.join(","),
    m.notes,
    m.isActive ? "TRUE" : "FALSE",
    m.createdAt,
    m.updatedAt,
  ];
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ materials: fallbackMaterials, source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "材質資料庫!A2:R",
    });

    const materials = (response.data.values ?? []).map((row) => mapRowToMaterial(row)).filter((row) => row.isActive);
    return NextResponse.json({ materials, source: "sheets" as const });
  } catch {
    return NextResponse.json({ materials: fallbackMaterials, source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const material = (await request.json()) as Material;
  const now = new Date().toISOString().slice(0, 10);
  material.createdAt = now;
  material.updatedAt = now;
  material.isActive = true;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法新增材質" }, { status: 503 });
  }

  try {
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: "材質資料庫!A:R",
      valueInputOption: "RAW",
      requestBody: { values: [materialToRow(material)] },
    });

    return NextResponse.json({ ok: true, material, source: "sheets" as const }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const material = (await request.json()) as Material;
  material.updatedAt = new Date().toISOString().slice(0, 10);

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定，無法更新材質" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "材質資料庫!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const rowIndex = ids.indexOf(material.id);

    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "material not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `材質資料庫!A${sheetRow}:R${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [materialToRow(material)] },
    });

    return NextResponse.json({ ok: true, material, source: "sheets" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
