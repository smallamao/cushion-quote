import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

// v11: add 出貨狀態 / 物流單號 / 出貨日期 columns to 案件 sheet (Y, Z, AA)
const NEW_HEADERS = ["出貨狀態", "物流單號", "出貨日期"];

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

    const caseSheet = (meta.data.sheets ?? []).find(
      (s) => s.properties?.title === "案件",
    );
    if (!caseSheet || caseSheet.properties?.sheetId == null) {
      return NextResponse.json(
        { ok: false, error: "案件 工作表不存在" },
        { status: 404 },
      );
    }

    const sheetId = caseSheet.properties.sheetId;
    const currentColumnCount = caseSheet.properties.gridProperties?.columnCount ?? 0;
    const requiredCols = 27; // A:AA

    if (currentColumnCount < requiredCols) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              appendDimension: {
                sheetId,
                dimension: "COLUMNS",
                length: requiredCols - currentColumnCount,
              },
            },
          ],
        },
      });
    }

    // Write the three new headers at Y1:AA1
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: "案件!Y1:AA1",
      valueInputOption: "RAW",
      requestBody: { values: [NEW_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      expanded: currentColumnCount < requiredCols,
      previousCols: currentColumnCount,
      newCols: requiredCols,
      headersWritten: NEW_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
