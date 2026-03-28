import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const VERSION_LINE_SHEET = "報價版本明細";

/**
 * v0.3.1 遷移腳本：為「報價版本明細」新增施工加給欄位
 *
 * 新增欄位（index 23-25）：
 *   23: 安裝高度等級 (installHeightTier)
 *   24: 板片尺寸等級 (panelSizeTier)
 *   25: 施工加給%    (installSurchargeRate)
 *
 * 冪等設計：
 *   - 檢查 header row 是否已包含新欄位
 *   - 若已遷移則跳過，回傳 already_migrated
 *   - 只更新 header row，不修改資料列（舊列讀取時以 ?? "" / toNumber fallback）
 *
 * POST = 執行遷移
 * GET  = 預覽遷移狀態
 */

const NEW_HEADERS = ["安裝高度等級", "板片尺寸等級", "施工加給%"];
// Column letter for index 23 is X (A=0 ... W=22, X=23)
const NEW_HEADER_START_COL = "X";
const NEW_HEADER_END_COL = "Z";

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const headerRes = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${VERSION_LINE_SHEET}!A1:Z1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];
    const alreadyMigrated = headers.includes("安裝高度等級");

    return NextResponse.json({
      ok: true,
      mode: "preview",
      alreadyMigrated,
      currentHeaderCount: headers.length,
      expectedHeaderCount: 26,
      newHeaders: NEW_HEADERS,
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
      range: `${VERSION_LINE_SHEET}!A1:Z1`,
    });

    const headers = (headerRes.data.values?.[0] ?? []) as string[];

    if (headers.includes("安裝高度等級")) {
      return NextResponse.json({
        ok: true,
        mode: "already_migrated",
        message: "施工加給欄位已存在，無需遷移",
        headerCount: headers.length,
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
      message: "已新增施工加給欄位 (安裝高度等級, 板片尺寸等級, 施工加給%)",
      newHeaderCount: headers.length + NEW_HEADERS.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
