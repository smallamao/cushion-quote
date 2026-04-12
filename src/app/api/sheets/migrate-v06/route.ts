import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const NEW_SHEETS = [
  {
    title: "庫存主檔",
    headers: [
      "庫存ID",
      "商品ID",
      "廠商編號",
      "商品快照JSON",
      "目前庫存",
      "最近入庫成本",
      "最近入庫日",
      "最近異動時間",
      "備註",
      "建立時間",
      "更新時間",
    ],
  },
  {
    title: "庫存異動",
    headers: [
      "異動ID",
      "庫存ID",
      "商品ID",
      "廠商編號",
      "採購單號",
      "採購明細ID",
      "異動類型",
      "數量變化",
      "單位",
      "單位成本",
      "發生時間",
      "參考單號",
      "備註",
      "建立時間",
      "更新時間",
    ],
  },
];

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const existing = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const existingTitles = (existing.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title));

    const sheetsToCreate = NEW_SHEETS.filter((sheet) => !existingTitles.includes(sheet.title));
    const existingSheets = NEW_SHEETS.filter((sheet) => existingTitles.includes(sheet.title));

    return NextResponse.json({
      ok: true,
      mode: "preview",
      sheetsToCreate: sheetsToCreate.map((sheet) => sheet.title),
      sheetsAlreadyExist: existingSheets.map((sheet) => sheet.title),
      alreadyMigrated: sheetsToCreate.length === 0,
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
    const existing = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
    });
    const existingTitles = (existing.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title));

    const sheetsToCreate = NEW_SHEETS.filter((sheet) => !existingTitles.includes(sheet.title));

    if (sheetsToCreate.length > 0) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: sheetsToCreate.map((sheet) => ({
            addSheet: { properties: { title: sheet.title } },
          })),
        },
      });
    }

    for (const sheet of sheetsToCreate) {
      await client.sheets.spreadsheets.values.update({
        spreadsheetId: client.spreadsheetId,
        range: `${sheet.title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [sheet.headers] },
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      sheetsCreated: sheetsToCreate.map((sheet) => sheet.title),
      message: `已建立 ${sheetsToCreate.length} 個庫存分頁`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
