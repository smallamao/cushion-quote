import "server-only";

import { randomUUID } from "node:crypto";

import { after } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

// 操作日誌（唯附加）。
//
// 🔴 2026-10-15 弱點分析第 6 項：系統記錄了「誰建立」（createdBy，57 處），但
//    updatedBy / deletedBy / 任何操作日誌「全專案 0 處」。而且刪除是硬刪除，
//    資料直接從試算表移除；13 支 DELETE 端點沒有一支留下任何痕跡。
//
//    所有寫入都經由同一個 Google 服務帳號，所以 Google 自己的活動紀錄只會顯示
//    那隻機器人帳號，看不出背後是哪個人。結果是：金額對不上、或一筆訂單不見了
//    的時候，試算表的版本歷史查得出「什麼時候改了什麼」，但查不出「是誰」。
//    在涉及金額的系統裡這是實質風險——內部責任無法釐清，爭議無法收尾。
//
// 設計上刻意保守：
//   - 唯附加，永不更新或刪除既有列
//   - best-effort：寫日誌失敗絕對不能讓主要動作失敗（記不到帳比開不了單好）
//   - 用 after() 延到回應送出後才寫，不拖慢使用者的等待時間
//   - 不記完整的前後值（會把客戶個資複製一份到另一張表），只記對象與摘要

const SHEET = "操作日誌";
const RANGE_FULL = `${SHEET}!A:G`;
const HEADERS = ["id", "時間", "操作者", "動作", "對象類型", "對象ID", "摘要"];

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

export type AuditAction = "create" | "update" | "delete";

export interface AuditEntry {
  /** 操作者 email。拿不到時傳 "unknown"——寧可記一筆 unknown，也不要整筆不記 */
  actor: string;
  action: AuditAction;
  /** 對象類型，例如 "order"、"client"、"purchase"、"einvoice"、"settings" */
  targetType: string;
  targetId: string;
  /** 一句話摘要，給人看的。不要放完整個資 */
  summary?: string;
}

async function ensureSheet(client: SheetsClient): Promise<void> {
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === SHEET);
  if (exists) return;
  await client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
  });
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${SHEET}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

async function write(entry: AuditEntry): Promise<void> {
  const client = await getSheetsClient();
  if (!client) return;
  try {
    await ensureSheet(client);
    await client.sheets.spreadsheets.values.append({
      spreadsheetId: client.spreadsheetId,
      range: RANGE_FULL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            randomUUID(),
            new Date().toISOString(),
            entry.actor || "unknown",
            entry.action,
            entry.targetType,
            entry.targetId,
            entry.summary ?? "",
          ],
        ],
      },
    });
  } catch {
    // 記錄失敗不影響主流程
  }
}

/**
 * 記一筆操作日誌。永遠不會丟錯，也不會讓呼叫端等待。
 *
 * after() 只能在請求情境內呼叫（排程或腳本會丟錯），那種情況退回直接寫入
 * 但不等待結果——照 lib/notifications-sheet.ts 的既有做法。
 */
export function appendAuditLog(entry: AuditEntry): void {
  try {
    after(() => write(entry));
  } catch {
    void write(entry);
  }
}
