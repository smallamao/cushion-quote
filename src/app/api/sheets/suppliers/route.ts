import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { Supplier } from "@/lib/types";

const SHEET = "廠商";
const RANGE_FULL = `${SHEET}!A:P`;
const RANGE_DATA = `${SHEET}!A2:P`;
const RANGE_IDS = `${SHEET}!A2:A`;

function rowToSupplier(row: string[]): Supplier {
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

function supplierToRow(s: Supplier): string[] {
  return [
    s.supplierId,
    s.name,
    s.shortName,
    s.contactPerson,
    s.phone,
    s.mobile,
    s.fax,
    s.email,
    s.taxId,
    s.address,
    s.paymentMethod,
    s.paymentTerms,
    s.notes,
    s.isActive ? "TRUE" : "FALSE",
    s.createdAt,
    s.updatedAt,
  ];
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ suppliers: [] as Supplier[], source: "defaults" as const });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const suppliers = (response.data.values ?? [])
      .map(rowToSupplier)
      .filter((s) => s.supplierId);
    return NextResponse.json({ suppliers, source: "sheets" as const });
  } catch {
    return NextResponse.json({ suppliers: [] as Supplier[], source: "defaults" as const });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Supplier;
  const now = new Date().toISOString().slice(0, 10);
  payload.createdAt = payload.createdAt || now;
  payload.updatedAt = now;
  if (payload.isActive === undefined) payload.isActive = true;

  const sheetsClient = await getSheetsClient();
  if (!sheetsClient) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    await sheetsClient.sheets.spreadsheets.values.append({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      requestBody: { values: [supplierToRow(payload)] },
    });
    return NextResponse.json({ ok: true, supplier: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as Supplier;
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
    const rowIndex = ids.indexOf(payload.supplierId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "supplier not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;
    await sheetsClient.sheets.spreadsheets.values.update({
      spreadsheetId: sheetsClient.spreadsheetId,
      range: `${SHEET}!A${sheetRow}:P${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [supplierToRow(payload)] },
    });
    return NextResponse.json({ ok: true, supplier: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
