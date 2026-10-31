import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";

import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { EInvoiceRowMovedError, deleteEInvoiceRows, getEInvoiceRows } from "../_shared";

// Only draft and failed invoices may be deleted; issued/cancelled are legal records
const DELETABLE_STATUSES = new Set(["draft", "failed"]);

export async function DELETE(request: Request) {
  const session = await getSession(request as unknown as Request);
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
    const rows = await getEInvoiceRows(client);

    if (mode === "cleanup-failed") {
      const failedTargets = rows.flatMap((row, idx) => (
        (row[25] ?? "") === "failed" && row[0] ? [{ sheetRow: idx + 2, invoiceId: row[0] }] : []
      ));

      if (failedTargets.length === 0) {
        return NextResponse.json({ ok: true, message: "沒有失敗記錄" });
      }

      await deleteEInvoiceRows(client, failedTargets);

      return NextResponse.json({
        ok: true,
        deleted: failedTargets.length,
        message: `已刪除 ${failedTargets.length} 筆失敗記錄`,
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

    // 刪除前確認該列仍是這張發票（中段插入的列會讓列號位移）
    await deleteEInvoiceRows(client, [{ sheetRow: rowIndex + 2, invoiceId }]);

    appendAuditLog({
      actor: session.email,
      action: "delete",
      targetType: "einvoice",
      targetId: invoiceId,
      summary: undefined,
    });
    return NextResponse.json({ ok: true, invoiceId });
  } catch (err) {
    if (err instanceof EInvoiceRowMovedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "刪除失敗" },
      { status: 500 },
    );
  }
}
