import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const VERSION_LINE_SHEET = "報價版本明細";

/**
 * v0.3.2 遷移腳本：為「報價版本明細」新增多片組合輸入模式欄位
 *
 * 新增欄位（index 26-31）：
 *   26: 輸入模式       (panelInputMode)
 *   27: 整面寬度cm     (surfaceWidthCm)
 *   28: 整面高度cm     (surfaceHeightCm)
 *   29: 分片方向       (splitDirection)
 *   30: 分片數         (splitCount)
 *   31: 才數進位模式   (caiRoundingMode)
 *
 * 冪等設計：
 *   - 檢查 header row 是否已包含新欄位
 *   - 若已遷移則跳過，回傳 already_migrated
 *   - 只更新 header row，不修改資料列（舊列讀取時以 ?? "" / toNumber fallback）
 *
 * POST = 執行遷移
 * GET  = 預覽遷移狀態
 */

const NEW_HEADERS = ["輸入模式", "整面寬度cm", "整面高度cm", "分片方向", "分片數", "才數進位模式"];
// Column letter for index 26 is AA (A=0 ... Z=25, AA=26)
const NEW_HEADER_START_COL = "AA";
const NEW_HEADER_END_COL = "AF";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${NEW_HEADER_START_COL}1:${NEW_HEADER_END_COL}1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];
    const alreadyMigrated = headers.includes("輸入模式");

    return NextResponse.json({
      ok: true,
      mode: "preview",
      alreadyMigrated,
      currentHeaders: headers,
      expectedHeaders: NEW_HEADERS,
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
    // Check current headers for idempotency
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${NEW_HEADER_START_COL}1:${NEW_HEADER_END_COL}1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];

    if (headers.includes("輸入模式")) {
      return NextResponse.json({
        ok: true,
        mode: "already_migrated",
        message: "多片組合輸入模式欄位已存在，無需遷移",
      });
    }

    // Append new headers to row 1
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!${NEW_HEADER_START_COL}1:${NEW_HEADER_END_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [NEW_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      mode: "migrated",
      message: "已新增多片組合輸入模式欄位 (輸入模式, 整面寬度cm, 整面高度cm, 分片方向, 分片數, 才數進位模式)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
