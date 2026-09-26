/**
 * 「叫料確認」工作表欄位對應（唯一真相來源）。需要讀寫這張表的路由一律 import 這裡。
 *
 * 欄位（A:S，19 欄）：
 *  A token / B cardId / C 訂單編號 / D 客戶姓名 / E 狀態 / F 生產週 / G 預計出貨日 /
 *  H 希望時段JSON / I 簽名者 / J 簽名圖 / K 確認時間 / L 內容有誤說明 /
 *  M 簽署IP / N 簽署裝置 / O 建立時間 / P 更新時間 /
 *  Q 司機token / R 確定日期 / S 確定時段          ← Q~S 為階段二（司機挑日）預留
 */
import "server-only";

import crypto from "node:crypto";

import { getSheetsClient } from "@/lib/sheets-client";
import {
  normalizeDeliveryPeriod,
  type DeliveryPeriod,
  type MaterialConfirm,
  type MaterialConfirmStatus,
  type PreferredSlot,
} from "@/lib/material-confirm-types";

export const SHEET = "叫料確認";
export const RANGE_FULL = `${SHEET}!A:S`;
export const RANGE_DATA = `${SHEET}!A2:S`;
export const ROW_RANGE = (sheetRow: number) => `${SHEET}!A${sheetRow}:S${sheetRow}`;

export const SHEET_HEADERS = [
  "token", "cardId", "訂單編號", "客戶姓名", "狀態", "生產週", "預計出貨日",
  "希望時段JSON", "簽名者", "簽名圖", "確認時間", "內容有誤說明",
  "簽署IP", "簽署裝置", "建立時間", "更新時間",
  "司機token", "確定日期", "確定時段",
];

type SheetsClient = NonNullable<Awaited<ReturnType<typeof getSheetsClient>>>;

/** 短亂數 token（給公開連結，越短越好貼 LINE）。 */
export function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 字元
}

function parseSlots(json: string | undefined): PreferredSlot[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ date?: string; period?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.date === "string" && s.date)
      .slice(0, 3)
      .map((s) => ({ date: s.date as string, period: normalizeDeliveryPeriod(s.period) }));
  } catch {
    return [];
  }
}

export function rowToConfirm(row: string[]): MaterialConfirm {
  return {
    token:           row[0] ?? "",
    cardId:          row[1] ?? "",
    orderNumber:     row[2] ?? "",
    customerName:    row[3] ?? "",
    status:          (row[4] as MaterialConfirmStatus) || "sent",
    weekKey:         row[5] ?? "",
    dueDate:         row[6] ?? "",
    preferredSlots:  parseSlots(row[7]),
    signerName:      row[8] ?? "",
    signatureUrl:    row[9] ?? "",
    confirmedAt:     row[10] ?? "",
    disputeNote:     row[11] ?? "",
    signerIp:        row[12] ?? "",
    signerUserAgent: row[13] ?? "",
    createdAt:       row[14] ?? "",
    updatedAt:       row[15] ?? "",
    driverToken:     row[16] ?? "",
    chosenDate:      row[17] ?? "",
    chosenPeriod:    (row[18] as DeliveryPeriod) || "",
  };
}

export function confirmToRow(c: MaterialConfirm): string[] {
  return [
    c.token,                              // A
    c.cardId,                             // B
    c.orderNumber,                        // C
    c.customerName,                       // D
    c.status,                             // E
    c.weekKey,                            // F
    c.dueDate,                            // G
    JSON.stringify(c.preferredSlots ?? []),// H
    c.signerName,                         // I
    c.signatureUrl,                       // J
    c.confirmedAt,                        // K
    c.disputeNote,                        // L
    c.signerIp,                           // M
    c.signerUserAgent,                    // N
    c.createdAt,                          // O
    c.updatedAt,                          // P
    c.driverToken,                        // Q
    c.chosenDate,                         // R
    c.chosenPeriod,                       // S
  ];
}

async function ensureSheetExists(client: SheetsClient): Promise<void> {
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
    requestBody: { values: [SHEET_HEADERS] },
  });
}

/** 全表讀出（含所在列號，供精準改寫單列）。 */
export async function listConfirms(): Promise<Array<{ confirm: MaterialConfirm; rowNumber: number }>> {
  const client = await getSheetsClient();
  if (!client) return [];
  await ensureSheetExists(client);
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  return (res.data.values ?? [])
    .map((r, i) => ({ confirm: rowToConfirm(r as string[]), rowNumber: i + 2 }))
    .filter((x) => x.confirm.token);
}

export async function findByToken(
  token: string,
): Promise<{ confirm: MaterialConfirm; rowNumber: number } | null> {
  if (!token) return null;
  const all = await listConfirms();
  return all.find((x) => x.confirm.token === token) ?? null;
}

/** 同一張卡只留一筆有效確認單（重發時沿用舊列，避免看板出現兩筆同單）。 */
export async function findByCardId(
  cardId: string,
): Promise<{ confirm: MaterialConfirm; rowNumber: number } | null> {
  if (!cardId) return null;
  const all = await listConfirms();
  return all.find((x) => x.confirm.cardId === cardId) ?? null;
}

export async function appendConfirm(c: MaterialConfirm): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await ensureSheetExists(client);
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    requestBody: { values: [confirmToRow(c)] },
  });
}

export async function writeConfirm(c: MaterialConfirm, rowNumber: number): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: ROW_RANGE(rowNumber),
    valueInputOption: "RAW",
    requestBody: { values: [confirmToRow({ ...c, updatedAt: new Date().toISOString() })] },
  });
}
