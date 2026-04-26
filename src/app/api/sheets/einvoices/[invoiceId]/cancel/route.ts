import { NextResponse } from "next/server";

import { cancelInvoice } from "@/lib/giveme-client";
import { getCancellationDeadline, isWithinCancellationDeadline, isoNow } from "@/lib/einvoice-utils";
import type { FilingPeriod } from "@/lib/einvoice-utils";
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
  const body = (await request.json().catch(() => ({}))) as { remark?: string };
  const remark = body.remark?.trim() || "系統作廢";

  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });
  }

  try {
    const updated = await getEInvoiceRecordById(client, invoiceId);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    }
    if (updated.status !== "issued") {
      return NextResponse.json({ ok: false, error: `invoice status ${updated.status} cannot cancel` }, { status: 409 });
    }
    if (!updated.providerInvoiceNo) {
      return NextResponse.json({ ok: false, error: "providerInvoiceNo is required" }, { status: 409 });
    }

    // 台灣電子發票申報期限檢查（雙月制為預設）
    const filingPeriod = (process.env.GIVEME_FILING_PERIOD === "monthly" ? "monthly" : "bimonthly") as FilingPeriod;
    if (!isWithinCancellationDeadline(updated.invoiceDate, filingPeriod)) {
      const deadline = getCancellationDeadline(updated.invoiceDate, filingPeriod);
      await appendEInvoiceEvent(client, {
        invoiceId,
        eventType: "cancel_failed",
        fromStatus: updated.status,
        toStatus: updated.status,
        message: `逾申報期限（截止 ${deadline.toISOString().slice(0, 10)}），須改開折讓單`,
        requestJson: JSON.stringify({ invoiceDate: updated.invoiceDate, filingPeriod }),
        responseJson: "",
        actor: session.displayName,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "逾申報期限無法作廢，請改開立折讓單",
          code: "cancellation_deadline_passed",
          deadline: deadline.toISOString(),
        },
        { status: 422 },
      );
    }

    const result = await cancelInvoice(updated.providerInvoiceNo, remark);
    if (!result.success) {
      await appendEInvoiceEvent(client, {
        invoiceId,
        eventType: "cancel_failed",
        fromStatus: updated.status,
        toStatus: updated.status,
        message: result.msg || "作廢失敗",
        requestJson: JSON.stringify({ code: updated.providerInvoiceNo }),
        responseJson: JSON.stringify({ success: result.success, code: result.code, msg: result.msg }),
        actor: session.displayName,
      });
      return NextResponse.json({ ok: false, error: result.msg || "作廢失敗" }, { status: 502 });
    }

    const next = await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: "cancelled",
      cancelledAt: isoNow(),
      cancelReason: remark,
      providerResponseJson: JSON.stringify({ success: result.success, code: result.code, msg: result.msg }),
      updatedAt: isoNow(),
    }));
    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: "cancel_succeeded",
      fromStatus: updated.status,
      toStatus: "cancelled",
      message: remark,
      requestJson: JSON.stringify({ code: updated.providerInvoiceNo }),
      responseJson: JSON.stringify({ success: result.success, code: result.code, msg: result.msg }),
      actor: session.displayName,
    });
    return NextResponse.json({ ok: true, invoice: next, provider: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
