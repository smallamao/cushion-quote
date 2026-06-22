import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  PO_RANGE_DATA,
  PO_RANGE_FULL,
  PO_RANGE_IDS,
  PO_SHEET,
  generatePoId,
  isoNow,
  poRecordToRow,
  poRowToRecord,
} from "@/lib/purchase-order-utils";
import type { FabricPurchaseOrder } from "@/lib/types";

async function ensurePoSheet(client: Awaited<ReturnType<typeof getSheetsClient>>) {
  if (!client) return;
  const meta = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
  });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === PO_SHEET,
  );
  if (!exists) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: PO_SHEET } } }],
      },
    });
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${PO_SHEET}!A1:J1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["poId","supplierName","status","lineItems","orderedAt","expectedAt","receivedAt","notes","createdAt","updatedAt"]],
      },
    });
  }
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "未設定" }, { status: 503 });
  await ensurePoSheet(client);
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PO_RANGE_DATA,
    });
    const rows = (res.data.values ?? []) as string[][];
    const orders = rows.filter((r) => r[0]).map(poRowToRecord);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<FabricPurchaseOrder>;
  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "未設定" }, { status: 503 });
  await ensurePoSheet(client);
  try {
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: PO_RANGE_IDS,
    });
    const existingIds = ((idRes.data.values ?? []) as string[][]).map((r) => r[0] ?? "").filter(Boolean);
    const now = isoNow();
    const newPo: FabricPurchaseOrder = {
      poId: generatePoId(existingIds),
      supplierName: body.supplierName ?? "",
      status: "draft",
      lineItems: body.lineItems ?? [],
      orderedAt: "",
      expectedAt: body.expectedAt ?? "",
      receivedAt: "",
      notes: body.notes ?? "",
      createdAt: now,
      updatedAt: now,
    };
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: PO_RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [poRecordToRow(newPo)] },
    });
    return NextResponse.json({ ok: true, poId: newPo.poId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
