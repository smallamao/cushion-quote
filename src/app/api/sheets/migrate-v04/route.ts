import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const VERSION_SHEET = "報價版本";

/**
 * v0.4 遷移腳本：為「報價版本」新增方案名稱快照欄位
 *
 * 新增欄位（index 42）：
 *   42: 方案名稱 (quoteNameSnapshot)
 *
 * 冪等設計：
 *   - 檢查 header row 是否已包含新欄位
 *   - 若已遷移則跳過，回傳 already_migrated
 *   - 只更新 header row，不修改資料列（舊列讀取時以 ?? "" fallback）
 *
 * POST = 執行遷移
 * GET  = 預覽遷移狀態
 */

const NEW_HEADER = "方案名稱";
// Column letter for index 42 is AQ (A=0, Z=25, AA=26 ... AP=41, AQ=42)
const NEW_HEADER_COL = "AQ";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Read entire first row to check if column exists
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!1:1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];
    const header = headers[42] ?? ""; // Index 42 = column AQ
    const alreadyMigrated = header === NEW_HEADER;

    return NextResponse.json({
      ok: true,
      mode: "preview",
      alreadyMigrated,
      currentHeader: header,
      expectedHeader: NEW_HEADER,
      currentColumns: headers.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // Read entire first row to check if column exists
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!1:1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];
    const header = headers[42] ?? ""; // Index 42 = column AQ

    if (header === NEW_HEADER) {
      return NextResponse.json({
        ok: true,
        mode: "already_migrated",
        message: "方案名稱欄位已存在，無需遷移",
      });
    }

    // Get sheet ID for batchUpdate
    const spreadsheet = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets?.find((s) => s.properties?.title === VERSION_SHEET);
    if (!sheet?.properties?.sheetId) {
      return NextResponse.json({ ok: false, error: "找不到報價版本分頁" }, { status: 404 });
    }

    // If sheet has less than 43 columns, expand it first
    const currentColumns = sheet.properties.gridProperties?.columnCount ?? 0;
    if (currentColumns < 43) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              appendDimension: {
                sheetId: sheet.properties.sheetId,
                dimension: "COLUMNS",
                length: 43 - currentColumns,
              },
            },
          ],
        },
      });
    }

    // Now add the header to column AQ
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!${NEW_HEADER_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[NEW_HEADER]] },
    });

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: `已新增方案名稱欄位於欄位 ${NEW_HEADER_COL}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
