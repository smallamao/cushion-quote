import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const CASE_HEADERS = [
  "案件ID",
  "案件名稱",
  "客戶ID",
  "客戶名稱",
  "聯絡人",
  "電話",
  "案件地址",
  "通路",
  "案件狀態",
  "立案日",
  "最新報價ID",
  "最新版本ID",
  "最近送出時間",
  "下次追蹤日",
  "最後追蹤時間",
  "成交版本ID",
  "失單原因",
  "內部備註",
  "建立時間",
  "更新時間",
  "案件來源",
  "來源人/介紹人",
  "來源備註",
];

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const spreadsheet = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
      includeGridData: false,
    });

    const caseSheet = (spreadsheet.data.sheets ?? []).find(
      (sheet) => sheet.properties?.title === "案件",
    );

    const sheetId = caseSheet?.properties?.sheetId;
    if (sheetId == null) {
      return NextResponse.json({ ok: false, error: "案件 工作表不存在" }, { status: 404 });
    }

    const currentColumnCount = caseSheet?.properties?.gridProperties?.columnCount ?? 0;
    if (currentColumnCount < CASE_HEADERS.length) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    columnCount: CASE_HEADERS.length,
                  },
                },
                fields: "gridProperties.columnCount",
              },
            },
          ],
        },
      });
    }

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: "案件!A1:W1",
      valueInputOption: "RAW",
      requestBody: { values: [CASE_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      sheet: "案件",
      columns: CASE_HEADERS.length,
      headers: CASE_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
