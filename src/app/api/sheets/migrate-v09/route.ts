import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const VERSION_SHEET = "報價版本";
const NEW_HEADERS = ["已回簽", "回簽日期", "合約檔案JSON", "回簽備註"];
// Existing sheet has 43 cols (A:AQ). Need to expand to 47 cols (A:AU).
// New columns: AR(43)=signedBack, AS(44)=signedBackDate, AT(45)=signedContractUrls, AU(46)=signedNotes
const FIRST_NEW_COL = "AR";
const LAST_NEW_COL = "AU";
const REQUIRED_COLUMN_COUNT = 47;

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    // 1. Find the sheetId + current column count for 報價版本
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === VERSION_SHEET);
    if (!sheet || sheet.properties?.sheetId == null) {
      return NextResponse.json(
        { ok: false, error: `找不到分頁：${VERSION_SHEET}` },
        { status: 404 },
      );
    }
    const sheetId = sheet.properties.sheetId;
    const currentColumnCount = sheet.properties.gridProperties?.columnCount ?? 0;

    // 2. If grid is too narrow, append columns first
    if (currentColumnCount < REQUIRED_COLUMN_COUNT) {
      const columnsToAdd = REQUIRED_COLUMN_COUNT - currentColumnCount;
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              appendDimension: {
                sheetId,
                dimension: "COLUMNS",
                length: columnsToAdd,
              },
            },
          ],
        },
      });
    }

    // 3. Check if already migrated (after potential expansion)
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!A1:AU1`,
    });
    const headers = (headerRes.data.values?.[0] ?? []) as string[];

    const alreadyMigrated =
      headers[43] === NEW_HEADERS[0] &&
      headers[44] === NEW_HEADERS[1] &&
      headers[45] === NEW_HEADERS[2] &&
      headers[46] === NEW_HEADERS[3];

    if (alreadyMigrated) {
      return NextResponse.json({
        ok: true,
        alreadyMigrated: true,
        currentColumnCount,
      });
    }

    // 4. Write headers to AR1:AU1
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!${FIRST_NEW_COL}1:${LAST_NEW_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [NEW_HEADERS] },
    });

    // 5. Backfill default values for existing data rows
    const dataRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_SHEET}!A2:A`,
    });
    const rowCount = (dataRes.data.values ?? []).length;

    if (rowCount > 0) {
      const defaults = Array.from({ length: rowCount }, () => ["FALSE", "", "[]", ""]);
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${VERSION_SHEET}!${FIRST_NEW_COL}2:${LAST_NEW_COL}${rowCount + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: defaults },
      });
    }

    return NextResponse.json({
      ok: true,
      migrated: true,
      columnsExpanded: currentColumnCount < REQUIRED_COLUMN_COUNT,
      rowsUpdated: rowCount,
      addedHeaders: NEW_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
