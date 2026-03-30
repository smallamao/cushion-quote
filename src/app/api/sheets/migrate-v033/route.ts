import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const VERSION_LINE_SHEET = "報價版本明細";
const NEW_HEADER = "自訂分片尺寸";
const TARGET_COL = "AG";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${TARGET_COL}1:${TARGET_COL}1`,
    });

    const currentHeader = headerRes.data.values?.[0]?.[0] ?? "";

    return NextResponse.json({
      ok: true,
      mode: "preview",
      alreadyMigrated: currentHeader === NEW_HEADER,
      currentHeader,
      expectedHeader: NEW_HEADER,
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
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${TARGET_COL}1:${TARGET_COL}1`,
    });

    const currentHeader = headerRes.data.values?.[0]?.[0] ?? "";
    if (currentHeader === NEW_HEADER) {
      return NextResponse.json({
        ok: true,
        mode: "already_migrated",
        message: "自訂分片尺寸欄位已存在，無需遷移",
      });
    }

    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${TARGET_COL}1:${TARGET_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[NEW_HEADER]] },
    });

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: "已新增自訂分片尺寸欄位",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
