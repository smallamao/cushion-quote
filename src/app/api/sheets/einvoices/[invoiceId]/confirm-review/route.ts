import { NextResponse } from "next/server";

import { isoNow } from "@/lib/einvoice-utils";
import { getSheetsClient } from "@/lib/sheets-client";

import { getSession } from "../../_auth";
import { appendEInvoiceEvent, getEInvoiceRecordById, updateEInvoiceRecord } from "../../_shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const session = getSession(request);
  if (!session) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    taxType?: number;
    taxRate?: number;
    untaxedAmount?: number;
    taxAmount?: number;
    totalAmount?: number;
    notes?: string;
  };

  const client = await getSheetsClient();
  if (!client) return NextResponse.json({ ok: false, error: "Google Sheets 未設定" }, { status: 503 });

  try {
    const current = await getEInvoiceRecordById(client, invoiceId);
    if (!current) return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });
    if (current.status !== "needs_review") {
      return NextResponse.json(
        { ok: false, error: `此功能只適用於 needs_review 狀態，目前狀態為 ${current.status}` },
        { status: 409 }
      );
    }

    const next = await updateEInvoiceRecord(client, invoiceId, (record) => ({
      ...record,
      status: "issued" as const,
      taxType: body.taxType !== undefined ? (body.taxType as 0 | 1 | 2 | 4) : record.taxType,
      taxRate: body.taxRate !== undefined ? body.taxRate : record.taxRate,
      untaxedAmount: body.untaxedAmount !== undefined ? body.untaxedAmount : record.untaxedAmount,
      taxAmount: body.taxAmount !== undefined ? body.taxAmount : record.taxAmount,
      totalAmount: body.totalAmount !== undefined ? body.totalAmount : record.totalAmount,
      errorMessage: "",
      updatedAt: isoNow(),
    }));

    await appendEInvoiceEvent(client, {
      invoiceId,
      eventType: "review_confirmed",
      fromStatus: "needs_review",
      toStatus: "issued",
      message: body.notes || "人工確認稅率，標記為已開立",
      requestJson: JSON.stringify(body),
      responseJson: "",
      actor: session.displayName,
    });

    return NextResponse.json({ ok: true, invoice: next });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
