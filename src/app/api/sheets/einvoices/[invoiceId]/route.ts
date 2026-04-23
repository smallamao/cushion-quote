import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";
import { EINVOICE_RANGE_FULL } from "@/lib/einvoice-utils";

import { getSession } from "../_auth";
import { getEInvoiceRows } from "../_shared";

export async function DELETE(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId");
  const mode = searchParams.get("mode") ?? "single";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getEInvoiceRows(client);
    if (mode === "cleanup-failed") {
      const failedIndices: number[] = [];
      rows.forEach((row, idx) => {
        if ((row[25] ?? "") === "failed") {
          failedIndices.push(idx + 2); // +2 because sheet row starts at 2 (after header)
        }
      });

      if (failedIndices.length === 0) {
        return NextResponse.json({ ok: true, message: "沒有失敗記錄" });
      }

      const spreadsheetId = client.spreadsheetId;
      const sheetName = "電子發票紀錄";

      for (let i = failedIndices.length - 1; i >= 0; i--) {
        const rowIndex = failedIndices[i];
        await client.sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          ranges: [`${sheetName}!A${rowIndex}:AL${rowIndex}`],
        });
      }

      return NextResponse.json({
        ok: true,
        deleted: failedIndices.length,
        rows: failedIndices,
        message: `已刪除 ${failedIndices.length} 筆失敗記錄`,
      });
    }

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "請提供 invoiceId" }, { status: 400 });
    }

    const rowIndex = rows.findIndex((row) => (row[0] ?? "") === invoiceId);
    if (rowIndex === -1) {
      return NextResponse.json({ ok: false, error: "找不到發票" }, { status: 404 });
    }

    const sheetRowIndex = rowIndex + 2;
    await client.sheets.spreadsheets.values.batchClear({
      spreadsheetId: client.spreadsheetId,
      ranges: [`${EINVOICE_RANGE_FULL.split("!")[0]}!A${sheetRowIndex}:AL${sheetRowIndex}`],
    });

    return NextResponse.json({ ok: true, invoiceId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 }
    );
  }
}