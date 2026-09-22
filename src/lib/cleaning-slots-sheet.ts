/**
 * 「清潔時段」工作表欄位對應（唯一真相來源）——到府清潔時段媒合的 session。
 * 需要讀寫這張表的路由一律 import 這裡。
 *
 * 欄位（A:L，12 欄）：
 *  A sessionId / B serviceId / C customerToken / D techToken / E 客人選的時段JSON /
 *  F 確認日期 / G 確認時段 / H 狀態 / I 客人地址 / J 客人電話 / K 建立時間 / L 更新時間
 */
import crypto from "node:crypto";

import type {
  CleaningSlotPeriod,
  CleaningSlotProposal,
  CleaningSlotSession,
  CleaningSlotStatus,
} from "@/lib/types";

export const SHEET = "清潔時段";
export const RANGE_FULL = `${SHEET}!A:L`;
export const RANGE_DATA = `${SHEET}!A2:L`;
export const ROW_RANGE = (sheetRow: number) => `${SHEET}!A${sheetRow}:L${sheetRow}`;

export const SHEET_HEADERS = [
  "sessionId", "serviceId", "客人連結token", "師傅連結token", "客人選時段JSON",
  "確認日期", "確認時段", "狀態", "客人地址", "客人電話", "建立時間", "更新時間",
];

const PERIODS: CleaningSlotPeriod[] = ["上午", "下午", "晚上", "皆可"];
export function normalizePeriod(v: string | undefined): CleaningSlotPeriod {
  return PERIODS.includes(v as CleaningSlotPeriod) ? (v as CleaningSlotPeriod) : "皆可";
}

/** 產生媒合 session ID：CLN-YYYYMMDD-XXXX */
export function generateSessionId(date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `CLN-${ymd}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

/** 短亂數 token（給公開連結，越短越好貼）。 */
export function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 字元
}

function parseSlots(json: string | undefined): CleaningSlotProposal[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ date?: string; period?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.date === "string" && s.date)
      .slice(0, 3)
      .map((s) => ({ date: s.date as string, period: normalizePeriod(s.period) }));
  } catch {
    return [];
  }
}

export function rowToSession(row: string[]): CleaningSlotSession {
  return {
    sessionId: row[0] ?? "",
    serviceId: row[1] ?? "",
    customerToken: row[2] ?? "",
    techToken: row[3] ?? "",
    proposedSlots: parseSlots(row[4]),
    confirmedDate: row[5] ?? "",
    confirmedPeriod: (row[6] as CleaningSlotPeriod) || "",
    status: (row[7] as CleaningSlotStatus) || "awaiting_customer",
    customerAddress: row[8] ?? "",
    customerPhone: row[9] ?? "",
    createdAt: row[10] ?? "",
    updatedAt: row[11] ?? "",
  };
}

export function sessionToRow(s: CleaningSlotSession): string[] {
  return [
    s.sessionId,                          // A
    s.serviceId,                          // B
    s.customerToken,                      // C
    s.techToken,                          // D
    JSON.stringify(s.proposedSlots ?? []),// E
    s.confirmedDate,                      // F
    s.confirmedPeriod,                    // G
    s.status,                             // H
    s.customerAddress,                    // I
    s.customerPhone,                      // J
    s.createdAt,                          // K
    s.updatedAt,                          // L
  ];
}
