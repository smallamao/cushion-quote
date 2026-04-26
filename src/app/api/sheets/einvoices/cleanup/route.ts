import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { getEInvoiceRows } from "../_shared";

export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getEInvoiceRows(client);
    const failedIndices: number[] = [];

    rows.forEach((row, idx) => {
      if ((row[25] ?? "") === "failed") {
        failedIndices.push(idx + 2);
      }
    });

    if (failedIndices.length === 0) {
      return NextResponse.json({ ok: true, message: "沒有失敗記錄" });
    }

    const sheetName = "電子發票紀錄";

    for (let i = failedIndices.length - 1; i >= 0; i--) {
      const rowIndex = failedIndices[i];
        await client.sheets.spreadsheets.values.clear({
          spreadsheetId: client.spreadsheetId,
          range: `${sheetName}!A${rowIndex}:AM${rowIndex}`,
        });
      }

    return NextResponse.json({
      ok: true,
      deleted: failedIndices.length,
      rows: failedIndices,
      message: `已刪除 ${failedIndices.length} 筆失敗記錄`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 }
    );
  }
}
