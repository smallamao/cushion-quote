import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { EInvoiceRowMovedError, deleteEInvoiceRows, getEInvoiceRows } from "../_shared";

export async function POST(request: Request) {
  const session = await getSession(request as unknown as Request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const rows = await getEInvoiceRows(client);
    const failedTargets = rows.flatMap((row, idx) => (
      (row[25] ?? "") === "failed" && row[0] ? [{ sheetRow: idx + 2, invoiceId: row[0] }] : []
    ));

    if (failedTargets.length === 0) {
      return NextResponse.json({ ok: true, message: "沒有失敗記錄" });
    }

    // 整列刪除（原本 values.clear A:AM 會留下空白列，AN/AO 的備註也沒清掉）；刪前逐列確認 ID
    await deleteEInvoiceRows(client, failedTargets);

    return NextResponse.json({
      ok: true,
      deleted: failedTargets.length,
      rows: failedTargets.map((target) => target.sheetRow),
      message: `已刪除 ${failedTargets.length} 筆失敗記錄`,
    });
  } catch (err) {
    if (err instanceof EInvoiceRowMovedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 }
    );
  }
}
