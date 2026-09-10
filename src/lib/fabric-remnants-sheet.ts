/**
 * 「裁剩庫存」工作表欄位對應（唯一真相來源）。
 * 需要讀寫這張表的路由一律 import 這裡，避免兩邊欄位漂移。
 *
 * 欄位（A:P，16 欄）：
 *  A ID / B 商品ID / C 色號 / D 品名 / E 色名規格 / F 供應商 / G 系列 /
 *  H 長度(碼) / I 類型 / J 進貨日 / K 來源 / L 擺放位置 / M 備註 /
 *  N 啟用 / O 建立時間 / P 更新時間
 */
import type { FabricRemnant, FabricRemnantPieceType } from "@/lib/types";

export const SHEET = "裁剩庫存";
export const RANGE_FULL = `${SHEET}!A:P`;
export const RANGE_DATA = `${SHEET}!A2:P`;
export const RANGE_IDS = `${SHEET}!A2:A`;

export const SHEET_HEADERS = [
  "ID", "商品ID", "色號", "品名", "色名規格", "供應商", "系列",
  "長度(碼)", "類型", "進貨日", "來源", "擺放位置", "備註",
  "啟用", "建立時間", "更新時間",
];

function toNumber(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 產生裁剩庫存 ID：RMN-YYYYMMDD-<4碼亂數> */
export function generateRemnantId(date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RMN-${ymd}-${rand}`;
}

export function rowToRemnant(row: string[]): FabricRemnant {
  const pieceType = (row[8] === "整支" ? "整支" : "裁剩") as FabricRemnantPieceType;
  return {
    id: row[0] ?? "",
    productId: row[1] ?? "",
    productCode: row[2] ?? "",
    productName: row[3] ?? "",
    specification: row[4] ?? "",
    supplierName: row[5] ?? "",
    series: row[6] ?? "",
    lengthYd: toNumber(row[7]),
    pieceType,
    receivedDate: row[9] ?? "",
    source: row[10] ?? "",
    location: row[11] ?? "",
    notes: row[12] ?? "",
    isActive: (row[13] ?? "TRUE") !== "FALSE",
    createdAt: row[14] ?? "",
    updatedAt: row[15] ?? "",
  };
}

export function remnantToRow(r: FabricRemnant): string[] {
  return [
    r.id,                                   // A
    r.productId,                            // B
    r.productCode,                          // C
    r.productName,                          // D
    r.specification,                        // E
    r.supplierName,                         // F
    r.series,                               // G
    String(r.lengthYd ?? 0),                // H
    r.pieceType,                            // I
    r.receivedDate,                         // J
    r.source,                               // K
    r.location,                             // L
    r.notes,                                // M
    r.isActive ? "TRUE" : "FALSE",          // N
    r.createdAt,                            // O
    r.updatedAt,                            // P
  ];
}
