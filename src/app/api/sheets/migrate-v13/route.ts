import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

/**
 * v13: add 月結待出 sheet.
 *
 * Columns A:O (15):
 *   A 待結ID
 *   B 版本ID
 *   C 報價ID
 *   D 案件ID
 *   E 客戶ID
 *   F 客戶名稱快照
 *   G 案件名稱快照
 *   H 專案名稱快照
 *   I 金額
 *   J 成交日
 *   K 合併後應收單號
 *   L 狀態
 *   M 備註
 *   N 建立時間
 *   O 更新時間
 *
 * Safe to re-run: if the sheet already exists the migration only
 * ensures the header row is in place.
 */

const HEADERS = [
  "待結ID",
  "版本ID",
  "報價ID",
  "案件ID",
  "客戶ID",
  "客戶名稱快照",
  "案件名稱快照",
  "專案名稱快照",
  "金額",
  "成交日",
  "合併後應收單號",
  "狀態",
  "備註",
  "建立時間",
  "更新時間",
];

const SHEET_TITLE = "月結待出";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets 未設定" },
      { status: 503 },
    );
  }

  try {
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });

    const existing = (meta.data.sheets ?? []).find(
      (s) => s.properties?.title === SHEET_TITLE,
    );

    let created = false;
    if (!existing) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_TITLE,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: HEADERS.length,
                  },
                },
              },
            },
          ],
        },
      });
      created = true;
    }

    // Always (re)write the header row to keep schema authoritative.
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET_TITLE}!A1:O1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      action: created ? "created" : "headers-verified",
      sheet: SHEET_TITLE,
      columns: HEADERS.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
