import "server-only";

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

// 訂製訂單「改狀態」的唯一寫入路徑。
//
// admin 的 /api/sheets/orders/[id]/status 與師傅的 /api/sheets/production-orders/[id]/status
// 共用這一份：寫 status、updatedAt，第一次進「完成」時補 completedDate，
// 再 best-effort 同步 Notion。兩邊各寫一份的話，completedDate 規則遲早走鐘。

export type OrderStatusWriteResult =
  | { ok: true; order: CustomOrder; notionUpdated: boolean }
  | { ok: false; error: "sheets_unavailable" | "not_found" | "row_missing" | "rejected" };

/**
 * 把訂單改成 status。
 *
 * allow：讀到現有那張單之後、寫入之前的檢查（例如師傅只能改生產中的單）。
 * 回 false 時不寫入，結果為 rejected。試算表讀寫錯誤直接往上丟，由 route 回 500。
 */
export async function writeOrderStatus(
  orderId: string,
  status: OrderStatus,
  allow?: (existing: CustomOrder) => boolean,
): Promise<OrderStatusWriteResult> {
  const client = await getSheetsClient();
  if (!client) return { ok: false, error: "sheets_unavailable" };

  const idRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_RANGE_IDS,
  });
  const idRows = (idRes.data.values ?? []) as string[][];
  const rowIndex = idRows.findIndex((r) => r[0] === orderId);
  if (rowIndex === -1) return { ok: false, error: "not_found" };

  const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-indexed sheets

  // Read the full existing row to merge
  const existingRes = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: ORDER_ROW_RANGE(sheetRow),
  });
  const existingRows = (existingRes.data.values ?? []) as string[][];
  if (existingRows.length === 0) return { ok: false, error: "row_missing" };
  const existing = orderRowToRecord(existingRows[0]);

  if (allow && !allow(existing)) return { ok: false, error: "rejected" };

  // Set completedDate to today if transitioning to "completed" and it was empty
  const completedDate =
    status === "completed" && !existing.completedDate ? todayDateStr() : existing.completedDate;

  const updatedRecord: CustomOrder = {
    ...existing,
    status,
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

  return { ok: true, order: updatedRecord, notionUpdated };
}
