import { NextResponse } from "next/server";

import { EINVOICE_SHEET } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { getEInvoiceRows } from "../_shared";

// Only draft and failed invoices may be deleted; issued/cancelled are legal records
const DELETABLE_STATUSES = new Set(["draft", "failed"]);

async function getEInvoiceSheetId(client: Awaited<ReturnType<typeof getSheetsClient>>): Promise<number | undefined> {
  if (!client) return undefined;
  const meta = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    fields: "sheets.properties",
  });
  return meta.data.sheets?.find((s) => s.properties?.title === EINVOICE_SHEET)?.properties?.sheetId ?? undefined;
}

export async function DELETE(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId");
  const mode = searchParams.get("mode") ?? "single";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const [rows, sheetId] = await Promise.all([
      getEInvoiceRows(client),
      getEInvoiceSheetId(client),
    ]);

    if (mode === "cleanup-failed") {
      const failedIndices: number[] = [];
      rows.forEach((row, idx) => {
        if ((row[25] ?? "") === "failed") {
          failedIndices.push(idx + 2);
        }
      });

      if (failedIndices.length === 0) {
        return NextResponse.json({ ok: true, message: "沒有失敗記錄" });
      }

      if (sheetId !== undefined) {
        const requests = [...failedIndices].sort((a, b) => b - a).map((rowNum) => ({
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum },
          },
        }));
        await client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: client.spreadsheetId,
          requestBody: { requests },
        });
      }

      return NextResponse.json({
        ok: true,
        deleted: failedIndices.length,
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

    const status = rows[rowIndex]?.[25] ?? "draft";
    if (!DELETABLE_STATUSES.has(status)) {
      return NextResponse.json(
        { ok: false, error: `已開立或已作廢的發票不可刪除（目前狀態：${status}），如需作廢請使用作廢功能` },
        { status: 409 },
      );
    }

    const sheetRowIndex = rowIndex + 2;
    if (sheetId !== undefined) {
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: sheetRowIndex - 1, endIndex: sheetRowIndex },
            },
          }],
        },
      });
    }

    return NextResponse.json({ ok: true, invoiceId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 },
    );
  }
}
