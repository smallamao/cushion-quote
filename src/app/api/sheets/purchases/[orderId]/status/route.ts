import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrderStatus } from "@/lib/types";

const SHEET = "採購單";
const RANGE_IDS = `${SHEET}!A2:A`;
// 採購單欄序: A採購單號 B採購日期 C廠商編號 D案件編號 E案件名稱快照 F廠商快照JSON
// G小計 H運費 I稅額 J合計金額 K附註 L狀態 M交貨地址 N到貨日期 O建立時間 P更新時間
const STATUS_COLUMN = "L";
const UPDATED_AT_COLUMN = "P";

const VALID_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "received",
  "cancelled",
];

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  let body: { status?: PurchaseOrderStatus };
  try {
    body = (await request.json()) as { status?: PurchaseOrderStatus };
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }

  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: "無效的狀態" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const idsRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_IDS,
    });
    const ids = (idsRes.data.values ?? []).flat();
    const rowIndex = ids.indexOf(orderId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
    }
    const sheetRow = rowIndex + 2;
    const now = new Date().toISOString();

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        data: [
          {
            range: `${SHEET}!${STATUS_COLUMN}${sheetRow}`,
            values: [[status]],
          },
          {
            range: `${SHEET}!${UPDATED_AT_COLUMN}${sheetRow}`,
            values: [[now]],
          },
        ],
        valueInputOption: "RAW",
      },
    });

    return NextResponse.json({ ok: true, orderId, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "更新狀態失敗";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
