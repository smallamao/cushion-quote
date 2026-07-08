import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  isoNow,
  orderRowToRecord,
  orderRecordToRow,
} from "@/lib/order-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/sheets/orders/[id]/workorder-pdf
// Body: { url: string }
// 產生施工工單 PDF 後呼叫，把最新一份的網址存回訂單記錄（取代舊的），
// 讓操作員之後打開訂單能直接看到上次產生的工單，不用重新產生。
export async function PATCH(request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;
  const body = (await request.json()) as { url?: string };

  if (!body.url) {
    return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const idRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_RANGE_IDS,
    });
    const idRows = (idRes.data.values ?? []) as string[][];
    const rowIndex = idRows.findIndex((r) => r[0] === orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;

    const existingRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
    });
    const existingRows = (existingRes.data.values ?? []) as string[][];
    if (existingRows.length === 0) {
      return NextResponse.json({ ok: false, error: "order row missing" }, { status: 404 });
    }
    const existing = orderRowToRecord(existingRows[0]);

    const updatedAt = isoNow();
    const updated = orderRecordToRow({
      ...existing,
      workOrderPdfUrl: body.url,
      workOrderPdfUpdatedAt: updatedAt,
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [updated] },
    });

    return NextResponse.json({ ok: true, workOrderPdfUpdatedAt: updatedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
