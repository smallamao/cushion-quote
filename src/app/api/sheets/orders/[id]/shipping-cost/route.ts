import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { appendAuditLog } from "@/lib/audit-log";
import { updateNotionPageIfExists } from "@/lib/notion-order";
import { ORDER_RANGE_IDS, ORDER_ROW_RANGE, ORDER_SHEET, isoNow, orderRowToRecord } from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";

// PATCH /api/sheets/orders/[id]/shipping-cost
// 銀行對帳「🚚 運費提領」寫入運費成本用的窄端點：只改「運費成本」與 updatedAt 兩格，
// 不走 PUT 整列覆寫——對帳畫面手上的訂單是載入當下的快照，整列寫回會蓋掉別人剛改的欄位。
//
// Body: { shippingCost: number ≥ 0, expectedCurrent: number }
//  - 是「設定」不是「累加」：同一個值寫兩次無害（目前值已等於目標就直接回成功、不寫）。
//  - expectedCurrent 是畫面上看到的舊值；跟表上目前的值不同就回 409，避免拿過期畫面蓋掉新資料。

/** 欄位位置對應 orderRowToRecord：row[18] = shippingCost、row[31] = updatedAt */
const SHIPPING_COST_COL = "S";
const UPDATED_AT_COL = "AF";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isValidAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAdmin(request);
  if (guard.denied) return guard.denied;

  const { id: orderId } = await context.params;

  let body: { shippingCost?: unknown; expectedCurrent?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "請求格式錯誤" }, { status: 400 });
  }
  const { shippingCost, expectedCurrent } = body ?? {};
  if (!isValidAmount(shippingCost) || !isValidAmount(expectedCurrent)) {
    return NextResponse.json(
      { ok: false, error: "shippingCost 與 expectedCurrent 必須是 ≥ 0 的數字" },
      { status: 400 },
    );
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

    const readRow = async () => {
      const res = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_ROW_RANGE(sheetRow),
      });
      const row = (res.data.values ?? [])[0] as string[] | undefined;
      return row && row[0] === orderId ? orderRowToRecord(row) : null;
    };

    const existing = await readRow();
    if (!existing) {
      // 找列與讀列之間有人插入／刪除列：寧可請使用者重試，也不要寫到別張單
      return NextResponse.json({ ok: false, error: "訂單列位置變動，請重新整理後再試" }, { status: 409 });
    }
    if (existing.shippingCost === shippingCost) {
      return NextResponse.json({ ok: true, shippingCost, unchanged: true });
    }
    if (existing.shippingCost !== expectedCurrent) {
      return NextResponse.json(
        {
          ok: false,
          error: `運費成本已被改成 $${existing.shippingCost.toLocaleString()}，請重新整理後再確認`,
          currentShippingCost: existing.shippingCost,
        },
        { status: 409 },
      );
    }

    const updatedAt = isoNow();
    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${ORDER_SHEET}!${SHIPPING_COST_COL}${sheetRow}`, values: [[String(shippingCost)]] },
          { range: `${ORDER_SHEET}!${UPDATED_AT_COL}${sheetRow}`, values: [[updatedAt]] },
        ],
      },
    });

    // 寫入後讀回確認真的落地（API 成功回應不代表資料寫進去了）
    const saved = await readRow();
    if (!saved || saved.shippingCost !== shippingCost) {
      return NextResponse.json({ ok: false, error: "寫入後讀回的運費成本不符，請重新整理確認" }, { status: 500 });
    }

    appendAuditLog({
      actor: guard.session.email,
      action: "update",
      targetType: "order",
      targetId: orderId,
      summary: `運費成本 ${existing.shippingCost} → ${shippingCost}（銀行對帳運費提領）`,
    });

    // best-effort：Notion 已有此單頁面時同步「運費」；失敗不影響寫入
    try {
      await updateNotionPageIfExists(saved);
    } catch {
      // Notion 同步失敗不影響主流程
    }

    return NextResponse.json({ ok: true, shippingCost: saved.shippingCost });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
