import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const ITEM_SHEET = "採購單明細";
const EXPECTED_HEADERS = [
  "明細ID",
  "採購單號",
  "項次",
  "商品ID",
  "商品快照JSON",
  "數量",
  "實收數量",
  "單價",
  "金額",
  "備註",
];

function hasReceivedQuantityHeader(headers: string[]): boolean {
  return headers.includes("實收數量");
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${ITEM_SHEET}!A1:J2`,
    });
    const headers = (response.data.values?.[0] ?? []) as string[];

    return NextResponse.json({
      ok: true,
      mode: "preview",
      sheet: ITEM_SHEET,
      alreadyMigrated: hasReceivedQuantityHeader(headers),
      currentHeaders: headers,
      expectedHeaders: EXPECTED_HEADERS,
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
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${ITEM_SHEET}!A:J`,
    });
    const rows = response.data.values ?? [];
    const headers = (rows[0] ?? []) as string[];

    if (hasReceivedQuantityHeader(headers)) {
      return NextResponse.json({
        ok: true,
        mode: "migrated",
        message: "採購單明細已包含實收數量欄位",
        updatedRows: 0,
      });
    }

    const migratedRows = rows.map((row, index) => {
      if (index === 0) {
        return EXPECTED_HEADERS;
      }

      return [
        row[0] ?? "",
        row[1] ?? "",
        row[2] ?? "",
        row[3] ?? "",
        row[4] ?? "",
        row[5] ?? "",
        row[6] ?? "0",
        row[7] ?? "",
        row[8] ?? "",
        row[9] ?? "",
      ];
    });

    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.spreadsheetId,
      range: `${ITEM_SHEET}!A:J`,
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${ITEM_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: migratedRows.length > 0 ? migratedRows : [EXPECTED_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: "已為採購單明細新增實收數量欄位",
      updatedRows: Math.max(migratedRows.length - 1, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
