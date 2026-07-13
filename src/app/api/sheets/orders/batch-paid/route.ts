import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import { ORDER_RANGE_IDS, ORDER_SHEET, isoNow } from "@/lib/order-utils";

// POST /api/sheets/orders/batch-paid
// Body: { orderIds: string[], paidDate: string }  — paidDate 傳空字串＝取消收款標記
// 請款對帳單「標記已收款」用：只寫收款日（AN）與更新時間（AF），不動整列其他欄位。
export async function POST(request: Request) {
  const body = (await request.json()) as { orderIds?: string[]; paidDate?: string };
  const orderIds = (body.orderIds ?? []).filter(Boolean);
  const paidDate = body.paidDate ?? "";

  if (orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: "orderIds is required" }, { status: 400 });
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
    const now = isoNow();

    const data: Array<{ range: string; values: string[][] }> = [];
    const missing: string[] = [];
    for (const orderId of orderIds) {
      const rowIndex = idRows.findIndex((r) => r[0] === orderId);
      if (rowIndex === -1) {
        missing.push(orderId);
        continue;
      }
      const sheetRow = rowIndex + 2;
      data.push({ range: `${ORDER_SHEET}!AN${sheetRow}`, values: [[paidDate]] });
      data.push({ range: `${ORDER_SHEET}!AF${sheetRow}`, values: [[now]] });
    }

    if (data.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
    }

    return NextResponse.json({
      ok: true,
      updated: orderIds.length - missing.length,
      missing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
