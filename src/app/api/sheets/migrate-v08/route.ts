import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const ORDER_SHEET = "採購單";
const EXPECTED_HEADERS = [
  "採購單號",
  "採購日期",
  "廠商編號",
  "案件編號",
  "案件名稱快照",
  "廠商快照JSON",
  "小計",
  "運費",
  "稅額",
  "合計金額",
  "附註",
  "狀態",
  "交貨地址",
  "到貨日期",
  "建立時間",
  "更新時間",
];

function hasCaseHeaders(headers: string[]): boolean {
  return headers.includes("案件編號") && headers.includes("案件名稱快照");
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${ORDER_SHEET}!A1:P2`,
    });
    const headers = (response.data.values?.[0] ?? []) as string[];

    return NextResponse.json({
      ok: true,
      mode: "preview",
      sheet: ORDER_SHEET,
      alreadyMigrated: hasCaseHeaders(headers),
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
      range: `${ORDER_SHEET}!A:P`,
    });
    const rows = response.data.values ?? [];
    const headers = (rows[0] ?? []) as string[];

    if (hasCaseHeaders(headers)) {
      return NextResponse.json({
        ok: true,
        mode: "migrated",
        message: "採購單已包含案件關聯欄位",
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
        "",
        "",
        row[3] ?? "",
        row[4] ?? "",
        row[5] ?? "",
        row[6] ?? "",
        row[7] ?? "",
        row[8] ?? "",
        row[9] ?? "",
        row[10] ?? "",
        row[11] ?? "",
        row[12] ?? "",
        row[13] ?? "",
      ];
    });

    await client.sheets.spreadsheets.values.clear({
      spreadsheetId: client.spreadsheetId,
      range: `${ORDER_SHEET}!A:P`,
    });

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${ORDER_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: migratedRows.length > 0 ? migratedRows : [EXPECTED_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: "已為採購單新增案件關聯欄位",
      updatedRows: Math.max(migratedRows.length - 1, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
