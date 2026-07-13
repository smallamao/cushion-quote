import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets-client";
import {
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  isoNow,
  todayDateStr,
  orderRowToRecord,
  orderRecordToRow,
} from "@/lib/order-utils";
import { updateNotionPageIfExists } from "@/lib/notion-order";
import type { CustomOrder, OrderStatus } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/sheets/orders/[id]/status
// Body: { status: OrderStatus }
export async function PATCH(request: Request, context: RouteContext) {
  const { id: orderId } = await context.params;
  const body = (await request.json()) as { status: OrderStatus };

  if (!body.status) {
    return NextResponse.json(
      { ok: false, error: "status is required" },
      { status: 400 },
    );
  }

  const VALID_ORDER_STATUSES = ["production", "waiting", "completed", "cancelled"] as const;
  if (!VALID_ORDER_STATUSES.includes(body.status as (typeof VALID_ORDER_STATUSES)[number])) {
    return NextResponse.json({ ok: false, error: "invalid status value" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
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

    const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-indexed sheets

    // Read the full existing row to merge
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

    // Set completedDate to today if transitioning to "completed" and it was empty
    const todayStr = todayDateStr();
    const completedDate =
      body.status === "completed" && !existing.completedDate
        ? todayStr
        : existing.completedDate;

    const updatedRecord: CustomOrder = {
      ...existing,
      status: body.status,
      completedDate,
      updatedAt: isoNow(),
    };

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: ORDER_ROW_RANGE(sheetRow),
      valueInputOption: "RAW",
      requestBody: { values: [orderRecordToRow(updatedRecord)] },
    });

    // best-effort：Notion 已有此單頁面時同步更新狀態（不建新頁；失敗不影響狀態變更）
    let notionUpdated = false;
    try {
      notionUpdated = await updateNotionPageIfExists(updatedRecord);
    } catch {
      // Notion 同步失敗不阻斷主流程
    }

    return NextResponse.json({ ok: true, notionUpdated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
