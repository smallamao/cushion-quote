import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import type { PurchaseOrderStatus } from "@/lib/types";

import { authorizeSchedulerRequest } from "../../_catalog";

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
  // 排程系統（server-to-server）用 x-api-key 把採購單標成已發送。
  // middleware 只確認「有帶 header」就放行，真正的 timing-safe 比對在這裡做——
  // 🔴 少了這段，任何帶任意 header 的人都能改全部採購單的狀態。
  //    白名單與這道鎖**必須同一次上線**（2026-09-26 只上線一半，
  //    採購單 PDF 曾可被任意金鑰下載）。
  // 瀏覽器（已登入、帶 cookie、不帶 x-api-key）維持原本行為，不受影響。
  if (request.headers.get("x-api-key")) {
    const denied = authorizeSchedulerRequest(request);
    if (denied) {
      return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
    }
  }
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
