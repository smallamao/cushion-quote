import "server-only";

import type { SheetsClient } from "@/lib/sheets-client";

/**
 * 讀「客人當初簽署的金額」。
 *
 * 訂製訂單只有一個金額欄位（quotedAmount），規格定案後被改掉就查不出客人原本
 * 簽的是多少。簽署金額本身永久保存在報價版本上（已回簽版本不可再改，要改得建
 * 新版本），所以這裡以報價版本為準去比對，不另外在訂單加欄位。
 */

export interface SignedQuoteAmount {
  /** 報價版本的含稅總額＝簽署當下客人看到並同意的金額 */
  signedAmount: number;
  /** 客人是否真的線上回簽過（沒簽過就沒有「簽署金額」可比） */
  signedBack: boolean;
  signedBackDate: string;
}

/** 報價版本欄位：col18=含稅總額、col43=已回簽、col44=回簽日期 */
export async function getSignedQuoteAmount(
  client: SheetsClient,
  versionId: string,
): Promise<SignedQuoteAmount | null> {
  if (!versionId) return null;
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: "報價版本!A2:AW2000",
  });
  const row = ((res.data.values ?? []) as string[][]).find((r) => r[0] === versionId);
  if (!row) return null;
  return {
    signedAmount: parseFloat(row[18] ?? "0") || 0,
    signedBack: String(row[43] ?? "").toUpperCase() === "TRUE",
    signedBackDate: row[44] ?? "",
  };
}
