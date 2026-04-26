import { NextResponse } from "next/server";

import { queryInvoice } from "@/lib/giveme-client";
import { isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, getEInvoiceRecordById, updateEInvoiceRecord } from "../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const session = getSession(request);
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
    const current = await getEInvoiceRecordById(client, invoiceId);
    if (!current) {
      return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    }
    if (current.status !== "issued" && current.status !== "cancelled" && current.status !== "needs_review") {
      return NextResponse.json({ ok: false, error: `invoice status ${current.status} cannot sync` }, { status: 409 });
    }
    if (!current.providerInvoiceNo) {
      return NextResponse.json({ ok: false, error: "providerInvoiceNo is required" }, { status: 409 });
    }

    const result = await queryInvoice(current.providerInvoiceNo);
    const nextStatus = result.success
      ? result.status === "1"
        ? "cancelled"
        : current.status === "cancelled"
          ? "cancelled"
          : "issued"
      : current.status;
    const next = await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: nextStatus,
      providerTrackNo: result.randomCode ?? record.providerTrackNo,
      providerResponseJson: JSON.stringify({
        success: result.success,
        code: result.code,
        msg: result.msg,
        status: result.status ?? "",
        randomCode: result.randomCode ?? "",
        delRemark: result.delRemark ?? "",
        delTime: result.delTime ?? "",
      }),
      updatedAt: isoNow(),
    }));
    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: result.success ? "sync_succeeded" : "sync_failed",
      fromStatus: current.status,
      toStatus: next?.status ?? current.status,
      message: result.msg || "同步完成",
      requestJson: JSON.stringify({ code: current.providerInvoiceNo }),
      responseJson: JSON.stringify({
        success: result.success,
        code: result.code,
        msg: result.msg,
        status: result.status ?? "",
        randomCode: result.randomCode ?? "",
      }),
      actor: session.displayName,
    });
    if (result.success && !next) {
      return NextResponse.json({ ok: false, error: "Sheets 找不到此發票列，請確認記錄是否存在", provider: result }, { status: 404 });
    }
    return NextResponse.json({ ok: result.success, invoice: next, provider: result }, { status: result.success ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
