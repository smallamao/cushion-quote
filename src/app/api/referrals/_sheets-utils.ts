import type { SheetsClient } from "@/lib/sheets-client";

export const REFERRER_SHEET = "轉介紹人";
const DATA_RANGE = `${REFERRER_SHEET}!A2:J`;

export async function getReferrerRows(client: SheetsClient): Promise<string[][]> {
  const res = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: DATA_RANGE,
  });
  return (res.data.values ?? []) as string[][];
}

export async function writeReferrerRows(client: SheetsClient, rows: string[][]): Promise<void> {
  await client.sheets.spreadsheets.values.clear({
    spreadsheetId: client.spreadsheetId,
    range: DATA_RANGE,
  });
  if (rows.length === 0) return;
  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${REFERRER_SHEET}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}
