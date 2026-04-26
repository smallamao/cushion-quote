import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

const SHEETS = [
  {
    title: "電子發票紀錄",
    range: "A1:AM1",
    headers: [
      "發票ID",
      "重試來源ID",
      "來源類型",
      "來源ID",
      "來源子ID",
      "報價ID",
      "版本ID",
      "案件ID",
      "客戶ID",
      "買方類型",
      "買方名稱",
      "買方統編",
      "Email",
      "載具類型",
      "載具值",
      "捐贈碼",
      "開立日期",
      "課稅別",
      "未稅金額",
      "稅額",
      "總金額",
      "稅率",
      "品項數",
      "品項JSON",
      "備註",
      "狀態",
      "供應商",
      "發票號碼",
      "隨機碼/追蹤碼",
      "回應JSON",
      "請求JSON",
      "錯誤代碼",
      "錯誤訊息",
      "作廢時間",
      "作廢原因",
      "建立者",
      "建立時間",
      "更新時間",
      "買方地址",
    ],
  },
  {
    title: "電子發票事件",
    range: "A1:J1",
    headers: [
      "事件ID",
      "發票ID",
      "事件類型",
      "前狀態",
      "後狀態",
      "訊息",
      "請求JSON",
      "回應JSON",
      "操作者",
      "發生時間",
    ],
  },
];

export async function POST() {
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
    const existingTitles = new Set((meta.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));

    const createRequests = SHEETS.filter((sheet) => !existingTitles.has(sheet.title)).map((sheet) => ({
      addSheet: {
        properties: {
          title: sheet.title,
          gridProperties: { rowCount: 1000, columnCount: sheet.headers.length },
        },
      },
    }));

    if (createRequests.length > 0) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { requests: createRequests },
      });
    }

    await Promise.all(
      SHEETS.map((sheet) =>
        client.sheets.spreadsheets.values.update({
          spreadsheetId: client.spreadsheetId,
          range: `${sheet.title}!${sheet.range}`,
          valueInputOption: "RAW",
          requestBody: { values: [sheet.headers] },
        }),
      ),
    );

    return NextResponse.json({ ok: true, sheets: SHEETS.map((sheet) => sheet.title) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
