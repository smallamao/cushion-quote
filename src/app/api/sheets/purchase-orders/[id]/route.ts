import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  PO_RANGE_IDS,
  PO_ROW_RANGE,
  isoNow,
  poRecordToRow,
  poRowToRecord,
} from "@/lib/purchase-order-utils";
import type { FabricPurchaseOrder } from "@/lib/types";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "未設定" }, { status: 503 });
  try {
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId, range: PO_RANGE_IDS,
    });
    const idx = ((idRes.data.values ?? []) as string[][]).findIndex((r) => r[0] === id);
    if (idx === -1) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const rowRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId, range: PO_ROW_RANGE(idx + 2),
    });
    const row = ((rowRes.data.values ?? [])[0] ?? []) as string[];
    return NextResponse.json({ ok: true, order: poRowToRecord(row) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const patch = (await request.json()) as Partial<FabricPurchaseOrder>;
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "未設定" }, { status: 503 });
  try {
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId, range: PO_RANGE_IDS,
    });
    const idx = ((idRes.data.values ?? []) as string[][]).findIndex((r) => r[0] === id);
    if (idx === -1) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const rowRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId, range: PO_ROW_RANGE(idx + 2),
    });
    const existing = poRowToRecord(((rowRes.data.values ?? [])[0] ?? []) as string[]);
    const updated: FabricPurchaseOrder = { ...existing, ...patch, poId: existing.poId, createdAt: existing.createdAt, updatedAt: isoNow() };
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: PO_ROW_RANGE(idx + 2),
      valueInputOption: "RAW",
      requestBody: { values: [poRecordToRow(updated)] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
