import "server-only";

import crypto from "node:crypto";

import { getSheetsClient } from "@/lib/sheets-client";
import type { OrderConfirm, OrderConfirmStatus } from "@/lib/order-confirm-types";

/**
 * 「訂單確認」工作表讀寫（線上下訂確認單）。
 *
 * 欄位對照只能有這一份；需要讀寫這張表的路由一律 import 這裡，
 * 避免各自抄一份造成欄位漂移（本專案踩過多次）。
 */

export const SHEET = "訂單確認";
// A token / B 卡片ID / C 卡片名稱 / D 訂金 / E 勾選條款(JSON) / F 狀態 /
// G 簽署人 / H 簽名圖 / I 確認時間 / J IP / K 裝置 / L 傳出時間 /
// M 建立時間 / N 更新時間 / O 建立者 / P 訂單編號 / Q 匯款期限
// ⚠️ 加欄位時這四處要一起改：RANGE 常數、單列 ROW_RANGE、HEADERS、實體 grid 欄數。
export const RANGE_FULL = `${SHEET}!A:Q`;
export const RANGE_DATA = `${SHEET}!A2:Q`;
export const ROW_RANGE = (rowNumber: number) => `${SHEET}!A${rowNumber}:Q${rowNumber}`;

export const HEADERS = [
  "token", "卡片ID", "卡片名稱", "訂金", "勾選條款", "狀態",
  "簽署人", "簽名圖", "確認時間", "IP", "裝置", "傳出時間",
  "建立時間", "更新時間", "建立者", "訂單編號", "匯款期限",
];

/** 短亂數 token（對外連結，越短越好貼）。 */
export function generateToken(): string {
  return crypto.randomBytes(6).toString("base64url"); // 8 字元
}

function parseIndexes(v: string | undefined): number[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function rowToOrderConfirm(row: string[]): OrderConfirm {
  return {
    token: row[0] ?? "",
    cardId: row[1] ?? "",
    cardName: row[2] ?? "",
    depositAmount: Number(row[3] ?? 0) || 0,
    checkedIndexes: parseIndexes(row[4]),
    status: ((row[5] as OrderConfirmStatus) || "sent"),
    signerName: row[6] ?? "",
    signatureUrl: row[7] ?? "",
    confirmedAt: row[8] ?? "",
    signerIp: row[9] ?? "",
    signerUserAgent: row[10] ?? "",
    notifiedAt: row[11] ?? "",
    createdAt: row[12] ?? "",
    updatedAt: row[13] ?? "",
    createdBy: row[14] ?? "",
    orderNo: row[15] ?? "",
    payByDate: row[16] ?? "",
  };
}

export function orderConfirmToRow(c: OrderConfirm): string[] {
  return [
    c.token,
    c.cardId,
    c.cardName,
    String(c.depositAmount),
    JSON.stringify(c.checkedIndexes ?? []),
    c.status,
    c.signerName,
    c.signatureUrl,
    c.confirmedAt,
    c.signerIp,
    c.signerUserAgent,
    c.notifiedAt,
    c.createdAt,
    c.updatedAt,
    c.createdBy,
    c.orderNo,
    c.payByDate,
  ];
}

export async function listOrderConfirms(): Promise<OrderConfirm[]> {
  const client = await getSheetsClient();
  if (!client) return [];
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  return (res.data.values ?? []).map(rowToOrderConfirm).filter((c) => c.token);
}

/** 依 token 找出該筆與其列號（列號供後續精準更新用）。 */
export async function findByToken(
  token: string,
): Promise<{ confirm: OrderConfirm; rowNumber: number } | null> {
  const client = await getSheetsClient();
  if (!client || !token) return null;
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_DATA,
  });
  const rows = (res.data.values ?? []) as string[][];
  const idx = rows.findIndex((r) => r[0] === token);
  if (idx === -1) return null;
  return { confirm: rowToOrderConfirm(rows[idx]), rowNumber: idx + 2 };
}

export async function appendOrderConfirm(c: OrderConfirm): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: RANGE_FULL,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [orderConfirmToRow(c)] },
  });
}

export async function writeOrderConfirm(c: OrderConfirm, rowNumber: number): Promise<void> {
  const client = await getSheetsClient();
  if (!client) throw new Error("Google Sheets 未設定");
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: ROW_RANGE(rowNumber),
    valueInputOption: "RAW",
    requestBody: { values: [orderConfirmToRow({ ...c, updatedAt: new Date().toISOString() })] },
  });
}
