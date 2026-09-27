/**
 * 「排程對帳」工作表：本機比對《馬鈴薯排程.numbers》與 Trello 的結果，推上來給雲端看板用。
 *
 * 為什麼需要：叫料確認看板跑在 Vercel，讀不到老闆電腦裡的 Numbers 檔，
 * 所以它本身無從得知「這週的 Trello 資料跟 Numbers 對不對得上」。
 * 本機跑完對帳後把結果推上來，看板才有辦法在發連結前擋人。
 *
 * 存法：整包 JSON 放在一格（A2）。資料量小（20 筆約 3KB，儲存格上限 5 萬字），
 * 一次覆寫即可，不會有多列同步到一半的中間狀態。
 */
import "server-only";

import { getSheetsClient } from "@/lib/sheets-client";

export const SHEET = "排程對帳";
const CELL = `${SHEET}!A2`;
const HEADER = `${SHEET}!A1`;

export interface DriftRecord {
  orderNumber: string;
  cardId: string;
  /** 該筆在 Numbers 上的排程日 YYYY-MM-DD */
  scheduleDate: string;
  /** date | slot | due —— 日期、時段、出貨日 */
  kind: string;
  /** 給人看的說明，例「出貨 Numbers「10/13-19」≠ Trello 10/03」 */
  reason: string;
}

export interface DriftPayload {
  /** 本機完成比對的時間 ISO */
  checkedAt: string;
  /** 比對涵蓋的起始週一 */
  start: string;
  weeks: number;
  /** Numbers 檔最後存檔時間 ISO，用來判斷「對帳是不是在最新存檔之後跑的」 */
  numbersSavedAt: string;
  records: DriftRecord[];
  /** 本機比對失敗時的錯誤訊息；有值代表這份結果不可信 */
  error?: string;
}

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

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
    range: HEADER,
    valueInputOption: "RAW",
    requestBody: { values: [["本機對帳結果JSON（由排程系統推送，勿手動編輯）"]] },
  });
}

export async function writeDrift(payload: DriftPayload): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await ensureSheet(client);
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: CELL,
    valueInputOption: "RAW",
    requestBody: { values: [[JSON.stringify(payload)]] },
  });
}

/** 讀不到、沒推過、或內容壞掉都回 null——呼叫端要把 null 當「不知道」而不是「沒問題」。 */
export async function readDrift(): Promise<DriftPayload | null> {
  const client = await getSheetsClient();
  if (!client) return null;
  try {
    const res = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: CELL,
    });
    const raw = res.data.values?.[0]?.[0];
    if (typeof raw !== "string" || !raw.trim()) return null;
    const parsed = JSON.parse(raw) as DriftPayload;
    if (!parsed || typeof parsed.checkedAt !== "string") return null;
    if (!Array.isArray(parsed.records)) parsed.records = [];
    return parsed;
  } catch {
    return null;
  }
}
