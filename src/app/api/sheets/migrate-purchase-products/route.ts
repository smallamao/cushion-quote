import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEET = "採購商品";

const CORRECT_HEADERS = [
  "ID",
  "商品編號",
  "廠商產品編號",
  "商品名稱",
  "規格",
  "分類",
  "單位",
  "廠商編號",
  "廠商名稱",
  "幅寬(cm)",
  "進價",
  "牌價",
  "品牌",
  "系列",
  "色號",
  "色名",
  "圖片URL",
  "備註",
  "最小訂量",
  "交期",
  "庫存狀態",
  "啟用",
  "建立時間",
  "更新時間",
];

export async function POST(request: Request) {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    await client.sheets.spreadsheets.values.update({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1:X1`,
      valueInputOption: "RAW",
      requestBody: { values: [CORRECT_HEADERS] },
    });

    return NextResponse.json({
      ok: true,
      message: "已更新欄位標題為正確的 24 欄格式",
      columns: CORRECT_HEADERS.length,
      headers: CORRECT_HEADERS,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "遷移失敗" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: `${SHEET}!A1:X1`,
    });

    const headers = (response.data.values?.[0] ?? []) as string[];
    return NextResponse.json({
      ok: true,
      sheet: SHEET,
      currentColumns: headers.length,
      headers: headers,
      requiredColumns: CORRECT_HEADERS.length,
      isUpToDate: JSON.stringify(headers) === JSON.stringify(CORRECT_HEADERS),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "檢查失敗" },
      { status: 500 }
    );
  }
}