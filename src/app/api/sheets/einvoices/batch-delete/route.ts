import { NextResponse } from "next/server";

import { EINVOICE_SHEET } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { getEInvoiceRows } from "../_shared";

const DELETABLE_STATUSES = new Set(["draft", "failed"]);

export async function POST(request: Request) {
  const session = getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { invoiceIds?: string[] };
  const invoiceIds = body.invoiceIds;
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return NextResponse.json({ ok: false, error: "invoiceIds 不可為空" }, { status: 400 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getEInvoiceRows(client);
    const idSet = new Set(invoiceIds);

    // Collect target row indices, skipping issued/cancelled records
    const targetIndices: number[] = [];
    const skipped: string[] = [];

    rows.forEach((row, idx) => {
      const id = row[0] ?? "";
      if (!idSet.has(id)) return;
      const status = row[25] ?? "draft";
      if (!DELETABLE_STATUSES.has(status)) {
        skipped.push(`${id}（${status}）`);
        return;
      }
      targetIndices.push(idx + 2);
    });

    if (targetIndices.length === 0) {
      const detail = skipped.length > 0 ? `已開立/已作廢的發票無法刪除：${skipped.join("、")}` : "找不到指定記錄";
      return NextResponse.json({ ok: true, deleted: 0, message: detail });
    }

    // Get sheet ID for deleteDimension
    const meta = await client.sheets.spreadsheets.get({
      spreadsheetId: client.spreadsheetId,
      fields: "sheets.properties",
    });
    const sheetId = meta.data.sheets
      ?.find((s) => s.properties?.title === EINVOICE_SHEET)
      ?.properties?.sheetId;

    if (sheetId !== undefined) {
      // Delete from bottom up to avoid row index shifting
      const requests = [...targetIndices].sort((a, b) => b - a).map((rowNum) => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum },
        },
      }));
      await client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { requests },
      });
    }

    const message = skipped.length > 0
      ? `已刪除 ${targetIndices.length} 筆，跳過 ${skipped.length} 筆已開立/已作廢記錄`
      : `已刪除 ${targetIndices.length} 筆記錄`;

    return NextResponse.json({ ok: true, deleted: targetIndices.length, skipped: skipped.length, message });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 },
    );
  }
}
