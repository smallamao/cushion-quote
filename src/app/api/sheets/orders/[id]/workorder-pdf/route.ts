import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  isoNow,
  orderRowToRecord,
  orderRecordToRow,
  resolveWorkOrderMaterialImage,
} from "@/lib/order-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/sheets/orders/[id]/workorder-pdf
// Body: { url: string, materialImageUrl?: string }
// 產生施工工單 PDF 後呼叫，把最新一份的網址存回訂單記錄（取代舊的），
// 讓操作員之後打開訂單能直接看到上次產生的工單，不用重新產生。
//
// materialImageUrl：產生工單前會跳裁切視窗讓操作員框布樣，那張裁切圖原本只用在
// 那一次渲染、不會回寫訂單。結果是工單 PDF 看到裁切圖、同步到 Notion 的工單圖
// （走 generateWorkOrderJpgBlob({ order })，吃訂單記錄）看到未裁切的原圖，同一張
// 單兩份文件長得不一樣（S1087 2026-10-30）。裁切也因此每次重產都要重做一遍。
// 改成連同實際用的那張圖一起存回，兩邊就吃同一個來源。
export async function PATCH(request: Request, context: RouteContext) {
  // route 層再驗一次身分。middleware 已經把這條路徑限制在 admin，這裡是第二道鎖：
  // /api/sheets 底下多數端點原本只靠 middleware 那一道門，而 Next.js 近期就有三個
  // middleware bypass 的公告——一道門倒了不該等於全部資料大開（2026-10-15 弱點分析）。
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;


  const { id: orderId } = await context.params;
  const body = (await request.json()) as { url?: string; materialImageUrl?: string };

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
    const materialImageUrl = resolveWorkOrderMaterialImage(body.materialImageUrl, existing.materialImageUrl);
    const updated = orderRecordToRow({
      ...existing,
      workOrderPdfUrl: body.url,
      workOrderPdfUpdatedAt: updatedAt,
      materialImageUrl,
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [updated] },
    });

    return NextResponse.json({ ok: true, workOrderPdfUpdatedAt: updatedAt, materialImageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
