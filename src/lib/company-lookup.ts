import type { sheets_v4 } from "googleapis";

/**
 * 從「客戶資料庫」取開票身分（統編／抬頭）。
 *
 * 為什麼需要這支：簽署頁與伺服器端報價單 PDF 原本都把 taxId 寫死成空字串，
 * 因為兩者都是照散客設計的——散客沒有客戶主檔。結果長期配合的 B2B 客戶
 * 每次簽核都要自己重打統編，主檔裡明明就有（禾雅窗飾 2026-09-16 事件）。
 */

/** 客戶主檔欄位：0 編號、1 公司名稱、2 簡稱、6 統一編號 */
const COL_CLIENT_ID = 0;
const COL_COMPANY_NAME = 1;
const COL_SHORT_NAME = 2;
const COL_TAX_ID = 6;

const COMPANY_RANGE = "客戶資料庫!A2:R";
/** 案件欄位：0 案件ID、2 客戶ID */
const CASE_RANGE = "案件!A2:C";

type SheetsHandle = { sheets: sheets_v4.Sheets; spreadsheetId: string };

export interface CompanyIdentity {
  clientId: string;
  companyName: string;
  taxId: string;
}

export interface CompanyLookupKey {
  clientId?: string;
  companyName?: string;
}

/**
 * 在客戶主檔列中找出對應的那一列。
 *
 * clientId 優先；找不到才退回名稱比對（舊案件的客戶ID可能沒填）。
 * 名稱必須非空——散客的公司名稱是空字串，拿空字串去比會誤中任何一列沒填公司名的資料。
 */
export function pickCompanyRow(rows: string[][], key: CompanyLookupKey): string[] | null {
  const clientId = (key.clientId ?? "").trim();
  const companyName = (key.companyName ?? "").trim();
  if (clientId) {
    const byId = rows.find((row) => (row[COL_CLIENT_ID] ?? "").trim() === clientId);
    if (byId) return byId;
  }
  if (companyName) {
    const byName = rows.find(
      (row) =>
        (row[COL_COMPANY_NAME] ?? "").trim() === companyName ||
        (row[COL_SHORT_NAME] ?? "").trim() === companyName,
    );
    if (byName) return byName;
  }
  return null;
}

export function companyRowToIdentity(row: string[]): CompanyIdentity {
  return {
    clientId: (row[COL_CLIENT_ID] ?? "").trim(),
    companyName: (row[COL_COMPANY_NAME] ?? "").trim(),
    taxId: (row[COL_TAX_ID] ?? "").trim(),
  };
}

/** 案件的客戶ID；空字串＝散客或尚未關聯主檔。 */
export async function findCaseClientId(client: SheetsHandle, caseId: string): Promise<string> {
  if (!caseId) return "";
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: CASE_RANGE,
  });
  const rows = (res.data.values ?? []) as string[][];
  const hit = rows.find((row) => (row[0] ?? "").trim() === caseId);
  return (hit?.[2] ?? "").trim();
}

/** 讀主檔並比對；查無對應（散客）回 null。 */
export async function findCompanyIdentity(
  client: SheetsHandle,
  key: CompanyLookupKey,
): Promise<CompanyIdentity | null> {
  if (!(key.clientId ?? "").trim() && !(key.companyName ?? "").trim()) return null;
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: COMPANY_RANGE,
  });
  const row = pickCompanyRow((res.data.values ?? []) as string[][], key);
  return row ? companyRowToIdentity(row) : null;
}

/**
 * 由案件反查開票身分。任何一步失敗都回 null——統編只是預填的便利，
 * 不該讓簽署頁或報價單 PDF 整個掛掉。
 */
export async function findCompanyIdentityForCase(
  client: SheetsHandle,
  caseId: string,
  companyNameFallback = "",
): Promise<CompanyIdentity | null> {
  try {
    const clientId = await findCaseClientId(client, caseId);
    return await findCompanyIdentity(client, { clientId, companyName: companyNameFallback });
  } catch {
    return null;
  }
}
