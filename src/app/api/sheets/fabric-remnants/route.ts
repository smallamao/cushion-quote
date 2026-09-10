import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  RANGE_DATA,
  RANGE_FULL,
  SHEET,
  generateRemnantId,
  remnantToRow,
  rowToRemnant,
} from "@/lib/fabric-remnants-sheet";
import type { FabricRemnant } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/sheets/fabric-remnants[?includeInactive=true]
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, remnants: [] as FabricRemnant[], error: "Google Sheets 未設定" }, { status: 503 });
  }
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    let remnants = ((res.data.values ?? []) as string[][])
      .filter((r) => r[0])
      .map(rowToRemnant);
    if (!includeInactive) remnants = remnants.filter((r) => r.isActive);
    return NextResponse.json({ ok: true, remnants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, remnants: [], error: message }, { status: 500 });
  }
}

// POST /api/sheets/fabric-remnants — 新增一塊裁剩
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<FabricRemnant>;

  if (!body.productId?.trim()) {
    return NextResponse.json({ ok: false, error: "請選擇布料色號（productId 必填）" }, { status: 400 });
  }
  if (!(Number(body.lengthYd) > 0)) {
    return NextResponse.json({ ok: false, error: "長度必須大於 0" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }
  try {
    const now = new Date().toISOString();
    const remnant: FabricRemnant = {
      id: generateRemnantId(),
      productId: body.productId.trim(),
      productCode: body.productCode?.trim() ?? "",
      productName: body.productName?.trim() ?? "",
      specification: body.specification?.trim() ?? "",
      supplierName: body.supplierName?.trim() ?? "",
      series: body.series?.trim() ?? "",
      lengthYd: Number(body.lengthYd),
      pieceType: body.pieceType === "整支" ? "整支" : "裁剩",
      receivedDate: body.receivedDate?.trim() ?? "",
      source: body.source?.trim() ?? "",
      location: body.location?.trim() ?? "",
      notes: body.notes?.trim() ?? "",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [remnantToRow(remnant)] },
    });

    return NextResponse.json({ ok: true, remnant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PATCH /api/sheets/fabric-remnants — 修改一塊（改長度/位置…），或軟刪 isActive:false
export async function PATCH(request: Request) {
  const body = (await request.json()) as Partial<FabricRemnant> & { id?: string };
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 必填" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const idx = rows.findIndex((r) => (r[0] ?? "") === id);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: "找不到這筆裁剩" }, { status: 404 });
    }
    const current = rowToRemnant(rows[idx]);
    const merged: FabricRemnant = {
      ...current,
      ...body,
      id: current.id,
      lengthYd: body.lengthYd != null ? Number(body.lengthYd) : current.lengthYd,
      pieceType: body.pieceType ?? current.pieceType,
      isActive: body.isActive != null ? body.isActive : current.isActive,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const rowNo = idx + 2; // 表頭 + 1-indexed
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A${rowNo}:P${rowNo}`,
      valueInputOption: "RAW",
      requestBody: { values: [remnantToRow(merged)] },
    });
    return NextResponse.json({ ok: true, remnant: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
