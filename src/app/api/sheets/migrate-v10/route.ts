import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

interface NewSheetDef {
  title: string;
  headers: string[];
}

const NEW_SHEETS: NewSheetDef[] = [
  {
    title: "應收帳款",
    headers: [
      "應收單號",
      "建立日期",
      "案件ID",
      "案件名稱快照",
      "報價ID",
      "版本ID",
      "客戶ID",
      "客戶名稱快照",
      "聯絡人快照",
      "客戶電話快照",
      "專案名稱快照",
      "總金額",
      "已收金額",
      "未收金額",
      "分期數",
      "應收狀態",
      "有逾期",
      "最近收款日",
      "備註",
      "建立時間",
      "更新時間",
      "建立者",
    ],
  },
  {
    title: "應收分期",
    headers: [
      "分期ID",
      "應收單號",
      "期數",
      "標籤",
      "比例",
      "應收金額",
      "預定收款日",
      "實收金額",
      "實收日期",
      "收款方式",
      "分期狀態",
      "調整金額",
      "備註",
      "建立時間",
      "更新時間",
    ],
  },
];

// Convert 0-based column index to A1-notation letter (e.g. 21 -> "V")
function colLetter(index: number): string {
  let n = index;
  let result = "";
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

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

    const existingSheets = new Map<
      string,
      { sheetId: number; columnCount: number; rowCount: number }
    >();
    for (const s of meta.data.sheets ?? []) {
      const title = s.properties?.title;
      const sheetId = s.properties?.sheetId;
      if (title && sheetId != null) {
        existingSheets.set(title, {
          sheetId,
          columnCount: s.properties?.gridProperties?.columnCount ?? 0,
          rowCount: s.properties?.gridProperties?.rowCount ?? 0,
        });
      }
    }

    const actions: Record<string, string> = {};

    for (const def of NEW_SHEETS) {
      const existing = existingSheets.get(def.title);
      const requiredCols = def.headers.length;
      const lastCol = colLetter(requiredCols - 1);

      if (!existing) {
        // Create new sheet
        await client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: client.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: def.title,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: requiredCols,
                    },
                  },
                },
              },
            ],
          },
        });

        await client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `${def.title}!A1:${lastCol}1`,
          valueInputOption: "RAW",
          requestBody: { values: [def.headers] },
        });
        actions[def.title] = "created";
        continue;
      }

      // Sheet exists: ensure it has enough columns
      if (existing.columnCount < requiredCols) {
        await client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: client.spreadsheetId,
          requestBody: {
            requests: [
              {
                appendDimension: {
                  sheetId: existing.sheetId,
                  dimension: "COLUMNS",
                  length: requiredCols - existing.columnCount,
                },
              },
            ],
          },
        });
      }

      // Ensure headers are written correctly
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${def.title}!A1:${lastCol}1`,
        valueInputOption: "RAW",
        requestBody: { values: [def.headers] },
      });

      actions[def.title] =
        existing.columnCount < requiredCols ? "expanded+headers-written" : "headers-verified";
    }

    return NextResponse.json({ ok: true, actions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
