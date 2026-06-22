import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_DATA,
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  isoNow,
  orderRecordToRow,
  orderRowToRecord,
} from "@/lib/order-utils";
import type { CustomOrder } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/sheets/orders/[id]
export async function GET(_request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const row = rows.find((r) => r[0] === orderId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "order not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ order: orderRowToRecord(row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PUT /api/sheets/orders/[id]
// Body: Partial<CustomOrder> — all fields except orderId, createdAt, createdBy
export async function PUT(request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;
  const patch = (await request.json()) as Partial<CustomOrder>;

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    // Find the row by ID using the ID-only range for efficiency
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const idRows = (idRes.data.values ?? []) as string[][];
    const rowIndex = idRows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "order not found" },
        { status: 404 },
      );
    }

    // Read the full existing row
    const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-indexed sheets
    const existingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
    });
    const existingRows = (existingRes.data.values ?? []) as string[][];
    if (existingRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "order row missing" },
        { status: 404 },
      );
    }
    const existing = orderRowToRecord(existingRows[0]);

    // Merge patch, preserving immutable fields
    const updated: CustomOrder = {
      ...existing,
      ...patch,
      // These fields must never be overwritten by the caller
      orderId: existing.orderId,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: isoNow(),
    };

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [orderRecordToRow(updated)] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
