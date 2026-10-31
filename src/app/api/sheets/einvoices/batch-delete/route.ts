import { NextResponse } from "next/server";

import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../_auth";
import { EInvoiceRowMovedError, deleteEInvoiceRows, getEInvoiceRows } from "../_shared";

const DELETABLE_STATUSES = new Set(["draft", "failed"]);

export async function POST(request: Request) {
  const session = await getSession(request as unknown as Request);
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
    const targets: Array<{ sheetRow: number; invoiceId: string }> = [];
    const skipped: string[] = [];

    rows.forEach((row, idx) => {
      const id = row[0] ?? "";
      if (!idSet.has(id)) return;
      const status = row[25] ?? "draft";
      if (!DELETABLE_STATUSES.has(status)) {
        skipped.push(`${id}（${status}）`);
        return;
      }
      targets.push({ sheetRow: idx + 2, invoiceId: id });
    });

    if (targets.length === 0) {
      const detail = skipped.length > 0 ? `已開立/已作廢的發票無法刪除：${skipped.join("、")}` : "找不到指定記錄";
      return NextResponse.json({ ok: true, deleted: 0, message: detail });
    }

    // 刪除前確認每一列仍是預期的發票，任何一列被擠動就整批不刪
    await deleteEInvoiceRows(client, targets);

    const message = skipped.length > 0
      ? `已刪除 ${targets.length} 筆，跳過 ${skipped.length} 筆已開立/已作廢記錄`
      : `已刪除 ${targets.length} 筆記錄`;

    return NextResponse.json({ ok: true, deleted: targets.length, skipped: skipped.length, message });
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
