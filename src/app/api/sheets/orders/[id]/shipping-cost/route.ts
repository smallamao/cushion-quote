import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api-auth";
import { appendAuditLog } from "@/lib/audit-log";
import { updateNotionPageIfExists } from "@/lib/notion-order";
import {
  ORDER_COL,
  ORDER_RANGE_IDS,
  ORDER_ROW_RANGE,
  ORDER_SHEET,
  columnLetter,
  isoNow,
  orderRowToRecord,
} from "@/lib/order-utils";
import { getSheetsClient } from "@/lib/sheets-client";

// PATCH /api/sheets/orders/[id]/shipping-cost
// 銀行對帳「🚚 運費提領」寫入運費成本用的窄端點：只改「運費成本」與 updatedAt 兩格，
// 不走 PUT 整列覆寫——對帳畫面手上的訂單是載入當下的快照，整列寫回會蓋掉別人剛改的欄位。
//
// Body: { shippingCost: number ≥ 0, expectedCurrent: number }
//  - 是「設定」不是「累加」：同一個值寫兩次無害（目前值已等於目標就直接回成功、不寫）。
//  - expectedCurrent 是畫面上看到的舊值；跟表上目前的值不同就回 409，避免拿過期畫面蓋掉新資料。

/** 欄名從 order-utils 的欄位位置推出（不寫死），跟 orderRowToRecord 讀的是同一份 */
const SHIPPING_COST_COL = columnLetter(ORDER_COL.shippingCost);
const UPDATED_AT_COL = columnLetter(ORDER_COL.updatedAt);

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

    const readRawRow = async (row: number): Promise<string[]> => {
      const res = await client.sheets.spreadsheets.values.get({
        spreadsheetId: client.spreadsheetId,
        range: ORDER_ROW_RANGE(row),
      });
      return ((res.data.values ?? [])[0] as string[] | undefined) ?? [];
    };
    /** 哪一列的 updatedAt 等於這次寫入的記號 → { sheetRow, id }；找不到回 null */
    const findMarkerRow = async (marker: string) => {
      const res = await client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: client.spreadsheetId,
        ranges: [ORDER_RANGE_IDS, `${ORDER_SHEET}!${UPDATED_AT_COL}2:${UPDATED_AT_COL}10000`],
      });
      const [ids, stamps] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);
      const i = (stamps ?? []).findIndex((r) => r[0] === marker);
      return i === -1 ? null : { sheetRow: i + 2, id: ids?.[i]?.[0] ?? "" };
    };
    const writeCells = (row: number, shippingCostCell: string, updatedAtCell: string) =>
      client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            { range: `${ORDER_SHEET}!${SHIPPING_COST_COL}${row}`, values: [[shippingCostCell]] },
            { range: `${ORDER_SHEET}!${UPDATED_AT_COL}${row}`, values: [[updatedAtCell]] },
          ],
        },
      });

    const beforeRow = await readRawRow(sheetRow);
    const existing = beforeRow[0] === orderId ? orderRowToRecord(beforeRow) : null;
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

    const prevShippingCostCell = beforeRow[ORDER_COL.shippingCost] ?? "";
    const prevUpdatedAtCell = beforeRow[ORDER_COL.updatedAt] ?? "";
    // updatedAt 同時當作這次寫入的記號（ISO 到毫秒），列位置變動時用來找出兩格實際寫到哪一列
    const marker = isoNow();
    await writeCells(sheetRow, String(shippingCost), marker);

    // 寫入後讀回確認真的落地（API 成功回應不代表資料寫進去了），並確認這一列還是同一張單。
    let afterRow = await readRawRow(sheetRow);
    if (afterRow[0] !== orderId) {
      // 找列到寫入之間有人插入／刪除列。Sheets 沒有交易／列鎖，只能事後補救：
      // 用記號找出剛寫的兩格落在哪一列——
      //  - 落在本單（位移發生在寫入之後）→ 寫入其實正確，照常完成；
      //  - 落在別張單（位移發生在讀取與寫入之間）→ 立刻把那兩格還原成寫入前讀到的值，回 409。
      // 殘餘風險：還原用的是寫入前從「本單」讀到的舊值。位移若剛好發生在讀取與寫入之間，
      // 那兩格原本屬於別張單，舊值未必相同；且還原本身也可能再遇到位移。
      // 機率極低（兩次 API 往返之間有人增刪訂單列），所以記稽核紀錄供人工比對。
      const landedRow = await findMarkerRow(marker);
      if (landedRow && landedRow.id === orderId) {
        afterRow = await readRawRow(landedRow.sheetRow);
      } else {
        if (landedRow) await writeCells(landedRow.sheetRow, prevShippingCostCell, prevUpdatedAtCell);
        appendAuditLog({
          actor: guard.session.email,
          action: "update",
          targetType: "order",
          targetId: orderId,
          summary: landedRow
            ? `運費成本寫入時列位置變動，誤寫到第 ${landedRow.sheetRow} 列（${landedRow.id || "空白"}），已把運費成本／updatedAt 還原成 ${prevShippingCostCell || "空白"}／${prevUpdatedAtCell || "空白"}，請人工確認`
            : `運費成本寫入時列位置變動，找不到寫入的列（記號 ${marker}），請人工確認`,
        });
        return NextResponse.json({ ok: false, error: "訂單表剛好有變動，請重新整理再試" }, { status: 409 });
      }
    }
    const saved = orderRowToRecord(afterRow);
    if (saved.shippingCost !== shippingCost) {
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
